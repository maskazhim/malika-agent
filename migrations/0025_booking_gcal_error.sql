-- Error terakhir pembuatan event kalender (agar bisa didiagnosis dari dashboard/DB).
ALTER TABLE support_bookings ADD COLUMN gcal_error TEXT NOT NULL DEFAULT '';
