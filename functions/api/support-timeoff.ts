/* Cloudflare Pages Functions — /api/support-timeoff
   Tanggal cuti per PIC (exclude dari slot booking).

   - GET ?staff=user[&from=YYYY-MM-DD] — daftar cuti mendatang.
     Akses: staff login ATAU customer login (customer: hanya untuk PIC-nya).
   - POST {staff?, date, note?} — tambah cuti.
     Akses: AI engineer / retensi (untuk dirinya) ATAU admin (untuk siapa saja).
   - DELETE ?id= — hapus cuti. Akses sama dengan POST.
*/

import { cors, getSession, normDivision, type EnvBase } from "./_auth";
import { getCustomerSession } from "./customer-auth";
import { ensureSupportTables, validDay } from "./_support";

interface Env extends EnvBase {}

function canEdit(s: { username: string; division: string; is_admin: boolean }, target: string): boolean {
  if (s.is_admin || s.division === "admin") return true;
  return ["ai_engineer", "retensi"].includes(s.division) && s.username === target;
}

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

// GET ?staff=user[&from=YYYY-MM-DD]
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
  const from = params.get("from") ?? "";
  const { results } = await env.DB.prepare(
    `SELECT id, date, note, created_by FROM support_timeoff
     WHERE staff_username = ? ${validDay(from) ? "AND date >= ?" : ""}
     ORDER BY date ASC LIMIT 100`
  ).bind(...(validDay(from) ? [staff, from] : [staff])).all().catch(() => ({ results: [] as never[] }));
  return Response.json({ ok: true, staff, timeoff: results ?? [] }, { headers: cors });
}

// POST {staff?, date, note?}
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
  if (!canEdit(me, target)) {
    return new Response(JSON.stringify({ error: "hanya PIC yang bersangkutan (atau admin)" }), { status: 403, headers: cors });
  }
  const date = String(b.date ?? "").slice(0, 10);
  if (!validDay(date)) return new Response(JSON.stringify({ error: "tanggal tidak valid (YYYY-MM-DD)" }), { status: 400, headers: cors });
  const note = String(b.note ?? "").trim().slice(0, 128);
  await ensureSupportTables(env.DB);
  const dup = await env.DB.prepare("SELECT id FROM support_timeoff WHERE staff_username = ? AND date = ?")
    .bind(target, date).first().catch(() => null);
  if (dup) return new Response(JSON.stringify({ error: "tanggal itu sudah cuti" }), { status: 409, headers: cors });
  const r = (await env.DB.prepare(
    "INSERT INTO support_timeoff (staff_username, date, note, created_at, created_by) VALUES (?, ?, ?, ?, ?)"
  ).bind(target, date, note, new Date().toISOString(), me.username).run()) as { meta?: { last_row_id?: number } };
  return Response.json({ ok: true, id: r?.meta?.last_row_id ?? 0 }, { headers: cors });
}

// DELETE ?id=
export async function onRequestDelete({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s = await getSession(request, env);
  if (!s) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  const me = { username: s.username, division: normDivision(s.division), is_admin: s.is_admin };
  const id = Math.round(Number(new URL(request.url).searchParams.get("id") ?? 0));
  if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400, headers: cors });
  await ensureSupportTables(env.DB);
  const row = await env.DB.prepare("SELECT staff_username FROM support_timeoff WHERE id = ?")
    .bind(id).first<{ staff_username: string }>().catch(() => null);
  if (!row) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
  if (!canEdit(me, row.staff_username)) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors });
  }
  await env.DB.prepare("DELETE FROM support_timeoff WHERE id = ?").bind(id).run();
  return Response.json({ ok: true, id }, { headers: cors });
}
