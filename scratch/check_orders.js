process.env.DATABASE_URL = "postgresql://neondb_owner:npg_RlBTKjJ8tA9g@ep-dark-bar-aqd264pw-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const db = require('../database');

async function check() {
  try {
    console.log("Fetching active orders...");
    const activeOrders = await db.all("SELECT * FROM active_orders ORDER BY tableId DESC");
    console.log("Active Orders:");
    activeOrders.forEach(o => {
      console.log(`- Table/Order ID: ${o.tableId}, Waiter: ${o.waiterId}, Type: ${o.orderType}`);
    });

    console.log("\nFetching kitchen orders...");
    const kitchenOrders = await db.all("SELECT * FROM kitchen_orders ORDER BY timestamp DESC LIMIT 5");
    console.log("Recent Kitchen Tickets:");
    kitchenOrders.forEach(k => {
      console.log(`- Ticket ID: ${k.id}, Table ID: ${k.tableId}, Table Name: ${k.tableName}, Status: ${k.status}, Waiter: ${k.waiterId}, Timestamp: ${k.timestamp}`);
    });

    process.exit(0);
  } catch (err) {
    console.error("Check failed:", err);
    process.exit(1);
  }
}

check();
