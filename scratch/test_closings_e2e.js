const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 3056;
const BASE_URL = `http://localhost:${PORT}`;
const dbPath = path.join(__dirname, '..', 'pos.db');
const backupPath = path.join(__dirname, '..', 'pos.db.backup');

async function main() {
  console.log("==================================================");
  console.log("    GO HEALTHY POS DAILY CLOSINGS API TEST");
  console.log("==================================================");

  // 1. Back up database if it exists
  if (fs.existsSync(dbPath)) {
    console.log("Backing up existing pos.db to pos.db.backup...");
    fs.copyFileSync(dbPath, backupPath);
    fs.unlinkSync(dbPath);
  }

  // 2. Start the Express server
  console.log(`Starting Express server on port ${PORT}...`);
  const nodeBinary = path.join(__dirname, '..', 'node-v20.11.0-darwin-arm64', 'bin', 'node');
  const serverJs = path.join(__dirname, '..', 'server.js');

  const serverProcess = spawn(nodeBinary, [serverJs], {
    env: { ...process.env, PORT: PORT, DATABASE_URL: '' }, // SQLite local mode
    stdio: 'pipe'
  });

  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  let started = false;
  for (let i = 0; i < 15; i++) {
    await wait(600);
    try {
      const res = await fetch(`${BASE_URL}/api/state`);
      if (res.status === 200) {
        started = true;
        break;
      }
    } catch (e) {}
  }

  if (!started) {
    console.error("❌ Failed to start Go Healthy Express server.");
    serverProcess.kill();
    restoreBackup();
    process.exit(1);
  }
  console.log("✓ Express server started successfully.");

  let testPassed = true;

  try {
    // 3. GET /api/closings (should be empty array at start)
    console.log("\n--- Testing GET /api/closings (Initial) ---");
    const getRes1 = await fetch(`${BASE_URL}/api/closings`);
    if (getRes1.status !== 200) {
      throw new Error(`GET /api/closings returned status ${getRes1.status}`);
    }
    const closings1 = await getRes1.json();
    console.log("Closings returned:", closings1);
    if (!Array.isArray(closings1) || closings1.length !== 0) {
      throw new Error("Expected initial closings list to be an empty array!");
    }
    console.log("✓ Correctly returned empty array initially.");

    // 4. POST /api/closings (submit a sample closing)
    console.log("\n--- Testing POST /api/closings ---");
    const sampleClosing = {
      id: "Z-TEST-9999",
      timestamp: new Date().toISOString(),
      closedBy: "Ahmet Test",
      startingCash: 500,
      expectedCash: 850,
      countedCash: 850,
      expectedCard: 1200,
      countedCard: 1200,
      expectedMealcard: 450,
      countedMealcard: 440, // 10 TL discrepancy (Eksik)
      expectedOther: 0,
      countedOther: 0,
      totalRevenue: 2000,
      totalExpenses: 100,
      notes: "Yemek kartında 10 TL fiş eksiği var."
    };

    const postRes = await fetch(`${BASE_URL}/api/closings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleClosing)
    });

    if (postRes.status !== 200) {
      throw new Error(`POST /api/closings returned status ${postRes.status}`);
    }
    const postResult = await postRes.json();
    console.log("POST Result:", postResult);
    if (!postResult.success) {
      throw new Error("Expected post result to indicate success");
    }
    console.log("✓ Closing submitted successfully.");

    // 5. GET /api/closings (verify it has the new item)
    console.log("\n--- Testing GET /api/closings (After Submit) ---");
    const getRes2 = await fetch(`${BASE_URL}/api/closings`);
    if (getRes2.status !== 200) {
      throw new Error(`GET /api/closings returned status ${getRes2.status}`);
    }
    const closings2 = await getRes2.json();
    console.log("Closings list after submit:", closings2);
    if (!Array.isArray(closings2) || closings2.length !== 1) {
      throw new Error("Expected closings list to contain exactly 1 closing record!");
    }
    const saved = closings2[0];
    if (saved.id !== "Z-TEST-9999" || saved.countedMealcard !== 440 || saved.closedBy !== "Ahmet Test") {
      throw new Error("Saved closing data mismatch!");
    }
    console.log("✓ Closing data successfully verified in database.");

    // 6. DELETE /api/closings/:id
    console.log("\n--- Testing DELETE /api/closings/:id ---");
    const delRes = await fetch(`${BASE_URL}/api/closings/Z-TEST-9999`, {
      method: 'DELETE'
    });
    if (delRes.status !== 200) {
      throw new Error(`DELETE /api/closings returned status ${delRes.status}`);
    }
    const delResult = await delRes.json();
    console.log("DELETE Result:", delResult);
    if (!delResult.success) {
      throw new Error("Expected delete result to indicate success");
    }
    console.log("✓ Closing deleted successfully.");

    // 7. GET /api/closings (should be empty again)
    console.log("\n--- Testing GET /api/closings (After Delete) ---");
    const getRes3 = await fetch(`${BASE_URL}/api/closings`);
    const closings3 = await getRes3.json();
    if (!Array.isArray(closings3) || closings3.length !== 0) {
      throw new Error("Expected closings list to be empty after deletion!");
    }
    console.log("✓ Verified database is empty after Z-report deletion.");

  } catch (err) {
    console.error("❌ Closings API test failed with error:", err);
    testPassed = false;
  } finally {
    console.log("\nStopping Express server...");
    serverProcess.kill();
    restoreBackup();
  }

  if (testPassed) {
    console.log("\n🎉 DAILY CLOSINGS API E2E TESTS PASSED SUCCESSFULLY!");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

function restoreBackup() {
  if (fs.existsSync(backupPath)) {
    console.log("Restoring original pos.db database...");
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    fs.copyFileSync(backupPath, dbPath);
    fs.unlinkSync(backupPath);
    console.log("✓ Original database successfully restored.");
  }
}

main();
