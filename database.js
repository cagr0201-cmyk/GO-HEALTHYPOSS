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

const KEY_MAPPING = {
  categoryid: 'categoryId',
  minlimit: 'minLimit',
  tableid: 'tableId',
  ordertype: 'orderType',
  waiterid: 'waiterId',
  tablename: 'tableName',
  paymentmethod: 'paymentMethod',
  shiftstart: 'shiftStart'
};

function normalizeRow(row) {
  if (!row) return row;
  const normalized = {};
  for (const key of Object.keys(row)) {
    const targetKey = KEY_MAPPING[key] || key;
    normalized[targetKey] = row[key];
  }
  return normalized;
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
      else resolve(normalizeRow(res.rows[0]));
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
      else resolve(res.rows.map(normalizeRow));
    });
  } else {
    sqliteDb.all(finalSql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  }
});

// Recipe configurations (server-side inventory deduction)
const MENU_RECIPES = {};

const INITIAL_STOCKS = [
  { id: 'porsiyon', name: 'Genel Porsiyon (Stok)', quantity: 99999, unit: 'porsiyon', minLimit: 10 }
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
  if (Number(tablesCount.count) === 0) {
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
      await run(`INSERT INTO tables (id, name, category, x, y, shape, status) VALUES (?, ?, ?, ?, ?, ?, ?)`, [t.id, t.name, t.category, t.x, t.y, t.shape, t.status]);
    }
  }

  const menuCount = await get(`SELECT COUNT(*) as count FROM menu_items`);
  if (Number(menuCount.count) === 0) {
    const defaultMenuItems = [
  {
    "id": "BBNpPyjOSxXmTdjPYtSK",
    "categoryId": "G7Dybmqujf1ahEEDJask",
    "name": "Magic Omlet",
    "price": 330,
    "description": "3 yumurtalı omlet, 2 adet mini pankek, 1 adet köz biber, yarım ekşi mayalı ekmek krem peynir üzeri kızarmış çeri domates, süzme yoğurtlu granola karışımı, Zeytin, misket peynir, çilek reçeli.",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777916689418-magic%20omlet%20.jpeg?alt=media&token=ee599f42-be49-4be7-9a11-70cd7de702c5",
    "popular": 0,
    "options": []
  },
  {
    "id": "YIKTlEYjFA69uuwkWnx3",
    "categoryId": "G7Dybmqujf1ahEEDJask",
    "name": "Avokado Ekmek",
    "price": 294,
    "description": "Ekşi Mayalı Tam Buğday Ekmek Üzeri 2 adet Yumurta, Hindi füme, Yarım Avokado, Endivyen Marul, Çeri Domates.",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777916746895-avakado%20ekmek%20yeni.jpg?alt=media&token=2a8a324f-d2dc-4571-a754-c4da7784e0dc",
    "popular": 0,
    "options": []
  },
  {
    "id": "uZ4elHg2rCzIBIzwxlRL",
    "categoryId": "G7Dybmqujf1ahEEDJask",
    "name": "Go Healthy Kahvaltı",
    "price": 396,
    "description": "2 adet Yumurta, 2 adet Hellim Peyniri, Yarım Avokado, Frankfurter sosis, Ekşi mayalı tam buğday ekmek, Fıstık Ezmesi, Çilek Reçeli, Zeytin.",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777916803218-go%20healthy%20kase%20yeni.jpg?alt=media&token=2b144ed2-9b89-47b0-bebd-ed9e930462cf",
    "popular": 0,
    "options": []
  },
  {
    "id": "yTrDQzr0opQtpzcNBWgq",
    "categoryId": "G7Dybmqujf1ahEEDJask",
    "name": "Yumurtalı Wrap",
    "price": 295,
    "description": "Krem Peynirli Tam Buğday Lavaş İçi 2 Adet Yumurta, Köz Kapya Biber, Endivyen Marul, Çeri Domates, yarım avakado.",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777916845544-yumurtal%C4%B1%20wrap%20yeni.jpeg?alt=media&token=9393e926-64c8-42ca-bded-112d6e7fef88",
    "popular": 0,
    "options": []
  },
  {
    "id": "1iqk0bP2N2ofFZ4iYTJu",
    "categoryId": "IDG2uULBtLhcIicltKSI",
    "name": "Sosisli Bruschetta",
    "price": 290,
    "description": "Ekşi Mayalı Tam Buğday Ekmek Üzeri 3 adet Yumurta, Frankfurter sosis.\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777917027605-SOS%C4%B0SL%C4%B0%20BRUSEHATTA.jpg?alt=media&token=d8506884-db5a-460c-818e-e0a513077cc9",
    "popular": 0,
    "options": []
  },
  {
    "id": "7Aew6l2gSrUv0iMPN7Wl",
    "categoryId": "IDG2uULBtLhcIicltKSI",
    "name": "Tatlı Bruschetta",
    "price": 269,
    "description": "Ekşi Mayalı Tam Buğday Ekmek Üzeri Şekersiz Fıstık ezmesi, yaban mersini, muz .\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777917367876-SWEET%20BRUSEHATTA.jpg?alt=media&token=50f9e50f-939d-422e-8c4d-7f06dc628cd5",
    "popular": 0,
    "options": []
  },
  {
    "id": "CUrDkzCruQbQLpreHgcc",
    "categoryId": "IDG2uULBtLhcIicltKSI",
    "name": "Mantarlı Bruschetta",
    "price": 269,
    "description": "Ekşi Mayalı Tam Buğday Ekmek Üzeri 2 adet Yumurta, sotelenmiş mantar ve soğan, krem peynir.\n",
    "image": "https://images.unsplash.com/photo-1541532713592-79a0317b6b77?auto=format&fit=crop&w=400&q=80",
    "popular": 0,
    "options": []
  },
  {
    "id": "Oca0s07CwJRPhc6SNfpw",
    "categoryId": "HzfdmS0BdMoEGtRX6IDg",
    "name": "Tavuklu Salata",
    "price": 295,
    "description": "Tavuk Izgara ( 150 - 170 )gr, Yeşil ve Renkli Kıvırcık Marul, Salatalık, Çeri Domates, Mor Soğan, Haşlanmış Nohut.\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777916887700-salatayeni.jpeg?alt=media&token=fb608b0e-99a6-4ba4-8af1-f9c9c4e1cd44",
    "popular": 0,
    "options": []
  },
  {
    "id": "WWynmvX9srN7d4WCrlmv",
    "categoryId": "HzfdmS0BdMoEGtRX6IDg",
    "name": "Ton balıklı Salata",
    "price": 295,
    "description": "Ton Balığı, Yeşil ve Renkli Kıvırcık Marul, Salatalık, Çeri Domates, Mor Soğan.\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777916918682-tuna%20salada%20.jpeg?alt=media&token=437b4f60-eaeb-4a29-95a0-7ef447fa9cae",
    "popular": 0,
    "options": []
  },
  {
    "id": "73DVxWyZWnlTp3ML8kTs",
    "categoryId": "L3SlF5TXqvlpC0tD2oVI",
    "name": "Domates Soslu Makarna",
    "price": 295,
    "description": "Tavuk Izgara ( 150-170 )gr, Kepekli Tam Buğday Makarna, domates sos,çeri domates ve fesleğen.\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777917864194-domatesyeni.jpeg?alt=media&token=ac48946a-8502-4790-95b2-899a9bc5ff73",
    "popular": 0,
    "options": []
  },
  {
    "id": "8QiO0bMpllj5IGfpVuwT",
    "categoryId": "L3SlF5TXqvlpC0tD2oVI",
    "name": "Pesto Makarna",
    "price": 295,
    "description": "Tavuk Izgara ( 150-170 )gr, Kepekli Tam Buğday Makarna, Mantar, Diyet Krema. Kalori: Karbonhidrat:  Protein: \n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777917916849-yeni%20makarna.png?alt=media&token=87cd7ca3-293f-4f33-b374-3d3d99d48410",
    "popular": 0,
    "options": []
  },
  {
    "id": "0RseBd5vNhLSDv7vTuOI",
    "categoryId": "J9V643KQdRIYsJiOHmLX",
    "name": "Tavuk Kase",
    "price": 365,
    "description": "Tavuk Izgara ( 150-170)gr, Basmati Pirinç, 1 adet havuç, sotelenmiş mantar, Mor lahana, Brokoli. Kalori: Karbonhidrat: Protein:\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777917519664-TAVUK%20KAE%20YEN%C4%B0%20.jpeg?alt=media&token=cb62b6c5-b3ba-4ee5-a01b-9fda725275a6",
    "popular": 0,
    "options": []
  },
  {
    "id": "5pO3wYsLUAPOvSOfL0gy",
    "categoryId": "J9V643KQdRIYsJiOHmLX",
    "name": "Köfte kase",
    "price": 465,
    "description": "4 Adet köfte ( 140-150)gr, Meksika Fasulyeli Bulgur Pilavı, Brokoli, Közlenmiş Patlıcan Salatası, Coleslaw, Mor Lahana, Humus. Kalori: Karbonhidrat: Protein:\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777917559911-k%C3%B6fte%20yendi.jpg?alt=media&token=050390fa-7ef5-4817-be16-8ef71fcb677b",
    "popular": 0,
    "options": []
  },
  {
    "id": "FL0yb68vavBs8mfwXb4V",
    "categoryId": "J9V643KQdRIYsJiOHmLX",
    "name": "Kinoalı Kısır Kase",
    "price": 345,
    "description": "Bulgur, Tavuk Izgara ( 150-170)gr, Kinoa, Domates, Salatalık, Kornişon, Marul.\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777917609912-k%C4%B1s%C4%B1r%20yeni.jpeg?alt=media&token=1f85bcc9-f310-4c37-9a56-cf1cb8695e96",
    "popular": 0,
    "options": []
  },
  {
    "id": "VfIhAKQkZELrvraGlNNu",
    "categoryId": "J9V643KQdRIYsJiOHmLX",
    "name": "Magic Kase",
    "price": 379,
    "description": "Nohutlu Kuş Üzümlü Basmati Pirinç, Yarım Izgara Avokado, Izgara Kabak, Edamame, Brokoli, Kırmızı Pancar, Havuç, Yeşil Elma. Kalori: Karbonhidrat: Protein:\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777917767324-MAG%C4%B0C%2C%2C.png?alt=media&token=fdcdf3cc-a248-4c24-b22a-743d809251c0",
    "popular": 0,
    "options": []
  },
  {
    "id": "93qTUyQ2Z5J17k2bTvWI",
    "categoryId": "kDkKyJRAjMcPSr69pEDk",
    "name": "Tavuk Wrap",
    "price": 348,
    "description": "Tam Buğday Lavaş İçerisi Tavuk ( 120 - 150)gr, Turşu salatası, Iceberg, Chedar Peyniri, Patates Cips. Kalori: Karbonhidrat:  Protein: \n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777917961074-tavuk%20wrap%20yeni%20.jpeg?alt=media&token=afc6378a-26ad-4356-bffa-18d8b275905a",
    "popular": 0,
    "options": []
  },
  {
    "id": "UWcoYF9bdAm8O8uq9hh5",
    "categoryId": "kDkKyJRAjMcPSr69pEDk",
    "name": "Et Burger",
    "price": 405,
    "description": "Dana Burger Köfte ( 120)gr, Özel Kepekli Tam Buğday Burger Ekmeği, Marul, Köz patlıcan sos, Cheddar Peyniri, Patates Cips, Kornişon. Kalori: Karbonhidrat:  Protein: \n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777917994916-burgeryeni.jpeg?alt=media&token=4eadc958-556e-4cf2-8345-03c7e30a06c4",
    "popular": 0,
    "options": []
  },
  {
    "id": "llqDo1yr6wNk2tXTejXO",
    "categoryId": "kDkKyJRAjMcPSr69pEDk",
    "name": "Pankek",
    "price": 285,
    "description": "Pankek, Çilek, Muz, Bal, Fıstık Ezmesi. Kalori: Karbonhidrat:  Protein: \n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777918030588-pankekyeni.jpeg?alt=media&token=6eb8b11d-3a1a-44ff-8dbb-35b28fb143b1",
    "popular": 0,
    "options": []
  },
  {
    "id": "nZReK8PvQgzFTPKIDCCO",
    "categoryId": "kDkKyJRAjMcPSr69pEDk",
    "name": "Porridge",
    "price": 198,
    "description": "Yulaf Ezmesi ( 60 - 80 )gr, Süt, Muz, Çilek, Kinoa. Kalori: Karbonhidrat:  Protein: \n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777918060294-porridge%20yeni%20.jpeg?alt=media&token=e1cbb4ae-9c49-488e-9a24-a3b6508f6846",
    "popular": 0,
    "options": []
  },
  {
    "id": "uGb18tx00PIGkVMt6eZo",
    "categoryId": "qKvNEcG5aQN2nx9ygarX",
    "name": "Aperatif-1",
    "price": 205,
    "description": "Süzme Yoğurt, roka, semiz otu, Üstüne Sotelenmiş baharatlı nohut. \n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777996894541-SSSSU.png?alt=media&token=6d77b18b-624b-4ca0-bc5d-6cfd997eaa0a",
    "popular": 0,
    "options": []
  },
  {
    "id": "DEIVaMUvrEAFYz5ta0El",
    "categoryId": "yKsnp6EFSg45UWDaz9LK",
    "name": "COLA ZERO",
    "price": 75,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": 0,
    "options": []
  },
  {
    "id": "IilLw0CZ9s7TdnHJbx1h",
    "categoryId": "yKsnp6EFSg45UWDaz9LK",
    "name": "AYRAN",
    "price": 30,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": 0,
    "options": []
  },
  {
    "id": "LLYYKBP5PVYAY6uYOVbk",
    "categoryId": "yKsnp6EFSg45UWDaz9LK",
    "name": "SU",
    "price": 25,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": 0,
    "options": []
  },
  {
    "id": "avD2rzdrtg5PzujM5hel",
    "categoryId": "yKsnp6EFSg45UWDaz9LK",
    "name": "SODA",
    "price": 45,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": 0,
    "options": []
  },
  {
    "id": "klLjZaoLZ5qrUtWyaLgi",
    "categoryId": "yKsnp6EFSg45UWDaz9LK",
    "name": "Churchill",
    "price": 75,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": 0,
    "options": []
  },
  {
    "id": "7JDC4wUgKmKZB1fSPXxT",
    "categoryId": "qrQmFX0ue7YpR9206WDV",
    "name": "Kırmızı Meyve Suyu",
    "price": 160,
    "description": "Pancar, Kırmızı Elma, zencefil, Limon.\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777996267607-pancardetokss.jpeg?alt=media&token=b13233be-a69c-4d93-8841-baa9c566fddb",
    "popular": 0,
    "options": []
  },
  {
    "id": "CoNEsnAcRQWyOnonYhrI",
    "categoryId": "qrQmFX0ue7YpR9206WDV",
    "name": "Turuncu Meyve Suyu",
    "price": 160,
    "description": "portakal, limon, havuç,zencefil,zerdaçal.\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777996295519-turuncudetoks.jpeg?alt=media&token=b8cc2df3-20f7-40c4-bbbe-22e949db3093",
    "popular": 0,
    "options": []
  },
  {
    "id": "UNzWyhfZh6f84LH6Sts4",
    "categoryId": "qrQmFX0ue7YpR9206WDV",
    "name": "Yeşil Meyve Suyu",
    "price": 160,
    "description": "Yeşil elma, salatalık, roka,maydanoz, limon.\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777996365989-ye%C5%9Fildetokss.jpeg?alt=media&token=fdd41a8e-7b78-44ef-9b08-1942aaa74f6d",
    "popular": 0,
    "options": []
  },
  {
    "id": "cjNOQtqVZhxdRBxhnAPM",
    "categoryId": "qrQmFX0ue7YpR9206WDV",
    "name": "portakal shot",
    "price": 160,
    "description": "portakal,limon,karabiber,bal,zencefil.\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777996399657-portaklashot.jpeg?alt=media&token=3089e4c6-ce2e-41da-a742-fc3cad20a713",
    "popular": 0,
    "options": []
  },
  {
    "id": "oyyU9Gt66mlTCXJ3N1UF",
    "categoryId": "qrQmFX0ue7YpR9206WDV",
    "name": "pancar shot",
    "price": 80,
    "description": "pancar,zencefil,limon,bal,zerdeçal.\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777996435869-shotk%C4%B1rm%C4%B1z%C4%B1.jpeg?alt=media&token=fb843cd4-3b72-41c0-8287-2956aceef6cd",
    "popular": 0,
    "options": []
  },
  {
    "id": "xdkkcTfJ2zIthzsWpvR5",
    "categoryId": "qrQmFX0ue7YpR9206WDV",
    "name": "zencefil shot",
    "price": 80,
    "description": "limon,zencefil,bal.\n",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777996492537-gingershot.jpeg?alt=media&token=3a4f02cd-d61f-43c1-b612-ec058451821a",
    "popular": 0,
    "options": []
  },
  {
    "id": "HUB2sOB9POktBQqASRmf",
    "categoryId": "tETcPjbPcvEkInJMU7yL",
    "name": "PANCAR SUYU",
    "price": 80,
    "description": "",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777996547974-pancardetokss.jpeg?alt=media&token=774f6fe6-af4b-479e-a2f3-d20ab92d960c",
    "popular": 0,
    "options": []
  },
  {
    "id": "JmvTDD6UCQ47AZM05Vfl",
    "categoryId": "tETcPjbPcvEkInJMU7yL",
    "name": "ELMA SUYU",
    "price": 80,
    "description": "",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777996557054-elma%20suyu.jpeg?alt=media&token=0fe031b4-ce5a-4ece-8f8f-d47695e0240e",
    "popular": 0,
    "options": []
  },
  {
    "id": "Wypr7nZ7feW4ePn1l2MY",
    "categoryId": "tETcPjbPcvEkInJMU7yL",
    "name": "PORTAKAL SUYU",
    "price": 80,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": 0,
    "options": []
  },
  {
    "id": "fOXzr4gXO93EvRysD4Jg",
    "categoryId": "tETcPjbPcvEkInJMU7yL",
    "name": "HAVUÇ SUYU",
    "price": 80,
    "description": "",
    "image": "https://firebasestorage.googleapis.com/v0/b/suitable-live.appspot.com/o/resized%2F1777996578190-turuncudetoks.jpeg?alt=media&token=c52b3f4d-171b-442f-9d22-03d3e819808b",
    "popular": 0,
    "options": []
  },
  {
    "id": "0XeYIO66BGGDVZbzvkIu",
    "categoryId": "HKdwjIy3KG9sKvHfLmzL",
    "name": "Espresso",
    "price": 75,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": 0,
    "options": []
  },
  {
    "id": "21HBHl9GfhP6Kjkz1ENh",
    "categoryId": "HKdwjIy3KG9sKvHfLmzL",
    "name": "Türk Kahvesi",
    "price": 70,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": 0,
    "options": []
  },
  {
    "id": "LGGBaxjAErAGKiXkXu7r",
    "categoryId": "HKdwjIy3KG9sKvHfLmzL",
    "name": "Filtre Kahve",
    "price": 70,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": 0,
    "options": []
  },
  {
    "id": "Q139eNrn60rqG0zCv32R",
    "categoryId": "HKdwjIy3KG9sKvHfLmzL",
    "name": "Cappuccino",
    "price": 110,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": 0,
    "options": []
  },
  {
    "id": "SH0NASoYXLRWeXjM7gXC",
    "categoryId": "HKdwjIy3KG9sKvHfLmzL",
    "name": "Americano",
    "price": 90,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": 0,
    "options": []
  },
  {
    "id": "hfjuAGmbzthlHdpG37FJ",
    "categoryId": "HKdwjIy3KG9sKvHfLmzL",
    "name": "Espresso Double",
    "price": 90,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": 0,
    "options": []
  },
  {
    "id": "ssUvaX4u94rtFj3TYwYr",
    "categoryId": "HKdwjIy3KG9sKvHfLmzL",
    "name": "Çay",
    "price": 20,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": 0,
    "options": []
  },
  {
    "id": "wNivd9unUA81rQmKZNhT",
    "categoryId": "HKdwjIy3KG9sKvHfLmzL",
    "name": "Cafe Latte",
    "price": 110,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": 0,
    "options": []
  },
  {
    "id": "9TyvOH8vZydDrQ5TaKyi",
    "categoryId": "lKEsPjjMDIjucLMx3QQb",
    "name": "Ice Americano",
    "price": 75,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": 0,
    "options": []
  },
  {
    "id": "Xriy9d1UrFlNXoT4QvCc",
    "categoryId": "lKEsPjjMDIjucLMx3QQb",
    "name": "Ice Latte",
    "price": 90,
    "description": "",
    "image": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80",
    "popular": 0,
    "options": []
  }
];
    for (const m of defaultMenuItems) {
      await run(`INSERT INTO menu_items (id, categoryId, name, price, description, image, popular, options) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [m.id, m.categoryId, m.name, m.price, m.description, m.image, m.popular, JSON.stringify(m.options)]);
    }
  }

  const stocksCount = await get(`SELECT COUNT(*) as count FROM stocks`);
  if (Number(stocksCount.count) === 0) {
    for (const s of INITIAL_STOCKS) {
      await run(`INSERT INTO stocks (id, name, quantity, unit, minLimit) VALUES (?, ?, ?, ?, ?)`, [s.id, s.name, s.quantity, s.unit, s.minLimit]);
    }
  }

  const staffCount = await get(`SELECT COUNT(*) as count FROM staff`);
  if (Number(staffCount.count) === 0) {
    const defaultStaff = [
      { id: 'ahmet', name: 'Ahmet Yılmaz', role: 'Şef Garson', code: '1111', status: 'in', shiftStart: new Date().toISOString() },
      { id: 'merve', name: 'Merve Kaya', role: 'Garson', code: '2222', status: 'out', shiftStart: null },
      { id: 'can', name: 'Can Demir', role: 'Garson', code: '3333', status: 'out', shiftStart: null },
      { id: 'elif', name: 'Elif Şahin', role: 'Kasiyer', code: '4444', status: 'in', shiftStart: new Date().toISOString() },
      { id: 'patron', name: 'Patron (Yönetici)', role: 'Patron', code: '9999', status: 'in', shiftStart: new Date().toISOString() }
    ];
    for (const st of defaultStaff) {
      await run(`INSERT INTO staff (id, name, role, code, status, shiftStart) VALUES (?, ?, ?, ?, ?, ?)`, [st.id, st.name, st.role, st.code, st.status, st.shiftStart]);
    }
  }

  const salesHistoryCount = await get(`SELECT COUNT(*) as count FROM sales_history`);
  if (Number(salesHistoryCount.count) === 0) {
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
      await run(`INSERT INTO sales_history (id, tableId, tableName, items, subtotal, tax, discount, total, paymentMethod, orderType, waiterId, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
      await run(`INSERT INTO sales_history (id, tableId, tableName, items, subtotal, tax, discount, total, paymentMethod, orderType, waiterId, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
