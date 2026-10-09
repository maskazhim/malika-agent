/* Cloudflare Pages Functions — /api/support-availability
   Jadwal & slot booking support per PIC (AI engineer / retensi).

   - GET ?staff=user — baris override + jadwal efektif mingguan.
     Akses: staff login ATAU customer login (customer: hanya untuk PIC-nya).
   - GET ?staff=user&slots=1[&from=YYYY-MM-DD][&days=N] — slot tersedia.
   - POST {staff?, weekday, start_time, end_time} — tambah/timpa jendela hari.
     Akses: AI engineer / retensi (untuk dirinya) ATAU admin (untuk siapa saja).
   - DELETE ?id=123 — hapus override. Akses sama dengan POST (pemilik/admin).
*/

import { cors, getSession, normDivision, type EnvBase } from "./_auth";
import { getCustomerSession } from "./customer-auth";
import {
  daySlots, effectiveWindows, ensureSupportTables, getSettings,
  parseWorkDays, validDay, validHHMM, weekdayOf, wibNow,
} from "./_support";

interface Env extends EnvBase {}
interface StaffSession { username: string; division: string; is_admin: boolean }

const SCHED_DIVISIONS = ["ai_engineer", "retensi"];

function canEditSchedule(s: StaffSession, target: string): boolean {
  if (s.is_admin || s.division === "admin") return true;
  return SCHED_DIVISIONS.includes(s.division) && s.username === target;
}

/* Customer boleh lihat slot PIC-nya sendiri (ai_engineer / retensi di assignment). */
async function customerOwnsPic(env: Env, email: string, staff: string): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT ai_engineer, retensi FROM client_assignments WHERE email = ?"
  ).bind(email.toLowerCase()).first<{ ai_engineer: string; retensi: string }>().catch(() => null);
  if (!row) return false;
  return row.ai_engineer === staff || row.retensi === staff;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// GET — jadwal atau slot.
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const params = new URL(request.url).searchParams;
  const staff = (params.get("staff") ?? "").trim().slice(0, 64);
  if (!staff) return new Response(JSON.stringify({ error: "staff required" }), { status: 400, headers: cors });
  await ensureSupportTables(env.DB);

  const s = await getSession(request, env);
  const c = s ? null : await getCustomerSession(request, env);
  if (!s && !c) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  if (c && !(await customerOwnsPic(env, c.email, staff))) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors });
  }

  // Mode slot: ?slots=1&from=YYYY-MM-DD&days=14
  if (params.get("slots") !== null) {
    const from = String(params.get("from") ?? "").slice(0, 10);
    const days = Math.max(1, Math.min(30, Math.round(Number(params.get("days") ?? 14)) || 14));
    const st = await getSettings(env.DB);
    const startDay = validDay(from) ? from : wibNow().slice(0, 10);
    const now = wibNow();
    const out: { date: string; weekday: number; slots: { start: string; end: string }[] }[] = [];
    const base = new Date(`${startDay}T12:00:00Z`).getTime();
    for (let i = 0; i < days; i++) {
      const day = new Date(base + i * 864e5).toISOString().slice(0, 10);
      out.push({ date: day, weekday: weekdayOf(day), slots: await daySlots(env.DB, staff, day, st.slot_minutes, now) });
    }
    return Response.json({ ok: true, staff, slot_minutes: st.slot_minutes, days: out }, { headers: cors });
  }

  // Mode jadwal: override + efektif 7 hari ke depan.
  const rows = await env.DB.prepare(
    "SELECT id, weekday, start_time, end_time, active FROM support_availability WHERE staff_username = ? ORDER BY weekday ASC, start_time ASC LIMIT 100"
  ).bind(staff).all().catch(() => ({ results: [] as never[] }));
  const st = await getSettings(env.DB);
  const week: { date: string; weekday: number; windows: { start: string; end: string }[] }[] = [];
  const base = new Date(`${wibNow().slice(0, 10)}T12:00:00Z`).getTime();
  for (let i = 0; i < 7; i++) {
    const day = new Date(base + i * 864e5).toISOString().slice(0, 10);
    week.push({ date: day, weekday: weekdayOf(day), windows: await effectiveWindows(env.DB, staff, day, st) });
  }
  return Response.json(
    { ok: true, staff, overrides: rows.results ?? [], defaults: st, default_days: [...parseWorkDays(st.work_days)], week },
    { headers: cors }
  );
}

// POST — tambah jendela availability.
export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s = await getSession(request, env);
  if (!s) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  const me = { username: s.username, division: normDivision(s.division), is_admin: s.is_admin };
  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const target = String(b.staff ?? me.username).trim().slice(0, 64) || me.username;
  if (!canEditSchedule(me, target)) {
    return new Response(JSON.stringify({ error: "hanya PIC AI engineer / retensi (atau admin)" }), { status: 403, headers: cors });
  }
  const wd = Math.round(Number(b.weekday));
  const st = String(b.start_time ?? "");
  const en = String(b.end_time ?? "");
  if (!Number.isInteger(wd) || wd < 0 || wd > 6) {
    return new Response(JSON.stringify({ error: "weekday 0-6 (0=Min)" }), { status: 400, headers: cors });
  }
  if (!validHHMM(st) || !validHHMM(en) || st >= en) {
    return new Response(JSON.stringify({ error: "jam tidak valid (HH:MM, mulai < selesai)" }), { status: 400, headers: cors });
  }
  await ensureSupportTables(env.DB);
  const now = new Date().toISOString();
  // Timpa jendela yang sama persis bila sudah ada (aktifkan lagi).
  const dup = await env.DB.prepare(
    "SELECT id FROM support_availability WHERE staff_username = ? AND weekday = ? AND start_time = ? AND end_time = ?"
  ).bind(target, wd, st, en).first<{ id: number }>().catch(() => null);
  if (dup) {
    await env.DB.prepare("UPDATE support_availability SET active = 1, updated_at = ?, updated_by = ? WHERE id = ?")
      .bind(now, me.username, dup.id).run();
    return Response.json({ ok: true, id: dup.id, reused: true }, { headers: cors });
  }
  const r = (await env.DB.prepare(
    "INSERT INTO support_availability (staff_username, weekday, start_time, end_time, active, updated_at, updated_by) VALUES (?, ?, ?, ?, 1, ?, ?)"
  ).bind(target, wd, st, en, now, me.username).run()) as { meta?: { last_row_id?: number } };
  return Response.json({ ok: true, id: r?.meta?.last_row_id ?? 0 }, { headers: cors });
}

// DELETE ?id= — hapus override (kembali ikut default).
export async function onRequestDelete({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s = await getSession(request, env);
  if (!s) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  const me = { username: s.username, division: normDivision(s.division), is_admin: s.is_admin };
  const id = Math.round(Number(new URL(request.url).searchParams.get("id") ?? 0));
  if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400, headers: cors });
  await ensureSupportTables(env.DB);
  const row = await env.DB.prepare("SELECT staff_username FROM support_availability WHERE id = ?")
    .bind(id).first<{ staff_username: string }>().catch(() => null);
  if (!row) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
  if (!canEditSchedule(me, row.staff_username)) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors });
  }
  await env.DB.prepare("DELETE FROM support_availability WHERE id = ?").bind(id).run();
  return Response.json({ ok: true, id }, { headers: cors });
}
