const orderId = "QR-TEST-" + Math.floor(1000 + Math.random() * 9000);
const items = [
  { name: "Avokado Ekmek", price: 290, quantity: 1, option: "Yumurtalı", note: "" }
];

async function run() {
  try {
    console.log("1. Simulating stock deduction for Avokado Ekmek...");
    // Find menuItem first
    const menuRes = await fetch("http://localhost:3000/api/state");
    const state = await menuRes.json();
    const menuItem = state.menuItems.find(mi => mi.name === items[0].name);
    
    if (!menuItem) {
      throw new Error("Avokado Ekmek not found in menu!");
    }

    const deductRes = await fetch("http://localhost:3000/api/stocks/deduct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: menuItem.id, quantity: items[0].quantity })
    });
    console.log("Stock deduction response status:", deductRes.status);
    const deductData = await deductRes.json();
    console.log("Stock deduction response data:", deductData);

    console.log("2. Sending order to /api/orders...");
    const orderRes = await fetch("http://localhost:3000/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tableId: orderId,
        items: items.map(i => {
          const mi = state.menuItems.find(x => x.name === i.name);
          return {
            id: mi ? mi.id : 'avokado-ekmek',
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            option: i.option || 'Paket Sipariş',
            note: 'Test Note',
            isSentToKitchen: true
          };
        }),
        discount: 0,
        orderType: 'delivery',
        waiterId: 'elif'
      })
    });
    console.log("Order response status:", orderRes.status);
    const orderData = await orderRes.json();
    console.log("Order response data:", orderData);

    console.log("3. Sending kitchen ticket to /api/kitchen/ticket...");
    const ticketRes = await fetch("http://localhost:3000/api/kitchen/ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 'K-DEL-' + Math.random().toString(36).substr(2, 4).toUpperCase(),
        tableId: orderId,
        tableName: `Paket Servis (${orderId})`,
        waiterId: 'Entegrasyon',
        items: items.map(i => ({
          name: i.name,
          quantity: i.quantity,
          option: i.option || 'Paket Servis',
          note: 'Test Note',
          cooked: false
        }))
      })
    });
    console.log("Ticket response status:", ticketRes.status);
    const ticketData = await ticketRes.json();
    console.log("Ticket response data:", ticketData);

    console.log("All steps completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Test flow failed with error:", err);
    process.exit(1);
  }
}

run();
