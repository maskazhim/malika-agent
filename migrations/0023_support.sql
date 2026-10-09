-- Booking jadwal support per PIC klien (AI Engineer / Account Executive).
-- Waktu wall-clock WIB "HH:MM" / "YYYY-MM-DDTHH:MM" (tanpa konversi zona).
CREATE TABLE IF NOT EXISTS support_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  slot_minutes INTEGER NOT NULL DEFAULT 30,
  work_start TEXT NOT NULL DEFAULT '09:00',
  work_end TEXT NOT NULL DEFAULT '17:00',
  work_days TEXT NOT NULL DEFAULT '1,2,3,4,5',
  updated_at TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT ''
);
INSERT INTO support_settings (id, slot_minutes, work_start, work_end, work_days, updated_at, updated_by)
VALUES (1, 30, '09:00', '17:00', '1,2,3,4,5', '', '')
ON CONFLICT(id) DO NOTHING;

-- Override availability mingguan per staff (username). Kosong = ikut default settings.
-- weekday: 0=Min .. 6=Sab. Bisa beberapa baris per hari (beberapa jendela).
CREATE TABLE IF NOT EXISTS support_availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_username TEXT NOT NULL DEFAULT '',
  weekday INTEGER NOT NULL DEFAULT 1,
  start_time TEXT NOT NULL DEFAULT '09:00',
  end_time TEXT NOT NULL DEFAULT '17:00',
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_avail_staff ON support_availability(staff_username, weekday);

-- Booking dari customer. pic_type: 'ai_engineer' | 'account_executive' (PIC retensi).
-- status: pending | confirmed | done | cancelled.
CREATE TABLE IF NOT EXISTS support_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_email TEXT NOT NULL DEFAULT '',
  order_id TEXT NOT NULL DEFAULT '',
  staff_username TEXT NOT NULL DEFAULT '',
  pic_type TEXT NOT NULL DEFAULT 'ai_engineer',
  scheduled_at TEXT NOT NULL DEFAULT '',
  duration_min INTEGER NOT NULL DEFAULT 30,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  handled_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_booking_staff ON support_bookings(staff_username, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_booking_email ON support_bookings(customer_email);
