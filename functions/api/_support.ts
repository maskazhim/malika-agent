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
  break_start: string;
  break_end: string;
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

/* Kurangi jendela dengan jam istirahat (split bila break di tengah). */
export function subtractBreak(wins: DayWindow[], bStart: string, bEnd: string): DayWindow[] {
  const bs = hhmmToMin(bStart);
  const be = hhmmToMin(bEnd);
  const out: DayWindow[] = [];
  for (const w of wins) {
    const s = hhmmToMin(w.start);
    const e = hhmmToMin(w.end);
    if (be <= s || bs >= e) {
      out.push(w);
      continue;
    }
    if (bs > s) out.push({ start: w.start, end: minToHHMM(bs) });
    if (be < e) out.push({ start: minToHHMM(be), end: w.end });
  }
  return out;
}

/* Cuti: tanggal tsb tidak ada slot sama sekali untuk staff. */
export async function isTimeoff(db: D1Database, staff: string, day: string): Promise<boolean> {
  const r = await db.prepare("SELECT id FROM support_timeoff WHERE staff_username = ? AND date = ? LIMIT 1")
    .bind(staff, day).first().catch(() => null);
  return !!r;
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
  // Self-heal kolom break (0026) untuk settings lama.
  await db.prepare("ALTER TABLE support_settings ADD COLUMN break_start TEXT NOT NULL DEFAULT '12:00'").run().catch(() => {});
  await db.prepare("ALTER TABLE support_settings ADD COLUMN break_end TEXT NOT NULL DEFAULT '13:00'").run().catch(() => {});
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS support_timeoff (
      id INTEGER PRIMARY KEY AUTOINCREMENT, staff_username TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL DEFAULT '')`
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
  // Self-heal kolom 0024-0025 untuk DB lama (gagal = sudah ada, abaikan).
  for (const col of ["gcal_event_id", "gmeet_url", "hoptodesk_id", "hoptodesk_pass", "gcal_error"]) {
    await db.prepare(`ALTER TABLE support_bookings ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`).run().catch(() => {});
  }
}

export async function getSettings(db: D1Database): Promise<SupportSettings> {
  // SELECT * agar tahan kolom break belum ada di DB lama (field = undefined).
  const row = await db.prepare("SELECT * FROM support_settings WHERE id = 1")
    .first<Record<string, unknown>>()
    .catch(() => null);
  const brS = String(row?.break_start ?? "");
  const brE = String(row?.break_end ?? "");
  const useBreak = validHHMM(brS) && validHHMM(brE) && brS < brE;
  return {
    slot_minutes: Math.max(10, Math.min(240, Math.round(Number(row?.slot_minutes ?? 30)) || 30)),
    work_start: validHHMM(row?.work_start) ? String(row?.work_start) : "09:00",
    work_end: validHHMM(row?.work_end) ? String(row?.work_end) : "17:00",
    work_days: String(row?.work_days ?? "1,2,3,4,5"),
    break_start: useBreak ? brS : "",
    break_end: useBreak ? brE : "",
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

interface OverrideRow { weekday: number; start_time: string; end_time: string }

/* Semua override aktif staff dalam 1 query (untuk komputasi batch). */
export async function getOverrides(db: D1Database, staff: string): Promise<OverrideRow[]> {
  const rows = await db.prepare(
    "SELECT weekday, start_time, end_time FROM support_availability WHERE staff_username = ? AND active = 1 ORDER BY weekday ASC, start_time ASC LIMIT 200"
  ).bind(staff).all<{ weekday: number; start_time: string; end_time: string }>().catch(() => ({ results: [] as never[] }));
  return (rows.results ?? []).filter((r) =>
    Number.isInteger(r.weekday) && r.weekday >= 0 && r.weekday <= 6 &&
    validHHMM(r.start_time) && validHHMM(r.end_time) && r.start_time < r.end_time
  );
}

/* Jendela efektif murni dari data (tanpa query) — dipakai komputasi batch. */
export function windowsForDay(overrides: OverrideRow[], wd: number, st: SupportSettings): DayWindow[] {
  const mine = overrides.filter((r) => r.weekday === wd).map((r) => ({ start: r.start_time, end: r.end_time }));
  if (mine.length > 0) return mine;
  if (!parseWorkDays(st.work_days).has(wd)) return [];
  if (!(validHHMM(st.work_start) && validHHMM(st.work_end) && st.work_start < st.work_end)) return [];
  return [{ start: st.work_start, end: st.work_end }];
}

/* Semua booking penghuni slot dalam rentang, dikelompokkan per tanggal. */
export async function getBusyMap(
  db: D1Database, staff: string, fromDay: string, toDay: string
): Promise<Record<string, { s: number; e: number }[]>> {
  const rows = await db.prepare(
    `SELECT substr(scheduled_at, 1, 10) AS day, scheduled_at, duration_min FROM support_bookings
     WHERE staff_username = ? AND substr(scheduled_at, 1, 10) >= ? AND substr(scheduled_at, 1, 10) <= ?
     AND status IN ('pending','confirmed') LIMIT 500`
  ).bind(staff, fromDay, toDay).all<{ day: string; scheduled_at: string; duration_min: number }>()
    .catch(() => ({ results: [] as never[] }));
  const map: Record<string, { s: number; e: number }[]> = {};
  for (const r of rows.results ?? []) {
    const t = String(r.scheduled_at ?? "").slice(11, 16);
    if (!validHHMM(t)) continue;
    const s = hhmmToMin(t);
    const dur = Math.max(10, Math.min(240, Math.round(Number(r.duration_min ?? 30)) || 30));
    (map[r.day] ??= []).push({ s, e: s + dur });
  }
  return map;
}

/* Tanggal cuti staff dalam rentang (1 query). */
export async function getTimeoffSet(db: D1Database, staff: string, fromDay: string, toDay: string): Promise<Set<string>> {
  const rows = await db.prepare(
    "SELECT date FROM support_timeoff WHERE staff_username = ? AND date >= ? AND date <= ? LIMIT 100"
  ).bind(staff, fromDay, toDay).all<{ date: string }>().catch(() => ({ results: [] as never[] }));
  return new Set((rows.results ?? []).map((r) => r.date));
}

/* Slot N hari ke depan dalam ~4 query total (settings, override, busy, cuti). */
export async function slotsRange(
  db: D1Database, staff: string, startDay: string, days: number, durMin: number, nowWib: string
): Promise<{ slots: { date: string; weekday: number; slots: { start: string; end: string }[] }[]; timeoff: string[]; slot_minutes: number }> {
  const st = await getSettings(db);
  const dur = Math.max(10, Math.min(240, Math.round(durMin) || st.slot_minutes));
  const base = new Date(`${startDay}T12:00:00Z`).getTime();
  const lastDay = new Date(base + (days - 1) * 864e5).toISOString().slice(0, 10);
  const [overrides, busyMap, offSet] = await Promise.all([
    getOverrides(db, staff),
    getBusyMap(db, staff, startDay, lastDay),
    getTimeoffSet(db, staff, startDay, lastDay),
  ]);
  const breakOn = !!(st.break_start && st.break_end);
  const out: { date: string; weekday: number; slots: { start: string; end: string }[] }[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(base + i * 864e5).toISOString().slice(0, 10);
    const wd = new Date(`${day}T12:00:00Z`).getUTCDay();
    let daySlots: { start: string; end: string }[] = [];
    if (!offSet.has(day)) {
      let wins = windowsForDay(overrides, wd, st);
      if (breakOn) wins = subtractBreak(wins, st.break_start, st.break_end);
      const busy = busyMap[day] ?? [];
      for (const w of wins) {
        let t = hhmmToMin(w.start);
        const end = hhmmToMin(w.end);
        while (t + dur <= end) {
          const slot = { start: `${day}T${minToHHMM(t)}`, end: `${day}T${minToHHMM(t + dur)}` };
          if (!busy.some((x) => t < x.e && x.s < t + dur) && slot.start > nowWib) daySlots.push(slot);
          t += dur;
        }
      }
    }
    out.push({ date: day, weekday: wd, slots: daySlots });
  }
  return { slots: out, timeoff: [...offSet], slot_minutes: st.slot_minutes };
}

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

/* Slot 1 tanggal (validasi POST) — lewat jalur batch yang sama. */
export async function daySlots(
  db: D1Database, staff: string, day: string, durMin: number, nowWib: string
): Promise<{ start: string; end: string }[]> {
  const r = await slotsRange(db, staff, day, 1, durMin, nowWib);
  return r.slots[0]?.slots ?? [];
}
