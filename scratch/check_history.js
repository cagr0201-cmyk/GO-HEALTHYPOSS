process.env.DATABASE_URL = "postgresql://neondb_owner:npg_RlBTKjJ8tA9g@ep-dark-bar-aqd264pw-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const db = require('../database');

async function check() {
  try {
    const history = await db.all("SELECT id, tableId, tableName, total, paymentMethod, timestamp FROM sales_history ORDER BY timestamp DESC LIMIT 10");
    console.log("Recent Sales History:");
    history.forEach(h => {
      console.log(`- ID: ${h.id}, Table: ${h.tableId} (${h.tableName}), Total: ${h.total} ₺, Method: ${h.paymentMethod}, Time: ${h.timestamp}`);
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
