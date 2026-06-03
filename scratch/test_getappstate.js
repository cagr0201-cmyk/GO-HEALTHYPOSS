process.env.DATABASE_URL = "postgresql://neondb_owner:npg_RlBTKjJ8tA9g@ep-dark-bar-aqd264pw-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const db = require('../database');

async function test() {
  try {
    console.log("Calling getAppState() on live Postgres...");
    const state = await db.getAppState();
    console.log("AppState retrieved successfully!");
    console.log("Number of tables:", state.tables.length);
    console.log("Number of menu items:", state.menuItems.length);
    console.log("Number of active orders:", Object.keys(state.activeOrders).length);
    console.log("Number of kitchen orders:", state.kitchenOrders.length);
    process.exit(0);
  } catch (err) {
    console.error("getAppState failed with error:", err);
    process.exit(1);
  }
}

test();
