const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 3055;
const BASE_URL = `http://localhost:${PORT}`;
const dbPath = path.join(__dirname, '..', 'pos.db');
const backupPath = path.join(__dirname, '..', 'pos.db.backup');

async function main() {
  console.log("==================================================");
  console.log("   GO HEALTHY POS BACKEND QA TESTING SCRIPT");
  console.log("==================================================");

  // 1. Back up database if it exists
  if (fs.existsSync(dbPath)) {
    console.log("Backing up existing pos.db to pos.db.backup...");
    fs.copyFileSync(dbPath, backupPath);
    fs.unlinkSync(dbPath);
    console.log("Original database backed up and temporarily removed.");
  } else {
    console.log("No existing pos.db found. Starting from scratch.");
  }

  // 2. Start the Express server using the local Node binary
  console.log(`Starting Express server on port ${PORT}...`);
  const nodeBinary = path.join(__dirname, '..', 'node-v20.11.0-darwin-arm64', 'bin', 'node');
  const serverJs = path.join(__dirname, '..', 'server.js');

  const serverProcess = spawn(nodeBinary, [serverJs], {
    env: { ...process.env, PORT: PORT, DATABASE_URL: '' }, // Ensure SQLite mode
    stdio: 'pipe'
  });

  let serverOutput = '';
  serverProcess.stdout.on('data', (data) => {
    serverOutput += data.toString();
  });
  serverProcess.stderr.on('data', (data) => {
    console.error(`[Server Error] ${data}`);
  });

  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Poll server state API to check when it becomes ready
  let started = false;
  for (let i = 0; i < 15; i++) {
    await wait(600);
    try {
      const res = await fetch(`${BASE_URL}/api/state`);
      if (res.status === 200) {
        started = true;
        break;
      }
    } catch (e) {
      // Not started yet
    }
  }

  if (!started) {
    console.error("❌ Failed to start Go Healthy Express server within the timeout.");
    console.error("Server output received so far:\n", serverOutput);
    serverProcess.kill();
    restoreBackup();
    process.exit(1);
  }
  console.log("✓ Express server successfully started.");

  let testPassed = true;

  try {
    // 3. Verify SQLite DB structures and seeding
    console.log("\n--- Checking database file and schemas ---");
    if (!fs.existsSync(dbPath)) {
      throw new Error("pos.db SQLite database file was not created by the server startup!");
    }
    console.log("✓ SQLite database file 'pos.db' exists.");

    // Now import database.js to perform queries
    const db = require('../database');

    const expectedTables = [
      'tables',
      'menu_items',
      'stocks',
      'active_orders',
      'kitchen_orders',
      'sales_history',
      'staff'
    ];

    const tablesInDb = await db.all(`SELECT name FROM sqlite_master WHERE type='table'`);
    const tableNames = tablesInDb.map(t => t.name);

    for (const table of expectedTables) {
      if (!tableNames.includes(table)) {
        throw new Error(`Table '${table}' is missing in the database!`);
      }
      console.log(`✓ Table '${table}' exists in SQLite database.`);
    }

    // Column schema validation
    const expectedColumns = {
      tables: ['id', 'name', 'category', 'x', 'y', 'shape', 'status'],
      menu_items: ['id', 'categoryId', 'name', 'price', 'description', 'image', 'popular', 'options'],
      stocks: ['id', 'name', 'quantity', 'unit', 'minLimit'],
      active_orders: ['tableId', 'items', 'discount', 'orderType', 'waiterId'],
      kitchen_orders: ['id', 'tableId', 'tableName', 'waiterId', 'status', 'items', 'timestamp'],
      sales_history: ['id', 'tableId', 'tableName', 'items', 'subtotal', 'tax', 'discount', 'total', 'paymentMethod', 'orderType', 'waiterId', 'timestamp'],
      staff: ['id', 'name', 'role', 'code', 'status', 'shiftStart']
    };

    for (const [table, cols] of Object.entries(expectedColumns)) {
      const colInfo = await db.all(`PRAGMA table_info(${table})`);
      const dbCols = colInfo.map(c => c.name);
      for (const col of cols) {
        if (!dbCols.includes(col)) {
          throw new Error(`Column '${col}' is missing in table '${table}'!`);
        }
      }
      console.log(`✓ Table structure validation passed for '${table}'.`);
    }

    // 4. Verify Firestore category IDs in seeded menu items
    const menuItems = await db.all(`SELECT * FROM menu_items`);
    console.log(`Seeded ${menuItems.length} menu items.`);
    if (menuItems.length === 0) {
      throw new Error("No menu items were seeded!");
    }

    const firestoreCategoryIds = [
      'G7Dybmqujf1ahEEDJask',
      'IDG2uULBtLhcIicltKSI',
      'HzfdmS0BdMoEGtRX6IDg',
      'L3SlF5TXqvlpC0tD2oVI',
      'J9V643KQdRIYsJiOHmLX',
      'kDkKyJRAjMcPSr69pEDk',
      'qKvNEcG5aQN2nx9ygarX',
      'yKsnp6EFSg45UWDaz9LK',
      'qrQmFX0ue7YpR9206WDV',
      'tETcPjbPcvEkInJMU7yL',
      'HKdwjIy3KG9sKvHfLmzL',
      'lKEsPjjMDIjucLMx3QQb'
    ];
    
    let matchedCategories = new Set();
    menuItems.forEach(item => {
      if (firestoreCategoryIds.includes(item.categoryId)) {
        matchedCategories.add(item.categoryId);
      }
    });

    console.log(`Matched categories in database:`, Array.from(matchedCategories));
    if (matchedCategories.size === 0) {
      throw new Error("Seeded menu items do not contain the new Firestore category IDs!");
    }
    console.log("✓ Seeded menu items successfully mapped to Firestore category IDs.");

    // 5. Test WebSocket Connection
    console.log("\n--- Testing Socket.io event broadcasting ---");
    const wsUrl = `ws://localhost:${PORT}/socket.io/?EIO=4&transport=websocket`;
    const ws = new WebSocket(wsUrl);

    let socketEvents = [];
    ws.onmessage = (event) => {
      const msg = event.data;
      if (msg.startsWith('0')) {
        // Send connect packet to establish the Socket.io connection on default namespace
        ws.send('40');
        console.log('[WebSocket] Sent connect packet (40)');
      } else if (msg.startsWith('40')) {
        console.log('[WebSocket] Connection acknowledged by Socket.io server');
      } else if (msg.startsWith('42')) {
        try {
          const parsed = JSON.parse(msg.substring(2));
          const [eventName, data] = parsed;
          socketEvents.push({ eventName, data });
          console.log(`[Socket.io Broadcaster] Received event: ${eventName}`);
        } catch (e) {
          console.error("Failed to parse WebSocket message:", msg);
        }
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket client connection error:", err);
    };

    // Wait for WebSocket handshake to complete
    await wait(1000);

    // 6. Test /api/state
    console.log("\n--- Testing GET /api/state ---");
    const stateRes = await fetch(`${BASE_URL}/api/state`);
    if (stateRes.status !== 200) {
      throw new Error(`/api/state returned status ${stateRes.status}`);
    }
    const stateData = await stateRes.json();
    if (!stateData.menuItems || !stateData.tables || !stateData.stocks || !stateData.staffMembers) {
      throw new Error("Invalid structure returned by /api/state");
    }
    console.log("✓ /api/state returns correct AppState schema.");
    
    const sampleCategoryMatches = stateData.menuItems.filter(item => item.categoryId === 'G7Dybmqujf1ahEEDJask');
    console.log(`Found ${sampleCategoryMatches.length} items with category ID G7Dybmqujf1ahEEDJask (e.g. ${sampleCategoryMatches[0]?.name})`);
    if (sampleCategoryMatches.length === 0) {
      throw new Error("No items with category ID G7Dybmqujf1ahEEDJask found in /api/state");
    }
    console.log("✓ /api/state response contains new category IDs.");

    // 7. Test POST /api/orders
    console.log("\n--- Testing POST /api/orders ---");
    const orderPayload = {
      tableId: "T1",
      items: [
        { id: "BBNpPyjOSxXmTdjPYtSK", name: "Magic Omlet", price: 330, quantity: 1, option: "", note: "Test order", isSentToKitchen: true }
      ],
      discount: 0,
      orderType: "dine-in",
      waiterId: "ahmet"
    };
    const orderRes = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload)
    });
    if (orderRes.status !== 200) {
      throw new Error(`/api/orders returned status ${orderRes.status}`);
    }
    const orderData = await orderRes.json();
    if (!orderData.success) {
      throw new Error(`/api/orders response did not indicate success`);
    }
    console.log("✓ POST /api/orders response status: 200 OK.");

    // Wait a bit and check if socket sync_state event was received
    await wait(600);
    const syncStateReceived = socketEvents.some(e => e.eventName === 'sync_state');
    if (!syncStateReceived) {
      throw new Error("Socket sync_state event was not broadcast on order creation");
    }
    console.log("✓ Socket.io broadcast sync_state successfully on order creation.");

    // Verify T1 status is 'busy' in state
    const afterOrderStateRes = await fetch(`${BASE_URL}/api/state`);
    const afterOrderState = await afterOrderStateRes.json();
    const t1Table = afterOrderState.tables.find(t => t.id === 'T1');
    if (t1Table.status !== 'busy') {
      throw new Error(`Table T1 status expected 'busy', got '${t1Table.status}'`);
    }
    console.log("✓ Table T1 status updated to 'busy' in State.");

    // 8. Test POST /api/kitchen/ticket
    console.log("\n--- Testing POST /api/kitchen/ticket ---");
    const ticketPayload = {
      id: "K-TEST-1234",
      tableId: "T1",
      tableName: "Masa 1",
      waiterId: "ahmet",
      items: [
        { name: "Magic Omlet", quantity: 1, option: "", note: "Test Note", cooked: false }
      ]
    };
    const ticketRes = await fetch(`${BASE_URL}/api/kitchen/ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticketPayload)
    });
    if (ticketRes.status !== 200) {
      throw new Error(`/api/kitchen/ticket returned status ${ticketRes.status}`);
    }
    const ticketData = await ticketRes.json();
    if (!ticketData.success) {
      throw new Error(`/api/kitchen/ticket response did not indicate success`);
    }
    console.log("✓ POST /api/kitchen/ticket response status: 200 OK.");

    // Verify socket event new_kitchen_ticket and sync_state
    await wait(600);
    const hasNewTicketEvent = socketEvents.some(e => e.eventName === 'new_kitchen_ticket');
    if (!hasNewTicketEvent) {
      throw new Error("Socket new_kitchen_ticket event was not broadcast");
    }
    console.log("✓ Socket.io broadcast new_kitchen_ticket successfully.");

    // 9. Test POST /api/settings/reset
    console.log("\n--- Testing POST /api/settings/reset ---");
    const resetRes = await fetch(`${BASE_URL}/api/settings/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (resetRes.status !== 200) {
      throw new Error(`/api/settings/reset returned status ${resetRes.status}`);
    }
    const resetData = await resetRes.json();
    if (!resetData.success) {
      throw new Error(`/api/settings/reset response did not indicate success`);
    }
    console.log("✓ POST /api/settings/reset response status: 200 OK.");

    // Verify T1 table status is reset to 'free'
    const afterResetStateRes = await fetch(`${BASE_URL}/api/state`);
    const afterResetState = await afterResetStateRes.json();
    const t1TableAfterReset = afterResetState.tables.find(t => t.id === 'T1');
    if (t1TableAfterReset.status !== 'free') {
      throw new Error(`Table T1 status expected 'free' after reset, got '${t1TableAfterReset.status}'`);
    }
    console.log("✓ Database successfully reset and table T1 returned to 'free'.");

    // Close WebSocket
    ws.close();

  } catch (err) {
    console.error("\n❌ Test failed with error:", err);
    testPassed = false;
  } finally {
    // 10. Clean up server process
    console.log("\nStopping Go Healthy Express server...");
    serverProcess.kill();

    // 11. Restore backup database
    restoreBackup();
  }

  if (testPassed) {
    console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY! Go Healthy POS backend QA verification is complete.");
    process.exit(0);
  } else {
    console.log("\n❌ TESTS FAILED. Please review the errors above.");
    process.exit(1);
  }
}

function restoreBackup() {
  if (fs.existsSync(backupPath)) {
    console.log("Restoring original pos.db database...");
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    fs.copyFileSync(backupPath, dbPath);
    fs.unlinkSync(backupPath);
    console.log("✓ Original database successfully restored.");
  }
}

main();
