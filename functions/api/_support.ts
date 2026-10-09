/* Helper booking support (diimpor API Pages). File underscore = bukan route.
   Waktu wall-clock WIB sebagai string "YYYY-MM-DDTHH:MM" (banding leksikal
   aman karena format ISO). "Sekarang" diambil dalam WIB via Intl.
*/

interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface D1Database {
  prepare(query: string): D1Prepared;
}

export interface SupportSettings {
  slot_minutes: number;
  work_start: string;
  work_end: string;
  work_days: string;
}

export const PIC_TYPES = ["ai_engineer", "account_executive"] as const;
export type PicType = (typeof PIC_TYPES)[number];

/* pic_type -> kolom client_assignments (account_executive = PIC retensi). */
export function picColumn(t: string): string {
  return t === "account_executive" ? "retensi" : "ai_engineer";
}

export function isPicType(t: unknown): t is PicType {
  return t === "ai_engineer" || t === "account_executive";
}

export async function ensureSupportTables(db: D1Database): Promise<void> {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS support_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1), slot_minutes INTEGER NOT NULL DEFAULT 30,
      work_start TEXT NOT NULL DEFAULT '09:00', work_end TEXT NOT NULL DEFAULT '17:00',
      work_days TEXT NOT NULL DEFAULT '1,2,3,4,5',
      updated_at TEXT NOT NULL DEFAULT '', updated_by TEXT NOT NULL DEFAULT '')`
  ).run().catch(() => {});
  await db.prepare(
    `INSERT INTO support_settings (id, slot_minutes, work_start, work_end, work_days, updated_at, updated_by)
     VALUES (1, 30, '09:00', '17:00', '1,2,3,4,5', '', '')
     ON CONFLICT(id) DO NOTHING`
  ).run().catch(() => {});
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS support_availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT, staff_username TEXT NOT NULL DEFAULT '',
      weekday INTEGER NOT NULL DEFAULT 1, start_time TEXT NOT NULL DEFAULT '09:00',
      end_time TEXT NOT NULL DEFAULT '17:00', active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT '', updated_by TEXT NOT NULL DEFAULT '')`
  ).run().catch(() => {});
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS support_bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, customer_email TEXT NOT NULL DEFAULT '',
      order_id TEXT NOT NULL DEFAULT '', staff_username TEXT NOT NULL DEFAULT '',
      pic_type TEXT NOT NULL DEFAULT 'ai_engineer', scheduled_at TEXT NOT NULL DEFAULT '',
      duration_min INTEGER NOT NULL DEFAULT 30, description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '', handled_by TEXT NOT NULL DEFAULT '')`
  ).run().catch(() => {});
  // Self-heal kolom 0024 untuk DB lama (gagal = sudah ada, abaikan).
  for (const col of ["gcal_event_id", "gmeet_url", "hoptodesk_id", "hoptodesk_pass"]) {
    await db.prepare(`ALTER TABLE support_bookings ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`).run().catch(() => {});
  }
}

export async function getSettings(db: D1Database): Promise<SupportSettings> {
  const row = await db.prepare("SELECT slot_minutes, work_start, work_end, work_days FROM support_settings WHERE id = 1")
    .first<{ slot_minutes: number; work_start: string; work_end: string; work_days: string }>()
    .catch(() => null);
  return {
    slot_minutes: Math.max(10, Math.min(240, Math.round(Number(row?.slot_minutes ?? 30)) || 30)),
    work_start: validHHMM(row?.work_start) ? String(row?.work_start) : "09:00",
    work_end: validHHMM(row?.work_end) ? String(row?.work_end) : "17:00",
    work_days: String(row?.work_days ?? "1,2,3,4,5"),
  };
}

export function validHHMM(t: unknown): boolean {
  if (typeof t !== "string" || !/^\d{2}:\d{2}$/.test(t)) return false;
  const [h, m] = t.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

export function hhmmToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minToHHMM(n: number): string {
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseWorkDays(s: string): Set<number> {
  const out = new Set<number>();
  for (const p of String(s ?? "").split(",")) {
    const n = Number(p.trim());
    if (Number.isInteger(n) && n >= 0 && n <= 6) out.add(n);
  }
  return out;
}

/* Sekarang dalam WIB sebagai "YYYY-MM-DDTHH:MM" (banding string aman). */
export function wibNow(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/* Weekday JS (0=Min..6=Sab) dari "YYYY-MM-DD" tanpa jebakan zona (UTC noon). */
export function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

export function validDay(day: unknown): boolean {
  return typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(new Date(`${day}T12:00:00Z`).getTime());
}

export interface DayWindow { start: string; end: string }

/* Jendela efektif staff pada tanggal tsb: override aktif bila ada,
   else default settings bila weekday termasuk hari kerja. */
export async function effectiveWindows(
  db: D1Database, staff: string, day: string, st: SupportSettings
): Promise<DayWindow[]> {
  const wd = weekdayOf(day);
  const rows = await db.prepare(
    "SELECT start_time, end_time FROM support_availability WHERE staff_username = ? AND weekday = ? AND active = 1 ORDER BY start_time ASC LIMIT 20"
  ).bind(staff, wd).all<{ start_time: string; end_time: string }>().catch(() => ({ results: [] as never[] }));
  const list = (rows.results ?? []).filter((r) => validHHMM(r.start_time) && validHHMM(r.end_time) && r.start_time < r.end_time);
  if (list.length > 0) return list.map((r) => ({ start: r.start_time, end: r.end_time }));
  if (!parseWorkDays(st.work_days).has(wd)) return [];
  if (!(validHHMM(st.work_start) && validHHMM(st.work_end) && st.work_start < st.work_end)) return [];
  return [{ start: st.work_start, end: st.work_end }];
}

/* Booking aktif (penghuni slot) staff pada tanggal: [mulai, selesai] menit. */
export async function busyRanges(db: D1Database, staff: string, day: string): Promise<{ s: number; e: number }[]> {
  const rows = await db.prepare(
    `SELECT scheduled_at, duration_min FROM support_bookings
     WHERE staff_username = ? AND substr(scheduled_at, 1, 10) = ? AND status IN ('pending','confirmed')`
  ).bind(staff, day).all<{ scheduled_at: string; duration_min: number }>().catch(() => ({ results: [] as never[] }));
  const out: { s: number; e: number }[] = [];
  for (const r of rows.results ?? []) {
    const t = String(r.scheduled_at ?? "").slice(11, 16);
    if (!validHHMM(t)) continue;
    const s = hhmmToMin(t);
    const dur = Math.max(10, Math.min(240, Math.round(Number(r.duration_min ?? 30)) || 30));
    out.push({ s, e: s + dur });
  }
  return out;
}

/* Slot tersedia untuk staff pada tanggal (durasi menit). */
export async function daySlots(
  db: D1Database, staff: string, day: string, durMin: number, nowWib: string
): Promise<{ start: string; end: string }[]> {
  const st = await getSettings(db);
  const dur = Math.max(10, Math.min(240, Math.round(durMin) || st.slot_minutes));
  const wins = await effectiveWindows(db, staff, day, st);
  if (wins.length === 0) return [];
  const busy = await busyRanges(db, staff, day);
  const out: { start: string; end: string }[] = [];
  for (const w of wins) {
    let t = hhmmToMin(w.start);
    const end = hhmmToMin(w.end);
    while (t + dur <= end) {
      const slot = { start: `${day}T${minToHHMM(t)}`, end: `${day}T${minToHHMM(t + dur)}` };
      const overlaps = busy.some((b) => t < b.e && b.s < t + dur);
      if (!overlaps && slot.start > nowWib) out.push(slot);
      t += dur;
    }
  }
  return out;
}
