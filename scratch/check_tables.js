process.env.DATABASE_URL = "postgresql://neondb_owner:npg_RlBTKjJ8tA9g@ep-dark-bar-aqd264pw-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const db = require('../database');

async function check() {
  try {
    const tables = await db.all("SELECT * FROM tables ORDER BY id ASC");
    console.log("Tables in database:");
    tables.forEach(t => {
      console.log(`- Table: ${t.id} (${t.name}), Status: ${t.status}`);
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
