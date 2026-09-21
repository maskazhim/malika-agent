-- Log email notifikasi pembayaran yang diproses worker
-- malika-payment-watcher (forward Gmail -> Email Routing -> Worker).
CREATE TABLE IF NOT EXISTS payment_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL DEFAULT '',
  from_addr TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  parsed_amounts TEXT NOT NULL DEFAULT '[]',
  matched_order TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT 'ignored',
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_payment_logs_received ON payment_logs(received_at);
CREATE INDEX IF NOT EXISTS idx_payment_logs_matched ON payment_logs(matched_order);
