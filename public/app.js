// Go Healthy POS
// Add "Extralar" category for POS panel only
if (typeof MENU_CATEGORIES !== 'undefined') {
  if (!MENU_CATEGORIES.some(cat => cat.id === 'extras')) {
    MENU_CATEGORIES.push({
      id: 'extras',
      name: 'EKSTRALAR',
      icon: '✨'
    });
  }
}

// İçecek kategorileri (mutfak ekranında GÖSTERİLMEZ, kasada yazdırılır)
const DRINK_CATEGORY_IDS_CLIENT = new Set([
  'yKsnp6EFSg45UWDaz9LK', // SOFT İÇECEKLER
  'qrQmFX0ue7YpR9206WDV', // DETOKS&SHOTLAR
  'tETcPjbPcvEkInJMU7yL', // TAZE SIKIM
  'HKdwjIy3KG9sKvHfLmzL', // SICAK İÇECEKLER
  'lKEsPjjMDIjucLMx3QQb', // SOĞUK KAHVELER
]);

// State ve Temel Mekanizmalar

let AppState = {
  activeView: 'tables',
  activeFloor: 'Salon',
  selectedTable: null,
  activeOrders: {},       // { tableId: { items: [], discount: 0, orderType: 'dine-in', waiterId: 'ahmet' } }
  kitchenOrders: [],      // [ { id, tableId, tableName, items: [], timestamp, status: 'cooking' } ]
  salesHistory: [],       // Geçmiş tamamlanan satışlar
  menuItems: [],          // Dinamik menü listesi
  tables: [],             // Dinamik masa listesi
  staffMembers: [],       // Personel durumu, şifre ve çalışma saatleri
  stocks: [],             // Hammadde stokları
  activePaymentMethod: 'CASH',
  activeStaff: null,      // Mesaideki güncel kasiyer/yönetici
  currentPinInput: '',    // PIN modalı için geçici tuşlama verisi
  selectedSplitItems: [], // Bölünecek seçili adisyon kalemleri listesi
  reportPeriod: 'today',  // Rapor dönemi ('today', 'yesterday', 'week', 'month', 'year', 'custom')
  dashboardSubTab: 'charts', // Dashboard alt sekmesi ('charts', 'ledger', 'expenses')
  expenses: [],           // Restoran giderleri
  charts: {
    trends: null,
    share: null
  }
};

// QR Menü Mobil Simülatör Kartı
let QRCart = {
  items: [],
  selectedTableId: 'T4'
};

// Otomatik Paket Servis Simülasyon Zamanlayıcısı
let deliverySimulatorInterval = null;
let currentPendingDeliveryOrder = null;
window.pendingDeliveryOrders = [];

// --- UYGULAMA BAŞLANGICI & SOCKET BAĞLANTISI ---
const socket = io();

document.addEventListener('DOMContentLoaded', () => {
  fetchAppState();
  initClock();
  initUIElements();
  switchScreen('tables');
  
  // Lucide İkonları Yükle
  lucide.createIcons();
});

// Real-time synchronization event from server
socket.on('sync_state', (data) => {
  AppState.menuItems = data.menuItems;
  AppState.tables = data.tables;
  AppState.kitchenOrders = data.kitchenOrders;
  AppState.activeOrders = data.activeOrders;
  AppState.stocks = data.stocks;
  AppState.staffMembers = data.staffMembers;
  AppState.stockStatus = data.stockStatus;
  AppState.expenses = data.expenses || [];

  AppState.activeStaff = resolveActiveStaff();
  updateActiveStaffHeader();

  AppState.tables.forEach(table => {
    if (AppState.activeOrders[table.id]) {
      const hasCooking = AppState.kitchenOrders.some(ko => ko.tableId === table.id && ko.status === 'cooking');
      table.status = hasCooking ? 'busy' : 'bill';
    } else {
      table.status = 'free';
    }
  });

  // Dynamically redraw active views
  if (AppState.activeView === 'tables') { renderTableMap(); renderActiveDeliveries(); }
  else if (AppState.activeView === 'pos') { renderPOSMenu(); renderCart(); }
  else if (AppState.activeView === 'kitchen') renderKitchenMonitor();
  else if (AppState.activeView === 'settings') renderStockManagementTable();
  else if (AppState.activeView === 'dashboard') renderDashboard();
});

// Live KDS socket notification listeners
socket.on('new_kitchen_ticket', (data) => {
  if (AppState.activeStaff && AppState.activeStaff.role === 'Patron') return;
  showToast(`Yeni Mutfak Siparişi! ${data.tableName} siparişi iletildi.`, 'success');
  if (data.waiterId === 'Müşteri') {
    startOrderSoundLoop();
  }
});

socket.on('kitchen_ticket_ready', (data) => {
  if (AppState.activeStaff && AppState.activeStaff.role === 'Patron') return;
  showToast(`${data.tableName} siparişi hazır! Servis edebilirsiniz.`, 'info');
  playOrderBeep();
});

// Live delivery notification listener
socket.on('incoming_delivery_alert', (data) => {
  if (AppState.activeStaff && AppState.activeStaff.role === 'Patron') return;
  triggerIncomingDeliveryClient(data.channelId, data.order);
});

// Live remote print request listener — calls localPrint to avoid API loop
socket.on('remote_print_request', (data) => {
  if (AppState.activeStaff && (AppState.activeStaff.role === 'Kasiyer' || AppState.activeStaff.role === 'Müdür' || AppState.activeStaff.role === 'Patron')) {
    if (isPrinterConnected()) {
      localPrint(data.tx, data.type);
    }
  }
});

// --- VERİ YÜKLEME VE YEREL DEPOLAMA (SUNUCU EŞLEŞTİRME) ---
async function fetchAppState() {
  try {
    const response = await fetch('/api/state');
    const data = await response.json();
    
    AppState.menuItems = data.menuItems;
    AppState.tables = data.tables;
    AppState.kitchenOrders = data.kitchenOrders;
    AppState.activeOrders = data.activeOrders;
    AppState.stocks = data.stocks;
    AppState.staffMembers = data.staffMembers;
    AppState.stockStatus = data.stockStatus;

    // Sunucu bağlantı bilgileri ve karekod güncellemesi
    const serverIpText = document.getElementById('server-ip-text');
    const connectionQR = document.getElementById('server-connection-qr');
    if (serverIpText) {
      serverIpText.innerHTML = `Sunucu Adresi:<br><code style="font-size:15px; color:#fff;">http://${data.serverIp}:${data.serverPort}</code>`;
    }
    if (connectionQR) {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=http://${data.serverIp}:${data.serverPort}`;
      connectionQR.innerHTML = `<img src="${qrUrl}" alt="Sunucu Bağlantı QR" style="width:110px; height:110px; border-radius:4px;">`;
    }

    AppState.activeStaff = resolveActiveStaff();
    updateActiveStaffHeader();

    AppState.tables.forEach(table => {
      if (AppState.activeOrders[table.id]) {
        const hasCooking = AppState.kitchenOrders.some(ko => ko.tableId === table.id && ko.status === 'cooking');
        table.status = hasCooking ? 'busy' : 'bill';
      } else {
        table.status = 'free';
      }
    });

    if (AppState.activeView === 'tables') {
      renderTableMap();
      renderActiveDeliveries();
    }

  } catch (err) {
    console.error('Error fetching state:', err);
    showToast('Sunucu bağlantısı kurulamadı!', 'error');
  }
}

async function saveActiveOrderToServer(tableId) {
  if (window.checkingOutTables && window.checkingOutTables.has(tableId)) {
    console.log(`Save skipped for table ${tableId} because checkout is in progress`);
    return;
  }
  const order = AppState.activeOrders[tableId];
  try {
    if (!order || !order.items || order.items.length === 0) {
      delete AppState.activeOrders[tableId];
      if (tableId !== 'quick') {
        const table = AppState.tables.find(t => t.id === tableId);
        if (table) table.status = 'free';
      }
      await fetch(`/api/orders/${tableId}`, { method: 'DELETE' });
    } else {
      await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId,
          items: order.items,
          discount: order.discount,
          orderType: order.orderType,
          waiterId: order.waiterId
        })
      });
    }
  } catch (err) {
    console.error('Error saving order to server:', err);
    showToast('Sipariş kaydedilemedi!', 'error');
  }
}

// --- DİNAMİK SAAT SİNYALİ ---
function initClock() {
  const clockEl = document.getElementById('current-time');
  setInterval(() => {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('tr-TR');
    
    if (AppState.activeView === 'kitchen') {
      updateKitchenTimers();
    }
  }, 1000);
}

// --- ARAYÜZ ELEMENTLERİ DOLDURMA ---
function initUIElements() {
  // 1. Kat seçici tablarını doldur
  const floors = [...new Set(AppState.tables.map(t => t.category))];
  const floorContainer = document.getElementById('floor-selector-container');
  floorContainer.innerHTML = '';
  
  floors.forEach(floor => {
    const tab = document.createElement('button');
    tab.className = `floor-tab ${floor === AppState.activeFloor ? 'active' : ''}`;
    tab.textContent = floor;
    tab.onclick = () => selectFloor(floor);
    floorContainer.appendChild(tab);
  });

  // 2. Garson listelerini doldur
  const waiterSelect = document.getElementById('cart-waiter-select');
  waiterSelect.innerHTML = '';
  AppState.staffMembers.forEach(staff => {
    const opt = document.createElement('option');
    opt.value = staff.id;
    opt.textContent = `${staff.name} (${staff.role})`;
    waiterSelect.appendChild(opt);
  });

  // 3. Ayarlar ekranındaki kategorileri doldur
  const categorySelect = document.getElementById('s-item-category');
  categorySelect.innerHTML = '';
  MENU_CATEGORIES.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = `${cat.icon} ${cat.name}`;
    categorySelect.appendChild(opt);
  });

  // 4. POS kategori tablarını doldur
  const posCatContainer = document.getElementById('categories-tabs-container');
  posCatContainer.innerHTML = '';
  
  const allTab = document.createElement('div');
  allTab.className = 'category-tab active';
  allTab.id = 'cat-all';
  allTab.innerHTML = `<span>📂</span> <span>Tüm Menü</span>`;
  allTab.onclick = () => selectPOSCategory('all');
  posCatContainer.appendChild(allTab);

  MENU_CATEGORIES.forEach(cat => {
    const tab = document.createElement('div');
    tab.className = 'category-tab';
    tab.id = `cat-${cat.id}`;
    tab.innerHTML = `<span>${cat.icon}</span> <span>${cat.name}</span>`;
    tab.onclick = () => selectPOSCategory(cat.id);
    posCatContainer.appendChild(tab);
  });

  // 5. Header personel durumunu güncelle
  updateActiveStaffHeader();

  // 6. QR Menü Masaları Seçicisini doldur
  const qrTableSelect = document.getElementById('qr-table-select');
  qrTableSelect.innerHTML = '';
  AppState.tables.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.name} (QR)`;
    if (t.id === 'T4') opt.selected = true;
    qrTableSelect.appendChild(opt);
  });

  // Rapor dönemi için varsayılan tarihleri ayarla ve dashboard'u ilklendir
  changeReportPeriod('today');
}

function updateSidebarForRole(role) {
  const navTables = document.getElementById('nav-tables');
  const navPos = document.getElementById('nav-pos');
  const navKitchen = document.getElementById('nav-kitchen');
  const navDashboard = document.getElementById('nav-dashboard');
  const navSettings = document.getElementById('nav-settings');

  // Dashboard elements to hide/show for Garson
  const metricsGrid = document.querySelector('.metrics-grid');
  const dbTabs = document.querySelector('.dashboard-tabs');
  const dbFilterBar = document.querySelector('.dashboard-filter-bar');
  
  if (role === 'Patron') {
    if (navTables) navTables.style.display = 'none';
    if (navPos) navPos.style.display = 'none';
    if (navKitchen) navKitchen.style.display = 'none';
    if (navSettings) navSettings.style.display = 'none';
    if (navDashboard) navDashboard.style.display = 'flex';

    if (metricsGrid) metricsGrid.style.display = 'grid';
    if (dbTabs) dbTabs.style.display = 'flex';
    if (dbFilterBar) dbFilterBar.style.display = 'flex';

    if (AppState.activeView !== 'dashboard') {
      switchScreen('dashboard');
    }
  } else if (role === 'Garson') {
    if (navTables) navTables.style.display = 'flex';
    if (navPos) navPos.style.display = 'flex';
    if (navKitchen) navKitchen.style.display = 'flex';
    if (navSettings) navSettings.style.display = 'none';
    if (navDashboard) navDashboard.style.display = 'flex';

    if (metricsGrid) metricsGrid.style.display = 'none';
    if (dbTabs) dbTabs.style.display = 'none';
    if (dbFilterBar) dbFilterBar.style.display = 'none';

    switchDashboardTab('expenses');

    if (AppState.activeView === 'settings') {
      switchScreen('tables');
    }
  } else {
    if (navTables) navTables.style.display = 'flex';
    if (navPos) navPos.style.display = 'flex';
    if (navKitchen) navKitchen.style.display = 'flex';
    if (navDashboard) navDashboard.style.display = 'flex';
    if (navSettings) navSettings.style.display = 'flex';

    if (metricsGrid) metricsGrid.style.display = 'grid';
    if (dbTabs) dbTabs.style.display = 'flex';
    if (dbFilterBar) dbFilterBar.style.display = 'flex';
  }
}

function resolveActiveStaff() {
  const localActiveStaffId = localStorage.getItem('localActiveStaffId');
  if (localActiveStaffId) {
    const localStaff = AppState.staffMembers.find(s => s.id === localActiveStaffId);
    if (localStaff) return localStaff;
  }
  // Fallback: exclude Patron from automatic fallback
  const fallbackStaff = AppState.staffMembers.find(s => s.role !== 'Patron');
  return fallbackStaff || null;
}

function updateActiveStaffHeader() {
  const badge = document.getElementById('active-staff-badge');
  const avatar = document.getElementById('sidebar-staff-avatar');
  
  if (AppState.activeStaff) {
    badge.textContent = `${AppState.activeStaff.role}: ${AppState.activeStaff.name}`;
    avatar.textContent = AppState.activeStaff.name.charAt(0);
    avatar.title = `${AppState.activeStaff.name} (${AppState.activeStaff.role})`;
    updateSidebarForRole(AppState.activeStaff.role);
  } else {
    badge.textContent = 'Personel Yok (Giriş Yapılmamış)';
    avatar.textContent = '?';
    updateSidebarForRole('default');
  }
}

// --- EKRAN GEÇİŞ YÖNETİMİ ---
async function fetchSalesHistoryFromServer() {
  try {
    const res = await fetch('/api/reports');
    if (!res.ok) throw new Error('Sales history fetch failed');
    const data = await res.json();
    AppState.salesHistory = data;
  } catch (err) {
    console.error(err);
    showToast('Satış geçmişi yüklenemedi!', 'error');
  }
}

async function switchScreen(viewName) {
  // Patron rolü Analiz (dashboard) dışındaki ekranlara geçemez
  if (AppState.activeStaff && AppState.activeStaff.role === 'Patron' && viewName !== 'dashboard') {
    return;
  }

  // Garson rolü Ayarlar (settings) ekranına geçemez
  if (AppState.activeStaff && AppState.activeStaff.role === 'Garson' && viewName === 'settings') {
    return;
  }

  document.querySelectorAll('.screen').forEach(scr => scr.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

  const targetScreen = document.getElementById(`screen-${viewName}`);
  const targetNav = document.getElementById(`nav-${viewName}`);
  
  if (targetScreen) targetScreen.classList.add('active');
  if (targetNav) targetNav.classList.add('active');

  AppState.activeView = viewName;

  const mainTitle = document.getElementById('header-main-title');
  const subTitle = document.getElementById('header-sub-title');
  
  if (viewName === 'tables') {
    mainTitle.textContent = `Masa Haritası - ${AppState.activeFloor}`;
    subTitle.textContent = 'Akıllı Masa Haritası Düzeni';
    renderTableMap();
    renderActiveDeliveries();
  } else if (viewName === 'pos') {
    const label = AppState.selectedTable ? AppState.selectedTable.name : 'Hızlı Satış';
    mainTitle.textContent = `POS Satış Paneli - ${label}`;
    subTitle.textContent = 'Reçete bazlı stok kontrollü akıllı menü listesi';
    renderPOSMenu();
    renderCart();
  } else if (viewName === 'kitchen') {
    mainTitle.textContent = 'KDS Mutfak Monitörü';
    subTitle.textContent = 'Hazırlık süreçleri ve KDS bilet kontrolü';
    renderKitchenMonitor();
  } else if (viewName === 'dashboard') {
    mainTitle.textContent = 'Canlı Satış Raporları & Analitik';
    subTitle.textContent = 'Günlük ciro ve ürün tercih grafikleri';
    await fetchSalesHistoryFromServer();
    renderDashboard();
  } else if (viewName === 'settings') {
    mainTitle.textContent = 'Sistem Yönetim & Reçete Ayarları';
    subTitle.textContent = 'Hammadde stok ve menü reçete yönetim paneli';
    renderStockManagementTable();
    loadPrinterSettings();
  }

  lucide.createIcons();
}

// --- MASA HARİTASI İŞLEMLERİ ---
function selectFloor(floorName) {
  AppState.activeFloor = floorName;
  document.querySelectorAll('.floor-tab').forEach(tab => {
    if (tab.textContent === floorName) tab.classList.add('active');
    else tab.classList.remove('active');
  });
  
  if (AppState.activeView === 'tables') {
    document.getElementById('header-main-title').textContent = `Masa Haritası - ${floorName}`;
    renderTableMap();
  }
}

function renderTableMap() {
  const mapArea = document.getElementById('table-map-area');
  mapArea.innerHTML = '';
  
  const filteredTables = AppState.tables.filter(t => t.category === AppState.activeFloor);
  
  filteredTables.forEach(table => {
    const tableDiv = document.createElement('div');
    tableDiv.className = `table-item ${table.shape} status-${table.status}`;
    tableDiv.style.left = `${table.x}%`;
    tableDiv.style.top = `${table.y}%`;
    
    let totalText = 'Boş';
    if (table.status !== 'free') {
      const activeOrder = AppState.activeOrders[table.id];
      if (activeOrder) {
        const totalAmount = calculateOrderTotal(activeOrder);
        totalText = `${totalAmount.toFixed(2)} ₺`;
      }
    }
    
    tableDiv.innerHTML = `
      <div class="table-body">
        ${table.id}
      </div>
      <div class="table-details">
        ${table.name}<br><strong>${totalText}</strong>
      </div>
    `;
    
    tableDiv.onclick = () => {
      if (AppState.activeStaff && AppState.activeStaff.role === 'Patron') {
        showToast('Patron yetkisi ile masalara müdahale edilemez!', 'warning');
        return;
      }
      AppState.selectedTable = table;
      switchScreen('pos');
    };
    mapArea.appendChild(tableDiv);
  });
}

// --- REÇETE VE STOK KONTROL ALGORİTMASI ---
function checkStockStatus(menuItemId) {
  // Reçeteyi kontrol et
  const recipe = MENU_RECIPES[menuItemId];
  if (!recipe) return 'available'; // Reçetesiz ürünler serbest satılır

  let status = 'available';
  
  for (const ingredient of recipe) {
    const stockItem = AppState.stocks.find(s => s.id === ingredient.ingredientId);
    if (!stockItem) continue;

    // Eğer gerekli miktar eldeki miktardan fazla ise tükendi
    if (stockItem.quantity < ingredient.quantity) {
      return 'out-of-stock';
    }
    
    // Eğer eldeki miktar minLimit'in altındaysa kritik stok
    if (stockItem.quantity - ingredient.quantity <= stockItem.minLimit) {
      status = 'low-stock';
    }
  }
  return status;
}

async function checkAndDeductStock(menuItemId, quantity = 1) {
  try {
    const response = await fetch('/api/stocks/deduct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: menuItemId, quantity })
    });
    const result = await response.json();
    if (result.success) {
      if (result.alerts && result.alerts.length > 0) {
        result.alerts.forEach(name => {
          showToast(`Düşük Hammadde Uyarısı: ${name} seviyesi kritik limitin altında!`, 'warning');
        });
      }
      return true;
    } else {
      showToast(result.error || 'Stok yetersiz!', 'error');
      return false;
    }
  } catch (err) {
    console.error('Deduct error:', err);
    return false;
  }
}

// --- POS MENÜ YÖNETİMİ ---
let activePOSCategory = 'all';

function selectPOSCategory(catId) {
  activePOSCategory = catId;
  document.querySelectorAll('.category-tab').forEach(tab => {
    if (tab.id === `cat-${catId}`) tab.classList.add('active');
    else tab.classList.remove('active');
  });
  renderPOSMenu();
}

function renderPOSMenu(itemsToRender = null) {
  const grid = document.getElementById('menu-items-grid');
  grid.innerHTML = '';
  
  let list = itemsToRender || AppState.menuItems;
  if (!itemsToRender && activePOSCategory !== 'all') {
    list = AppState.menuItems.filter(item => item.categoryId === activePOSCategory);
  }
  
  list.forEach(item => {
    const stockStatus = checkStockStatus(item.id);
    const card = document.createElement('div');
    
    let extraClass = '';
    if (stockStatus === 'out-of-stock') extraClass = 'out-of-stock';
    else if (stockStatus === 'low-stock') extraClass = 'low-stock';

    card.className = `menu-card ${extraClass}`;
    
    let popularBadge = item.popular ? `<span class="menu-card-badge">Popüler</span>` : '';
    let imageSrc = item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80';
    
    card.innerHTML = `
      ${popularBadge}
      <img src="${imageSrc}" class="menu-card-image" alt="${item.name}">
      <div class="menu-card-content">
        <div>
          <h4 class="menu-card-title">${item.name}</h4>
          <p class="menu-card-desc">${item.description || 'Taze ve sağlıklı olarak servis edilir.'}</p>
        </div>
        <div class="menu-card-footer">
          <span class="menu-card-price">${item.price.toFixed(2)} ₺</span>
          <button class="menu-card-add-btn" onclick="event.stopPropagation(); handleAddItemToCart('${item.id}')" ${stockStatus === 'out-of-stock' ? 'disabled' : ''}>
            <i data-lucide="plus"></i>
          </button>
        </div>
      </div>
    `;
    
    if (stockStatus !== 'out-of-stock') {
      card.onclick = () => handleAddItemToCart(item.id);
    } else {
      card.onclick = () => showToast('Bu ürünün hammadde stoğu tükendiği için sipariş alınamıyor!', 'error');
    }
    
    grid.appendChild(card);
  });
  lucide.createIcons();
}

function handleMenuSearch() {
  const query = document.getElementById('menu-search-input').value.toLowerCase().trim();
  if (query === '') {
    renderPOSMenu();
    return;
  }
  
  const filtered = AppState.menuItems.filter(item => {
    return item.name.toLowerCase().includes(query) || 
           item.description.toLowerCase().includes(query);
  });
  renderPOSMenu(filtered);
}

// --- CART / SEPET HAREKETLERİ ---
function renderCart() {
  const listEl = document.getElementById('cart-items-list');
  listEl.innerHTML = '';
  
  const tableLabel = document.getElementById('cart-table-label');
  const sendKitchenBtn = document.getElementById('btn-send-kitchen');
  const checkoutBtn = document.getElementById('btn-checkout');
  const splitBtn = document.getElementById('btn-split-bill');
  const mergeBtn = document.getElementById('btn-merge-tables');
  
  const tableId = AppState.selectedTable ? AppState.selectedTable.id : 'quick';
  tableLabel.textContent = AppState.selectedTable ? AppState.selectedTable.name : 'Hızlı Satış';
  
  let activeOrder = AppState.activeOrders[tableId];
  
  if (!activeOrder || !activeOrder.items || activeOrder.items.length === 0) {
    listEl.innerHTML = `
      <div class="cart-empty-state">
        <i data-lucide="shopping-bag"></i>
        <p>Adisyonda ürün bulunmuyor.</p>
        <span style="font-size: 11px;">Eklemek için soldan ürün seçin.</span>
      </div>
    `;
    
    document.getElementById('summary-subtotal').textContent = '0.00 ₺';
    document.getElementById('summary-tax').textContent = '0.00 ₺';
    document.getElementById('summary-total').textContent = '0.00 ₺';
    document.getElementById('summary-discount-input').value = 0;
    
    sendKitchenBtn.disabled = true;
    checkoutBtn.disabled = true;
    splitBtn.disabled = true;
    mergeBtn.disabled = true;
    lucide.createIcons();
    return;
  }
  
  sendKitchenBtn.disabled = false;
  checkoutBtn.disabled = false;
  splitBtn.disabled = false;
  mergeBtn.disabled = AppState.selectedTable ? false : true; // Hızlı satışta masa birleştirme pasiftir

  const waiterSelect = document.getElementById('cart-waiter-select');
  waiterSelect.value = activeOrder.waiterId || 'garson';

  document.querySelectorAll('.cart-type-btn').forEach(btn => {
    if (btn.id === `btn-${activeOrder.orderType}`) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  activeOrder.items.forEach((item, index) => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'cart-item';
    
    let noteText = item.note ? `<div class="cart-item-note">* Not: ${item.note}</div>` : '';
    let optText = item.option ? ` (${item.option})` : '';
    
    itemDiv.innerHTML = `
      <div class="cart-item-row">
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}${optText}</div>
          ${noteText}
        </div>
        <div class="cart-item-price-col">
          <div class="cart-item-price">${(item.price * item.quantity).toFixed(2)} ₺</div>
        </div>
      </div>
      <div class="cart-item-actions">
        <div class="cart-item-qty-control">
          <div class="qty-btn" onclick="updateCartItemQty('${tableId}', ${index}, -1)"><i data-lucide="minus"></i></div>
          <span class="qty-number">${item.quantity}</span>
          <div class="qty-btn" onclick="updateCartItemQty('${tableId}', ${index}, 1)"><i data-lucide="plus"></i></div>
        </div>
        <div class="cart-item-remove-btn" onclick="removeCartItem('${tableId}', ${index})">
          <i data-lucide="trash-2"></i>
        </div>
      </div>
    `;
    listEl.appendChild(itemDiv);
  });
  
  recalculateTotals(false);
  lucide.createIcons();
}

async function handleAddItemToCart(itemId) {
  const item = AppState.menuItems.find(i => i.id === itemId);
  if (!item) return;

  const tableId = AppState.selectedTable ? AppState.selectedTable.id : 'quick';
  
  // Reçete stok kontrolü
  const currentStockStatus = checkStockStatus(item.id);
  if (currentStockStatus === 'out-of-stock') {
    showToast('Bu ürünün hammadde stokları tamamen bittiği için sipariş eklenemez!', 'error');
    return;
  }

  if (!AppState.activeOrders[tableId]) {
    AppState.activeOrders[tableId] = {
      items: [],
      discount: 0,
      orderType: 'dine-in',
      waiterId: document.getElementById('cart-waiter-select').value
    };
  }

  if (item.options && item.options.length > 0) {
    openCustomiseModal(item, async (customOption, note) => {
      // Stoğu rezerve et/düş
      const success = await checkAndDeductStock(item.id, 1);
      if (success) {
        await addItemToActiveOrder(tableId, item, customOption, note);
        showToast(`${item.name} adisyona eklendi.`, 'success');
        renderCart();
      } else {
        showToast('Hammade yetersizliği nedeniyle sipariş eklenemedi.', 'error');
      }
    });
  } else {
    const success = await checkAndDeductStock(item.id, 1);
    if (success) {
      await addItemToActiveOrder(tableId, item, null, '');
      showToast(`${item.name} adisyona eklendi.`, 'success');
      renderCart();
    } else {
      showToast('Hammade yetersizliği nedeniyle sipariş eklenemedi.', 'error');
    }
  }
}

async function addItemToActiveOrder(tableId, item, option, note) {
  const order = AppState.activeOrders[tableId];
  
  const existing = order.items.find(i => i.id === item.id && i.option === option && i.note === note);
  if (existing) {
    existing.quantity += 1;
  } else {
    order.items.push({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
      option: option || '',
      note: note || '',
      isSentToKitchen: false
    });
  }
  
  if (AppState.selectedTable) {
    const table = AppState.tables.find(t => t.id === tableId);
    if (table && table.status === 'free') {
      table.status = 'busy';
    }
  }
  
  await saveActiveOrderToServer(tableId);
}

async function updateCartItemQty(tableId, index, delta) {
  const order = AppState.activeOrders[tableId];
  if (!order || !order.items[index]) return;
  
  const item = order.items[index];
  
  if (delta > 0) {
    // Stok kontrolü yap ve düş
    const success = await checkAndDeductStock(item.id, 1);
    if (!success) {
      showToast('Stok yetersizliği nedeniyle adedi artıramazsınız!', 'error');
      return;
    }
    item.quantity += 1;
  } else {
    // Geri iade stoğu ekle (isteğe bağlı)
    await checkAndDeductStock(item.id, -1);
    item.quantity -= 1;
  }
  
  if (item.quantity <= 0) {
    order.items.splice(index, 1);
  }
  
  if (order.items.length === 0) {
    delete AppState.activeOrders[tableId];
    if (tableId !== 'quick') {
      const table = AppState.tables.find(t => t.id === tableId);
      if (table) table.status = 'free';
    }
  }
  
  await saveActiveOrderToServer(tableId);
  renderCart();
  if (AppState.activeView === 'tables') renderTableMap();
}

async function removeCartItem(tableId, index) {
  const order = AppState.activeOrders[tableId];
  if (!order || !order.items[index]) return;
  
  const item = order.items[index];
  // Stoğu geri iade et
  await checkAndDeductStock(item.id, -item.quantity);

  order.items.splice(index, 1);
  
  if (order.items.length === 0) {
    delete AppState.activeOrders[tableId];
    if (tableId !== 'quick') {
      const table = AppState.tables.find(t => t.id === tableId);
      if (table) table.status = 'free';
    }
  }
  
  await saveActiveOrderToServer(tableId);
  renderCart();
}

async function setOrderType(type) {
  const tableId = AppState.selectedTable ? AppState.selectedTable.id : 'quick';
  if (AppState.activeOrders[tableId]) {
    AppState.activeOrders[tableId].orderType = type;
    document.querySelectorAll('.cart-type-btn').forEach(btn => {
      if (btn.id === `btn-${type}`) btn.classList.add('active');
      else btn.classList.remove('active');
    });
    await saveActiveOrderToServer(tableId);
  }
}

// Garson Değişimi Dinleyicisi
document.getElementById('cart-waiter-select').addEventListener('change', async (e) => {
  const tableId = AppState.selectedTable ? AppState.selectedTable.id : 'quick';
  if (AppState.activeOrders[tableId]) {
    AppState.activeOrders[tableId].waiterId = e.target.value;
    await saveActiveOrderToServer(tableId);
  }
});

// --- HESAPLAMA SİSTEMİ ---
async function recalculateTotals(shouldSave = true) {
  const tableId = AppState.selectedTable ? AppState.selectedTable.id : 'quick';
  const order = AppState.activeOrders[tableId];
  
  if (!order) return;

  const subtotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discountInput = document.getElementById('summary-discount-input');
  const discountPercent = parseFloat(discountInput.value) || 0;
  
  order.discount = discountPercent;
  
  const discountAmount = subtotal * (discountPercent / 100);
  const subtotalWithDiscount = subtotal - discountAmount;
  const tax = 0;
  const total = subtotalWithDiscount;

  document.getElementById('summary-subtotal').textContent = `${subtotal.toFixed(2)} ₺`;
  document.getElementById('summary-tax').textContent = `${tax.toFixed(2)} ₺`;
  document.getElementById('summary-total').textContent = `${total.toFixed(2)} ₺`;
  
  if (shouldSave) {
    await saveActiveOrderToServer(tableId);
  }
}

function calculateOrderTotal(order) {
  if (!order || !order.items) return 0;
  const subtotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discountAmount = subtotal * ((order.discount || 0) / 100);
  const subtotalWithDiscount = subtotal - discountAmount;
  return subtotalWithDiscount;
}

// --- MODAL: ÜRÜN ÖZELLEŞTİRME VE NOT MODALI ---
let selectedOption = '';

function openCustomiseModal(item, callback) {
  const modal = document.getElementById('modal-customise');
  document.getElementById('customise-item-title').textContent = item.name;
  
  const optionsList = document.getElementById('customise-options-list');
  optionsList.innerHTML = '';
  selectedOption = item.options[0];
  
  item.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = `option-badge-btn ${idx === 0 ? 'selected' : ''}`;
    btn.textContent = opt;
    btn.onclick = () => {
      document.querySelectorAll('.option-badge-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedOption = opt;
    };
    optionsList.appendChild(btn);
  });

  document.getElementById('customise-item-note').value = '';
  modal.classList.add('active');

  const confirmBtn = document.getElementById('btn-customise-confirm');
  confirmBtn.onclick = () => {
    const note = document.getElementById('customise-item-note').value.trim();
    modal.classList.remove('active');
    callback(selectedOption, note);
  };
}

// --- MUTFAK EKLEME / KDS ---
async function sendActiveOrderToKitchen() {
  const tableId = AppState.selectedTable ? AppState.selectedTable.id : 'quick';
  const order = AppState.activeOrders[tableId];
  
  if (!order || order.items.length === 0) {
    showToast('Adisyon boş, mutfağa gönderilemez!', 'error');
    return;
  }

  const unsentItems = order.items.filter(item => !item.isSentToKitchen);
  
  if (unsentItems.length === 0) {
    showToast('Bu sipariş zaten mutfağa gönderilmiş!', 'info');
    return;
  }

  const kitchenTicket = {
    id: 'K-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
    tableId: tableId,
    tableName: AppState.selectedTable ? AppState.selectedTable.name : 'Hızlı Satış',
    waiterId: order.waiterId,
    timestamp: new Date().toISOString(),
    status: 'cooking',
    items: unsentItems.map(item => ({
      name: item.name,
      quantity: item.quantity,
      option: item.option,
      note: item.note,
      cooked: false
    }))
  };

  try {
    await fetch('/api/kitchen/ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(kitchenTicket)
    });

    order.items.forEach(item => item.isSentToKitchen = true);
    await saveActiveOrderToServer(tableId);

    // Kasıdaki yazıcıdan mutfak fişi yazdırmak üzere sunucuya gönder
    try {
      await fetch('/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tx: kitchenTicket, type: 'kitchen' })
      });
    } catch (printErr) {
      console.error('Error sending remote print request:', printErr);
    }

    showToast('Siparişler mutfak ekranına iletildi.', 'success');
    switchScreen('tables');
  } catch (err) {
    console.error('Error sending kitchen ticket:', err);
    showToast('Sipariş mutfağa iletilemedi!', 'error');
  }
}

function renderKitchenMonitor() {
  const container = document.getElementById('kitchen-cards-container');
  container.innerHTML = '';

  const activeTickets = AppState.kitchenOrders.filter(ko => ko.status === 'cooking');

  if (activeTickets.length === 0) {
    container.innerHTML = `
      <div class="kitchen-empty-state">
        <i data-lucide="chef-hat"></i>
        <p>Mutfakta beklemede olan sipariş bulunmuyor.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  activeTickets.forEach(ticket => {
    const card = document.createElement('div');
    
    const orderTime = new Date(ticket.timestamp);
    const diffMins = Math.floor((new Date() - orderTime) / 60000);
    
    let timerClass = '';
    if (diffMins >= 10) timerClass = 'danger';
    else if (diffMins >= 5) timerClass = 'warning';
    
    const cardClass = diffMins >= 10 ? 'kitchen-card priority-high' : 'kitchen-card';
    card.className = cardClass;
    card.id = `k-card-${ticket.id}`;

    // Mutfak ekranında sadece yemek ürünlerini göster; içecekler kasa yazıcısına gider
    const foodItems = ticket.items.filter(item => {
      const menuItem = AppState.menuItems.find(mi => mi.name === item.name);
      if (!menuItem) return true; // bilinmeyen ürünleri mutfakta göster
      return !DRINK_CATEGORY_IDS_CLIENT.has(menuItem.categoryId);
    });

    if (foodItems.length === 0) return; // sadece içecek varsa kartı gösterme

    let itemRows = '';
    foodItems.forEach((item, index) => {
      const realIndex = ticket.items.indexOf(item);
      const cookedClass = item.cooked ? 'cooked' : '';
      const noteHtml = item.note ? `<div class="k-item-note">* Not: ${item.note}</div>` : '';
      const optText = item.option ? ` (${item.option})` : '';

      itemRows += `
        <div class="kitchen-item ${cookedClass}" onclick="toggleKitchenItemCooked('${ticket.id}', ${realIndex})">
          <div style="display: flex; align-items: flex-start;">
            <span class="k-item-qty">${item.quantity}x</span>
            <div class="k-item-info">
              <div>${item.name}${optText}</div>
              ${noteHtml}
            </div>
          </div>
          <div class="k-check-circle">
            <i data-lucide="check"></i>
          </div>
        </div>
      `;
    });

    card.innerHTML = `
      <div class="kitchen-card-header">
        <span class="k-table-name">${ticket.tableName}</span>
        <span class="k-timer ${timerClass}" id="timer-${ticket.id}" data-time="${ticket.timestamp}">
          <i data-lucide="clock" style="width:12px; height:12px;"></i> ${diffMins} dk
        </span>
      </div>
      <div class="kitchen-card-info">
        <span>Bilet: ${ticket.id}</span>
        <span>Garson: ${ticket.waiterId.toUpperCase()}</span>
      </div>
      <div class="kitchen-items-list">
        ${itemRows}
      </div>
      <div class="kitchen-card-footer">
        <button class="kitchen-complete-btn" onclick="completeKitchenOrder('${ticket.id}')">
          Siparişi Tamamla
        </button>
      </div>
    `;

    container.appendChild(card);
  });
  lucide.createIcons();
}

function updateKitchenTimers() {
  document.querySelectorAll('.k-timer').forEach(timerEl => {
    const startTimeStr = timerEl.getAttribute('data-time');
    if (!startTimeStr) return;
    
    const startTime = new Date(startTimeStr);
    const diffMins = Math.floor((new Date() - startTime) / 60000);
    
    timerEl.innerHTML = `<i data-lucide="clock" style="width:12px; height:12px;"></i> ${diffMins} dk`;
    
    timerEl.className = 'k-timer';
    if (diffMins >= 10) {
      timerEl.classList.add('danger');
      const card = timerEl.closest('.kitchen-card');
      if (card && !card.classList.contains('priority-high')) {
        card.classList.add('priority-high');
      }
    } else if (diffMins >= 5) {
      timerEl.classList.add('warning');
    }
  });
  lucide.createIcons();
}

async function toggleKitchenItemCooked(ticketId, itemIndex) {
  try {
    await fetch('/api/kitchen/toggle-cooked', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId, itemIndex })
    });
  } catch (err) {
    console.error('Error toggling kitchen item:', err);
    showToast('Mutfak ürünü güncellenemedi!', 'error');
  }
}

async function completeKitchenOrder(ticketId) {
  try {
    await fetch('/api/kitchen/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId })
    });
  } catch (err) {
    console.error('Error completing kitchen ticket:', err);
    showToast('Mutfak siparişi tamamlanamadı!', 'error');
  }
}

// --- MODAL: ÖDEME ALMA VE CHECKOUT ---
function openCheckoutModal() {
  const tableId = AppState.selectedTable ? AppState.selectedTable.id : 'quick';
  const order = AppState.activeOrders[tableId];
  
  if (!order || order.items.length === 0) return;

  const total = calculateOrderTotal(order);
  
  document.getElementById('checkout-due-amount').textContent = `${total.toFixed(2)} ₺`;
  
  const quickCashContainer = document.getElementById('quick-cash-buttons-container');
  quickCashContainer.innerHTML = '';
  
  const roundedTotal = Math.ceil(total / 10) * 10;
  const cashOptions = [
    total,
    roundedTotal,
    roundedTotal + 10,
    roundedTotal + 50,
    roundedTotal + 100,
    roundedTotal + 200
  ];
  
  const uniqueCashOptions = [...new Set(cashOptions)].filter(val => val >= total).slice(0, 5);
  
  uniqueCashOptions.forEach(val => {
    const btn = document.createElement('button');
    btn.className = 'quick-cash-btn';
    btn.textContent = `${Math.ceil(val)} ₺`;
    btn.onclick = () => {
      document.getElementById('received-amount-input').value = Math.ceil(val);
      calculateChangeDue();
    };
    quickCashContainer.appendChild(btn);
  });

  document.getElementById('received-amount-input').value = Math.ceil(total);
  document.getElementById('change-due-value').textContent = '0.00 ₺';
  
  AppState.activePaymentMethod = 'CASH';
  document.getElementById('method-cash').classList.add('selected');
  document.getElementById('method-card').classList.remove('selected');
  
  const methodMeal = document.getElementById('method-mealcard');
  const methodOther = document.getElementById('method-other');
  if (methodMeal) methodMeal.classList.remove('selected');
  if (methodOther) methodOther.classList.remove('selected');

  document.getElementById('cash-change-calculator').style.display = 'block';

  document.getElementById('modal-checkout').classList.add('active');
}

function setPaymentMethod(method) {
  AppState.activePaymentMethod = method;
  
  document.getElementById('method-cash').classList.remove('selected');
  document.getElementById('method-card').classList.remove('selected');
  const methodMeal = document.getElementById('method-mealcard');
  const methodOther = document.getElementById('method-other');
  if (methodMeal) methodMeal.classList.remove('selected');
  if (methodOther) methodOther.classList.remove('selected');

  if (method === 'CASH') {
    document.getElementById('method-cash').classList.add('selected');
    document.getElementById('cash-change-calculator').style.display = 'block';
  } else if (method === 'CARD') {
    document.getElementById('method-card').classList.add('selected');
    document.getElementById('cash-change-calculator').style.display = 'none';
  } else if (method === 'MEALCARD') {
    if (methodMeal) methodMeal.classList.add('selected');
    document.getElementById('cash-change-calculator').style.display = 'none';
  } else if (method === 'OTHER') {
    if (methodOther) methodOther.classList.add('selected');
    document.getElementById('cash-change-calculator').style.display = 'none';
  }
}

function calculateChangeDue() {
  const tableId = AppState.selectedTable ? AppState.selectedTable.id : 'quick';
  const order = AppState.activeOrders[tableId];
  if (!order) return;

  const total = calculateOrderTotal(order);
  const received = parseFloat(document.getElementById('received-amount-input').value) || 0;
  const change = Math.max(0, received - total);
  
  const changeEl = document.getElementById('change-due-value');
  changeEl.textContent = `${change.toFixed(2)} ₺`;
  if (change > 0) changeEl.className = 'change-value positive';
  else changeEl.className = 'change-value';
}

async function processPaymentAndPrint() {
  const tableId = AppState.selectedTable ? AppState.selectedTable.id : 'quick';
  const order = AppState.activeOrders[tableId];
  if (!order) return;

  window.checkingOutTables = window.checkingOutTables || new Set();
  window.checkingOutTables.add(tableId);

  const subtotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discountAmount = subtotal * ((order.discount || 0) / 100);
  const subtotalWithDiscount = subtotal - discountAmount;
  const tax = 0;
  const total = subtotalWithDiscount;
  
  const transaction = {
    id: 'TX-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
    tableId: tableId,
    tableName: AppState.selectedTable ? AppState.selectedTable.name : 'Hızlı Satış',
    items: [...order.items],
    subtotal: subtotal,
    tax: tax,
    discount: order.discount,
    total: total,
    paymentMethod: AppState.activePaymentMethod,
    orderType: order.orderType || 'dine-in',
    waiterId: order.waiterId,
    timestamp: new Date().toISOString()
  };

  try {
    const response = await fetch('/api/orders/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transaction)
    });
    
    if (response.ok) {
      delete AppState.activeOrders[tableId];
      if (tableId !== 'quick') {
        const table = AppState.tables.find(t => t.id === tableId);
        if (table) table.status = 'free';
      }
      closeModal('modal-checkout');
      generateReceiptHTML(transaction);
      document.getElementById('modal-receipt').classList.add('active');
      showToast('Ödeme başarıyla alındı ve adisyon kapatıldı.', 'success');
    }
  } catch (err) {
    console.error('Error during checkout payment:', err);
    showToast('Ödeme kaydedilemedi!', 'error');
  } finally {
    window.checkingOutTables.delete(tableId);
  }
}

function isPrinterConnected() {
  const isElectron = (typeof window !== 'undefined' && window.process && window.process.type) || (navigator.userAgent.includes('Electron'));
  if (isElectron) return true;
  if (AppState.activeStaff && (AppState.activeStaff.role === 'Kasiyer' || AppState.activeStaff.role === 'Müdür')) return true;
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return true;
  return false;
}

async function printReceipt(tx, type = 'receipt') {
  // Önce sunucuya gönder: IP yazıcıları etkinse sessizce yazdırır,
  // değilse socket ile diğer cihazlara yayar (onlar localPrint ile basar)
  try {
    const response = await fetch('/api/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx, type })
    });
    if (response.ok) {
      const resData = await response.json();
      if (resData.printedDirectly) {
        showToast('Sipariş ağ yazıcısına sessizce gönderildi. ✅', 'success');
        return;
      }
    }
  } catch (e) {
    console.error('Print API error:', e);
  }

  // IP yazıcı yoksa veya başarısız olduysa bu cihazdan tarayıcı ile bas
  if (isPrinterConnected()) {
    localPrint(tx, type);
  }
}

// Sadece tarayıcı üzerinden basar — döngü oluşturmaz, API'ye ÇAĞIRMAZ
function localPrint(tx, type = 'receipt') {
  if (!isPrinterConnected()) return;

  const printSection = document.getElementById('print-receipt-section');
  if (!printSection) return;

  const dateStr = new Date(tx.timestamp).toLocaleString('tr-TR');
  
  if (type === 'kitchen') {
    let itemLines = '';
    tx.items.forEach(item => {
      const optText = item.option ? ` (${item.option})` : '';
      const noteText = item.note ? `<div style="font-size: 11px; font-weight: bold; margin-left: 10px;">>> Not: ${item.note}</div>` : '';
      itemLines += `
        <div style="font-size: 14px; font-weight: bold; margin-bottom: 6px; border-bottom: 1px dashed #eee; padding-bottom: 4px; color: #000;">
          <div style="display: flex; justify-content: space-between;">
            <span>${item.quantity}x ${item.name}${optText}</span>
          </div>
          ${noteText}
        </div>
      `;
    });

    printSection.innerHTML = `
      <div class="receipt-paper" style="width: 80mm; padding: 10px; background:#fff; color:#000; font-family:monospace; margin:0 auto; box-sizing:border-box;">
        <div style="text-align: center; font-size: 16px; font-weight: bold; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 10px; color:#000;">
          MUTFAK SİPARİŞ FİŞİ
        </div>
        <div style="font-size: 12px; margin-bottom: 4px; color:#000;"><strong>Masa/Bölüm:</strong> ${tx.tableName}</div>
        <div style="font-size: 12px; margin-bottom: 4px; color:#000;"><strong>Garson:</strong> ${tx.waiterId ? tx.waiterId.toUpperCase() : 'BİLİNMİYOR'}</div>
        <div style="font-size: 10px; margin-bottom: 10px; color:#000;"><strong>Tarih:</strong> ${dateStr}</div>
        <div style="border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 8px 0; margin-bottom: 10px;">
          ${itemLines}
        </div>
        <div style="text-align: center; font-size: 9px; margin-top: 10px; border-top: 1px dashed #000; padding-top: 6px; color:#000;">
          Go Healthy - Kitchen Ticket
        </div>
      </div>
    `;
  } else {
    let itemLines = '';
    tx.items.forEach(item => {
      const optText = item.option ? ` (${item.option})` : '';
      itemLines += `
        <div class="receipt-item-line" style="display:flex; justify-content:space-between; margin-bottom: 4px; font-size:12px; color:#000;">
          <span>${item.quantity}x ${item.name}${optText}</span>
          <span>${(item.price * item.quantity).toFixed(2)} ₺</span>
        </div>
      `;
    });

    const payMap = { CASH: 'NAKİT', CARD: 'KREDİ KARTI', MEALCARD: 'YEMEK KARTI', OTHER: 'DİĞER' };
    const methodText = payMap[tx.paymentMethod] || 'NAKİT';

    printSection.innerHTML = `
      <div class="receipt-paper" style="width: 80mm; padding: 10px; background:#fff; color:#000; font-family:monospace; margin:0 auto; box-sizing:border-box;">
        <div class="receipt-header" style="text-align:center; margin-bottom: 8px; color:#000;">
          <div class="receipt-logo" style="font-size:18px; font-weight:bold;">Go Healthy</div>
          <div style="font-size:11px; font-weight:bold;">THE KITCHEN ALANYA</div>
          <div style="font-size:9px; color:#333;">Saray Mah. Macaroğlu Sok. 4B / ALANYA</div>
          <div style="font-size:9px; color:#333;">Tel: +90 501 073 7303</div>
        </div>
        <div style="border-top:1px dashed #000; margin: 6px 0;"></div>
        <div class="receipt-info-row" style="display:flex; justify-content:space-between; font-size:10px; margin-bottom: 2px; color:#000;">
          <span>Tarih:</span>
          <span>${dateStr}</span>
        </div>
        <div class="receipt-info-row" style="display:flex; justify-content:space-between; font-size:10px; margin-bottom: 2px; color:#000;">
          <span>Fiş No:</span>
          <span>${tx.id}</span>
        </div>
        <div class="receipt-info-row" style="display:flex; justify-content:space-between; font-size:10px; margin-bottom: 2px; color:#000;">
          <span>Masa/Bölüm:</span>
          <span>${tx.tableName}</span>
        </div>
        <div class="receipt-info-row" style="display:flex; justify-content:space-between; font-size:10px; margin-bottom: 2px; color:#000;">
          <span>Personel:</span>
          <span>${tx.waiterId ? tx.waiterId.toUpperCase() : ''}</span>
        </div>
        <div style="border-top:1px dashed #000; margin: 6px 0;"></div>
        <div class="receipt-items">
          ${itemLines}
        </div>
        <div style="border-top:1px dashed #000; margin: 6px 0;"></div>
        <div class="receipt-info-row" style="display:flex; justify-content:space-between; font-size:11px; margin-bottom: 2px; color:#000;">
          <span>Ara Toplam:</span>
          <span>${tx.subtotal.toFixed(2)} ₺</span>
        </div>
        ${tx.discount > 0 ? `
        <div class="receipt-info-row" style="display:flex; justify-content:space-between; font-size:11px; color: green; margin-bottom: 2px;">
          <span>İndirim (%${tx.discount}):</span>
          <span>-${(tx.subtotal * tx.discount / 100).toFixed(2)} ₺</span>
        </div>
        ` : ''}
        <div class="receipt-info-row receipt-totals" style="display:flex; justify-content:space-between; font-size:14px; font-weight:bold; margin-top: 4px; color:#000;">
          <span>TOPLAM:</span>
          <span>${tx.total.toFixed(2)} ₺</span>
        </div>
        <div style="border-top:1px dashed #000; margin: 6px 0;"></div>
        <div class="receipt-info-row" style="display:flex; justify-content:space-between; font-size:11px; font-weight:bold; margin-bottom: 4px; color:#000;">
          <span>Ödeme Tipi:</span>
          <span>${methodText}</span>
        </div>
        <div class="receipt-footer" style="text-align:center; font-size:10px; margin-top: 12px; color:#000;">
          <p style="margin:0 0 4px 0;">TEŞEKKÜR EDERİZ</p>
        </div>
      </div>
    `;
  }

  document.body.classList.add('printing-receipt');
  window.print();
  document.body.classList.remove('printing-receipt');
}

// --- ADİSYON / FATURA SİMÜLASYONU ---
function generateReceiptHTML(tx) {
  window.currentPrintTransaction = tx;
  const receiptEl = document.getElementById('receipt-paper-content');
  const dateStr = new Date(tx.timestamp).toLocaleString('tr-TR');
  
  let itemLines = '';
  tx.items.forEach(item => {
    const optText = item.option ? ` (${item.option})` : '';
    itemLines += `
      <div class="receipt-item-line">
        <span>${item.quantity}x ${item.name}${optText}</span>
        <span>${(item.price * item.quantity).toFixed(2)} ₺</span>
      </div>
    `;
  });

  const payMap = { CASH: 'NAKİT', CARD: 'KREDİ KARTI', MEALCARD: 'YEMEK KARTI', OTHER: 'DİĞER' };
  const methodText = payMap[tx.paymentMethod] || 'NAKİT';
  
  receiptEl.innerHTML = `
    <div class="receipt-header">
      <div class="receipt-logo">Go Healthy</div>
      <div style="font-size:10px;">THE KITCHEN ALANYA</div>
      <div style="font-size:9px; color:#555;">Saray Mah. Macaroğlu Sok. 4B / ALANYA</div>
      <div style="font-size:9px; color:#555;">Tel: +90 501 073 7303</div>
    </div>
    <div class="receipt-divider"></div>
    <div class="receipt-info-row">
      <span>Tarih:</span>
      <span>${dateStr}</span>
    </div>
    <div class="receipt-info-row">
      <span>Fiş No:</span>
      <span>${tx.id}</span>
    </div>
    <div class="receipt-info-row">
      <span>Masa/Bölüm:</span>
      <span>${tx.tableName}</span>
    </div>
    <div class="receipt-info-row">
      <span>Personel:</span>
      <span>${tx.waiterId.toUpperCase()}</span>
    </div>
    <div class="receipt-divider"></div>
    <div class="receipt-items">
      ${itemLines}
    </div>
    <div class="receipt-divider"></div>
    <div class="receipt-info-row">
      <span>Ara Toplam:</span>
      <span>${tx.subtotal.toFixed(2)} ₺</span>
    </div>
    ${tx.discount > 0 ? `
    <div class="receipt-info-row" style="color: green;">
      <span>İndirim (%${tx.discount}):</span>
      <span>-${(tx.subtotal * tx.discount / 100).toFixed(2)} ₺</span>
    </div>
    ` : ''}
    <div class="receipt-info-row" style="display:none;">
      <span>KDV (%10):</span>
      <span>${tx.tax.toFixed(2)} ₺</span>
    </div>
    <div class="receipt-info-row receipt-totals">
      <span>TOPLAM:</span>
      <span>${tx.total.toFixed(2)} ₺</span>
    </div>
    <div class="receipt-divider"></div>
    <div class="receipt-info-row" style="font-weight:bold;">
      <span>Ödeme Tipi:</span>
      <span>${methodText}</span>
    </div>
    <div class="receipt-footer">
      <p>TEŞEKKÜR EDERİZ</p>
      <div class="receipt-barcode"></div>
    </div>
  `;
}

// --- ADİSYON BÖLME (SPLIT BILL) LİMİTLERİ ---
function openSplitBillModal() {
  const tableId = AppState.selectedTable ? AppState.selectedTable.id : 'quick';
  const order = AppState.activeOrders[tableId];
  if (!order || order.items.length === 0) return;

  const total = calculateOrderTotal(order);
  document.getElementById('split-total-amount').textContent = `${total.toFixed(2)} ₺`;

  const itemsListContainer = document.getElementById('split-bill-items-list');
  itemsListContainer.innerHTML = '';
  
  AppState.selectedSplitItems = [];
  document.getElementById('split-selected-amount').textContent = '0.00 ₺';

  // Adisyondaki tekil porsiyonları listele
  order.items.forEach((item, index) => {
    // Her bir adedi ayrı ayrı bölmek için döngüye alıyoruz
    for (let k = 0; k < item.quantity; k++) {
      const splitId = `split-${index}-${k}`;
      const itemRow = document.createElement('div');
      itemRow.className = 'split-item-row';
      itemRow.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" id="${splitId}" class="split-checkbox" onchange="toggleSplitItem('${item.id}', ${item.price}, this.checked)">
          <label for="${splitId}">${item.name} ${item.option ? '('+item.option+')' : ''}</label>
        </div>
        <span>${item.price.toFixed(2)} ₺</span>
      `;
      itemsListContainer.appendChild(itemRow);
    }
  });

  document.getElementById('modal-split-bill').classList.add('active');
}

function toggleSplitItem(itemId, price, isChecked) {
  if (isChecked) {
    AppState.selectedSplitItems.push({ itemId, price });
  } else {
    const idx = AppState.selectedSplitItems.findIndex(i => i.itemId === itemId && i.price === price);
    if (idx !== -1) AppState.selectedSplitItems.splice(idx, 1);
  }
  
  // Seçilenlerin KDV dahil toplamını hesapla (%10 KDV)
  const subtotal = AppState.selectedSplitItems.reduce((sum, item) => sum + item.price, 0);
  const total = subtotal * 1.10;
  
  document.getElementById('split-selected-amount').textContent = `${total.toFixed(2)} ₺`;
}

async function processSplitPayment() {
  if (AppState.selectedSplitItems.length === 0) {
    showToast('Lütfen ödeme alınacak en az bir ürün seçin!', 'warning');
    return;
  }

  const tableId = AppState.selectedTable ? AppState.selectedTable.id : 'quick';
  const order = AppState.activeOrders[tableId];
  if (!order) return;

  window.checkingOutTables = window.checkingOutTables || new Set();
  window.checkingOutTables.add(tableId);

  // Seçilen kalemleri sepetten çıkart
  AppState.selectedSplitItems.forEach(splitItem => {
    const itemIdx = order.items.findIndex(i => i.id === splitItem.itemId && i.quantity > 0);
    if (itemIdx !== -1) {
      order.items[itemIdx].quantity -= 1;
      if (order.items[itemIdx].quantity <= 0) {
        order.items.splice(itemIdx, 1);
      }
    }
  });

  const subtotal = AppState.selectedSplitItems.reduce((sum, i) => sum + i.price, 0);
  const tax = 0;
  const total = subtotal;

  const transaction = {
    id: 'TX-SPLIT-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
    tableId: order.items.length > 0 ? 'quick' : tableId, // Kalan ürün varsa masayı sıfırlama, yoksa masayı sıfırla
    tableName: AppState.selectedTable ? `${AppState.selectedTable.name} (Parçalı Ödeme)` : 'Hızlı Satış (Parçalı)',
    items: AppState.selectedSplitItems.map(i => {
      const menuItem = AppState.menuItems.find(mi => mi.id === i.itemId);
      return {
        name: menuItem ? menuItem.name : 'Bilinmeyen Ürün',
        quantity: 1,
        price: i.price,
        note: 'Parçalı Ödeme'
      };
    }),
    subtotal: subtotal,
    tax: tax,
    discount: 0,
    total: total,
    paymentMethod: 'CARD',
    orderType: order.orderType || 'dine-in',
    waiterId: order.waiterId,
    timestamp: new Date().toISOString()
  };

  try {
    const payRes = await fetch('/api/orders/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transaction)
    });
    
    if (!payRes.ok) throw new Error('Ödeme kaydedilemedi.');

    window.checkingOutTables.delete(tableId);
    await saveActiveOrderToServer(tableId);

    closeModal('modal-split-bill');
    generateReceiptHTML({ ...transaction, tableId: tableId });
    document.getElementById('modal-receipt').classList.add('active');

    showToast('Parçalı ödeme başarıyla tahsil edildi.', 'success');
  } catch (err) {
    console.error(err);
    showToast('Parçalı ödeme sırasında bir hata oluştu!', 'error');
  } finally {
    window.checkingOutTables.delete(tableId);
  }
}

// --- MASA BİRLEŞTİRME ---
function openMergeTablesModal() {
  if (!AppState.selectedTable) return;
  
  const selectEl = document.getElementById('merge-tables-select');
  selectEl.innerHTML = '';
  
  // Boş olmayan diğer masaları listele
  const otherActiveTables = AppState.tables.filter(t => t.id !== AppState.selectedTable.id && t.status !== 'free');
  
  if (otherActiveTables.length === 0) {
    showToast('Birleştirmek için aktif hesabı olan başka bir masa bulunamadı!', 'info');
    return;
  }

  otherActiveTables.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.name} (Hesap: ${calculateOrderTotal(AppState.activeOrders[t.id]).toFixed(2)} ₺)`;
    selectEl.appendChild(opt);
  });

  document.getElementById('modal-merge-tables').classList.add('active');
}

async function processMergeTables() {
  const targetTableId = document.getElementById('merge-tables-select').value;
  const currentTableId = AppState.selectedTable.id;

  try {
    const response = await fetch('/api/orders/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceTableId: currentTableId, targetTableId })
    });

    if (!response.ok) throw new Error('Masa birleştirme başarısız.');

    closeModal('modal-merge-tables');
    showToast(`Masalar başarıyla birleştirildi. Tüm hesap ${targetTableId} masasına aktarıldı.`, 'success');
    switchScreen('tables');
  } catch (err) {
    console.error(err);
    showToast('Masalar birleştirilemedi!', 'error');
  }
}

// --- PERSONEL / İK GİRİŞ ŞİFRESİ (PIN) ---
function openStaffPINModal() {
  AppState.currentPinInput = '';
  document.getElementById('staff-pin-display').textContent = '****';
  document.getElementById('modal-staff-pin').classList.add('active');
}

function pressPin(num) {
  if (AppState.currentPinInput.length < 4) {
    AppState.currentPinInput += num;
    // Yıldız gösterimi
    document.getElementById('staff-pin-display').textContent = '*'.repeat(AppState.currentPinInput.length) + '_'.repeat(4 - AppState.currentPinInput.length);
  }
}

function clearPin() {
  AppState.currentPinInput = '';
  document.getElementById('staff-pin-display').textContent = '____';
}

async function submitPin() {
  const pin = AppState.currentPinInput;
  try {
    const res = await fetch('/api/staff/shift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    
    if (!res.ok) {
      const errData = await res.json();
      showToast(errData.error || 'PIN kodu geçersiz!', 'error');
      clearPin();
      return;
    }

    const data = await res.json();
    if (data.success) {
      const staffName = data.staff.name;
      const staffRole = data.staff.role;
      localStorage.setItem('localActiveStaffId', data.staff.id);
      showToast(`${staffName} (${staffRole}) giriş yaptı.`, 'success');
      closeModal('modal-staff-pin');
    }
  } catch (err) {
    console.error(err);
    showToast('PIN doğrulaması sırasında hata oluştu!', 'error');
    clearPin();
  }
}

// --- QR MENÜ SİMÜLATÖRÜ ---
function openQRMenuSimulator() {
  // Simulator modalını aç
  const modal = document.getElementById('modal-qr-simulator');
  
  // Telefon ekranındaki menüyü çiz
  const menuList = document.getElementById('qr-phone-menu-list');
  menuList.innerHTML = '';

  AppState.menuItems.slice(0, 8).forEach(item => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'qr-phone-menu-item';
    
    let imgHtml = item.image ? `<img src="${item.image}" class="qr-phone-item-img">` : '<div class="qr-phone-item-img" style="background:#1e293b;"></div>';
    
    itemDiv.innerHTML = `
      ${imgHtml}
      <div style="flex:1; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="font-size:12px; font-weight:600;">${item.name}</div>
          <div style="font-size:10px; color:var(--text-secondary); line-height:1.2; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${item.description}</div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
          <span style="font-size:11px; font-weight:700; color:var(--accent-cyan);">${item.price} ₺</span>
          <button onclick="addQRItemToCart('${item.id}', ${item.price})" style="background:var(--accent-purple); color:white; font-size:10px; padding:3px 8px; border-radius:6px; font-weight:600;">Ekle</button>
        </div>
      </div>
    `;
    menuList.appendChild(itemDiv);
  });

  // Sepeti sıfırla
  QRCart.items = [];
  QRCart.selectedTableId = document.getElementById('qr-table-select').value || 'T4';
  updateQRMenuCartUI();

  modal.classList.add('active');
}

function changeQRTable() {
  QRCart.selectedTableId = document.getElementById('qr-table-select').value;
}

function addQRItemToCart(itemId, price) {
  // Basitlik adına tek porsiyon ekleme
  QRCart.items.push({ itemId, price });
  updateQRMenuCartUI();
  showToast('Ürün telefon sepetinize eklendi.', 'success');
}

function updateQRMenuCartUI() {
  const total = QRCart.items.reduce((sum, i) => sum + i.price, 0);
  document.getElementById('qr-cart-total').textContent = `${total.toFixed(2)} ₺`;
  
  const sendBtn = document.getElementById('qr-send-order-btn');
  if (QRCart.items.length > 0) {
    sendBtn.disabled = false;
    sendBtn.style.opacity = '1';
  } else {
    sendBtn.disabled = true;
    sendBtn.style.opacity = '0.5';
  }
}

function sendQRMenuOrder() {
  const tableId = QRCart.selectedTableId;
  const table = AppState.tables.find(t => t.id === tableId);
  
  if (!table) return;

  // POS Siparişi Başlat
  if (!AppState.activeOrders[tableId]) {
    AppState.activeOrders[tableId] = {
      items: [],
      discount: 0,
      orderType: 'dine-in',
      waiterId: 'garson' // QR siparişleri varsayılan olarak garsona atanır
    };
  }

  // Sepetteki tüm ürünleri masaya ekle (stok düşümünü yaparız)
  let allAdded = true;
  QRCart.items.forEach(qItem => {
    const item = AppState.menuItems.find(mi => mi.id === qItem.itemId);
    if (item) {
      const stockSuccess = checkAndDeductStock(item.id, 1);
      if (stockSuccess) {
        addItemToActiveOrder(tableId, item, 'Masa QR Sipariş', 'Telefondan iletildi');
      } else {
        allAdded = false;
      }
    }
  });

  // Mutfağa otomatik gönderim simülasyonu
  const order = AppState.activeOrders[tableId];
  if (order && order.items.length > 0) {
    const unsentItems = order.items.filter(item => !item.isSentToKitchen);
    if (unsentItems.length > 0) {
      const kitchenTicket = {
        id: 'K-QR-' + Math.random().toString(36).substr(2, 4).toUpperCase(),
        tableId: tableId,
        tableName: table.name,
        waiterId: 'QR Menü',
        timestamp: new Date().toISOString(),
        status: 'cooking',
        items: unsentItems.map(item => ({
          name: item.name,
          quantity: item.quantity,
          option: item.option,
          note: item.note,
          cooked: false
        }))
      };
      AppState.kitchenOrders.push(kitchenTicket);
      order.items.forEach(item => item.isSentToKitchen = true);
    }
  }

  table.status = 'busy';
  saveStateToStorage();
  closeModal('modal-qr-simulator');
  
  if (allAdded) {
    showToast(`${table.name}: Müşteri telefondan QR siparişi iletti! Mutfak ekranına otomatik aktarıldı.`, 'success');
  } else {
    showToast(`${table.name}: Siparişin bir kısmı stok yetersizliği nedeniyle reddedildi!`, 'warning');
  }

  // Haritayı yenile
  if (AppState.activeView === 'tables') renderTableMap();
  if (AppState.activeView === 'kitchen') renderKitchenMonitor();
}

// --- ONLINE SİPARİŞ KANALLARI ---
function triggerIncomingDelivery(channelId) {
  if (AppState.activeStaff && AppState.activeStaff.role === 'Patron') return;
  if (window.pendingDeliveryOrders && window.pendingDeliveryOrders.length > 0) {
    showNextPendingDeliveryOrder();
    return;
  }
  const names = { delivery: 'Online Paket', takeaway: 'Online Gel-Al' };
  const channelName = names[channelId] || 'Paket Sipariş';
  showToast(`${channelName} kanalı aktif durumdadır.`, 'info');
}

let deliveryMap = null;
let deliveryMarker = null;

function renderDeliveryOrderMap(lat, lng, customerName) {
  const mapEl = document.getElementById('delivery-order-map');
  if (!mapEl) return;
  mapEl.style.display = 'block';

  setTimeout(() => {
    if (deliveryMap) {
      deliveryMap.setView([lat, lng], 15);
      if (deliveryMarker) {
        deliveryMarker.setLatLng([lat, lng]);
        deliveryMarker.bindPopup(`<b>${customerName}</b>`).openPopup();
      }
      deliveryMap.invalidateSize();
      return;
    }

    deliveryMap = L.map('delivery-order-map').setView([lat, lng], 15);

    L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      attribution: '&copy; Google Maps'
    }).addTo(deliveryMap);

    deliveryMarker = L.marker([lat, lng]).addTo(deliveryMap)
      .bindPopup(`<b>${customerName}</b>`).openPopup();
  }, 300);
}

// Global shared AudioContext initialized/unlocked via user gesture
document.addEventListener('click', () => {
  stopOrderSoundLoop();
  if (!window.appAudioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      window.appAudioCtx = new AudioContext();
      console.log("Audio Context initialized via user gesture.");
    }
  } else if (window.appAudioCtx.state === 'suspended') {
    window.appAudioCtx.resume();
  }
}, { once: false });

let activeMarchOscillators = [];
let activeMarchGainNodes = [];

function stopActiveMarchNotes() {
  activeMarchOscillators.forEach(osc => {
    try { osc.stop(); } catch (e) {}
  });
  activeMarchOscillators = [];
  activeMarchGainNodes.forEach(g => {
    try { g.gain.setValueAtTime(0, g.context.currentTime); } catch (e) {}
  });
  activeMarchGainNodes = [];
}

function startOrderSoundLoop() {
  if (AppState.activeStaff && AppState.activeStaff.role === 'Patron') return;
  window.isOrderSoundActive = true;
  playTurkishMarch();
}

function stopOrderSoundLoop() {
  window.isOrderSoundActive = false;
  stopTurkishMarch();
}

function playOrderBeep() {
  if (AppState.activeStaff && AppState.activeStaff.role === 'Patron') return;
  playTurkishMarch();
}

function playTurkishMarch() {
  if (AppState.activeStaff && AppState.activeStaff.role === 'Patron') return;
  let ctx = window.appAudioCtx;
  if (!ctx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    ctx = new AudioContext();
    window.appAudioCtx = ctx;
  }
  
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  stopActiveMarchNotes();

  const notes = {
    'G#4': 415.30, 'A4': 440.00, 'B4': 493.88, 'C5': 523.25, 'D5': 587.33,
    'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00
  };

  // İzmir Marşı - "İzmir'in dağlarında çiçekler açar..."
  // Transposed to A minor for highly accurate and clean tones using standard flüt/melodika notes.
  const melody = [
    // 1. İz-mir'in dağ-la-rın-da (La-Mi-Mi-Mi-Mi-Mi-Mi)
    ['A4', 0.25], ['E5', 0.25], ['E5', 0.25],
    ['E5', 0.25], ['E5', 0.25], ['E5', 0.25], ['E5', 0.25],
    // çi-çek-ler a-çar (Fa-Mi-Re-Fa-Mi)
    ['F5', 0.35], ['E5', 0.15], ['D5', 0.25], ['F5', 0.25], ['E5', 0.75],
    
    // 2. İz-mir'in dağ-la-rın-da (La-Mi-Mi-Mi-Mi-Mi-Mi)
    ['A4', 0.25], ['E5', 0.25], ['E5', 0.25],
    ['E5', 0.25], ['E5', 0.25], ['E5', 0.25], ['E5', 0.25],
    // çi-çek-ler a-çar (Fa-Mi-Re-Fa-Mi)
    ['F5', 0.35], ['E5', 0.15], ['D5', 0.25], ['F5', 0.25], ['E5', 0.75],

    // 3. Al-tın gü-neş o-ra-da (Mi-La-Sol-Fa-Mi-Re)
    ['E5', 0.25], ['A5', 0.25], ['G5', 0.25], ['F5', 0.25], ['E5', 0.25], ['D5', 0.25],
    // sır-ma-lar sa-çar (Mi-Re-Do-Si-Do)
    ['E5', 0.35], ['D5', 0.15], ['C5', 0.25], ['B4', 0.25], ['C5', 0.75],

    // 4. Al-tın gü-neş o-ra-da (Mi-La-Sol-Fa-Mi-Re)
    ['E5', 0.25], ['A5', 0.25], ['G5', 0.25], ['F5', 0.25], ['E5', 0.25], ['D5', 0.25],
    // sır-ma-lar sa-çar (Mi-Re-Do-Si-Do)
    ['E5', 0.35], ['D5', 0.15], ['C5', 0.25], ['B4', 0.25], ['C5', 0.75],

    // 5. Bo-zul-muş düş-man-lar yel (La-Mi-Mi-Mi-Mi-Mi-Mi)
    ['A4', 0.25], ['E5', 0.25], ['E5', 0.25],
    ['E5', 0.25], ['E5', 0.25], ['E5', 0.25], ['E5', 0.25],
    // gi-bi ka-çar (Fa-Mi-Re-Fa-Mi)
    ['F5', 0.35], ['E5', 0.15], ['D5', 0.25], ['F5', 0.25], ['E5', 0.75],

    // 6. Bo-zul-muş düş-man-lar yel (La-Mi-Mi-Mi-Mi-Mi-Mi)
    ['A4', 0.25], ['E5', 0.25], ['E5', 0.25],
    ['E5', 0.25], ['E5', 0.25], ['E5', 0.25], ['E5', 0.25],
    // gi-bi ka-çar (Fa-Mi-Re-Fa-Mi)
    ['F5', 0.35], ['E5', 0.15], ['D5', 0.25], ['F5', 0.25], ['E5', 0.75],

    // 7. Ya-şa Mus-ta-fa Ke-mal (Mi-La-Sol-Fa-Mi-Re)
    ['E5', 0.25], ['A5', 0.25], ['G5', 0.25], ['F5', 0.25], ['E5', 0.25], ['D5', 0.25],
    // Pa-şa ya-şa (Mi-Re-Do-Si-Do)
    ['E5', 0.35], ['D5', 0.15], ['C5', 0.25], ['B4', 0.25], ['C5', 0.75],

    // 8. A-dın ya-zı-la-cak mü- (Do-Mi-Re-Do-Si-La)
    ['C5', 0.25], ['E5', 0.25], ['D5', 0.25], ['C5', 0.25], ['B4', 0.25], ['A4', 0.25],
    // cev-her ta-şa (Do-Si-La-Sol#-La)
    ['C5', 0.35], ['B4', 0.15], ['A4', 0.25], ['G#4', 0.25], ['A4', 0.75]
  ];

  let time = ctx.currentTime + 0.1;
  const tempo = 0.90; // Speed modifier (slightly faster for energetic feel)

  melody.forEach(([note, beats]) => {
    const freq = notes[note];
    const duration = beats * tempo;
    
    if (freq) {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();
      const gainHarmonic = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, time);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 2, time);

      gainNode.gain.setValueAtTime(0, time);
      gainNode.gain.linearRampToValueAtTime(0.25, time + 0.03);
      // Give a tiny gap between notes so they sound distinct
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration - 0.03);

      gainHarmonic.gain.setValueAtTime(0.08, time);

      osc1.connect(gainNode);
      osc2.connect(gainHarmonic);
      gainHarmonic.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(time);
      osc1.stop(time + duration);
      osc2.start(time);
      osc2.stop(time + duration);

      activeMarchOscillators.push(osc1, osc2);
      activeMarchGainNodes.push(gainNode, gainHarmonic);
    }
    
    time += duration;
  });

  // Loop the march if the order is still pending after the melody finishes
  const totalDurationMs = (time - ctx.currentTime) * 1000;
  if (window.turkishMarchTimeout) clearTimeout(window.turkishMarchTimeout);
  window.turkishMarchTimeout = setTimeout(() => {
    if (currentPendingDeliveryOrder || window.isOrderSoundActive) {
      playTurkishMarch();
    }
  }, totalDurationMs);
}

function stopTurkishMarch() {
  if (window.turkishMarchTimeout) {
    clearTimeout(window.turkishMarchTimeout);
    window.turkishMarchTimeout = null;
  }
  stopActiveMarchNotes();
}

function updateDeliveryModalTitle() {
  if (currentPendingDeliveryOrder) {
    const queueLength = window.pendingDeliveryOrders.length;
    document.getElementById('delivery-modal-title').textContent = 
      `${currentPendingDeliveryOrder.channelName}: Yeni Sipariş! (Bekleyen: ${queueLength})`;
  }
}

function showNextPendingDeliveryOrder() {
  if (!window.pendingDeliveryOrders || window.pendingDeliveryOrders.length === 0) {
    currentPendingDeliveryOrder = null;
    closeModal('modal-delivery-order');
    stopOrderSoundLoop();
    stopTurkishMarch();
    
    // Clear active-alert badges
    document.querySelectorAll('.delivery-channel-badge').forEach(b => b.classList.remove('active-alert'));
    return;
  }

  // Get first pending order
  const nextItem = window.pendingDeliveryOrders[0];
  currentPendingDeliveryOrder = nextItem.order;

  // Make the corresponding badge alert active
  const badge = document.getElementById(`delivery-${nextItem.channelId}`);
  if (badge) {
    badge.classList.add('active-alert');
  }

  const order = currentPendingDeliveryOrder;
  
  if (order.coords && order.coords.lat && order.coords.lng && order.channel !== 'takeaway') {
    renderDeliveryOrderMap(order.coords.lat, order.coords.lng, order.customerName || 'Müşteri');
  } else {
    const mapEl = document.getElementById('delivery-order-map');
    if (mapEl) mapEl.style.display = 'none';
  }

  const detailsEl = document.getElementById('delivery-order-details');
  let itemRows = '';
  order.items.forEach(i => {
    itemRows += `<div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
      <span>${i.quantity}x ${i.name}</span>
      <span>${(i.price*i.quantity).toFixed(2)} ₺</span>
    </div>`;
  });

  let customerDetailsHtml = '';
  if (order.customerName) {
    let mapsBtnHtml = '';
    if (order.coords && order.coords.lat && order.coords.lng) {
      mapsBtnHtml = `
        <div style="margin-top:8px;">
          <a href="https://www.google.com/maps/search/?api=1&query=${order.coords.lat},${order.coords.lng}" target="_blank" class="ledger-action-btn" style="display:inline-flex; align-items:center; gap:6px; text-decoration:none; padding:6px 12px; font-weight:600; background:rgba(16,185,129,0.15); color:var(--status-free); border-radius:8px; border:1px solid rgba(16,185,129,0.3);">
            <i data-lucide="map-pin" style="width:14px; height:14px;"></i> Google Haritalar'da Aç
          </a>
        </div>
      `;
    }
    customerDetailsHtml = `
      <div style="border-top:1px dashed var(--border-light); padding:10px 0; margin-bottom:10px; font-size:12px; display:flex; flex-direction:column; gap:4px; text-align:left;">
        <div><strong>Müşteri:</strong> ${order.customerName}</div>
        <div><strong>Telefon:</strong> ${order.customerPhone}</div>
        ${order.customerAddress ? `<div><strong>Adres:</strong> ${order.customerAddress}</div>` : ''}
        ${mapsBtnHtml}
      </div>
    `;
  }

  detailsEl.innerHTML = `
    <div style="font-weight:700; font-size:14px; margin-bottom:8px; color: var(--accent-cyan);">${order.channelName}</div>
    <div style="font-size:12px; margin-bottom:12px; color:var(--text-secondary);">Sipariş No: ${order.orderId}</div>
    <div style="border-top:1px dashed var(--border-light); border-bottom:1px dashed var(--border-light); padding:10px 0; margin-bottom:10px;">
      ${itemRows}
    </div>
    ${customerDetailsHtml}
    <div style="display:flex; justify-content:space-between; font-weight:700; font-size:14px;">
      <span>Toplam Tutar:</span>
      <span>${order.total.toFixed(2)} ₺</span>
    </div>
  `;

  updateDeliveryModalTitle();
  document.getElementById('modal-delivery-order').classList.add('active');
  lucide.createIcons();
}

function triggerIncomingDeliveryClient(channelId, order) {
  // Push to queue
  if (!window.pendingDeliveryOrders) window.pendingDeliveryOrders = [];
  window.pendingDeliveryOrders.push({ channelId, order });

  const badge = document.getElementById(`delivery-${channelId}`);
  if (badge) {
    badge.classList.add('active-alert');
  }

  // Start looping order sound
  startOrderSoundLoop();

  // If modal is not active, show it immediately
  if (!document.getElementById('modal-delivery-order').classList.contains('active')) {
    showNextPendingDeliveryOrder();
  } else {
    // If modal is already active, update the title to show count
    updateDeliveryModalTitle();
  }
}

async function acceptDeliveryOrder() {
  try {
    if (!currentPendingDeliveryOrder) {
      alert("Hata: currentPendingDeliveryOrder bulunamadı (null veya undefined)!");
      return;
    }
    stopTurkishMarch();
    
    const orderId = currentPendingDeliveryOrder.orderId;
    const channel = currentPendingDeliveryOrder.channel;
    const channelName = currentPendingDeliveryOrder.channelName;
    const items = currentPendingDeliveryOrder.items;

    if (!items || !Array.isArray(items)) {
      alert("Hata: Siparişe ait ürün listesi alınamadı!");
      return;
    }

    let orderNote = `${channelName} Siparişi`;
    let kitchenNote = 'Otomatik Entegre';

    if (currentPendingDeliveryOrder.customerName) {
      const details = `Müşteri: ${currentPendingDeliveryOrder.customerName} | Tel: ${currentPendingDeliveryOrder.customerPhone} | Adres: ${currentPendingDeliveryOrder.customerAddress || 'Gel-Al'}`;
      orderNote = details;
      kitchenNote = details;
    }

    if (!AppState.menuItems || !Array.isArray(AppState.menuItems)) {
      alert("Hata: AppState.menuItems yüklü değil veya dizi değil!");
      return;
    }

    for (const i of items) {
      const menuItem = AppState.menuItems.find(mi => mi.name === i.name);
      if (menuItem) {
        await checkAndDeductStock(menuItem.id, i.quantity);
      }
    }

    const resOrders = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tableId: orderId,
        items: items.map(i => {
          const menuItem = AppState.menuItems.find(mi => mi.name === i.name);
          return {
            id: menuItem ? menuItem.id : i.name.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, ''),
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            option: i.option || 'Paket Sipariş',
            note: orderNote,
            isSentToKitchen: true
          };
        }),
        discount: 0,
        orderType: 'delivery',
        waiterId: 'mudur'
      })
    });

    if (!resOrders.ok) {
      const errText = await resOrders.text();
      throw new Error(`Sipariş kaydedilemedi. Sunucu Hatası: ${resOrders.status} - ${errText}`);
    }

    const resTicket = await fetch('/api/kitchen/ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'K-DEL-' + Math.random().toString(36).substr(2, 4).toUpperCase(),
        tableId: orderId,
        tableName: `${channelName} (${orderId})`,
        waiterId: 'Entegrasyon',
        items: items.map(i => ({
          name: i.name,
          quantity: i.quantity,
          option: i.option || 'Paket Servis',
          note: kitchenNote,
          cooked: false
        }))
      })
    });

    if (!resTicket.ok) {
      const errText = await resTicket.text();
      throw new Error(`Mutfak bileti oluşturulamadı. Sunucu Hatası: ${resTicket.status} - ${errText}`);
    }

    const badge = document.getElementById(`delivery-${channel}`);
    if (badge) badge.classList.remove('active-alert');

    showToast(`${channelName} siparişi onaylandı, mutfağa gönderildi.`, 'success');

    // Automatically trigger printing for the accepted delivery order
    printReceipt({
      id: 'DEL-' + orderId,
      timestamp: new Date().toISOString(),
      tableName: `${channelName} (Paket)`,
      waiterId: 'Entegrasyon',
      items: items,
      subtotal: items.reduce((sum, i) => sum + (i.price * i.quantity), 0),
      discount: 0,
      tax: 0,
      total: items.reduce((sum, i) => sum + (i.price * i.quantity), 0),
      paymentMethod: 'CARD'
    });
    
    // Remove from queue and show next
    window.pendingDeliveryOrders.shift();
    showNextPendingDeliveryOrder();
  } catch (err) {
    console.error(err);
    alert('Sipariş onaylanırken hata oluştu: ' + err.message);
    showToast('Sipariş onaylanırken hata oluştu: ' + err.message, 'error');
  }
}

function rejectDeliveryOrder() {
  if (!currentPendingDeliveryOrder) return;
  
  const channel = currentPendingDeliveryOrder.channel;
  const channelName = currentPendingDeliveryOrder.channelName;
  const badge = document.getElementById(`delivery-${channel}`);
  if (badge) badge.classList.remove('active-alert');

  showToast(`${channelName} siparişi iptal edildi.`, 'info');

  // Remove from queue and show next
  window.pendingDeliveryOrders.shift();
  showNextPendingDeliveryOrder();
}

// --- DİZİN: STOK YÖNETİM TABLOSU ---
function renderStockManagementTable() {
  const listEl = document.getElementById('settings-stock-list');
  listEl.innerHTML = '';

  AppState.stocks.forEach(stock => {
    const percent = Math.min(100, Math.round((stock.quantity / 25000) * 100)); // 25kg / 100 adet max kapasite varsayımı
    
    let colorClass = '';
    if (stock.quantity <= 0) colorClass = 'danger';
    else if (stock.quantity <= stock.minLimit) colorClass = 'warning';

    const row = document.createElement('div');
    row.className = 'stock-grid-table';
    row.style.borderBottom = '1px solid var(--border-light)';
    row.style.padding = '8px 0';
    
    row.innerHTML = `
      <div class="stock-cell" style="font-weight:600;">${stock.name}</div>
      <div class="stock-cell">${Math.ceil(stock.quantity)}</div>
      <div class="stock-cell">${stock.unit}</div>
      <div class="stock-cell">
        <div class="stock-bar-container">
          <div class="stock-bar-fill ${colorClass}" style="width: ${percent}%;"></div>
        </div>
      </div>
    `;
    listEl.appendChild(row);
  });
}

async function refillAllStocks() {
  try {
    const res = await fetch('/api/settings/stock/refill', { method: 'POST' });
    if (!res.ok) throw new Error('Sunucu hatası.');
    showToast('Tüm hammadde stokları başarıyla maksimum seviyeye yükseltildi.', 'success');
  } catch (err) {
    console.error(err);
    showToast('Stoklar yenilenemedi!', 'error');
  }
}

// --- DASHBOARD / ANALİTİK ÇİZİMLERİ ---
function changeReportPeriod(period) {
  AppState.reportPeriod = period;
  
  // Rapor butonları aktiflik durumu güncelle
  document.querySelectorAll('.period-btn').forEach(btn => {
    if (btn.id === `period-${period}`) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const now = new Date();
  let startStr = '';
  let endStr = '';

  const formatLocalDate = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  if (period === 'today') {
    startStr = formatLocalDate(now);
    endStr = formatLocalDate(now);
  } else if (period === 'yesterday') {
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    startStr = formatLocalDate(yesterday);
    endStr = formatLocalDate(yesterday);
  } else if (period === 'week') {
    const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    startStr = formatLocalDate(weekAgo);
    endStr = formatLocalDate(now);
  } else if (period === 'month') {
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startStr = formatLocalDate(firstOfMonth);
    endStr = formatLocalDate(now);
  } else if (period === 'year') {
    startStr = `2026-01-01`;
    endStr = `2026-12-31`;
  }

  if (period !== 'custom') {
    const startInput = document.getElementById('filter-start-date');
    const endInput = document.getElementById('filter-end-date');
    if (startInput) startInput.value = startStr;
    if (endInput) endInput.value = endStr;
  }

  renderDashboard();
  renderLedgerTable();
}

function handleCustomDateChange() {
  AppState.reportPeriod = 'custom';
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  renderDashboard();
  renderLedgerTable();
}

function filterHistoryByPeriod() {
  const startVal = document.getElementById('filter-start-date').value;
  const endVal = document.getElementById('filter-end-date').value;
  
  if (!startVal || !endVal) {
    return AppState.salesHistory;
  }

  const startLimit = new Date(startVal + 'T00:00:00');
  const endLimit = new Date(endVal + 'T23:59:59.999');

  return AppState.salesHistory.filter(tx => {
    const txDate = new Date(tx.timestamp);
    return txDate >= startLimit && txDate <= endLimit;
  });
}

function switchDashboardTab(tabName) {
  AppState.dashboardSubTab = tabName;
  
  const tabCharts = document.getElementById('tab-db-charts');
  const tabLedger = document.getElementById('tab-db-ledger');
  const tabExpenses = document.getElementById('tab-db-expenses');
  
  const viewCharts = document.getElementById('db-view-charts');
  const viewLedger = document.getElementById('db-view-ledger');
  const viewExpenses = document.getElementById('db-view-expenses');
  
  if (tabCharts) tabCharts.classList.remove('active');
  if (tabLedger) tabLedger.classList.remove('active');
  if (tabExpenses) tabExpenses.classList.remove('active');
  
  if (viewCharts) viewCharts.style.display = 'none';
  if (viewLedger) viewLedger.style.display = 'none';
  if (viewExpenses) viewExpenses.style.display = 'none';

  if (tabName === 'charts') {
    if (tabCharts) tabCharts.classList.add('active');
    if (viewCharts) viewCharts.style.display = 'block';
    renderDashboard();
  } else if (tabName === 'ledger') {
    if (tabLedger) tabLedger.classList.add('active');
    if (viewLedger) viewLedger.style.display = 'block';
    renderLedgerTable();
  } else if (tabName === 'expenses') {
    if (tabExpenses) tabExpenses.classList.add('active');
    if (viewExpenses) viewExpenses.style.display = 'block';
    const dateInput = document.getElementById('expense-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
    renderExpensesTable();
  }
}

function renderDashboard() {
  if (AppState.activeStaff && AppState.activeStaff.role === 'Garson') {
    renderExpensesTable();
    return;
  }

  const filteredSales = filterHistoryByPeriod();
  const filteredExpenses = filterExpensesByPeriod();
  
  const totalRevenue = filteredSales.reduce((sum, tx) => sum + tx.total, 0);
  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalRevenue - totalExpenses;

  const totalOrders = filteredSales.length;
  const avgCheck = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  
  const occupiedTables = AppState.tables.filter(t => t.status !== 'free').length;
  const occupancyRate = AppState.tables.length > 0 ? Math.round((occupiedTables / AppState.tables.length) * 100) : 0;

  const revEl = document.getElementById('metric-revenue');
  const expEl = document.getElementById('metric-expense');
  const prfEl = document.getElementById('metric-profit');
  const ordEl = document.getElementById('metric-orders');
  const avgEl = document.getElementById('metric-avg-check');
  const occEl = document.getElementById('metric-occupancy');

  if (revEl) revEl.textContent = `${totalRevenue.toFixed(2)} ₺`;
  if (expEl) expEl.textContent = `${totalExpenses.toFixed(2)} ₺`;
  if (prfEl) prfEl.textContent = `${netProfit.toFixed(2)} ₺`;
  if (ordEl) ordEl.textContent = totalOrders;
  if (avgEl) avgEl.textContent = `${avgCheck.toFixed(2)} ₺`;
  if (occEl) occEl.textContent = `${occupancyRate}%`;

  const revTitle = document.getElementById('revenue-metric-title');
  const expTitle = document.getElementById('expense-metric-title');
  const prfTitle = document.getElementById('profit-metric-title');
  const period = AppState.reportPeriod;

  if (revTitle) {
    if (period === 'today') revTitle.textContent = "Bugünkü Toplam Ciro";
    else if (period === 'yesterday') revTitle.textContent = "Dünkü Toplam Ciro";
    else if (period === 'week') revTitle.textContent = "Son 7 Günlük Toplam Ciro";
    else if (period === 'month') revTitle.textContent = "Bu Ayki Toplam Ciro";
    else if (period === 'year') revTitle.textContent = "Yıllık Toplam Ciro (2026)";
    else revTitle.textContent = "Seçili Dönem Toplam Ciro";
  }

  if (expTitle) {
    if (period === 'today') expTitle.textContent = "Bugünkü Toplam Gider";
    else if (period === 'yesterday') expTitle.textContent = "Dünkü Toplam Gider";
    else if (period === 'week') expTitle.textContent = "Son 7 Günlük Toplam Gider";
    else if (period === 'month') expTitle.textContent = "Bu Ayki Toplam Gider";
    else if (period === 'year') expTitle.textContent = "Yıllık Toplam Gider (2026)";
    else expTitle.textContent = "Seçili Dönem Toplam Gider";
  }

  if (prfTitle) {
    if (period === 'today') prfTitle.textContent = "Bugünkü Net Kâr";
    else if (period === 'yesterday') prfTitle.textContent = "Dünkü Net Kâr";
    else if (period === 'week') prfTitle.textContent = "Son 7 Günlük Net Kâr";
    else if (period === 'month') prfTitle.textContent = "Bu Ayki Net Kâr";
    else if (period === 'year') prfTitle.textContent = "Yıllık Net Kâr (2026)";
    else prfTitle.textContent = "Seçili Dönem Net Kâr";
  }

  renderCharts(filteredSales);
  renderTopItemsTable(filteredSales);

  if (AppState.dashboardSubTab === 'expenses') {
    renderExpensesTable();
  }
}

function renderCharts(filteredSales) {
  const period = AppState.reportPeriod;
  const trendsChartTitle = document.getElementById('trends-chart-title');
  const ctxTrends = document.getElementById('salesTrendsChart').getContext('2d');
  
  if (AppState.charts.trends) AppState.charts.trends.destroy();

  const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  if (period === 'year') {
    if (trendsChartTitle) trendsChartTitle.textContent = "2025 vs 2026 Yıllık Satış Karşılaştırması";

    const data2025 = Array(12).fill(0);
    const data2026 = Array(12).fill(0);

    AppState.salesHistory.forEach(tx => {
      const txDate = new Date(tx.timestamp);
      const yr = txDate.getFullYear();
      const mn = txDate.getMonth();
      if (yr === 2025) {
        data2025[mn] += tx.total;
      } else if (yr === 2026) {
        data2026[mn] += tx.total;
      }
    });

    AppState.charts.trends = new Chart(ctxTrends, {
      type: 'bar',
      data: {
        labels: monthNames,
        datasets: [
          {
            label: '2025 Ciro (₺)',
            data: data2025,
            backgroundColor: '#EC4899', // Pink
            borderRadius: 6,
            borderWidth: 0
          },
          {
            label: '2026 Ciro (₺)',
            data: data2026,
            backgroundColor: '#8B5CF6', // Purple
            borderRadius: 6,
            borderWidth: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: { color: '#9CA3AF', font: { family: 'Outfit' } }
          }
        },
        scales: {
          y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9CA3AF' } },
          x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9CA3AF' } }
        }
      }
    });

  } else {
    // line chart
    let labels = [];
    let data = [];

    if (period === 'today' || period === 'yesterday') {
      if (trendsChartTitle) trendsChartTitle.textContent = period === 'today' ? "Bugünün Satış Dağılımı (Saatlik)" : "Dünün Satış Dağılımı (Saatlik)";
      labels = ['12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];
      data = Array(11).fill(0);
      filteredSales.forEach(tx => {
        const hour = new Date(tx.timestamp).getHours();
        if (hour >= 12 && hour <= 22) {
          data[hour - 12] += tx.total;
        }
      });
    } else if (period === 'week') {
      if (trendsChartTitle) trendsChartTitle.textContent = "Son 7 Günün Satış Dağılımı (Günlük)";
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dayStr = d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
        labels.push(dayStr);

        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
        const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
        const dayTotal = AppState.salesHistory.reduce((sum, tx) => {
          const txDate = new Date(tx.timestamp);
          if (txDate >= dayStart && txDate <= dayEnd) return sum + tx.total;
          return sum;
        }, 0);
        data.push(dayTotal);
      }
    } else if (period === 'month') {
      if (trendsChartTitle) trendsChartTitle.textContent = "Bu Ayın Satış Dağılımı (Günlük)";
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonthIdx = now.getMonth();
      const daysInMonth = new Date(currentYear, currentMonthIdx + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        labels.push(String(day).padStart(2, '0'));
        const dayStart = new Date(currentYear, currentMonthIdx, day, 0, 0, 0, 0);
        const dayEnd = new Date(currentYear, currentMonthIdx, day, 23, 59, 59, 999);
        const dayTotal = AppState.salesHistory.reduce((sum, tx) => {
          const txDate = new Date(tx.timestamp);
          if (txDate >= dayStart && txDate <= dayEnd) return sum + tx.total;
          return sum;
        }, 0);
        data.push(dayTotal);
      }
    } else {
      // custom
      const startVal = document.getElementById('filter-start-date').value;
      const endVal = document.getElementById('filter-end-date').value;
      if (trendsChartTitle) trendsChartTitle.textContent = "Seçili Dönem Satış Dağılımı";
      if (startVal && endVal) {
        const sDate = new Date(startVal + 'T00:00:00');
        const eDate = new Date(endVal + 'T23:59:59');
        const diffTime = Math.abs(eDate - sDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 2) {
          labels = ['12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];
          data = Array(11).fill(0);
          filteredSales.forEach(tx => {
            const hour = new Date(tx.timestamp).getHours();
            if (hour >= 12 && hour <= 22) {
              data[hour - 12] += tx.total;
            }
          });
        } else if (diffDays <= 60) {
          const cursor = new Date(sDate);
          while (cursor <= eDate) {
            const dateStr = cursor.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
            labels.push(dateStr);

            const dayStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 0, 0, 0, 0);
            const dayEnd = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 23, 59, 59, 999);
            const dayTotal = filteredSales.reduce((sum, tx) => {
              const txDate = new Date(tx.timestamp);
              if (txDate >= dayStart && txDate <= dayEnd) return sum + tx.total;
              return sum;
            }, 0);
            data.push(dayTotal);
            cursor.setDate(cursor.getDate() + 1);
          }
        } else {
          const monthlyCiro = {};
          filteredSales.forEach(tx => {
            const txDate = new Date(tx.timestamp);
            const key = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
            monthlyCiro[key] = (monthlyCiro[key] || 0) + tx.total;
          });
          const sortedKeys = Object.keys(monthlyCiro).sort();
          sortedKeys.forEach(key => {
            const [yr, mn] = key.split('-');
            labels.push(`${monthNames[parseInt(mn) - 1]} ${yr}`);
            data.push(monthlyCiro[key]);
          });
        }
      } else {
        labels = ['Satış Yok'];
        data = [0];
      }
    }

    AppState.charts.trends = new Chart(ctxTrends, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Ciro (₺)',
          data: data,
          borderColor: '#8B5CF6',
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9CA3AF' } },
          x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9CA3AF' } }
        }
      }
    });
  }

  // Kategori dağılım çemberi
  const categoryCounts = {};
  MENU_CATEGORIES.forEach(cat => categoryCounts[cat.id] = 0);

  filteredSales.forEach(tx => {
    tx.items.forEach(item => {
      const menuItem = AppState.menuItems.find(mi => mi.name === item.name);
      if (menuItem) {
        categoryCounts[menuItem.categoryId] = (categoryCounts[menuItem.categoryId] || 0) + (item.quantity * item.price);
      }
    });
  });

  const categoryLabels = MENU_CATEGORIES.map(c => c.name);
  const categoryData = MENU_CATEGORIES.map(c => categoryCounts[c.id]);

  const ctxShare = document.getElementById('categoryShareChart').getContext('2d');
  if (AppState.charts.share) AppState.charts.share.destroy();

  AppState.charts.share = new Chart(ctxShare, {
    type: 'doughnut',
    data: {
      labels: categoryLabels,
      datasets: [{
        data: categoryData,
        backgroundColor: ['#8B5CF6', '#EC4899', '#06B6D4', '#F59E0B', '#10B981'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#9CA3AF', font: { family: 'Outfit' } } }
      }
    }
  });
}

function renderTopItemsTable(filteredSales) {
  const itemCounts = {};
  filteredSales.forEach(tx => {
    tx.items.forEach(item => {
      if (!itemCounts[item.name]) {
        itemCounts[item.name] = { count: 0, amount: 0 };
      }
      itemCounts[item.name].count += item.quantity;
      itemCounts[item.name].amount += (item.quantity * item.price);
    });
  });

  const sortedItems = Object.keys(itemCounts).map(name => ({
    name: name,
    count: itemCounts[name].count,
    amount: itemCounts[name].amount
  })).sort((a, b) => b.count - a.count).slice(0, 5);

  const listEl = document.getElementById('dashboard-rank-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const maxCount = sortedItems.length > 0 ? sortedItems[0].count : 1;

  sortedItems.forEach(item => {
    const pct = Math.round((item.count / maxCount) * 100);
    const row = document.createElement('div');
    row.className = 'rank-item';
    row.innerHTML = `
      <div class="rank-item-info">
        <span class="rank-item-name">${item.name}</span>
        <span class="rank-item-count">${item.count} Adet (${item.amount.toFixed(2)} ₺)</span>
      </div>
      <div class="rank-bar-bg">
        <div class="rank-bar-fill" style="width: ${pct}%"></div>
      </div>
    `;
    listEl.appendChild(row);
  });
}

function renderLedgerTable() {
  const filteredSales = filterHistoryByPeriod();
  const searchInput = document.getElementById('ledger-search-input');
  const typeFilter = document.getElementById('ledger-type-filter');
  const payFilter = document.getElementById('ledger-pay-filter');

  const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const serviceType = typeFilter ? typeFilter.value : 'all';
  const payType = payFilter ? payFilter.value : 'all';
  
  const tbody = document.getElementById('ledger-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  const ledgerData = filteredSales.filter(tx => {
    const matchesSearch = searchQuery === '' || 
      tx.id.toLowerCase().includes(searchQuery) || 
      (tx.waiterId && tx.waiterId.toLowerCase().includes(searchQuery)) ||
      tx.tableName.toLowerCase().includes(searchQuery);
      
    const txType = tx.orderType || 'dine-in';
    const matchesType = serviceType === 'all' || txType === serviceType;
    const matchesPay = payType === 'all' || tx.paymentMethod === payType;
    
    return matchesSearch && matchesType && matchesPay;
  });

  ledgerData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (ledgerData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; color: var(--text-secondary); padding: 24px; background: rgba(0,0,0,0.1);">
          Arama kriterlerine uygun işlem bulunamadı.
        </td>
      </tr>
    `;
    return;
  }

  const typeMap = { 'dine-in': 'Masaya Servis', 'takeaway': 'Gel-Al', 'delivery': 'Adrese Paket' };
  const payMap = { 'CASH': 'Nakit', 'CARD': 'Kredi Kartı', 'MEALCARD': 'Yemek Kartı', 'OTHER': 'Diğer' };

  ledgerData.forEach(tx => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.onclick = () => {
      generateReceiptHTML(tx);
      document.getElementById('modal-receipt').classList.add('active');
    };
    
    const dateStr = new Date(tx.timestamp).toLocaleString('tr-TR');
    const typeStr = typeMap[tx.orderType || 'dine-in'] || 'Masaya Servis';
    const payStr = payMap[tx.paymentMethod] || 'Nakit';
    const discountStr = tx.discount > 0 ? `%${tx.discount}` : '-';

    tr.innerHTML = `
      <td style="font-weight:600; color:var(--accent-cyan);">${tx.id}</td>
      <td>${dateStr}</td>
      <td>${tx.tableName}</td>
      <td>${tx.waiterId.toUpperCase()}</td>
      <td>${typeStr}</td>
      <td><span class="ledger-badge ${tx.paymentMethod.toLowerCase()}">${payStr}</span></td>
      <td>${discountStr}</td>
      <td style="font-weight:700; color:var(--status-free);">${tx.total.toFixed(2)} ₺</td>
      <td>
        <button class="ledger-action-btn" onclick="event.stopPropagation(); showLedgerReceipt('${tx.id}')">
          Fiş Detay
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function showLedgerReceipt(txId) {
  const tx = AppState.salesHistory.find(t => t.id === txId);
  if (tx) {
    generateReceiptHTML(tx);
    document.getElementById('modal-receipt').classList.add('active');
  }
}

function exportLedgerToCSV() {
  const startVal = document.getElementById('filter-start-date').value;
  const endVal = document.getElementById('filter-end-date').value;
  const period = AppState.reportPeriod;
  const filename = `Go_Healthy_POS_Rapor_${period}_${startVal}_to_${endVal}.csv`;

  const filteredSales = filterHistoryByPeriod();
  const searchInput = document.getElementById('ledger-search-input');
  const typeFilter = document.getElementById('ledger-type-filter');
  const payFilter = document.getElementById('ledger-pay-filter');

  const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const serviceType = typeFilter ? typeFilter.value : 'all';
  const payType = payFilter ? payFilter.value : 'all';

  const ledgerData = filteredSales.filter(tx => {
    const matchesSearch = searchQuery === '' || 
      tx.id.toLowerCase().includes(searchQuery) || 
      (tx.waiterId && tx.waiterId.toLowerCase().includes(searchQuery)) ||
      tx.tableName.toLowerCase().includes(searchQuery);
      
    const txType = tx.orderType || 'dine-in';
    const matchesType = serviceType === 'all' || txType === serviceType;
    const matchesPay = payType === 'all' || tx.paymentMethod === payType;
    
    return matchesSearch && matchesType && matchesPay;
  });

  if (ledgerData.length === 0) {
    showToast('Dışa aktarılacak veri bulunamadı!', 'warning');
    return;
  }

  const typeMap = { 'dine-in': 'Masaya Servis', 'takeaway': 'Gel-Al', 'delivery': 'Adrese Paket' };
  const payMap = { 'CASH': 'Nakit', 'CARD': 'Kredi Kartı', 'MEALCARD': 'Yemek Kartı', 'OTHER': 'Diğer' };

  let csvContent = "\ufeff"; // UTF-8 BOM for Excel
  csvContent += "Fiş / TX ID,Tarih & Saat,Masa / Kanal,Personel,Hizmet Tipi,Ödeme Tipi,İndirim %,Toplam Tutar\n";

  ledgerData.forEach(tx => {
    const dateStr = new Date(tx.timestamp).toLocaleString('tr-TR').replace(/,/g, '');
    const typeStr = typeMap[tx.orderType || 'dine-in'] || 'Masaya Servis';
    const payStr = payMap[tx.paymentMethod] || 'Nakit';
    const row = [
      tx.id,
      dateStr,
      tx.tableName,
      tx.waiterId.toUpperCase(),
      typeStr,
      payStr,
      tx.discount,
      tx.total.toFixed(2)
    ].map(val => `"${val}"`).join(",");
    csvContent += row + "\n";
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('CSV Raporu başarıyla indirildi.', 'success');
}

// --- AYARLAR EKRANI EKLEME FORMLARI ---
async function handleSettingsAddItem(e) {
  e.preventDefault();
  
  const name = document.getElementById('s-item-name').value.trim();
  const price = parseFloat(document.getElementById('s-item-price').value);
  const categoryId = document.getElementById('s-item-category').value;
  const image = document.getElementById('s-item-image').value.trim();
  const description = document.getElementById('s-item-desc').value.trim();

  const newItem = {
    id: name.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, ''),
    categoryId: categoryId,
    name: name,
    price: price,
    description: description,
    image: image || null,
    popular: false,
    options: []
  };

  try {
    const res = await fetch('/api/settings/item/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newItem)
    });
    if (!res.ok) throw new Error('Sunucu hatası.');
    showToast(`${name} menüye başarıyla eklendi.`, 'success');
    document.getElementById('settings-add-item-form').reset();
  } catch (err) {
    console.error(err);
    showToast('Ürün eklenemedi!', 'error');
  }
}

async function handleSettingsAddTable() {
  const name = document.getElementById('s-table-name').value.trim();
  const category = document.getElementById('s-table-floor').value;

  if (name === '') {
    showToast('Lütfen geçerli bir masa adı girin!', 'warning');
    return;
  }

  const x = 10 + Math.floor(Math.random() * 70);
  const y = 10 + Math.floor(Math.random() * 70);

  const newTable = {
    id: name.replace(/ /g, ''),
    name: name,
    category: category,
    x: x,
    y: y,
    shape: 'square',
    status: 'free'
  };

  try {
    const res = await fetch('/api/settings/table/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTable)
    });
    if (!res.ok) throw new Error('Sunucu hatası.');
    showToast(`${name} (${category}) başarıyla eklendi.`, 'success');
    document.getElementById('s-table-name').value = '';
  } catch (err) {
    console.error(err);
    showToast('Masa eklenemedi!', 'error');
  }
}

async function resetSystemData() {
  if (confirm('Tüm verileri silmek ve fabrika ayarlarına dönmek istediğinizden emin misiniz?')) {
    try {
      const res = await fetch('/api/settings/reset', { method: 'POST' });
      if (!res.ok) throw new Error('Sıfırlama hatası.');
      localStorage.clear();
      showToast('Tüm veriler sıfırlandı.', 'info');
      switchScreen('tables');
    } catch (err) {
      console.error(err);
      showToast('Sistem sıfırlanamadı!', 'error');
    }
  }
}

// --- BİLDİRİM SİSTEMİ (TOAST) ---
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'info';
  if (type === 'success') icon = 'check-circle';
  else if (type === 'warning') icon = 'alert-triangle';
  else if (type === 'error') icon = 'alert-circle';

  toast.innerHTML = `
    <div class="toast-icon">
      <i data-lucide="${icon}"></i>
    </div>
    <span>${msg}</span>
  `;
  container.appendChild(toast);
  lucide.createIcons();

  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
  if (modalId === 'modal-delivery-order') {
    const mapEl = document.getElementById('delivery-order-map');
    if (mapEl) mapEl.style.display = 'none';
    stopOrderSoundLoop();
    stopTurkishMarch();
  }
}

// --- MASA QR KARTLARI BASKI DENEYİMİ ---
function openQRPrintLayout() {
  const section = document.getElementById('print-qr-section');
  const grid = document.getElementById('print-qr-grid');
  grid.innerHTML = '';

  // Tüm masalar için basılabilir şık etiketler oluştur
  AppState.tables.forEach(table => {
    const card = document.createElement('div');
    card.className = 'print-qr-card';
    
    // SVG olarak detaylı ve şık bir QR Kod çizimi (simüle edilmiş piksel yapısı)
    const qrSvg = `
      <svg width="110" height="110" viewBox="0 0 29 29" style="shape-rendering: crispEdges;">
        <path fill="#000000" d="M0 0h7v7H0zm1 1v5h5V1zm8 0h3v1H9zm4 0h1v1h-1zm1 0h3v1h-3zm5 0h1v3h-1zm2 0h3v7h-3zm1 1v5h1V2zm-9 1h1v1h-1zm2 0h1v2h-1zm2 0h1v1h-1zm2 1h1v2h-1zm-9 1h1v2h-1zm4 0h1v1h-1zm1 0h1v2h-1zm-6 2h1v1H8zm2 0h2v1H10zm4 0h3v1h-3zm-14 1h7v7H0zm1 1v5h5v-5zm11 1h1v1h-1zm3 0h1v2h-1zm-6 1h1v3h-1zm2 0h1v1h-1zm5 0h1v2h-1zm2 0h1v1h-1zm-7 1h1v1h-1zm4 0h1v2h-1zm5 0h1v1h-1zm-10 1h2v1h-2zm3 0h1v1h-1zm5 0h2v1h-2z"/>
        <rect x="11" y="11" width="7" height="7" fill="#ffffff"/>
        <rect x="13" y="13" width="3" height="3" fill="#4c956c"/>
      </svg>
    `;

    card.innerHTML = `
      <div class="print-qr-card-title">GO HEALTHY</div>
      <div class="print-qr-card-table">${table.name}</div>
      <div class="print-qr-svg-wrapper">
        ${qrSvg}
      </div>
      <div class="print-qr-card-instruction">
        Temassız Sipariş Vermek İçin<br>Telefonunuzdan Karekodu Okutun.
      </div>
      <div class="print-qr-card-wifi">
        📶 Wifi: GoHealthy_Free_Wifi<br>🔑 Şifre: gohealthy1234
      </div>
    `;
    
    // QR Koda tıklanırsa doğrudan o masanın mobil simülatörünü açsın (etkileşimli demo)
    card.onclick = () => {
      closeQRPrintLayout();
      const select = document.getElementById('qr-table-select');
      if (select) {
        select.value = table.id;
        changeQRTable();
      }
      openQRMenuSimulator();
    };

    grid.appendChild(card);
  });

  section.style.display = 'block';
  showToast('Masa QR etiket baskı ön izleme ekranı açıldı.', 'info');
}

function closeQRPrintLayout() {
  document.getElementById('print-qr-section').style.display = 'none';
}

function renderActiveDeliveries() {
  const container = document.getElementById('active-deliveries-list');
  if (!container) return;
  container.innerHTML = '';

  const tableIds = AppState.tables.map(t => t.id);
  const activeOrderKeys = Object.keys(AppState.activeOrders);
  const deliveryOrders = activeOrderKeys.filter(key => !tableIds.includes(key) && key !== 'quick');

  if (deliveryOrders.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-secondary); font-size: 11px; padding: 20px 0;">
        <i data-lucide="package-open" style="width: 24px; height: 24px; stroke-width: 1.5; margin-bottom: 6px; color: var(--text-muted);"></i>
        <div>Aktif dış sipariş bulunmuyor.</div>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  deliveryOrders.forEach(orderId => {
    const order = AppState.activeOrders[orderId];
    const card = document.createElement('div');
    card.style.background = 'rgba(255, 255, 255, 0.02)';
    card.style.border = '1px solid var(--border-light)';
    card.style.borderRadius = '12px';
    card.style.padding = '10px';
    card.style.cursor = 'pointer';
    card.style.transition = 'all 0.2s';
    
    const isReady = !AppState.kitchenOrders.some(ko => ko.tableId === orderId && ko.status === 'cooking');
    const statusText = isReady ? 'Hazır (Servis)' : 'Hazırlanıyor';
    const statusColor = isReady ? 'var(--status-free)' : 'var(--status-bill)';

    const total = calculateOrderTotal(order);
    
    let noteText = '';
    if (order.items && order.items.length > 0 && order.items[0].note) {
      const parts = order.items[0].note.split('|');
      const namePart = parts.find(p => p.includes('Müşteri:'));
      if (namePart) {
        noteText = namePart.replace('Müşteri:', '').trim();
      }
    }
    if (!noteText) noteText = order.orderType === 'delivery' ? 'Paket Servis' : 'Gel-Al';

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span style="font-weight:700; font-size:12px; color:var(--accent-cyan);">${orderId}</span>
        <span style="font-size:10px; font-weight:600; color:${statusColor}; background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:6px;">${statusText}</span>
      </div>
      <div style="font-size:11px; color:var(--text-primary); font-weight:500; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
        ${noteText}
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--text-secondary);">
        <span>${order.items.length} Ürün</span>
        <span style="font-weight:700; color:var(--text-primary);">${total.toFixed(2)} ₺</span>
      </div>
    `;

    card.onmouseover = () => {
      card.style.borderColor = 'var(--border-focus)';
      card.style.transform = 'translateY(-2px)';
    };
    card.onmouseout = () => {
      card.style.borderColor = 'var(--border-light)';
      card.style.transform = 'translateY(0)';
    };

    card.onclick = () => {
      AppState.selectedTable = { id: orderId, name: `Sipariş ${orderId}`, isDelivery: true };
      switchScreen('pos');
    };

    container.appendChild(card);
  });
  lucide.createIcons();
}

// --- RESTORAN GİDER TAKİBİ FONKSİYONLARI ---

function filterExpensesByPeriod() {
  const startVal = document.getElementById('filter-start-date').value;
  const endVal = document.getElementById('filter-end-date').value;
  
  const expenses = AppState.expenses || [];
  if (!startVal || !endVal) {
    return expenses;
  }

  const startLimit = new Date(startVal + 'T00:00:00');
  const endLimit = new Date(endVal + 'T23:59:59.999');

  return expenses.filter(exp => {
    const expDate = new Date(exp.timestamp);
    return expDate >= startLimit && expDate <= endLimit;
  });
}

function renderExpensesTable() {
  const tbody = document.getElementById('expense-list-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filtered = filterExpensesByPeriod();
  const total = filtered.reduce((sum, e) => sum + e.amount, 0);

  const totalBadge = document.getElementById('expense-total-badge');
  if (totalBadge) {
    totalBadge.textContent = `Toplam: ${total.toFixed(2)} ₺`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding: 20px; color: var(--text-secondary);">
          Seçili dönemde girilmiş gider bulunmuyor.
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach(exp => {
    const tr = document.createElement('tr');
    const dateStr = new Date(exp.timestamp).toLocaleDateString('tr-TR');
    tr.innerHTML = `
      <td>${dateStr}</td>
      <td style="font-weight: 500;">${exp.description}</td>
      <td><span class="ledger-badge dine-in" style="background: rgba(255,255,255,0.05); color:#fff; border:1px solid var(--border-light); font-size:11px;">${exp.category}</span></td>
      <td style="font-weight: 700; color: var(--status-busy);">${exp.amount.toFixed(2)} ₺</td>
      <td>
        <button class="expense-delete-btn" onclick="deleteExpense('${exp.id}')">
          <i data-lucide="trash-2" style="width:12px; height:12px;"></i> Sil
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  lucide.createIcons();
}

async function handleExpenseSubmit(event) {
  event.preventDefault();

  const descInput = document.getElementById('expense-desc');
  const amountInput = document.getElementById('expense-amount');
  const catSelect = document.getElementById('expense-category');
  const dateInput = document.getElementById('expense-date');

  const description = descInput.value.trim();
  const amount = parseFloat(amountInput.value);
  const category = catSelect.value;
  const dateVal = dateInput.value;

  if (!description || isNaN(amount) || amount <= 0 || !category || !dateVal) {
    showToast('Lütfen tüm alanları geçerli değerlerle doldurun!', 'warning');
    return;
  }

  const staffId = AppState.activeStaff ? AppState.activeStaff.id : '';
  const timestamp = new Date(dateVal + 'T12:00:00').toISOString();

  try {
    const response = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description,
        amount,
        category,
        staffId,
        timestamp
      })
    });

    const result = await response.json();
    if (result.success) {
      showToast('Gider başarıyla kaydedildi.', 'success');
      descInput.value = '';
      amountInput.value = '';
      dateInput.value = new Date().toISOString().split('T')[0];
    } else {
      showToast(result.error || 'Gider kaydedilemedi!', 'error');
    }
  } catch (err) {
    console.error('Error adding expense:', err);
    showToast('Gider kaydedilemedi!', 'error');
  }
}

async function deleteExpense(id) {
  if (!confirm('Bu gider kaydını silmek istediğinize emin misiniz?')) return;

  try {
    const response = await fetch(`/api/expenses/${id}`, {
      method: 'DELETE'
    });

    const result = await response.json();
    if (result.success) {
      showToast('Gider kaydı silindi.', 'success');
    } else {
      showToast(result.error || 'Gider silinemedi!', 'error');
    }
  } catch (err) {
    console.error('Error deleting expense:', err);
    showToast('Gider silinemedi!', 'error');
  }
}

// --- YAZICI YÖNETİM AYARLARI ---
async function loadPrinterSettings() {
  try {
    const res = await fetch('/api/settings/printers');
    if (res.ok) {
      const data = await res.json();
      document.getElementById('p-kasa-ip').value = data.kasaIp || '';
      document.getElementById('p-mutfak-ip').value = data.mutfakIp || '';
      document.getElementById('p-printer-enabled').checked = !!data.enabled;
    }
  } catch (err) {
    console.error('Error loading printer settings:', err);
  }
}

async function savePrinterSettings(e) {
  if (e) e.preventDefault();
  const kasaIp = document.getElementById('p-kasa-ip').value.trim();
  const mutfakIp = document.getElementById('p-mutfak-ip').value.trim();
  const enabled = document.getElementById('p-printer-enabled').checked;

  try {
    const res = await fetch('/api/settings/printers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kasaIp, mutfakIp, enabled })
    });
    if (res.ok) {
      showToast('Yazıcı ayarları başarıyla kaydedildi.', 'success');
    } else {
      throw new Error('Kaydetme hatası');
    }
  } catch (err) {
    console.error(err);
    showToast('Yazıcı ayarları kaydedilemedi!', 'error');
  }
}

async function testPrinterConnection() {
  const kasaIp = document.getElementById('p-kasa-ip').value.trim();
  const mutfakIp = document.getElementById('p-mutfak-ip').value.trim();
  
  if (!kasaIp && !mutfakIp) {
    showToast('Lütfen test etmek için en az bir IP adresi girin.', 'warning');
    return;
  }

  showToast('Bağlantı test ediliyor...', 'info');

  try {
    const res = await fetch('/api/settings/printers/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kasaIp, mutfakIp })
    });
    const result = await res.json();
    if (result.success) {
      showToast(result.message, 'success');
    } else {
      showToast(result.message || 'Bağlantı başarısız!', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Yazıcı bağlantı testi başarısız oldu!', 'error');
  }
}
