CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT UNIQUE NOT NULL,
  product TEXT NOT NULL DEFAULT '-',
  amount INTEGER NOT NULL DEFAULT 0,
  nama TEXT NOT NULL DEFAULT '-',
  bisnis TEXT NOT NULL DEFAULT '-',
  telepon TEXT NOT NULL DEFAULT '-',
  email TEXT NOT NULL DEFAULT '-',
  method TEXT NOT NULL DEFAULT '',
  bukti_filename TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'checkout',
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
