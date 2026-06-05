const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const os = require('os');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
  const { tableId, items, discount, orderType, waiterId } = req.body;
  try {
    // 1. Verify and deduct stocks if new items are added
    // For simplicity, stock is deducted when orders are closed (paid) or sent to kitchen.
    // In our SQLite backend, we will persist this order.
    await db.run(
      `INSERT INTO active_orders (tableId, items, discount, orderType, waiterId)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(tableId) DO UPDATE SET
         items = excluded.items,
         discount = excluded.discount,
         orderType = excluded.orderType,
         waiterId = excluded.waiterId`,
      [tableId, JSON.stringify(items), discount, orderType, waiterId]
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
  const { id, tableId, tableName, items, subtotal, tax, discount, total, paymentMethod, orderType, waiterId } = req.body;
  try {
    // Save to sales history
    await db.run(
      `INSERT INTO sales_history (id, tableId, tableName, items, subtotal, tax, discount, total, paymentMethod, orderType, waiterId, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, tableId, tableName, JSON.stringify(items), subtotal, tax, discount, total, paymentMethod, orderType, waiterId, new Date().toISOString()]
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

    await db.run(
      `INSERT INTO active_orders (tableId, items, discount, orderType, waiterId)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(tableId) DO UPDATE SET
         items = excluded.items,
         discount = excluded.discount,
         orderType = excluded.orderType,
         waiterId = excluded.waiterId`,
      [targetTableId, JSON.stringify(targetItems), discount, orderType, waiterId]
    );

    await db.run(`DELETE FROM active_orders WHERE tableId = ?`, [sourceTableId]);

    const targetTable = await db.get(`SELECT name FROM tables WHERE id = ?`, [targetTableId]);
    const targetName = targetTable ? targetTable.name : targetTableId;
    await db.run(
      `UPDATE kitchen_orders SET tableId = ?, tableName = ? WHERE tableId = ?`,
      [targetTableId, targetName, sourceTableId]
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
  const { id, tableId, tableName, waiterId, items } = req.body;
  try {
    await db.run(
      `INSERT INTO kitchen_orders (id, tableId, tableName, waiterId, status, items, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, tableId, tableName, waiterId, 'cooking', JSON.stringify(items), new Date().toISOString()]
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
    await db.initDatabase();

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

// Remote print propagation endpoint
app.post('/api/print', (req, res) => {
  const { tx, type } = req.body;
  io.emit('remote_print_request', { tx, type });
  res.json({ success: true });
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
  .then(() => {
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
