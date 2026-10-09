-- Meet + HopToDesk di booking support.
-- gcal_event_id/gmeet_url diisi saat PIC konfirmasi; hoptodesk_* opsional dari customer.
ALTER TABLE support_bookings ADD COLUMN gcal_event_id TEXT NOT NULL DEFAULT '';
ALTER TABLE support_bookings ADD COLUMN gmeet_url TEXT NOT NULL DEFAULT '';
ALTER TABLE support_bookings ADD COLUMN hoptodesk_id TEXT NOT NULL DEFAULT '';
ALTER TABLE support_bookings ADD COLUMN hoptodesk_pass TEXT NOT NULL DEFAULT '';
