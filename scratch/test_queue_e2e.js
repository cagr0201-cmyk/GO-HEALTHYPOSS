const { io } = require("socket.io-client");

const BASE_URL = "http://localhost:3000";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  let socket;
  try {
    console.log("=== STARTING E2E DELIVERY QUEUE TEST ===");

    // 1. Fetch active menu items from /api/state
    console.log("\n[Step 1] Fetching active menu items from /api/state...");
    const stateRes = await fetch(`${BASE_URL}/api/state`);
    if (!stateRes.ok) {
      throw new Error(`Failed to fetch app state: ${stateRes.statusText}`);
    }
    const appState = await stateRes.json();
    const menuItems = appState.menuItems;
    console.log(`Successfully fetched state. Found ${menuItems.length} menu items.`);

    // Choose 2 menu items for our simulated orders
    const item1 = menuItems.find(mi => mi.name === "Avokado Ekmek") || menuItems[0];
    const item2 = menuItems.find(mi => mi.name === "Magic Omlet") || menuItems[1];
    
    console.log(`Using items for test orders:`);
    console.log(`- Item 1: ${item1.name} (${item1.price} ₺)`);
    console.log(`- Item 2: ${item2.name} (${item2.price} ₺)`);

    // 2. Establish Socket.IO client connection
    console.log("\n[Step 2] Establishing Socket.IO connection to server...");
    socket = io(BASE_URL, {
      transports: ["websocket"]
    });

    const receivedAlerts = [];
    socket.on("incoming_delivery_alert", (data) => {
      console.log(`[Socket event] Received 'incoming_delivery_alert':`);
      console.log(`  Channel: ${data.channelId} (${data.order.channelName})`);
      console.log(`  Order ID: ${data.order.orderId}`);
      console.log(`  Total: ${data.order.total} ₺`);
      console.log(`  Items: ${data.order.items.map(i => `${i.quantity}x ${i.name}`).join(", ")}`);
      receivedAlerts.push(data);
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Socket connection timeout")), 5000);
      socket.on("connect", () => {
        clearTimeout(timeout);
        console.log("WebSocket client successfully connected!");
        resolve();
      });
    });

    // 3. Send 3 rapid POST requests to simulate incoming customer orders
    console.log("\n[Step 3] Sending 3 rapid POST requests to /api/delivery/simulate...");
    
    const simulatedOrders = [
      {
        channelId: "yemeksepeti",
        order: {
          orderId: "DEL-YS-" + Math.floor(1000 + Math.random() * 9000),
          channel: "yemeksepeti",
          channelName: "Yemeksepeti",
          items: [
            { name: item1.name, price: item1.price, quantity: 1, option: "Yumurtalı", note: "Yemeksepeti Siparişi" }
          ],
          total: item1.price,
          customerName: "Ali Veli",
          customerPhone: "05551112233",
          customerAddress: "Kadıköy, İstanbul"
        }
      },
      {
        channelId: "getir",
        order: {
          orderId: "DEL-GT-" + Math.floor(1000 + Math.random() * 9000),
          channel: "getir",
          channelName: "Getir Yemek",
          items: [
            { name: item2.name, price: item2.price, quantity: 2, option: "Pankekli", note: "Getir Yemek Siparişi" }
          ],
          total: item2.price * 2,
          customerName: "Ayşe Yılmaz",
          customerPhone: "05554445566",
          customerAddress: "Beşiktaş, İstanbul"
        }
      },
      {
        channelId: "trendyol",
        order: {
          orderId: "DEL-TY-" + Math.floor(1000 + Math.random() * 9000),
          channel: "trendyol",
          channelName: "Trendyol Go",
          items: [
            { name: item1.name, price: item1.price, quantity: 1, option: "Sade", note: "Trendyol Go Siparişi" },
            { name: item2.name, price: item2.price, quantity: 1, option: "Pankekli", note: "Trendyol Go Siparişi" }
          ],
          total: item1.price + item2.price,
          customerName: "Mehmet Kaya",
          customerPhone: "05557778899",
          customerAddress: "Şişli, İstanbul"
        }
      }
    ];

    // Trigger rapid POST requests
    const postPromises = simulatedOrders.map(payload => {
      console.log(`- Sending simulation request for ${payload.order.channelName} (Order: ${payload.order.orderId})`);
      return fetch(`${BASE_URL}/api/delivery/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(res => {
        if (!res.ok) throw new Error(`POST failed for ${payload.order.channelName}`);
        return res.json();
      });
    });

    const postResults = await Promise.all(postPromises);
    console.log("All 3 simulation trigger responses received:", postResults);

    // Wait for WebSocket event propagation
    console.log("\nWaiting 2 seconds for WebSocket event propagation...");
    await sleep(2000);

    // 4. Verify socket alerts
    console.log(`\n[Step 4] Verifying socket alerts...`);
    console.log(`Total alerts received over WebSocket: ${receivedAlerts.length} (Expected: 3)`);
    if (receivedAlerts.length !== 3) {
      throw new Error(`Expected 3 socket alerts, but got ${receivedAlerts.length}`);
    }
    console.log("Socket alert E2E propagation verified successfully!");

    // 5. Simulate client-side queue transitions (app.js)
    console.log("\n[Step 5] Simulating client-side queue variables logic (app.js)...");
    
    // Mimicking window.pendingDeliveryOrders queue
    const pendingDeliveryOrders = [];
    let currentPendingDeliveryOrder = null;

    function triggerIncomingDeliveryClient(channelId, order) {
      pendingDeliveryOrders.push({ channelId, order });
      console.log(`[Queue Action] Pushed to queue. Queue size: ${pendingDeliveryOrders.length}`);
      
      if (pendingDeliveryOrders.length === 1) {
        currentPendingDeliveryOrder = pendingDeliveryOrders[0].order;
        console.log(`[Queue Action] Modal opened with current order: ${currentPendingDeliveryOrder.orderId}`);
      }
      
      // Update Title logic
      if (currentPendingDeliveryOrder) {
        const queueLength = pendingDeliveryOrders.length;
        console.log(`[UI Simulated Title] "${currentPendingDeliveryOrder.channelName}: Yeni Sipariş! (Bekleyen: ${queueLength})"`);
      }
    }

    // Process alerts sequentially as they would arrive
    for (const alert of receivedAlerts) {
      triggerIncomingDeliveryClient(alert.channelId, alert.order);
    }

    console.log(`\nFinal simulated queue size before processing: ${pendingDeliveryOrders.length}`);

    // Process/Accept orders one by one to verify DB and queue decrement
    while (pendingDeliveryOrders.length > 0) {
      const nextItem = pendingDeliveryOrders[0];
      currentPendingDeliveryOrder = nextItem.order;
      const queueLength = pendingDeliveryOrders.length;
      
      console.log(`\n--- Processing next order from queue (Bekleyen: ${queueLength}) ---`);
      console.log(`Accepting ${currentPendingDeliveryOrder.channelName} Order: ${currentPendingDeliveryOrder.orderId}`);

      const orderId = currentPendingDeliveryOrder.orderId;
      const channelName = currentPendingDeliveryOrder.channelName;
      const items = currentPendingDeliveryOrder.items;

      // A. Stock deduction check & simulation
      for (const item of items) {
        const menuItem = menuItems.find(mi => mi.name === item.name);
        if (menuItem) {
          const deductRes = await fetch(`${BASE_URL}/api/stocks/deduct`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: menuItem.id, quantity: item.quantity })
          });
          const deductData = await deductRes.json();
          console.log(`  Stock deduction for ${item.name}: success=${deductData.success}`);
        }
      }

      // B. Save order to /api/orders
      console.log(`  Saving active order to /api/orders...`);
      const resOrders = await fetch(`${BASE_URL}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId: orderId,
          items: items.map(i => {
            const menuItem = menuItems.find(mi => mi.name === i.name);
            return {
              id: menuItem ? menuItem.id : "test-item",
              name: i.name,
              price: i.price,
              quantity: i.quantity,
              option: i.option || "Paket Sipariş",
              note: `${channelName} Sipariş No: ${orderId}`,
              isSentToKitchen: true
            };
          }),
          discount: 0,
          orderType: "delivery",
          waiterId: "elif"
        })
      });
      const orderResData = await resOrders.json();
      console.log(`  Active order save response:`, orderResData);

      // C. Save kitchen ticket to /api/kitchen/ticket
      console.log(`  Sending ticket to kitchen...`);
      const ticketId = "K-DEL-" + Math.random().toString(36).substr(2, 4).toUpperCase();
      const resTicket = await fetch(`${BASE_URL}/api/kitchen/ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: ticketId,
          tableId: orderId,
          tableName: `${channelName} (${orderId})`,
          waiterId: "Entegrasyon",
          items: items.map(i => ({
            name: i.name,
            quantity: i.quantity,
            option: i.option || "Paket Servis",
            note: `${channelName} Mutfak Notu`,
            cooked: false
          }))
        })
      });
      const ticketResData = await resTicket.json();
      console.log(`  Kitchen ticket save response:`, ticketResData);

      // D. Verify persistence in SQLite
      console.log(`  Verifying persistence in database state...`);
      const checkStateRes = await fetch(`${BASE_URL}/api/state`);
      const checkState = await checkStateRes.json();
      
      const activeOrderSaved = checkState.activeOrders[orderId];
      const kitchenTicketSaved = checkState.kitchenOrders.find(k => k.tableId === orderId);

      if (!activeOrderSaved || !kitchenTicketSaved) {
        throw new Error(`DB verification failed! Active order or kitchen ticket not found for ID: ${orderId}`);
      }
      console.log(`  [Verified] Active order & Kitchen ticket successfully created in Database.`);

      // E. Simulate receipt print
      console.log(`\n================ SIMULATED RECEIPT ================`);
      console.log(`Tarih/Saat: ${new Date().toLocaleString("tr-TR")}`);
      console.log(`Adisyon: ${channelName} (Paket)`);
      console.log(`Sipariş No: ${orderId}`);
      console.log(`Garson: Entegrasyon`);
      console.log(`--------------------------------------------------`);
      items.forEach(i => {
        console.log(`${i.quantity}x ${i.name.padEnd(25)} ${(i.price * i.quantity).toFixed(2)} ₺`);
        if (i.option) console.log(`  * Seçenek: ${i.option}`);
      });
      console.log(`--------------------------------------------------`);
      console.log(`Ara Toplam: ${items.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2)} ₺`);
      console.log(`Toplam Tutar: ${items.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2)} ₺`);
      console.log(`Ödeme Yöntemi: CARD (Kredi Kartı)`);
      console.log(`====================================================\n`);

      // F. Shift queue
      pendingDeliveryOrders.shift();
      console.log(`[Queue Action] Shifted queue. Remaining queue size: ${pendingDeliveryOrders.length}`);
    }

    // 6. Test database checkout and payment history logic
    console.log("\n[Step 6] Testing Database Checkout & Sales History Logic...");
    
    // Choose the first simulated order to pay out
    const testOrderToPay = simulatedOrders[0].order;
    const payPayload = {
      id: "TX-DEL-" + Math.floor(1000 + Math.random() * 9000),
      tableId: testOrderToPay.orderId,
      tableName: `${testOrderToPay.channelName} (${testOrderToPay.orderId})`,
      items: testOrderToPay.items,
      subtotal: testOrderToPay.total,
      tax: 0,
      discount: 0,
      total: testOrderToPay.total,
      paymentMethod: "CARD",
      orderType: "delivery",
      waiterId: "elif"
    };

    console.log(`Paying order ${testOrderToPay.orderId} of amount ${testOrderToPay.total} ₺ via /api/orders/pay...`);
    const payRes = await fetch(`${BASE_URL}/api/orders/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payPayload)
    });
    const payData = await payRes.json();
    console.log(`Pay response:`, payData);

    // Verify it is cleared from active orders and exists in sales history
    console.log("Verifying sales history database records...");
    const reportsRes = await fetch(`${BASE_URL}/api/reports`);
    const reports = await reportsRes.json();

    const saleInHistory = reports.find(s => s.id === payPayload.id);
    const finalStateRes = await fetch(`${BASE_URL}/api/state`);
    const finalState = await finalStateRes.json();

    const isClearedFromActive = !finalState.activeOrders[testOrderToPay.orderId];
    const isClearedFromKitchen = !finalState.kitchenOrders.some(k => k.tableId === testOrderToPay.orderId);

    console.log(`- Is active order cleared? ${isClearedFromActive}`);
    console.log(`- Is kitchen ticket cleared? ${isClearedFromKitchen}`);
    console.log(`- Exists in sales history reports? ${!!saleInHistory}`);

    if (!isClearedFromActive || !isClearedFromKitchen || !saleInHistory) {
      throw new Error("Checkout verification failed! Database integrity not maintained.");
    }
    console.log("Database checkout logic verified successfully!");

    console.log("\n=== ALL E2E TEST STEPS COMPLETED SUCCESSFULLY ===");
    socket.disconnect();
    process.exit(0);

  } catch (err) {
    console.error("\nE2E Queue Test Failed:", err.message);
    if (socket) socket.disconnect();
    process.exit(1);
  }
}

run();
