const path = require('path');

const usePostgres = !!process.env.DATABASE_URL;
let pgPool = null;
let sqliteDb = null;

if (usePostgres) {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
  console.log("Database Mode: Cloud PostgreSQL (Neon/Supabase)");
} else {
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(__dirname, 'pos.db');
  sqliteDb = new sqlite3.Database(dbPath);
  console.log("Database Mode: Local SQLite (" + dbPath + ")");
}

// SQL translator to map SQLite '?' placeholders to PostgreSQL '$1, $2...' format
function translateSql(sql) {
  if (!usePostgres) return sql;
  let index = 1;
  let converted = sql
    .replace(/\bREAL\b/gi, 'DOUBLE PRECISION')
    .replace(/\bINTEGER PRIMARY KEY\b/gi, 'TEXT PRIMARY KEY')
    .replace(/\?/g, () => `$${index++}`);
  return converted;
}

// Helper Promise wrappers that transparently choose SQLite or PostgreSQL
const run = (sql, params = []) => new Promise((resolve, reject) => {
  const finalSql = translateSql(sql);
  if (usePostgres) {
    pgPool.query(finalSql, params, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  } else {
    sqliteDb.run(finalSql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  }
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
  const finalSql = translateSql(sql);
  if (usePostgres) {
    pgPool.query(finalSql, params, (err, res) => {
      if (err) reject(err);
      else resolve(res.rows[0]);
    });
  } else {
    sqliteDb.get(finalSql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  }
});

const all = (sql, params = []) => new Promise((resolve, reject) => {
  const finalSql = translateSql(sql);
  if (usePostgres) {
    pgPool.query(finalSql, params, (err, res) => {
      if (err) reject(err);
      else resolve(res.rows);
    });
  } else {
    sqliteDb.all(finalSql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  }
});

// Recipe configurations (server-side inventory deduction)
const MENU_RECIPES = {
  'avokado-ekmek': [
    { ingredientId: 'avokado', quantity: 80 },
    { ingredientId: 'yumurta', quantity: 2 },
    { ingredientId: 'hindi-fume', quantity: 40 },
    { ingredientId: 'eksi-maya', quantity: 1 }
  ],
  'go-healthy-omlet': [
    { ingredientId: 'yumurta', quantity: 3 },
    { ingredientId: 'ispanak', quantity: 50 },
    { ingredientId: 'peynir', quantity: 40 },
    { ingredientId: 'yulaf-unu', quantity: 30 }
  ],
  'fit-yulaf-lapasi': [
    { ingredientId: 'yulaf', quantity: 60 },
    { ingredientId: 'badem-sutu', quantity: 200 },
    { ingredientId: 'muz', quantity: 1 },
    { ingredientId: 'fistik-ezmesi', quantity: 20 }
  ],
  'kisir-kase': [
    { ingredientId: 'kinoa', quantity: 80 },
    { ingredientId: 'tavuk-eti', quantity: 150 },
    { ingredientId: 'avokado', quantity: 40 },
    { ingredientId: 'domates', quantity: 1 }
  ],
  'tavuk-kase': [
    { ingredientId: 'tavuk-eti', quantity: 180 },
    { ingredientId: 'basmati-pirinc', quantity: 100 },
    { ingredientId: 'mantar', quantity: 50 },
    { ingredientId: 'brokoli', quantity: 60 }
  ],
  'somon-kase': [
    { ingredientId: 'somon', quantity: 150 },
    { ingredientId: 'kinoa', quantity: 80 },
    { ingredientId: 'avokado', quantity: 50 },
    { ingredientId: 'edamame', quantity: 40 }
  ],
  'tavuklu-fit-wrap': [
    { ingredientId: 'tavuk-eti', quantity: 150 },
    { ingredientId: 'cheddar', quantity: 30 },
    { ingredientId: 'lavas', quantity: 1 },
    { ingredientId: 'patates', quantity: 120 }
  ],
  'avokado-hellim-wrap': [
    { ingredientId: 'hellim', quantity: 100 },
    { ingredientId: 'avokado', quantity: 50 },
    { ingredientId: 'lavas', quantity: 1 },
    { ingredientId: 'domates', quantity: 1 }
  ],
  'sekersiz-fit-kunefe': [
    { ingredientId: 'kunefe-peyniri', quantity: 120 },
    { ingredientId: 'kadayif', quantity: 100 },
    { ingredientId: 'stevia', quantity: 50 }
  ],
  'fit-mango-chia': [
    { ingredientId: 'chia', quantity: 30 },
    { ingredientId: 'hindistan-sutu', quantity: 150 },
    { ingredientId: 'cilek', quantity: 50 }
  ],
  'yesil-detoks': [
    { ingredientId: 'elma', quantity: 1 },
    { ingredientId: 'salatalik', quantity: 1 },
    { ingredientId: 'limon', quantity: 1 },
    { ingredientId: 'zencefil', quantity: 10 }
  ],
  'kirmizi-fit-smoothie': [
    { ingredientId: 'bogurtlen', quantity: 100 },
    { ingredientId: 'yulaf-sutu', quantity: 150 },
    { ingredientId: 'muz', quantity: 1 }
  ],
  'ayran': [
    { ingredientId: 'yogurt', quantity: 150 }
  ],
  'turk-kahvesi': [
    { ingredientId: 'kahve', quantity: 7 },
    { ingredientId: 'seker', quantity: 0 }
  ],
  'cay': [
    { ingredientId: 'cay', quantity: 1 }
  ]
};

const INITIAL_STOCKS = [
  { id: 'avokado', name: 'Avokado (Adet)', quantity: 80, unit: 'adet', minLimit: 15 },
  { id: 'yumurta', name: 'Organik Yumurta', quantity: 200, unit: 'adet', minLimit: 40 },
  { id: 'hindi-fume', name: 'Hindi Füme Dilim', quantity: 5000, unit: 'gr', minLimit: 1000 },
  { id: 'eksi-maya', name: 'Ekşi Mayalı Ekmek Dilimi', quantity: 100, unit: 'dilim', minLimit: 20 },
  { id: 'ispanak', name: 'Bebek Ispanak Yaprağı', quantity: 3000, unit: 'gr', minLimit: 500 },
  { id: 'peynir', name: 'Hafif Keçi/Lor Peyniri', quantity: 6000, unit: 'gr', minLimit: 1000 },
  { id: 'yulaf-unu', name: 'Glütensiz Yulaf Unu', quantity: 10000, unit: 'gr', minLimit: 2000 },
  { id: 'yulaf', name: 'Organik Yulaf Ezmesi', quantity: 15000, unit: 'gr', minLimit: 3000 },
  { id: 'badem-sutu', name: 'Şekersiz Badem Sütü', quantity: 20000, unit: 'ml', minLimit: 4000 },
  { id: 'muz', name: 'İthal Muz (Adet)', quantity: 100, unit: 'adet', minLimit: 20 },
  { id: 'fistik-ezmesi', name: 'Şekersiz Fıstık Ezmesi', quantity: 5000, unit: 'gr', minLimit: 1000 },
  { id: 'kinoa', name: 'Beyaz/Kırmızı Kinoa', quantity: 15000, unit: 'gr', minLimit: 3000 },
  { id: 'tavuk-eti', name: 'Temizlenmiş Tavuk Göğsü', quantity: 20000, unit: 'gr', minLimit: 4000 },
  { id: 'domates', name: 'Salkım Domates', quantity: 150, unit: 'adet', minLimit: 30 },
  { id: 'basmati-pirinc', name: 'Basmati Pirinç', quantity: 25000, unit: 'gr', minLimit: 5000 },
  { id: 'mantar', name: 'Kültür Mantarı', quantity: 10000, unit: 'gr', minLimit: 2000 },
  { id: 'brokoli', name: 'Buharlık Brokoli', quantity: 12000, unit: 'gr', minLimit: 2000 },
  { id: 'somon', name: 'Taze Norveç Somon Fileto', quantity: 10000, unit: 'gr', minLimit: 2000 },
  { id: 'edamame', name: 'Ayıklanmış Edamame', quantity: 8000, unit: 'gr', minLimit: 1500 },
  { id: 'cheddar', name: 'Hafif Cheddar Peyniri', quantity: 5000, unit: 'gr', minLimit: 1000 },
  { id: 'lavas', name: 'Tam Buğday Lavaş', quantity: 120, unit: 'adet', minLimit: 25 },
  { id: 'patates', name: 'Dondurulmuş Patates Dilimleri', quantity: 20000, unit: 'gr', minLimit: 4000 },
  { id: 'hellim', name: 'Hellim Peyniri Dilimleri', quantity: 8000, unit: 'gr', minLimit: 1500 },
  { id: 'kunefe-peyniri', name: 'Tuzsuz Künefe Peyniri', quantity: 8000, unit: 'gr', minLimit: 1500 },
  { id: 'kadayif', name: 'Çıtır Kadayıf Lifleri', quantity: 10000, unit: 'gr', minLimit: 2000 },
  { id: 'stevia', name: 'Doğal Stevia Şurubu', quantity: 5000, unit: 'ml', minLimit: 1000 },
  { id: 'chia', name: 'Chia Tohumu', quantity: 10000, unit: 'gr', minLimit: 2000 },
  { id: 'hindistan-sutu', name: 'Hindistan Cevizi Sütü', quantity: 20000, unit: 'ml', minLimit: 4000 },
  { id: 'cilek', name: 'Taze Çilek (Adet)', quantity: 200, unit: 'adet', minLimit: 40 },
  { id: 'elma', name: 'Yeşil Elma (Adet)', quantity: 100, unit: 'adet', minLimit: 20 },
  { id: 'salatalik', name: 'Çengelköy Salatalığı', quantity: 150, unit: 'adet', minLimit: 30 },
  { id: 'limon', name: 'Sulu Limon (Adet)', quantity: 100, unit: 'adet', minLimit: 20 },
  { id: 'zencefil', name: 'Taze Zencefil Kökü', quantity: 3000, unit: 'gr', minLimit: 500 },
  { id: 'bogurtlen', name: 'Dondurulmuş Böğürtlen', quantity: 10000, unit: 'gr', minLimit: 2000 },
  { id: 'yulaf-sutu', name: 'Şekersiz Yulaf Sütü', quantity: 20000, unit: 'ml', minLimit: 4000 },
  { id: 'yogurt', name: 'Organik Yoğurt', quantity: 15000, unit: 'gr', minLimit: 3000 },
  { id: 'kahve', name: 'Türk Kahvesi Toz', quantity: 3000, unit: 'gr', minLimit: 500 },
  { id: 'cay', name: 'Organik Yeşil Çay', quantity: 200, unit: 'bardak', minLimit: 45 }
];

async function initDatabase() {
  if (!usePostgres) sqliteDb.serialize();

  // Create tables
  await run(`CREATE TABLE IF NOT EXISTS tables (
    id TEXT PRIMARY KEY,
    name TEXT,
    category TEXT,
    x INTEGER,
    y INTEGER,
    shape TEXT,
    status TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS menu_items (
    id TEXT PRIMARY KEY,
    categoryId TEXT,
    name TEXT,
    price REAL,
    description TEXT,
    image TEXT,
    popular INTEGER,
    options TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS stocks (
    id TEXT PRIMARY KEY,
    name TEXT,
    quantity REAL,
    unit TEXT,
    minLimit REAL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS active_orders (
    tableId TEXT PRIMARY KEY,
    items TEXT,
    discount REAL,
    orderType TEXT,
    waiterId TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS kitchen_orders (
    id TEXT PRIMARY KEY,
    tableId TEXT,
    tableName TEXT,
    waiterId TEXT,
    status TEXT,
    items TEXT,
    timestamp TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS sales_history (
    id TEXT PRIMARY KEY,
    tableId TEXT,
    tableName TEXT,
    items TEXT,
    subtotal REAL,
    tax REAL,
    discount REAL,
    total REAL,
    paymentMethod TEXT,
    orderType TEXT,
    waiterId TEXT,
    timestamp TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY,
    name TEXT,
    role TEXT,
    code TEXT,
    status TEXT,
    shiftStart TEXT
  )`);

  // Seed default data
  const tablesCount = await get(`SELECT COUNT(*) as count FROM tables`);
  if (tablesCount.count === 0) {
    const defaultTables = [
      { id: 'T1', name: 'Masa 1', category: 'Salon', x: 15, y: 15, shape: 'round', status: 'free' },
      { id: 'T2', name: 'Masa 2', category: 'Salon', x: 45, y: 15, shape: 'round', status: 'free' },
      { id: 'T3', name: 'Masa 3', category: 'Salon', x: 75, y: 15, shape: 'round', status: 'free' },
      { id: 'T4', name: 'Masa 4', category: 'Salon', x: 15, y: 55, shape: 'square', status: 'free' },
      { id: 'T5', name: 'Masa 5', category: 'Salon', x: 45, y: 55, shape: 'square', status: 'free' },
      { id: 'T6', name: 'Masa 6', category: 'Salon', x: 75, y: 55, shape: 'square', status: 'free' },
      { id: 'T7', name: 'Masa 7 (Teras)', category: 'Teras', x: 15, y: 15, shape: 'square', status: 'free' },
      { id: 'T8', name: 'Masa 8 (Teras)', category: 'Teras', x: 45, y: 15, shape: 'round', status: 'free' },
      { id: 'T9', name: 'Masa 9 (Teras)', category: 'Teras', x: 75, y: 15, shape: 'square', status: 'free' },
      { id: 'T10', name: 'Masa 10 (Teras)', category: 'Teras', x: 15, y: 55, shape: 'round', status: 'free' },
      { id: 'T11', name: 'Masa 11 (Teras)', category: 'Teras', x: 45, y: 55, shape: 'square', status: 'free' },
      { id: 'T12', name: 'Masa 12 (Teras)', category: 'Teras', x: 75, y: 55, shape: 'round', status: 'free' },
      { id: 'V1', name: 'VIP Oda 1', category: 'VIP', x: 20, y: 30, shape: 'large-round', status: 'free' },
      { id: 'V2', name: 'VIP Oda 2', category: 'VIP', x: 70, y: 30, shape: 'large-round', status: 'free' },
      { id: 'V3', name: 'VIP Oda 3', category: 'VIP', x: 20, y: 70, shape: 'large-round', status: 'free' },
      { id: 'V4', name: 'VIP Oda 4', category: 'VIP', x: 70, y: 70, shape: 'large-round', status: 'free' }
    ];
    for (const t of defaultTables) {
      await run(`INSERT INTO tables VALUES (?, ?, ?, ?, ?, ?, ?)`, [t.id, t.name, t.category, t.x, t.y, t.shape, t.status]);
    }
  }

  const menuCount = await get(`SELECT COUNT(*) as count FROM menu_items`);
  if (menuCount.count === 0) {
    const defaultMenuItems = [
      { id: 'avokado-ekmek', categoryId: 'kebap-izgara', name: 'Avokado Ekmek', price: 290, description: 'Ekşi mayalı ekmek, ezilmiş avokado, poşe yumurta, füme hindi ve mikro yeşillikler.', image: 'https://images.unsplash.com/photo-1541532713592-79a0317b6b77?auto=format&fit=crop&w=400&q=80', popular: 1, options: ['Yumurtalı', 'Yumurtasız'] },
      { id: 'go-healthy-omlet', categoryId: 'kebap-izgara', name: 'Go Healthy Omlet', price: 310, description: 'Keçi peynirli ve ıspanaklı omlet, yulaf krebi, granola ve taze böğürtlenler.', image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=400&q=80', popular: 1, options: [] },
      { id: 'fit-yulaf-lapasi', categoryId: 'kebap-izgara', name: 'Fit Yulaf Lapası', price: 190, description: 'Badem sütlü yulaf; muz, fıstık ezmesi, chia tohumu ve organik bal ile.', image: 'https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&w=400&q=80', popular: 0, options: [] },
      { id: 'kisir-kase', categoryId: 'pide-pizza', name: 'Kısır Kase', price: 340, description: 'Kinoa kısırı, ızgara tavuk, Akdeniz yeşillikleri, avokado ve çeri domates.', image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=400&q=80', popular: 1, options: [] },
      { id: 'tavuk-kase', categoryId: 'pide-pizza', name: 'Tavuk Kase (Protein)', price: 360, description: 'Izgara tavuk, basmati pirinç, buharda brokoli, mantar sote ve kırmızı lahana.', image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80', popular: 1, options: [] },
      { id: 'somon-kase', categoryId: 'pide-pizza', name: 'Somon Kase (Omega-3)', price: 450, description: 'Izgara Norveç somonu, siyah pirinç kinoa karışımı, avokado, edamame ve salatalık.', image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=400&q=80', popular: 1, options: [] },
      { id: 'tavuklu-fit-wrap', categoryId: 'baslangic-salata', name: 'Tavuklu Fit Wrap', price: 320, description: 'Izgara tavuk, hafif cheddar, light mayonez, lavaş ve fırınlanmış patates.', image: 'https://images.unsplash.com/photo-1626700051175-6518c4793f4f?auto=format&fit=crop&w=400&q=80', popular: 0, options: [] },
      { id: 'avokado-hellim-wrap', categoryId: 'baslangic-salata', name: 'Avokado Hellim Wrap', price: 310, description: 'Izgara hellim peyniri, avokado, fesleğenli pesto, lavaş ve fırınlanmış tatlı patates.', image: 'https://images.unsplash.com/photo-1626700051175-6518c4793f4f?auto=format&fit=crop&w=400&q=80', popular: 0, options: [] },
      { id: 'sekersiz-fit-kunefe', categoryId: 'tatlilar', name: 'Şekersiz Fit Künefe', price: 210, description: 'Tuzsuz peynirli çıtır kadayıf, stevia şurubu ve toz fıstık.', image: 'https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=400&q=80', popular: 1, options: [] },
      { id: 'fit-mango-chia', categoryId: 'tatlilar', name: 'Mango & Chia Puding', price: 180, description: 'Hindistan cevizi sütlü chia tohumu, mango püresi ve taze çilek dilimleri.', image: 'https://images.unsplash.com/photo-1541532713592-79a0317b6b77?auto=format&fit=crop&w=400&q=80', popular: 0, options: [] },
      { id: 'yesil-detoks', categoryId: 'icecekler', name: 'Yeşil Detoks Suyu', price: 120, description: 'Yeşil elma, kereviz sapı, salatalık, limon ve taze zencefil suyu.', image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=400&q=80', popular: 1, options: [] },
      { id: 'kirmizi-fit-smoothie', categoryId: 'icecekler', name: 'Kırmızı Fit Smoothie', price: 140, description: 'Orman meyveleri, muz, yulaf sütü ve chia tohumu.', image: 'https://images.unsplash.com/photo-1553530979-7ee52a2670c4?auto=format&fit=crop&w=400&q=80', popular: 0, options: [] },
      { id: 'ayran', categoryId: 'icecekler', name: 'Organik Yayık Ayranı', price: 50, description: 'Taze organik süzme yoğurttan bol köpüklü ayran.', image: 'https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=400&q=80', popular: 0, options: [] },
      { id: 'turk-kahvesi', categoryId: 'icecekler', name: 'Fit Türk Kahvesi', price: 75, description: 'Cezvede pişmiş şekersiz kahve, şekersiz bitter çikolata ikramı ile.', image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=400&q=80', popular: 0, options: [] },
      { id: 'cay', categoryId: 'icecekler', name: 'Organik Yeşil Çay', price: 40, description: 'Organik demleme yaprak yeşil çay.', image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=400&q=80', popular: 1, options: [] }
    ];
    for (const m of defaultMenuItems) {
      await run(`INSERT INTO menu_items VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [m.id, m.categoryId, m.name, m.price, m.description, m.image, m.popular, JSON.stringify(m.options)]);
    }
  }

  const stocksCount = await get(`SELECT COUNT(*) as count FROM stocks`);
  if (stocksCount.count === 0) {
    for (const s of INITIAL_STOCKS) {
      await run(`INSERT INTO stocks VALUES (?, ?, ?, ?, ?)`, [s.id, s.name, s.quantity, s.unit, s.minLimit]);
    }
  }

  const staffCount = await get(`SELECT COUNT(*) as count FROM staff`);
  if (staffCount.count === 0) {
    const defaultStaff = [
      { id: 'ahmet', name: 'Ahmet Yılmaz', role: 'Şef Garson', code: '1111', status: 'in', shiftStart: new Date().toISOString() },
      { id: 'merve', name: 'Merve Kaya', role: 'Garson', code: '2222', status: 'out', shiftStart: null },
      { id: 'can', name: 'Can Demir', role: 'Garson', code: '3333', status: 'out', shiftStart: null },
      { id: 'elif', name: 'Elif Şahin', role: 'Kasiyer', code: '4444', status: 'in', shiftStart: new Date().toISOString() }
    ];
    for (const st of defaultStaff) {
      await run(`INSERT INTO staff VALUES (?, ?, ?, ?, ?, ?)`, [st.id, st.name, st.role, st.code, st.status, st.shiftStart]);
    }
  }

  const salesHistoryCount = await get(`SELECT COUNT(*) as count FROM sales_history`);
  if (salesHistoryCount.count === 0) {
    await seedHistoryInSQLite();
  }
}

// 18 months sales history seeder for SQLite
async function seedHistoryInSQLite() {
  const startYear = 2025;
  const currentYear = 2026;
  const currentMonth = new Date().getMonth(); // 0-indexed (June = 5)
  const waiters = ['ahmet', 'merve', 'can', 'elif'];
  
  const menuItems = await all(`SELECT * FROM menu_items`);
  const tables = await all(`SELECT * FROM tables`);

  const generateRandomTx = (date) => {
    const waiter = waiters[Math.floor(Math.random() * waiters.length)];
    const table = tables[Math.floor(Math.random() * tables.length)];
    
    const itemsCount = 1 + Math.floor(Math.random() * 3);
    const items = [];
    let subtotal = 0;
    
    for (let i = 0; i < itemsCount; i++) {
      const randomItem = menuItems[Math.floor(Math.random() * menuItems.length)];
      if (!items.some(it => it.name === randomItem.name)) {
        const quantity = 1 + Math.floor(Math.random() * 2);
        items.push({
          id: randomItem.id,
          name: randomItem.name,
          price: randomItem.price,
          quantity: quantity,
          option: '',
          note: 'Geçmiş Kayıt'
        });
        subtotal += (randomItem.price * quantity);
      }
    }

    const discountPercent = Math.random() > 0.8 ? 10 : 0;
    const discount = subtotal * (discountPercent / 100);
    const subtotalWithDiscount = subtotal - discount;
    const tax = subtotalWithDiscount * 0.10;
    const total = subtotalWithDiscount + tax;

    return {
      id: 'TX-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      tableId: table.id,
      tableName: table.name,
      items: JSON.stringify(items),
      subtotal: subtotal,
      tax: tax,
      discount: discountPercent,
      total: total,
      paymentMethod: Math.random() > 0.4 ? 'CARD' : 'CASH',
      orderType: Math.random() > 0.3 ? 'dine-in' : (Math.random() > 0.5 ? 'takeaway' : 'delivery'),
      waiterId: waiter,
      timestamp: date.toISOString()
    };
  };

  // 2025 Seeding
  for (let month = 0; month < 12; month++) {
    const ordersInMonth = 25 + Math.floor(Math.random() * 20);
    for (let o = 0; o < ordersInMonth; o++) {
      const day = 1 + Math.floor(Math.random() * 28);
      const hour = 12 + Math.floor(Math.random() * 10);
      const min = Math.floor(Math.random() * 60);
      const date = new Date(startYear, month, day, hour, min);
      const tx = generateRandomTx(date);
      await run(`INSERT INTO sales_history VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        tx.id, tx.tableId, tx.tableName, tx.items, tx.subtotal, tx.tax, tx.discount, tx.total, tx.paymentMethod, tx.orderType, tx.waiterId, tx.timestamp
      ]);
    }
  }

  // 2026 Seeding (up to current month)
  for (let month = 0; month <= currentMonth; month++) {
    const isThisMonth = (month === currentMonth);
    const ordersInMonth = 35 + Math.floor(Math.random() * 25);
    const daysLimit = isThisMonth ? new Date().getDate() : 28;
    for (let o = 0; o < ordersInMonth; o++) {
      const day = 1 + Math.floor(Math.random() * daysLimit);
      const hour = 12 + Math.floor(Math.random() * 10);
      const min = Math.floor(Math.random() * 60);
      const date = new Date(currentYear, month, day, hour, min);
      const tx = generateRandomTx(date);
      await run(`INSERT INTO sales_history VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        tx.id, tx.tableId, tx.tableName, tx.items, tx.subtotal, tx.tax, tx.discount, tx.total, tx.paymentMethod, tx.orderType, tx.waiterId, tx.timestamp
      ]);
    }
  }
}

// Check stock levels and deduct items
async function checkAndDeductStock(menuItemId, quantity = 1) {
  const recipe = MENU_RECIPES[menuItemId];
  if (!recipe) return { success: true };

  // 1. Verify availability
  for (const ingredient of recipe) {
    const stock = await get(`SELECT quantity, name FROM stocks WHERE id = ?`, [ingredient.ingredientId]);
    if (!stock || stock.quantity < (ingredient.quantity * quantity)) {
      return { success: false, reason: `${stock ? stock.name : ingredient.ingredientId} yetersiz.` };
    }
  }

  // 2. Perform deductions
  const alerts = [];
  for (const ingredient of recipe) {
    await run(`UPDATE stocks SET quantity = quantity - ? WHERE id = ?`, [ingredient.quantity * quantity, ingredient.ingredientId]);
    const updatedStock = await get(`SELECT quantity, minLimit, name FROM stocks WHERE id = ?`, [ingredient.ingredientId]);
    if (updatedStock && updatedStock.quantity <= updatedStock.minLimit) {
      alerts.push(updatedStock.name);
    }
  }

  return { success: true, alerts };
}

// Restock / Refill everything
async function refillAllStocks() {
  for (const s of INITIAL_STOCKS) {
    await run(`UPDATE stocks SET quantity = ? WHERE id = ?`, [s.quantity, s.id]);
  }
}

// Return inventory stock status list
async function getStockStatus() {
  const menuItems = await all(`SELECT id FROM menu_items`);
  const statusMap = {};
  
  for (const item of menuItems) {
    const recipe = MENU_RECIPES[item.id];
    if (!recipe) {
      statusMap[item.id] = 'available';
      continue;
    }
    
    let itemStatus = 'available';
    for (const ingredient of recipe) {
      const stock = await get(`SELECT quantity, minLimit FROM stocks WHERE id = ?`, [ingredient.ingredientId]);
      if (!stock) continue;
      if (stock.quantity < ingredient.quantity) {
        itemStatus = 'out-of-stock';
        break;
      }
      if (stock.quantity - ingredient.quantity <= stock.minLimit) {
        itemStatus = 'low-stock';
      }
    }
    statusMap[item.id] = itemStatus;
  }
  return statusMap;
}

// Return unified AppState object
async function getAppState() {
  const tables = await all(`SELECT * FROM tables`);
  const menuItems = await all(`SELECT * FROM menu_items`);
  const stocks = await all(`SELECT * FROM stocks`);
  const staff = await all(`SELECT * FROM staff`);
  const kitchenRows = await all(`SELECT * FROM kitchen_orders`);
  const activeOrderRows = await all(`SELECT * FROM active_orders`);

  // Parse JSON fields
  const menu = menuItems.map(m => ({ ...m, popular: m.popular === 1, options: JSON.parse(m.options) }));
  
  const kitchenOrders = kitchenRows.map(k => ({ ...k, items: JSON.parse(k.items) }));
  
  const activeOrders = {};
  activeOrderRows.forEach(a => {
    activeOrders[a.tableId] = {
      items: JSON.parse(a.items),
      discount: a.discount,
      orderType: a.orderType,
      waiterId: a.waiterId
    };
  });

  const stockStatus = await getStockStatus();

  return {
    tables,
    menuItems: menu,
    stocks,
    staffMembers: staff,
    kitchenOrders,
    activeOrders,
    stockStatus
  };
}

module.exports = {
  run,
  get,
  all,
  initDatabase,
  checkAndDeductStock,
  refillAllStocks,
  getAppState,
  MENU_RECIPES
};
