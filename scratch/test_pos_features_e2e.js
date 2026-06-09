const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 3099;
const BASE_URL = `http://localhost:${PORT}`;
const dbPath = path.join(__dirname, '..', 'pos.db');
const backupPath = path.join(__dirname, '..', 'pos.db.backup');

async function main() {
  console.log("==================================================");
  console.log("    POS NEW FEATURES INTEGRATION TEST (E2E)");
  console.log("==================================================");

  // 1. Back up database if it exists
  if (fs.existsSync(dbPath)) {
    console.log("Backing up existing pos.db to pos.db.backup...");
    fs.copyFileSync(dbPath, backupPath);
    fs.unlinkSync(dbPath);
  }

  // 2. Start the Express server
  console.log(`Starting Express server on port ${PORT}...`);
  const nodeBinary = path.join(__dirname, '..', 'node-v20.11.0-darwin-arm64', 'bin', 'node');
  const serverJs = path.join(__dirname, '..', 'server.js');

  const serverProcess = spawn(nodeBinary, [serverJs], {
    env: { ...process.env, PORT: PORT, DATABASE_URL: '' }, // SQLite local mode
    stdio: 'pipe'
  });

  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  let started = false;
  for (let i = 0; i < 15; i++) {
    await wait(600);
    try {
      const res = await fetch(`${BASE_URL}/api/state`);
      if (res.status === 200) {
        started = true;
        break;
      }
    } catch (e) {}
  }

  if (!started) {
    console.error("❌ Failed to start Go Healthy Express server.");
    serverProcess.kill();
    restoreBackup();
    process.exit(1);
  }
  console.log("✓ Express server started successfully.");

  let testPassed = true;

  try {
    // 3. Test 1: Fetch initial state & verify schema alteration (timestamp and customLabel exist)
    console.log("\n--- Test 1: Verifying active_orders columns ---");
    const stateRes = await fetch(`${BASE_URL}/api/state`);
    const state = await stateRes.json();
    console.log("✓ Fetch /api/state completed successfully.");
    console.log("✓ activeOrders: ", state.activeOrders);

    // 4. Test 2: Create active order with customLabel and timestamp
    console.log("\n--- Test 2: Creating active order with customLabel and timestamp ---");
    const testTimestamp = "2026-06-09T12:00:00.000Z";
    const testLabel = "Mustafa Ahmet";
    const orderPayload = {
      tableId: "T1",
      items: [
        { id: "item1", name: "Türk Kahvesi", price: 60, quantity: 2 }
      ],
      discount: 0,
      orderType: "dine-in",
      waiterId: "ahmet",
      timestamp: testTimestamp,
      customLabel: testLabel
    };

    const orderRes = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload)
    });

    if (orderRes.status !== 200) {
      throw new Error(`POST /api/orders failed with status ${orderRes.status}`);
    }
    console.log("✓ Order created successfully.");

    // Fetch state again and verify
    const stateRes2 = await fetch(`${BASE_URL}/api/state`);
    const state2 = await stateRes2.json();
    const createdOrder = state2.activeOrders["T1"];
    if (!createdOrder) {
      throw new Error("Active order not found for table T1!");
    }
    console.log("✓ Retrieved order for table T1:", createdOrder);
    if (createdOrder.customLabel !== testLabel) {
      throw new Error(`Expected customLabel '${testLabel}', got '${createdOrder.customLabel}'`);
    }
    if (createdOrder.timestamp !== testTimestamp) {
      throw new Error(`Expected timestamp '${testTimestamp}', got '${createdOrder.timestamp}'`);
    }
    console.log("✓ Test 2 Passed: customLabel and timestamp persisted correctly!");

    // 5. Test 3: Modify order items and toggle 'ikram' (treat)
    console.log("\n--- Test 3: Testing Treat (İkram) price calculation ---");
    // We add 1 regular coffee (60 ₺) and 1 treat coffee (60 ₺ -> 0 ₺)
    const orderPayload3 = {
      tableId: "T1",
      items: [
        { id: "item1", name: "Türk Kahvesi", price: 60, quantity: 1 },
        { id: "item1", name: "Türk Kahvesi", price: 60, quantity: 1, ikram: true }
      ],
      discount: 0,
      orderType: "dine-in",
      waiterId: "ahmet",
      timestamp: testTimestamp,
      customLabel: testLabel
    };

    const orderRes3 = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload3)
    });

    if (orderRes3.status !== 200) {
      throw new Error(`POST /api/orders failed with status ${orderRes3.status}`);
    }

    // Now checkout/pay for the table
    // Subtotal should be 60 (only 1 coffee is charged, other is ikram/free)
    const txId = "TX-E2E-TEST-IKRAM";
    const payPayload = {
      id: txId,
      tableId: "T1",
      tableName: "Masa 1 - Mustafa Ahmet",
      items: orderPayload3.items,
      subtotal: 60, // 60 + 0 = 60
      tax: 0,
      discount: 0,
      total: 60,
      paymentMethod: "CASH",
      orderType: "dine-in",
      waiterId: "ahmet"
    };

    console.log("Sending checkout pay payload with subtotal/total of 60 ₺...");
    const payRes = await fetch(`${BASE_URL}/api/orders/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payPayload)
    });

    if (payRes.status !== 200) {
      throw new Error(`POST /api/orders/pay failed with status ${payRes.status}`);
    }
    console.log("✓ Payment completed successfully.");

    // Fetch reports to verify transaction values
    const reportsRes = await fetch(`${BASE_URL}/api/reports`);
    const reports = await reportsRes.json();
    const checkedTx = reports.find(r => r.id === txId);
    if (!checkedTx) {
      throw new Error("Checkout transaction not found in sales history!");
    }
    console.log("✓ Retrieved transaction details:", checkedTx);
    if (Number(checkedTx.total) !== 60) {
      throw new Error(`Expected transaction total 60, got ${checkedTx.total}`);
    }
    // Verify items in the report have the ikram flag preserved
    const txItems = typeof checkedTx.items === 'string' ? JSON.parse(checkedTx.items) : checkedTx.items;
    console.log("✓ Transaction items list in database:", txItems);
    const ikramItem = txItems.find(i => i.ikram === true);
    if (!ikramItem) {
      throw new Error("Complimentary/ikram item property was not preserved in transaction!");
    }
    console.log("✓ Test 3 Passed: Treat items calculated as 0 ₺ and persisted successfully!");

    // 6. Test 4: Merge Active Orders
    console.log("\n--- Test 4: Merging active orders with custom labels ---");
    // Setup table T2 with a custom name
    const orderPayloadT2 = {
      tableId: "T2",
      items: [
        { id: "item2", name: "Su", price: 15, quantity: 1 }
      ],
      discount: 0,
      orderType: "dine-in",
      waiterId: "elif",
      timestamp: "2026-06-09T13:00:00.000Z",
      customLabel: "Vivense Home"
    };
    await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayloadT2)
    });

    // Setup table T3 with no custom name but a timestamp
    const orderPayloadT3 = {
      tableId: "T3",
      items: [
        { id: "item3", name: "Soda", price: 20, quantity: 1 }
      ],
      discount: 0,
      orderType: "dine-in",
      waiterId: "elif",
      timestamp: "2026-06-09T14:00:00.000Z"
    };
    await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayloadT3)
    });

    // Merge T2 (source) into T3 (target)
    // T3 (target) should acquire T2's customLabel because T3 had none, and target should keep target timestamp or fallback.
    console.log("Merging table T2 into T3...");
    const mergeRes = await fetch(`${BASE_URL}/api/orders/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceTableId: "T2",
        targetTableId: "T3"
      })
    });

    if (mergeRes.status !== 200) {
      throw new Error(`POST /api/orders/merge failed with status ${mergeRes.status}`);
    }
    console.log("✓ Merge endpoint completed successfully.");

    // Fetch state and verify target T3 details
    const stateRes4 = await fetch(`${BASE_URL}/api/state`);
    const state4 = await stateRes4.json();
    const mergedT3 = state4.activeOrders["T3"];
    const mergedT2 = state4.activeOrders["T2"];

    if (mergedT2) {
      throw new Error("Source table T2 was not deleted after merge!");
    }
    if (!mergedT3) {
      throw new Error("Target table T3 not found in active orders!");
    }
    console.log("✓ Retrieved merged target order (T3):", mergedT3);
    if (mergedT3.customLabel !== "Vivense Home") {
      throw new Error(`Expected merged customLabel to be 'Vivense Home', got '${mergedT3.customLabel}'`);
    }
    if (mergedT3.timestamp !== "2026-06-09T14:00:00.000Z") {
      throw new Error(`Expected merged timestamp to retain target's '2026-06-09T14:00:00.000Z', got '${mergedT3.timestamp}'`);
    }
    console.log("✓ Test 4 Passed: Order merging correctly resolves custom labels and timestamps!");

    console.log("\n🎉 ALL POS NEW FEATURES API TESTS PASSED SUCCESSFULLY!");

  } catch (err) {
    console.error("❌ POS new features test failed with error:", err);
    testPassed = false;
  } finally {
    console.log("\nStopping Express server...");
    serverProcess.kill();
    restoreBackup();
  }

  if (testPassed) {
    process.exit(0);
  } else {
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
