const { Pool } = require('pg');

const DATABASE_URL = "postgresql://neondb_owner:npg_RlBTKjJ8tA9g@ep-dark-bar-aqd264pw-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// SQL translator to map SQLite '?' placeholders to PostgreSQL '$1, $2...' format
function translateSql(sql) {
  let index = 1;
  let converted = sql
    .replace(/\bREAL\b/gi, 'DOUBLE PRECISION')
    .replace(/\bINTEGER PRIMARY KEY\b/gi, 'TEXT PRIMARY KEY')
    .replace(/\?/g, () => `$${index++}`);
  return converted;
}

async function runTest() {
  try {
    console.log("Connecting to PostgreSQL...");
    
    // Check tables
    const tableCheck = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    console.log("Tables in database:", tableCheck.rows.map(r => r.table_name));

    const orderId = "TEST-ORDER-POSTGRES-" + Math.floor(1000 + Math.random() * 9000);
    const tableName = `Paket Servis (${orderId})`;
    const items = [
      { id: "avokado-ekmek", name: "Avokado Ekmek", price: 150, quantity: 1, option: "Paket Sipariş", note: "Test Note", isSentToKitchen: true }
    ];

    // Try active_orders insert
    const insertOrderSql = translateSql(
      `INSERT INTO active_orders (tableId, items, discount, orderType, waiterId)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(tableId) DO UPDATE SET
         items = excluded.items,
         discount = excluded.discount,
         orderType = excluded.orderType,
         waiterId = excluded.waiterId`
    );
    console.log("SQL for active_orders:", insertOrderSql);
    await pool.query(insertOrderSql, [orderId, JSON.stringify(items), 0, 'delivery', 'elif']);
    console.log("Active order inserted successfully in Postgres.");

    // Try kitchen_orders insert
    const insertTicketSql = translateSql(
      `INSERT INTO kitchen_orders (id, tableId, tableName, waiterId, status, items, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    console.log("SQL for kitchen_orders:", insertTicketSql);
    await pool.query(insertTicketSql, [
      'K-TEST-' + Math.random().toString(36).substr(2, 4).toUpperCase(),
      orderId,
      tableName,
      'Entegrasyon',
      'cooking',
      JSON.stringify(items),
      new Date().toISOString()
    ]);
    console.log("Kitchen order inserted successfully in Postgres.");

    console.log("PostgreSQL tests passed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("PostgreSQL test failed with error:", err);
    process.exit(1);
  }
}

runTest();
