process.env.DATABASE_URL = "postgresql://neondb_owner:npg_RlBTKjJ8tA9g@ep-dark-bar-aqd264pw-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const db = require('../database');

async function test() {
  try {
    const tableId = 'T1';
    const activeOrder = await db.get("SELECT * FROM active_orders WHERE tableId = ?", [tableId]);
    if (!activeOrder) {
      console.log("No active order found for T1");
      process.exit(0);
    }
    console.log("Active order found for T1:", activeOrder);
    
    const id = 'TX-TEST-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    const tableName = 'Masa 1';
    const items = JSON.parse(activeOrder.items);
    const subtotal = 589;
    const tax = 0;
    const discount = 0;
    const total = 589;
    const paymentMethod = 'CASH';
    const orderType = 'dine-in';
    const waiterId = '';
    
    console.log("Saving to sales history...");
    await db.run(
      `INSERT INTO sales_history (id, tableId, tableName, items, subtotal, tax, discount, total, paymentMethod, orderType, waiterId, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, tableId, tableName, JSON.stringify(items), subtotal, tax, discount, total, paymentMethod, orderType, waiterId, new Date().toISOString()]
    );
    console.log("✓ Saved to sales history.");

    console.log("Deleting active_orders...");
    await db.run("DELETE FROM active_orders WHERE tableId = ?", [tableId]);
    console.log("✓ Deleted active_orders.");

    console.log("Deleting kitchen_orders...");
    await db.run("DELETE FROM kitchen_orders WHERE tableId = ?", [tableId]);
    console.log("✓ Deleted kitchen_orders.");

    console.log("Updating tables SET status = 'free'...");
    await db.run("UPDATE tables SET status = 'free' WHERE id = ?", [tableId]);
    console.log("✓ Updated tables SET status = 'free'.");

    console.log("Verifying T1 status...");
    const tableAfter = await db.get("SELECT status FROM tables WHERE id = ?", [tableId]);
    console.log("Table status after:", tableAfter);
    
    const activeOrderAfter = await db.get("SELECT * FROM active_orders WHERE tableId = ?", [tableId]);
    console.log("Active order after:", activeOrderAfter);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

test();
