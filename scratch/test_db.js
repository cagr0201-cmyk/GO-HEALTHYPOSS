const db = require('../database');

async function test() {
  try {
    console.log("Initializing database...");
    await db.initDatabase();
    console.log("Database initialized.");

    const orderId = "TEST-ORDER-" + Math.floor(1000 + Math.random() * 9000);
    const tableName = `Paket Servis (${orderId})`;
    const items = [
      { id: "avokado-ekmek", name: "Avokado Ekmek", price: 150, quantity: 1, option: "Paket Sipariş", note: "Test Note", isSentToKitchen: true }
    ];

    console.log("Inserting active order...");
    await db.run(
      `INSERT INTO active_orders (tableId, items, discount, orderType, waiterId)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(tableId) DO UPDATE SET
         items = excluded.items,
         discount = excluded.discount,
         orderType = excluded.orderType,
         waiterId = excluded.waiterId`,
      [orderId, JSON.stringify(items), 0, 'delivery', 'elif']
    );
    console.log("Active order inserted successfully.");

    console.log("Inserting kitchen order...");
    await db.run(
      `INSERT INTO kitchen_orders (id, tableId, tableName, waiterId, status, items, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['K-TEST-' + Math.random().toString(36).substr(2, 4).toUpperCase(), orderId, tableName, 'Entegrasyon', 'cooking', JSON.stringify(items), new Date().toISOString()]
    );
    console.log("Kitchen order inserted successfully.");

    console.log("Tests passed!");
    process.exit(0);
  } catch (err) {
    console.error("Test failed with error:", err);
    process.exit(1);
  }
}

test();
