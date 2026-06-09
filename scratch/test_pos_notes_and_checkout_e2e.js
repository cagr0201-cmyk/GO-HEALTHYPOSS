const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 3099;
const BASE_URL = `http://localhost:${PORT}`;
const dbPath = path.join(__dirname, '..', 'pos.db');
const backupPath = path.join(__dirname, '..', 'pos.db.backup');

async function main() {
  console.log("==================================================");
  console.log("   POS NOTES & CHECKOUT FLOW INTEGRATION TEST");
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
    // Test 1: Fetch initial state & verify schema alteration (note property exists in activeOrders)
    console.log("\n--- Test 1: Verifying active_orders columns ---");
    const stateRes = await fetch(`${BASE_URL}/api/state`);
    const state = await stateRes.json();
    console.log("✓ Fetch /api/state completed successfully.");
    
    // Test 2: Create active order with a general note
    console.log("\n--- Test 2: Creating active order with a general note ---");
    const testNote = "Sıcak su istendi, cam kenarı";
    const orderPayload = {
      tableId: "T1",
      items: [
        { id: "item1", name: "Türk Kahvesi", price: 60, quantity: 2 }
      ],
      discount: 0,
      orderType: "dine-in",
      waiterId: "ahmet",
      timestamp: new Date().toISOString(),
      customLabel: "Mustafa",
      note: testNote
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

    // Fetch state again and verify note
    const stateRes2 = await fetch(`${BASE_URL}/api/state`);
    const state2 = await stateRes2.json();
    const createdOrder = state2.activeOrders["T1"];
    if (!createdOrder) {
      throw new Error("Active order not found for table T1!");
    }
    console.log("✓ Retrieved order for table T1:", createdOrder);
    if (createdOrder.note !== testNote) {
      throw new Error(`Expected note '${testNote}', got '${createdOrder.note}'`);
    }
    console.log("✓ Test 2 Passed: General order note persisted correctly in active_orders!");

    // Test 3: Send Order to Kitchen and verify note is saved in kitchen_orders
    console.log("\n--- Test 3: Sending order to kitchen and verifying note in kitchen_orders ---");
    const kitchenTicketPayload = {
      id: "K-TEST-NOTE-1",
      tableId: "T1",
      tableName: "Masa 1 - Mustafa",
      waiterId: "ahmet",
      items: [
        { id: "item1", name: "Türk Kahvesi", quantity: 2, option: "", note: "", ikram: false, cooked: false }
      ],
      note: testNote
    };

    const kitchenRes = await fetch(`${BASE_URL}/api/kitchen/ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(kitchenTicketPayload)
    });

    if (kitchenRes.status !== 200) {
      throw new Error(`POST /api/kitchen/ticket failed with status ${kitchenRes.status}`);
    }
    console.log("✓ Kitchen ticket sent successfully.");

    // Fetch state again to verify kitchenOrders list note
    const stateRes3 = await fetch(`${BASE_URL}/api/state`);
    const state3 = await stateRes3.json();
    const createdKitchenOrder = state3.kitchenOrders.find(ko => ko.id === "K-TEST-NOTE-1");
    if (!createdKitchenOrder) {
      throw new Error("Kitchen ticket K-TEST-NOTE-1 not found in kitchen orders!");
    }
    console.log("✓ Retrieved kitchen order:", createdKitchenOrder);
    if (createdKitchenOrder.note !== testNote) {
      throw new Error(`Expected kitchen order note to be '${testNote}', got '${createdKitchenOrder.note}'`);
    }
    console.log("✓ Test 3 Passed: General note persisted correctly in kitchen_orders table!");

    // Test 4: Checkout and Pay Order, verify note is saved in sales_history
    console.log("\n--- Test 4: Checking out table T1 and verifying note in sales_history ---");
    const txId = "TX-E2E-TEST-NOTE";
    const payPayload = {
      id: txId,
      tableId: "T1",
      tableName: "Masa 1 - Mustafa",
      items: orderPayload.items,
      subtotal: 120,
      tax: 0,
      discount: 0,
      total: 120,
      paymentMethod: "CASH",
      orderType: "dine-in",
      waiterId: "ahmet",
      note: testNote
    };

    const payRes = await fetch(`${BASE_URL}/api/orders/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payPayload)
    });

    if (payRes.status !== 200) {
      throw new Error(`POST /api/orders/pay failed with status ${payRes.status}`);
    }
    console.log("✓ Payment completed successfully.");

    // Fetch reports to verify transaction note value
    const reportsRes = await fetch(`${BASE_URL}/api/reports`);
    const reports = await reportsRes.json();
    const checkedTx = reports.find(r => r.id === txId);
    if (!checkedTx) {
      throw new Error("Checkout transaction not found in sales history!");
    }
    console.log("✓ Retrieved transaction details from reports:", checkedTx);
    if (checkedTx.note !== testNote) {
      throw new Error(`Expected transaction note '${testNote}', got '${checkedTx.note}'`);
    }
    console.log("✓ Test 4 Passed: Order note successfully saved to sales_history!");

    // Test 5: Merge active orders with notes and verify merging logic
    console.log("\n--- Test 5: Merging orders and verifying note combination ---");
    // Table T2 has note "Su ekstra sıcak olsun"
    const orderPayloadT2 = {
      tableId: "T2",
      items: [
        { id: "item2", name: "Su", price: 15, quantity: 1 }
      ],
      discount: 0,
      orderType: "dine-in",
      waiterId: "elif",
      timestamp: new Date().toISOString(),
      customLabel: "Elif",
      note: "Su ekstra sıcak olsun"
    };
    await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayloadT2)
    });

    // Table T3 has no note
    const orderPayloadT3 = {
      tableId: "T3",
      items: [
        { id: "item3", name: "Soda", price: 20, quantity: 1 }
      ],
      discount: 0,
      orderType: "dine-in",
      waiterId: "elif",
      timestamp: new Date().toISOString(),
      note: ""
    };
    await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayloadT3)
    });

    // Merge T2 (source) into T3 (target).
    // Target T3 note should become T2's note since target note is falsy.
    console.log("Merging T2 into T3...");
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
    const stateRes5 = await fetch(`${BASE_URL}/api/state`);
    const state5 = await stateRes5.json();
    const mergedT3 = state5.activeOrders["T3"];
    if (!mergedT3) {
      throw new Error("Target table T3 not found in active orders after merge!");
    }
    console.log("✓ Retrieved merged target order (T3):", mergedT3);
    if (mergedT3.note !== "Su ekstra sıcak olsun") {
      throw new Error(`Expected merged note to be 'Su ekstra sıcak olsun', got '${mergedT3.note}'`);
    }
    console.log("✓ Test 5 Passed: Order notes are correctly merged!");

    // Test 6: Checkout with payment method ODENMEZ
    console.log("\n--- Test 6: Checking out table with payment method ODENMEZ ---");
    const txOdenmezId = "TX-E2E-TEST-ODENMEZ";
    const payOdenmezPayload = {
      id: txOdenmezId,
      tableId: "T3",
      tableName: "Masa 3 - Elif",
      items: [
        { id: "item3", name: "Soda", price: 20, quantity: 1 },
        { id: "item2", name: "Su", price: 15, quantity: 1 }
      ],
      subtotal: 35,
      tax: 0,
      discount: 0,
      total: 35,
      paymentMethod: "ODENMEZ",
      orderType: "dine-in",
      waiterId: "elif",
      note: "Su ekstra sıcak olsun"
    };

    const payOdenmezRes = await fetch(`${BASE_URL}/api/orders/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payOdenmezPayload)
    });

    if (payOdenmezRes.status !== 200) {
      throw new Error(`POST /api/orders/pay failed for ODENMEZ with status ${payOdenmezRes.status}`);
    }
    console.log("✓ Payment with method ODENMEZ completed successfully.");

    // Fetch reports to verify transaction paymentMethod
    const reportsOdenmezRes = await fetch(`${BASE_URL}/api/reports`);
    const reportsOdenmez = await reportsOdenmezRes.json();
    const checkedOdenmezTx = reportsOdenmez.find(r => r.id === txOdenmezId);
    if (!checkedOdenmezTx) {
      throw new Error("Checkout transaction for ODENMEZ not found in sales history!");
    }
    console.log("✓ Retrieved transaction details from reports:", checkedOdenmezTx);
    if (checkedOdenmezTx.paymentMethod !== "ODENMEZ") {
      throw new Error(`Expected paymentMethod 'ODENMEZ', got '${checkedOdenmezTx.paymentMethod}'`);
    }
    console.log("✓ Test 6 Passed: Closed order with paymentMethod ODENMEZ successfully!");

    console.log("\n🎉 ALL NOTES AND CHECKOUT INTEGRATION TESTS PASSED SUCCESSFULLY!");

  } catch (err) {
    console.error("❌ Integration test failed with error:", err);
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
