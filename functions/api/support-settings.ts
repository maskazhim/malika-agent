/* Cloudflare Pages Functions — /api/support-settings
   Pengaturan booking support (durasi slot, jam & hari kerja default).
   - GET — baca setting. Akses: staff login ATAU customer login.
   - POST {slot_minutes?, work_start?, work_end?, work_days?} — khusus admin.
*/

import { canManageCatalog, cors, getSession, type EnvBase } from "./_auth";
import { getCustomerSession } from "./customer-auth";
import { ensureSupportTables, getSettings, parseWorkDays, validHHMM } from "./_support";

interface Env extends EnvBase {}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

async function allowed(request: Request, env: Env): Promise<boolean> {
  if (await getSession(request, env)) return true;
  return !!(await getCustomerSession(request, env));
}

// GET /api/support-settings
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  if (!(await allowed(request, env))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  await ensureSupportTables(env.DB);
  return Response.json({ ok: true, settings: await getSettings(env.DB) }, { headers: cors });
}

// POST /api/support-settings — khusus admin.
export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s = await getSession(request, env);
  if (!s || !canManageCatalog(s)) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors });
  }
  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  await ensureSupportTables(env.DB);
  const cur = await getSettings(env.DB);
  const slot = b.slot_minutes === undefined ? cur.slot_minutes : Math.round(Number(b.slot_minutes));
  const ws = b.work_start === undefined ? cur.work_start : String(b.work_start);
  const we = b.work_end === undefined ? cur.work_end : String(b.work_end);
  const wd = b.work_days === undefined ? cur.work_days : String(b.work_days);
  if (!Number.isFinite(slot) || slot < 10 || slot > 240) {
    return new Response(JSON.stringify({ error: "durasi 10-240 menit" }), { status: 400, headers: cors });
  }
  if (!validHHMM(ws) || !validHHMM(we) || ws >= we) {
    return new Response(JSON.stringify({ error: "jam kerja tidak valid (HH:MM, mulai < selesai)" }), { status: 400, headers: cors });
  }
  if (parseWorkDays(wd).size === 0) {
    return new Response(JSON.stringify({ error: "hari kerja kosong (0=Min..6=Sab, mis. 1,2,3,4,5)" }), { status: 400, headers: cors });
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE support_settings SET slot_minutes = ?, work_start = ?, work_end = ?, work_days = ?, updated_at = ?, updated_by = ? WHERE id = 1"
  ).bind(slot, ws, we, wd, now, s.username).run();
  return Response.json({ ok: true, settings: await getSettings(env.DB) }, { headers: cors });
}
