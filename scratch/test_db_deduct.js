process.env.DATABASE_URL = "postgresql://neondb_owner:npg_RlBTKjJ8tA9g@ep-dark-bar-aqd264pw-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const db = require('../database');

async function test() {
  try {
    console.log("Calling checkAndDeductStock('avokado-ekmek', 1) on live Postgres...");
    const result = await db.checkAndDeductStock('avokado-ekmek', 1);
    console.log("Deduct result:", result);
    process.exit(0);
  } catch (err) {
    console.error("Deduct failed with error:", err);
    process.exit(1);
  }
}

test();
