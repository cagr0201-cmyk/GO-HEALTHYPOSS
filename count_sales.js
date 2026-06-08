const { Pool } = require('pg');

const DATABASE_URL = "postgresql://neondb_owner:npg_RlBTKjJ8tA9g@ep-dark-bar-aqd264pw-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

async function main() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log("Connecting to PostgreSQL...");
    const resCount = await pool.query("SELECT COUNT(*) as count FROM sales_history");
    console.log("sales_history count:", resCount.rows[0].count);

    const resSample = await pool.query("SELECT * FROM sales_history ORDER BY timestamp DESC LIMIT 5");
    console.log("Recent sales history:");
    console.log(JSON.stringify(resSample.rows, null, 2));

    const dateRange = await pool.query("SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM sales_history");
    console.log("Date range:", dateRange.rows[0]);

  } catch (err) {
    console.error("Error executing query:", err);
  } finally {
    await pool.end();
  }
}

main();
