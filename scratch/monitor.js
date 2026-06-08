process.env.DATABASE_URL = "postgresql://neondb_owner:npg_RlBTKjJ8tA9g@ep-dark-bar-aqd264pw-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const db = require('../database');

async function monitor() {
  console.log("Starting DB monitor on Cloud PostgreSQL...");
  let lastActiveOrders = {};
  let lastTableStatuses = {};

  // Initial load
  try {
    const activeOrders = await db.all("SELECT * FROM active_orders");
    activeOrders.forEach(o => {
      lastActiveOrders[o.tableId] = o.items;
    });

    const tables = await db.all("SELECT * FROM tables");
    tables.forEach(t => {
      lastTableStatuses[t.id] = t.status;
    });
    console.log("Initial load complete. Monitoring changes...");
  } catch (err) {
    console.error("Initial load failed:", err);
    process.exit(1);
  }

  while (true) {
    try {
      const activeOrders = await db.all("SELECT * FROM active_orders");
      const currentActiveOrders = {};
      activeOrders.forEach(o => {
        currentActiveOrders[o.tableId] = o.items;
      });

      // Check for deleted orders
      for (const tableId of Object.keys(lastActiveOrders)) {
        if (!currentActiveOrders[tableId]) {
          console.log(`[${new Date().toLocaleTimeString()}] ORDER DELETED for Table: ${tableId}`);
        }
      }

      // Check for inserted or modified orders
      for (const tableId of Object.keys(currentActiveOrders)) {
        if (!lastActiveOrders[tableId]) {
          console.log(`[${new Date().toLocaleTimeString()}] ORDER CREATED for Table: ${tableId} with items: ${currentActiveOrders[tableId]}`);
        } else if (lastActiveOrders[tableId] !== currentActiveOrders[tableId]) {
          console.log(`[${new Date().toLocaleTimeString()}] ORDER MODIFIED for Table: ${tableId} new items: ${currentActiveOrders[tableId]}`);
        }
      }

      lastActiveOrders = currentActiveOrders;

      const tables = await db.all("SELECT * FROM tables");
      const currentTableStatuses = {};
      tables.forEach(t => {
        currentTableStatuses[t.id] = t.status;
      });

      for (const id of Object.keys(currentTableStatuses)) {
        if (lastTableStatuses[id] !== currentTableStatuses[id]) {
          console.log(`[${new Date().toLocaleTimeString()}] TABLE STATUS CHANGED for Table: ${id} (${tables.find(t=>t.id===id).name}) -> ${lastTableStatuses[id]} to ${currentTableStatuses[id]}`);
        }
      }

      lastTableStatuses = currentTableStatuses;

      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error("Monitor loop error:", err);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

monitor();
