const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const os = require('os');
const net = require('net');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory printer settings (persist across requests; reset on server restart)
// For production use, these can be loaded from an env var or a JSON file
let printerSettings = {
  kasaIp: process.env.PRINTER_KASA_IP || '',
  mutfakIp: process.env.PRINTER_MUTFAK_IP || '',
  enabled: false
};

// Category IDs that belong to the kitchen (food items)
// These are seeded from data.js. Extras (extra-XX) also go to kitchen.
const KITCHEN_CATEGORY_IDS = new Set([
  'G7Dybmqujf1ahEEDJask', // KAHVALTILAR
  'IDG2uULBtLhcIicltKSI', // HEALTHY BRUSCHETTA
  'HzfdmS0BdMoEGtRX6IDg', // SALATALAR
  'L3SlF5TXqvlpC0tD2oVI', // MAKARNALAR
  'J9V643KQdRIYsJiOHmLX', // KASELER
  'kDkKyJRAjMcPSr69pEDk', // FAST&HEALTHY
  'qKvNEcG5aQN2nx9ygarX', // APERATİFLER
  'extras'                 // EKSTRALAR (extra charges go to kasa, not kitchen)
]);

// Category IDs that belong to the bar/kasa (drinks)
// Everything not in KITCHEN_CATEGORY_IDS goes to kasa
const DRINK_CATEGORY_IDS = new Set([
  'yKsnp6EFSg45UWDaz9LK', // SOFT İÇECEKLER
  'qrQmFX0ue7YpR9206WDV', // DETOKS&SHOTLAR
  'tETcPjbPcvEkInJMU7yL', // TAZE SIKIM
  'HKdwjIy3KG9sKvHfLmzL', // SICAK İÇECEKLER
  'lKEsPjjMDIjucLMx3QQb', // SOĞUK KAHVELER
]);

// Helper: Send raw ESC/POS text to a TCP printer over IP:port
function sendToPrinter(ip, port = 9100, data) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const timeout = 5000;
    client.setTimeout(timeout);
    client.connect(port, ip, () => {
      client.write(data, 'binary');
      client.end();
    });
    client.on('close', () => resolve(true));
    client.on('timeout', () => { client.destroy(); reject(new Error('Printer timeout')); });
    client.on('error', (err) => reject(err));
  });
}

function groupItems(items) {
  const map = new Map();
  (items || []).forEach(item => {
    const key = `${item.id}-${item.option || ''}-${item.note || ''}`;
    if (map.has(key)) {
      map.get(key).quantity += item.quantity || 1;
    } else {
      map.set(key, { ...item, quantity: item.quantity || 1 });
    }
  });
  return Array.from(map.values());
}

// ESC/POS: Build a simple kitchen ticket text
function buildKitchenTicket(tx) {
  const ESC = '\x1b';
  const INIT = ESC + '@';
  const BOLD_ON = ESC + 'E\x01';
  const BOLD_OFF = ESC + 'E\x00';
  const CENTER = ESC + 'a\x01';
  const LEFT = ESC + 'a\x00';
  const CUT = '\x1d' + 'V\x41\x00';
  const LF = '\n';

  const date = new Date(tx.timestamp).toLocaleString('tr-TR');
  let text = INIT + CENTER + BOLD_ON + 'MUTFAK SİPARİŞ FİŞİ' + BOLD_OFF + LF;
  text += '================================' + LF;
  text += LEFT + 'Masa: ' + (tx.tableName || '') + LF;
  text += 'Garson: ' + (tx.waiterId ? tx.waiterId.toUpperCase() : '') + LF;
  text += 'Tarih: ' + date + LF;
  text += '--------------------------------' + LF;
  const groupedItems = groupItems(tx.items || []);
  groupedItems.forEach(item => {
    const opt = item.option ? ' (' + item.option + ')' : '';
    const note = item.note ? '\n  >> Not: ' + item.note : '';
    text += BOLD_ON + item.quantity + 'x ' + item.name + opt + BOLD_OFF + note + LF;
  });
  text += '================================' + LF + LF + LF;
  text += CUT;
  return text;
}

// ESC/POS: Build a receipt text for the kasa printer
function buildKasaReceipt(tx) {
  const ESC = '\x1b';
  const INIT = ESC + '@';
  const BOLD_ON = ESC + 'E\x01';
  const BOLD_OFF = ESC + 'E\x00';
  const CENTER = ESC + 'a\x01';
  const LEFT = ESC + 'a\x00';
  const CUT = '\x1d' + 'V\x41\x00';
  const LF = '\n';

  const date = new Date(tx.timestamp).toLocaleString('tr-TR');
  const payMap = { CASH: 'NAKİT', CARD: 'KREDİ KARTI', MEALCARD: 'YEMEK KARTI', OTHER: 'DİĞER' };
  const methodText = payMap[tx.paymentMethod] || 'NAKİT';

  let text = INIT + CENTER + BOLD_ON + 'Go Healthy THE KITCHEN' + BOLD_OFF + LF;
  text += 'Saray Mah. Macaroglu Sok. 4B / ALANYA' + LF;
  text += 'Tel: +90 501 073 7303' + LF;
  text += '================================' + LF;
  text += LEFT + 'Masa: ' + (tx.tableName || '') + LF;
  text += 'Fiş No: ' + (tx.id || '') + LF;
  text += 'Tarih: ' + date + LF;
  text += '--------------------------------' + LF;
  const groupedItems = groupItems(tx.items || []);
  groupedItems.forEach(item => {
    const opt = item.option ? ' (' + item.option + ')' : '';
    const total = ((item.price || 0) * (item.quantity || 1)).toFixed(2);
    text += item.quantity + 'x ' + item.name + opt + '  ' + total + ' TL' + LF;
  });
  text += '================================' + LF;
  text += 'Ara Toplam: ' + (tx.subtotal || 0).toFixed(2) + ' TL' + LF;
  if (tx.discount > 0) {
    text += 'Indirim (%' + tx.discount + '): -' + (tx.subtotal * tx.discount / 100).toFixed(2) + ' TL' + LF;
  }
  text += BOLD_ON + 'TOPLAM: ' + (tx.total || 0).toFixed(2) + ' TL' + BOLD_OFF + LF;
  text += 'Odeme: ' + methodText + LF;
  text += '================================' + LF;
  text += CENTER + 'TESEKKUR EDERIZ!' + LF + LF + LF;
  text += CUT;
  return text;
}

// ESC/POS: Build a drink/bar ticket
function buildDrinkTicket(tx, drinkItems) {
  const ESC = '\x1b';
  const INIT = ESC + '@';
  const BOLD_ON = ESC + 'E\x01';
  const BOLD_OFF = ESC + 'E\x00';
  const CENTER = ESC + 'a\x01';
  const LEFT = ESC + 'a\x00';
  const CUT = '\x1d' + 'V\x41\x00';
  const LF = '\n';

  const date = new Date(tx.timestamp).toLocaleString('tr-TR');
  let text = INIT + CENTER + BOLD_ON + 'BAR/İÇECEK SİPARİŞİ' + BOLD_OFF + LF;
  text += '================================' + LF;
  text += LEFT + 'Masa: ' + (tx.tableName || '') + LF;
  text += 'Garson: ' + (tx.waiterId ? tx.waiterId.toUpperCase() : '') + LF;
  text += 'Tarih: ' + date + LF;
  text += '--------------------------------' + LF;
  const groupedItems = groupItems(drinkItems || []);
  groupedItems.forEach(item => {
    const opt = item.option ? ' (' + item.option + ')' : '';
    text += BOLD_ON + item.quantity + 'x ' + item.name + opt + BOLD_OFF + LF;
  });
  text += '================================' + LF + LF + LF;
  text += CUT;
  return text;
}

// ESC/POS: Build an adisyon (pre-bill) ticket for the kasa printer
function buildPreBill(tx) {
  const ESC = '\x1b';
  const INIT = ESC + '@';
  const BOLD_ON = ESC + 'E\x01';
  const BOLD_OFF = ESC + 'E\x00';
  const CENTER = ESC + 'a\x01';
  const LEFT = ESC + 'a\x00';
  const CUT = '\x1d' + 'V\x41\x00';
  const LF = '\n';

  const date = new Date(tx.timestamp).toLocaleString('tr-TR');

  let text = INIT + CENTER + BOLD_ON + 'Go Healthy THE KITCHEN' + BOLD_OFF + LF;
  text += 'Saray Mah. Macaroglu Sok. 4B / ALANYA' + LF;
  text += 'Tel: +90 501 073 7303' + LF;
  text += '================================' + LF;
  text += CENTER + BOLD_ON + '*** ADİSYON ***' + BOLD_OFF + LF;
  text += '================================' + LF;
  text += LEFT + 'Masa: ' + (tx.tableName || '') + LF;
  text += 'Personel: ' + (tx.waiterId ? tx.waiterId.toUpperCase() : '') + LF;
  text += 'Tarih: ' + date + LF;
  text += '--------------------------------' + LF;
  const groupedItems = groupItems(tx.items || []);
  groupedItems.forEach(item => {
    const opt = item.option ? ' (' + item.option + ')' : '';
    const total = ((item.price || 0) * (item.quantity || 1)).toFixed(2);
    text += item.quantity + 'x ' + item.name + opt + '  ' + total + ' TL' + LF;
  });
  text += '================================' + LF;
  text += 'Ara Toplam: ' + (tx.subtotal || 0).toFixed(2) + ' TL' + LF;
  if (tx.discount > 0) {
    text += 'Indirim (%' + tx.discount + '): -' + (tx.subtotal * tx.discount / 100).toFixed(2) + ' TL' + LF;
  }
  text += BOLD_ON + 'TOPLAM: ' + (tx.total || 0).toFixed(2) + ' TL' + BOLD_OFF + LF;
  text += '================================' + LF;
  text += CENTER + BOLD_ON + 'AFIYET OLSUN!' + BOLD_OFF + LF + LF + LF;
  text += CUT;
  return text;
}

function buildZReport(tx) {
  const ESC = '\x1b';
  const INIT = ESC + '@';
  const BOLD_ON = ESC + 'E\x01';
  const BOLD_OFF = ESC + 'E\x00';
  const CENTER = ESC + 'a\x01';
  const LEFT = ESC + 'a\x00';
  const CUT = '\x1d' + 'V\x41\x00';
  const LF = '\n';

  const date = new Date(tx.timestamp).toLocaleString('tr-TR');

  let text = INIT + CENTER + BOLD_ON + 'Go Healthy THE KITCHEN' + BOLD_OFF + LF;
  text += 'Saray Mah. Macaroglu Sok. 4B / ALANYA' + LF;
  text += '================================' + LF;
  text += CENTER + BOLD_ON + '*** GUN SONU (Z) RAPORU ***' + BOLD_OFF + LF;
  text += '================================' + LF;
  text += LEFT + 'Rapor ID: ' + tx.id + LF;
  text += 'Tarih:    ' + date + LF;
  text += 'Kapatan:  ' + (tx.closedBy ? tx.closedBy.toUpperCase() : '') + LF;
  text += '--------------------------------' + LF;
  
  text += BOLD_ON + 'CIRO & GIDER OZETI:' + BOLD_OFF + LF;
  text += 'Devir Nakit:       ' + tx.startingCash.toFixed(2) + ' TL' + LF;
  text += 'Toplam Ciro(Brut): ' + tx.totalRevenue.toFixed(2) + ' TL' + LF;
  text += 'Toplam Gider:      ' + tx.totalExpenses.toFixed(2) + ' TL' + LF;
  text += '--------------------------------' + LF;
  
  text += BOLD_ON + 'KASA SAYIM DETAYLARI:' + BOLD_OFF + LF;
  text += 'Nakit (Say/Bek):   ' + tx.countedCash.toFixed(2) + ' / ' + tx.expectedCash.toFixed(2) + ' TL' + LF;
  text += 'Kredi K.(Say/Bek): ' + tx.countedCard.toFixed(2) + ' / ' + tx.expectedCard.toFixed(2) + ' TL' + LF;
  text += 'Yemek K.(Say/Bek): ' + tx.countedMealcard.toFixed(2) + ' / ' + tx.expectedMealcard.toFixed(2) + ' TL' + LF;
  text += 'Diger   (Say/Bek): ' + tx.countedOther.toFixed(2) + ' / ' + tx.expectedOther.toFixed(2) + ' TL' + LF;
  text += '--------------------------------' + LF;
  
  const cashDiff = tx.countedCash - tx.expectedCash;
  const cardDiff = tx.countedCard - tx.expectedCard;
  const mealDiff = tx.countedMealcard - tx.expectedMealcard;
  const otherDiff = tx.countedOther - tx.expectedOther;
  const totalDiff = cashDiff + cardDiff + mealDiff + otherDiff;
  
  let diffStatus = 'DENGEDE';
  if (totalDiff < -0.01) diffStatus = 'EKSIK (' + totalDiff.toFixed(2) + ' TL)';
  else if (totalDiff > 0.01) diffStatus = 'FAZLA (+' + totalDiff.toFixed(2) + ' TL)';
  
  text += BOLD_ON + 'KASA DURUMU:       ' + diffStatus + BOLD_OFF + LF;
  
  if (tx.notes) {
    text += '--------------------------------' + LF;
    text += 'Notlar: ' + tx.notes + LF;
  }
  
  text += '================================' + LF;
  text += CENTER + BOLD_ON + 'RAPOR ALINDI' + BOLD_OFF + LF + LF + LF;
  text += CUT;
  return text;
}


app.get('/menu', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'menu.html'));
});

// Helper to get local network IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const SERVER_IP = getLocalIP();

// --- REST API ENDPOINTS ---

// Fetch unified AppState + server connection IP
app.get('/api/state', async (req, res) => {
  try {
    const state = await db.getAppState();
    state.serverIp = SERVER_IP;
    state.serverPort = PORT;
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create or update active order
app.post('/api/orders', async (req, res) => {
  const { tableId, items, discount, orderType, waiterId, timestamp, customLabel, note } = req.body;
  try {
    // 1. Verify and deduct stocks if new items are added
    // For simplicity, stock is deducted when orders are closed (paid) or sent to kitchen.
    // In our SQLite backend, we will persist this order.
    await db.run(
      `INSERT INTO active_orders (tableId, items, discount, orderType, waiterId, timestamp, customLabel, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tableId) DO UPDATE SET
         items = excluded.items,
         discount = excluded.discount,
         orderType = excluded.orderType,
         waiterId = excluded.waiterId,
         timestamp = COALESCE(active_orders.timestamp, excluded.timestamp),
         customLabel = excluded.customLabel,
         note = excluded.note`,
      [tableId, JSON.stringify(items), discount, orderType, waiterId, timestamp || new Date().toISOString(), customLabel || null, note || null]
    );

    // Update table status in database
    if (tableId !== 'quick') {
      const status = items.length > 0 ? 'busy' : 'free';
      await db.run(`UPDATE tables SET status = ? WHERE id = ?`, [status, tableId]);
    }

    const state = await db.getAppState();
    io.emit('sync_state', state); // Broadcast to all connected clients
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete or empty active order
app.delete('/api/orders/:tableId', async (req, res) => {
  const { tableId } = req.params;
  try {
    await db.run(`DELETE FROM active_orders WHERE tableId = ?`, [tableId]);
    if (tableId !== 'quick') {
      await db.run(`UPDATE tables SET status = 'free' WHERE id = ?`, [tableId]);
    }
    const state = await db.getAppState();
    io.emit('sync_state', state);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Complete and Pay Order
app.post('/api/orders/pay', async (req, res) => {
  const { id, tableId, tableName, items, subtotal, tax, discount, total, paymentMethod, orderType, waiterId, note } = req.body;
  try {
    // Save to sales history
    await db.run(
      `INSERT INTO sales_history (id, tableId, tableName, items, subtotal, tax, discount, total, paymentMethod, orderType, waiterId, timestamp, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, tableId, tableName, JSON.stringify(items), subtotal, tax, discount, total, paymentMethod, orderType, waiterId, new Date().toISOString(), note || null]
    );

    // Clear active order and active kitchen orders for this table
    await db.run(`DELETE FROM active_orders WHERE tableId = ?`, [tableId]);
    await db.run(`DELETE FROM kitchen_orders WHERE tableId = ?`, [tableId]);

    // Free table
    if (tableId !== 'quick') {
      await db.run(`UPDATE tables SET status = 'free' WHERE id = ?`, [tableId]);
    }

    const state = await db.getAppState();
    io.emit('sync_state', state);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Merge active orders and KDS tickets
app.post('/api/orders/merge', async (req, res) => {
  const { sourceTableId, targetTableId } = req.body;
  try {
    const sourceOrderRow = await db.get(`SELECT * FROM active_orders WHERE tableId = ?`, [sourceTableId]);
    const targetOrderRow = await db.get(`SELECT * FROM active_orders WHERE tableId = ?`, [targetTableId]);

    if (!sourceOrderRow) {
      return res.status(400).json({ error: 'Mevcut masa siparişi bulunamadı.' });
    }

    let sourceItems = JSON.parse(sourceOrderRow.items);
    let targetItems = targetOrderRow ? JSON.parse(targetOrderRow.items) : [];
    let discount = targetOrderRow ? targetOrderRow.discount : sourceOrderRow.discount;
    let orderType = targetOrderRow ? targetOrderRow.orderType : sourceOrderRow.orderType;
    let waiterId = targetOrderRow ? targetOrderRow.waiterId : sourceOrderRow.waiterId;

    sourceItems.forEach(item => {
      const existing = targetItems.find(i => i.id === item.id && i.option === item.option && i.note === item.note);
      if (existing) {
        existing.quantity += item.quantity;
        existing.isSentToKitchen = existing.isSentToKitchen && item.isSentToKitchen;
      } else {
        targetItems.push({ ...item });
      }
    });

    let timestamp = (targetOrderRow && targetOrderRow.timestamp) ? targetOrderRow.timestamp : ((sourceOrderRow && sourceOrderRow.timestamp) ? sourceOrderRow.timestamp : new Date().toISOString());
    let customLabel = (targetOrderRow && targetOrderRow.customLabel) ? targetOrderRow.customLabel : ((sourceOrderRow && sourceOrderRow.customLabel) ? sourceOrderRow.customLabel : null);
    let note = (targetOrderRow && targetOrderRow.note) ? targetOrderRow.note : ((sourceOrderRow && sourceOrderRow.note) ? sourceOrderRow.note : null);

    await db.run(
      `INSERT INTO active_orders (tableId, items, discount, orderType, waiterId, timestamp, customLabel, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tableId) DO UPDATE SET
         items = excluded.items,
         discount = excluded.discount,
         orderType = excluded.orderType,
         waiterId = excluded.waiterId,
         timestamp = excluded.timestamp,
         customLabel = excluded.customLabel,
         note = excluded.note`,
      [targetTableId, JSON.stringify(targetItems), discount, orderType, waiterId, timestamp, customLabel, note]
    );

    await db.run(`DELETE FROM active_orders WHERE tableId = ?`, [sourceTableId]);

    const targetTable = await db.get(`SELECT name FROM tables WHERE id = ?`, [targetTableId]);
    const targetName = targetTable ? targetTable.name : targetTableId;
    await db.run(
      `UPDATE kitchen_orders SET tableId = ?, tableName = ?, note = ? WHERE tableId = ?`,
      [targetTableId, targetName, note, sourceTableId]
    );
    await db.run(
      `UPDATE kitchen_orders SET note = ? WHERE tableId = ?`,
      [note, targetTableId]
    );

    await db.run(`UPDATE tables SET status = 'free' WHERE id = ?`, [sourceTableId]);
    
    const hasCooking = await db.get(`SELECT COUNT(*) as count FROM kitchen_orders WHERE tableId = ? AND status = 'cooking'`, [targetTableId]);
    const targetStatus = hasCooking.count > 0 ? 'busy' : 'bill';
    await db.run(`UPDATE tables SET status = ? WHERE id = ?`, [targetStatus, targetTableId]);

    const state = await db.getAppState();
    io.emit('sync_state', state);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add kitchen KOT bilet
app.post('/api/kitchen/ticket', async (req, res) => {
  const { id, tableId, tableName, waiterId, items, note } = req.body;
  try {
    await db.run(
      `INSERT INTO kitchen_orders (id, tableId, tableName, waiterId, status, items, timestamp, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, tableId, tableName, waiterId, 'cooking', JSON.stringify(items), new Date().toISOString(), note || null]
    );
    
    if (tableId !== 'quick') {
      await db.run(`UPDATE tables SET status = 'busy' WHERE id = ?`, [tableId]);
    }

    const state = await db.getAppState();
    io.emit('sync_state', state);
    io.emit('new_kitchen_ticket', { tableName, waiterId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle kitchen item cooked status
app.post('/api/kitchen/toggle-cooked', async (req, res) => {
  const { ticketId, itemIndex } = req.body;
  try {
    const ticket = await db.get(`SELECT items FROM kitchen_orders WHERE id = ?`, [ticketId]);
    if (ticket) {
      const items = JSON.parse(ticket.items);
      if (items[itemIndex]) {
        items[itemIndex].cooked = !items[itemIndex].cooked;
        await db.run(`UPDATE kitchen_orders SET items = ? WHERE id = ?`, [JSON.stringify(items), ticketId]);
        const state = await db.getAppState();
        io.emit('sync_state', state);
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Complete kitchen ticket
app.post('/api/kitchen/complete', async (req, res) => {
  const { ticketId } = req.body;
  try {
    const ticket = await db.get(`SELECT tableId, tableName FROM kitchen_orders WHERE id = ?`, [ticketId]);
    if (ticket) {
      await db.run(`UPDATE kitchen_orders SET status = 'ready' WHERE id = ?`, [ticketId]);
      
      // Update table status if no remaining cooking tickets exist
      const remaining = await db.get(`SELECT COUNT(*) as count FROM kitchen_orders WHERE tableId = ? AND status = 'cooking'`, [ticket.tableId]);
      if (remaining.count === 0 && ticket.tableId !== 'quick') {
        await db.run(`UPDATE tables SET status = 'bill' WHERE id = ?`, [ticket.tableId]);
      }

      const state = await db.getAppState();
      io.emit('sync_state', state);
      io.emit('kitchen_ticket_ready', { tableName: ticket.tableName });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deduct ingredient stocks programmatically
app.post('/api/stocks/deduct', async (req, res) => {
  const { itemId, quantity } = req.body;
  try {
    const result = await db.checkAndDeductStock(itemId, quantity);
    if (result.success) {
      const state = await db.getAppState();
      io.emit('sync_state', state);
      res.json({ success: true, alerts: result.alerts });
    } else {
      res.status(400).json({ success: false, error: result.reason });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch reports with period limits
app.get('/api/reports', async (req, res) => {
  const { start, end } = req.query;
  try {
    let rows;
    if (start && end) {
      rows = await db.all(`SELECT * FROM sales_history WHERE timestamp >= ? AND timestamp <= ?`, [start, end]);
    } else {
      rows = await db.all(`SELECT * FROM sales_history`);
    }
    const history = rows.map(r => ({ ...r, items: JSON.parse(r.items) }));
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update payment method for a specific sale (correction)
app.patch('/api/sales/:id/payment', async (req, res) => {
  const { id } = req.params;
  const { paymentMethod } = req.body;
  const validMethods = ['CASH', 'CARD', 'MEALCARD', 'OTHER'];
  if (!validMethods.includes(paymentMethod)) {
    return res.status(400).json({ error: 'Geçersiz ödeme yöntemi. Kabul edilen: CASH, CARD, MEALCARD, OTHER' });
  }
  try {
    const existing = await db.get(`SELECT id FROM sales_history WHERE id = ?`, [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Satış kaydı bulunamadı.' });
    }
    await db.run(`UPDATE sales_history SET paymentMethod = ? WHERE id = ?`, [paymentMethod, id]);
    const state = await db.getAppState();
    io.emit('sync_state', state);
    res.json({ success: true, id, paymentMethod });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a specific sale (correction of payment method, discount, total)
app.patch('/api/sales/:id', async (req, res) => {
  const { id } = req.params;
  const { paymentMethod, discount, total } = req.body;
  try {
    const existing = await db.get(`SELECT * FROM sales_history WHERE id = ?`, [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Satış kaydı bulunamadı.' });
    }
    
    const updates = [];
    const params = [];
    
    if (paymentMethod !== undefined) {
      const validMethods = ['CASH', 'CARD', 'MEALCARD', 'OTHER'];
      if (!validMethods.includes(paymentMethod)) {
        return res.status(400).json({ error: 'Geçersiz ödeme yöntemi.' });
      }
      updates.push('paymentMethod = ?');
      params.push(paymentMethod);
    }
    
    if (discount !== undefined) {
      updates.push('discount = ?');
      params.push(Number(discount));
    }
    
    if (total !== undefined) {
      updates.push('total = ?');
      params.push(Number(total));
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'Güncellenecek alan gönderilmedi.' });
    }
    
    params.push(id);
    await db.run(`UPDATE sales_history SET ${updates.join(', ')} WHERE id = ?`, params);
    
    const state = await db.getAppState();
    io.emit('sync_state', state);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete (cancel/void) a specific sale
app.delete('/api/sales/:id', async (req, res) => {
  const { id } = req.params;
  const { returnToStock } = req.query;
  try {
    const sale = await db.get(`SELECT items FROM sales_history WHERE id = ?`, [id]);
    if (!sale) {
      return res.status(404).json({ error: 'Satış kaydı bulunamadı.' });
    }
    
    if (returnToStock === 'true') {
      const items = JSON.parse(sale.items);
      for (const item of items) {
        await db.checkAndDeductStock(item.id, -item.quantity);
      }
    }
    
    await db.run(`DELETE FROM sales_history WHERE id = ?`, [id]);
    const state = await db.getAppState();
    io.emit('sync_state', state);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Staff key clock-in shift attendance
app.post('/api/staff/shift', async (req, res) => {
  const { pin } = req.body;
  try {
    const staff = await db.get(`SELECT * FROM staff WHERE code = ?`, [pin]);
    if (!staff) {
      return res.status(401).json({ error: 'Hatalı PIN kodu!' });
    }

    const nextStatus = 'in';
    const shiftStart = staff.status !== 'in' ? new Date().toISOString() : staff.shiftStart;

    await db.run(`UPDATE staff SET status = ?, shiftStart = ? WHERE id = ?`, [nextStatus, shiftStart, staff.id]);

    const state = await db.getAppState();
    io.emit('sync_state', state);
    res.json({ success: true, staff: { ...staff, status: nextStatus } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stock refill action
app.post('/api/settings/stock/refill', async (req, res) => {
  try {
    await db.refillAllStocks();
    const state = await db.getAppState();
    io.emit('sync_state', state);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add custom menu item
app.post('/api/settings/item/add', async (req, res) => {
  const { id, categoryId, name, price, description, image, popular, options } = req.body;
  try {
    await db.run(
      `INSERT INTO menu_items (id, categoryId, name, price, description, image, popular, options)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, categoryId, name, price, description, image, popular ? 1 : 0, JSON.stringify(options)]
    );
    const state = await db.getAppState();
    io.emit('sync_state', state);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add custom table map coordinate
app.post('/api/settings/table/add', async (req, res) => {
  const { id, name, category, x, y, shape, status } = req.body;
  try {
    await db.run(
      `INSERT INTO tables (id, name, category, x, y, shape, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, category, x, y, shape, status]
    );
    const state = await db.getAppState();
    io.emit('sync_state', state);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Factory reset db utility
app.post('/api/settings/reset', async (req, res) => {
  try {
    await db.run(`DROP TABLE IF EXISTS tables`);
    await db.run(`DROP TABLE IF EXISTS menu_items`);
    await db.run(`DROP TABLE IF EXISTS stocks`);
    await db.run(`DROP TABLE IF EXISTS active_orders`);
    await db.run(`DROP TABLE IF EXISTS kitchen_orders`);
    await db.run(`DROP TABLE IF EXISTS sales_history`);
    await db.run(`DROP TABLE IF EXISTS staff`);
    await db.run(`DROP TABLE IF EXISTS expenses`);
    await db.run(`DROP TABLE IF EXISTS daily_closings`);
    await db.initDatabase();

    const state = await db.getAppState();
    io.emit('sync_state', state);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Daily Closings (Gün Sonu) APIs
app.get('/api/closings', async (req, res) => {
  try {
    const closings = await db.all("SELECT * FROM daily_closings ORDER BY timestamp DESC");
    res.json(closings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/closings', async (req, res) => {
  const {
    id, timestamp, closedBy, startingCash,
    expectedCash, countedCash, expectedCard, countedCard,
    expectedMealcard, countedMealcard, expectedOther, countedOther,
    totalRevenue, totalExpenses, notes
  } = req.body;
  try {
    await db.run(
      `INSERT INTO daily_closings (id, timestamp, closedBy, startingCash, expectedCash, countedCash, expectedCard, countedCard, expectedMealcard, countedMealcard, expectedOther, countedOther, totalRevenue, totalExpenses, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, timestamp, closedBy, Number(startingCash),
        Number(expectedCash), Number(countedCash), Number(expectedCard), Number(countedCard),
        Number(expectedMealcard), Number(countedMealcard), Number(expectedOther), Number(countedOther),
        Number(totalRevenue), Number(totalExpenses), notes || ''
      ]
    );
    const state = await db.getAppState();
    io.emit('sync_state', state);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/closings/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await db.get(`SELECT id FROM daily_closings WHERE id = ?`, [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Gün sonu kaydı bulunamadı.' });
    }
    await db.run(`DELETE FROM daily_closings WHERE id = ?`, [id]);
    const state = await db.getAppState();
    io.emit('sync_state', state);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/closings/:id', async (req, res) => {
  const { id } = req.params;
  const {
    startingCash,
    expectedCash, countedCash,
    expectedCard, countedCard,
    expectedMealcard, countedMealcard,
    expectedOther, countedOther,
    totalRevenue, totalExpenses,
    notes
  } = req.body;
  try {
    const existing = await db.get(`SELECT * FROM daily_closings WHERE id = ?`, [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Gün sonu kaydı bulunamadı.' });
    }
    
    await db.run(
      `UPDATE daily_closings SET
         startingCash = ?,
         expectedCash = ?,
         countedCash = ?,
         expectedCard = ?,
         countedCard = ?,
         expectedMealcard = ?,
         countedMealcard = ?,
         expectedOther = ?,
         countedOther = ?,
         totalRevenue = ?,
         totalExpenses = ?,
         notes = ?
       WHERE id = ?`,
      [
        startingCash !== undefined ? Number(startingCash) : existing.startingCash,
        expectedCash !== undefined ? Number(expectedCash) : existing.expectedCash,
        countedCash !== undefined ? Number(countedCash) : existing.countedCash,
        expectedCard !== undefined ? Number(expectedCard) : existing.expectedCard,
        countedCard !== undefined ? Number(countedCard) : existing.countedCard,
        expectedMealcard !== undefined ? Number(expectedMealcard) : existing.expectedMealcard,
        countedMealcard !== undefined ? Number(countedMealcard) : existing.countedMealcard,
        expectedOther !== undefined ? Number(expectedOther) : existing.expectedOther,
        countedOther !== undefined ? Number(countedOther) : existing.countedOther,
        totalRevenue !== undefined ? Number(totalRevenue) : existing.totalRevenue,
        totalExpenses !== undefined ? Number(totalExpenses) : existing.totalExpenses,
        notes !== undefined ? notes : existing.notes,
        id
      ]
    );
    
    const state = await db.getAppState();
    io.emit('sync_state', state);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Expense Management APIs
app.get('/api/expenses', async (req, res) => {
  try {
    const expenses = await db.all("SELECT * FROM expenses ORDER BY timestamp DESC");
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/expenses', async (req, res) => {
  const { description, amount, category, staffId, timestamp } = req.body;
  try {
    const id = 'EXP-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    const ts = timestamp || new Date().toISOString();
    await db.run(
      `INSERT INTO expenses (id, description, amount, category, timestamp, staffId)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, description, Number(amount), category, ts, staffId || '']
    );
    const state = await db.getAppState();
    io.emit('sync_state', state);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/expenses/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.run(`DELETE FROM expenses WHERE id = ?`, [id]);
    const state = await db.getAppState();
    io.emit('sync_state', state);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aggregated delivery channel simulation hook
app.post('/api/delivery/simulate', (req, res) => {
  const { channelId, order } = req.body;
  io.emit('incoming_delivery_alert', { channelId, order });
  res.json({ success: true });
});

// Smart print endpoint — routes to correct IP printer or falls back to socket broadcast
app.post('/api/print', async (req, res) => {
  const { tx, type, senderSocketId } = req.body;

  if (printerSettings.enabled && (printerSettings.kasaIp || printerSettings.mutfakIp)) {
    try {
      if (type === 'kitchen') {
        // Split items: food → mutfak, drinks → kasa
        const allItems = tx.items || [];
        const menuItems = await db.all('SELECT id, categoryId FROM menu_items');
        const itemCatMap = {};
        menuItems.forEach(m => { itemCatMap[m.id] = m.categoryId; });

        const foodItems = allItems.filter(item => {
          const catId = itemCatMap[item.id] || '';
          return !DRINK_CATEGORY_IDS.has(catId);
        });
        const drinkItems = allItems.filter(item => {
          const catId = itemCatMap[item.id] || '';
          return DRINK_CATEGORY_IDS.has(catId);
        });

        const printPromises = [];
        if (foodItems.length > 0 && printerSettings.mutfakIp) {
          const ticket = buildKitchenTicket({ ...tx, items: foodItems });
          printPromises.push(sendToPrinter(printerSettings.mutfakIp, 9100, ticket));
        }
        if (drinkItems.length > 0 && printerSettings.kasaIp) {
          const ticket = buildDrinkTicket({ ...tx, items: drinkItems }, drinkItems);
          printPromises.push(sendToPrinter(printerSettings.kasaIp, 9100, ticket));
        }

        await Promise.all(printPromises);
        return res.json({ success: true, printedDirectly: true });


      } else if (type === 'receipt' && printerSettings.kasaIp) {
        // Receipt always goes to kasa printer
        const receipt = buildKasaReceipt(tx);
        await sendToPrinter(printerSettings.kasaIp, 9100, receipt);
        return res.json({ success: true, printedDirectly: true });

      } else if (type === 'prebill' && printerSettings.kasaIp) {
        // Adisyon (pre-bill) — kasa yazıcısına gider, masa kapatılmaz
        const prebill = buildPreBill(tx);
        await sendToPrinter(printerSettings.kasaIp, 9100, prebill);
        return res.json({ success: true, printedDirectly: true });
      } else if (type === 'zreport' && printerSettings.kasaIp) {
        // Z Raporu (kasa kapatma) — kasa yazıcısına gider
        const zreport = buildZReport(tx);
        await sendToPrinter(printerSettings.kasaIp, 9100, zreport);
        return res.json({ success: true, printedDirectly: true });
      }
    } catch (err) {
      console.error('Direct IP print failed, falling back to socket broadcast:', err.message);
      // Fall through to socket broadcast below
    }
  }

  // Fallback: broadcast to all connected browser clients via Socket.IO
  io.emit('remote_print_request', { tx, type, senderSocketId });
  res.json({ success: true, printedDirectly: false });
});

// Printer settings GET
app.get('/api/settings/printers', (req, res) => {
  res.json(printerSettings);
});

// Printer settings SAVE
app.post('/api/settings/printers', async (req, res) => {
  const { kasaIp, mutfakIp, enabled } = req.body;
  printerSettings.kasaIp = (kasaIp || '').trim();
  printerSettings.mutfakIp = (mutfakIp || '').trim();
  printerSettings.enabled = !!enabled;
  console.log('Printer settings updated:', printerSettings);
  try {
    await db.saveSetting('printers', printerSettings);
  } catch (err) {
    console.error('Failed to save printer settings to DB:', err);
  }
  res.json({ success: true });
});

// Printer connection test
app.post('/api/settings/printers/test', async (req, res) => {
  const { kasaIp, mutfakIp } = req.body;
  const results = [];

  async function testOne(label, ip) {
    if (!ip) return;
    try {
      await sendToPrinter(ip, 9100, '\x1b@Test: ' + label + ' baglantisi basarili!\n\n\n\x1dV\x41\x00');
      results.push({ label, ip, ok: true });
    } catch (err) {
      results.push({ label, ip, ok: false, error: err.message });
    }
  }

  await Promise.all([testOne('Kasa Yazıcısı', kasaIp), testOne('Mutfak Yazıcısı', mutfakIp)]);

  const allOk = results.every(r => r.ok);
  const message = results.map(r => `${r.label} (${r.ip}): ${r.ok ? '✅ BAĞLANDI' : '❌ BAĞLANAMADI - ' + r.error}`).join(' | ');
  res.json({ success: allOk, message });
});

// --- SOCKET.IO EVENTS ---
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// --- SERVER LAUNCH ---
db.initDatabase()
  .then(async () => {
    // Load printer settings from database!
    try {
      const savedPrinters = await db.getSetting('printers');
      if (savedPrinters) {
        printerSettings = {
          kasaIp: savedPrinters.kasaIp || '',
          mutfakIp: savedPrinters.mutfakIp || '',
          enabled: !!savedPrinters.enabled
        };
        console.log('Loaded printer settings from database:', printerSettings);
      }
    } catch (e) {
      console.error('Failed to load printer settings from DB:', e);
    }

    server.listen(PORT, () => {
      console.log(`=========================================`);
      console.log(`Go Healthy POS Server`);
      console.log(`Sunucu Başlatıldı!`);
      console.log(`Lokal Giriş: http://localhost:${PORT}`);
      console.log(`Diğer Cihazlar: http://${SERVER_IP}:${PORT}`);
      console.log(`=========================================`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
  });
