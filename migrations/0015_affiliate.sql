-- Sistem affiliate: admin menentukan jatah (budget %) per tier jumlah referral,
-- referrer membagi jatahnya menjadi diskon untuk teman + komisi untuk dirinya.
-- budget: total jatah % dari tier (mis. 20). discount + commission harus == budget.
CREATE TABLE IF NOT EXISTS affiliate_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  min_referrals INTEGER NOT NULL DEFAULT 0,
  budget_percent INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT ''
);

-- Kode affiliate milik customer (satu customer satu kode).
CREATE TABLE IF NOT EXISTS affiliate_codes (
  code TEXT PRIMARY KEY,
  customer_id INTEGER NOT NULL DEFAULT 0,
  email TEXT NOT NULL DEFAULT '',
  discount_percent INTEGER NOT NULL DEFAULT 0,
  commission_percent INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_affiliate_codes_customer ON affiliate_codes(customer_id);

-- Setiap order terverifikasi yang memakai kode affiliate.
CREATE TABLE IF NOT EXISTS affiliate_referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL DEFAULT '',
  order_id TEXT NOT NULL DEFAULT '',
  discount_amount INTEGER NOT NULL DEFAULT 0,
  commission_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'payable',
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_code ON affiliate_referrals(code);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_order ON affiliate_referrals(order_id);
