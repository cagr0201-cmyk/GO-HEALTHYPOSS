const db = require('../database.js');

async function testReset() {
  try {
    console.log("Initializing database and resetting tables...");
    
    // Simulate drop tables and init
    await db.run(`DROP TABLE IF EXISTS tables`);
    await db.run(`DROP TABLE IF EXISTS menu_items`);
    await db.run(`DROP TABLE IF EXISTS stocks`);
    await db.run(`DROP TABLE IF EXISTS active_orders`);
    await db.run(`DROP TABLE IF EXISTS kitchen_orders`);
    await db.run(`DROP TABLE IF EXISTS sales_history`);
    await db.run(`DROP TABLE IF EXISTS staff`);
    await db.run(`DROP TABLE IF EXISTS expenses`);
    
    await db.initDatabase();
    console.log("Database initialized successfully.");
    
    const salesCount = await db.get("SELECT COUNT(*) as count FROM sales_history");
    const expensesCount = await db.get("SELECT COUNT(*) as count FROM expenses");
    const menuCount = await db.get("SELECT COUNT(*) as count FROM menu_items");
    const tablesCount = await db.get("SELECT COUNT(*) as count FROM tables");
    const staffCount = await db.get("SELECT COUNT(*) as count FROM staff");
    
    console.log("Sales History count (should be 0):", salesCount.count);
    console.log("Expenses count (should be 0):", expensesCount.count);
    console.log("Menu Items count:", menuCount.count);
    console.log("Tables count:", tablesCount.count);
    console.log("Staff members count:", staffCount.count);
    
    const staff = await db.all("SELECT * FROM staff");
    console.log("Seeded staff members:", staff.map(s => `${s.name} (${s.role}, PIN: ${s.code})`).join(', '));
    
    if (Number(salesCount.count) === 0 && Number(expensesCount.count) === 0 && Number(menuCount.count) > 0) {
      console.log("Test PASSED: Database successfully reset to clean state!");
      process.exit(0);
    } else {
      console.error("Test FAILED: Database state is incorrect.");
      process.exit(1);
    }
  } catch (err) {
    console.error("Reset test encountered an error:", err);
    process.exit(1);
  }
}

testReset();
