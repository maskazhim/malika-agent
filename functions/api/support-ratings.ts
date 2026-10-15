/* Cloudflare Pages Functions — /api/support-ratings
   Penilaian support AI engineer oleh customer (bintang 0-5 + pesan opsional).

   - GET ?mine=1 — customer: rating periode berjalan (bisa direvisi) + riwayat
     periode lampau (final) + nama AI engineer-nya. Paksa identitas customer
     (?as=customer tidak perlu — endpoint ini customer-first; sesi staff yang
     login di browser yang sama diabaikan kecuali ?scope=recap).
   - POST {stars, message?} — customer nilai / revisi penilaian periode berjalan.
     Periode = YYYY-MM WIB dihitung server. PIC diambil dari client_assignments.
   - GET ?scope=recap[&staff=&period=] — staff: rekap rata-rata + distribusi +
     daftar pesan. Admin/bisdev = semua staff; ai_engineer = dirinya sendiri.
*/

import { cors, getSession, type EnvBase } from "./_auth";
import { getCustomerSession } from "./customer-auth";
import { wibNow } from "./_support";

interface Env extends EnvBase {}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

const TABLE = `CREATE TABLE IF NOT EXISTS support_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, customer_email TEXT NOT NULL DEFAULT '',
  staff_username TEXT NOT NULL DEFAULT '', period TEXT NOT NULL DEFAULT '',
  stars INTEGER NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '',
  UNIQUE(customer_email, staff_username, period))`;

/* Periode berjalan "YYYY-MM" dalam WIB (server-side, anti curang jam HP). */
function currentPeriod(): string {
  return wibNow().slice(0, 7);
}

function validPeriod(p: unknown): p is string {
  return typeof p === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
}

const ID_MONTH = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export function periodLabel(p: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  if (!m) return p;
  return `${ID_MONTH[Number(m[2])]} ${m[1]}`;
}

// GET — customer (?mine=1) atau rekap staff (?scope=recap).
// ?as=customer -> paksa identitas customer (abaikan cookie sesi staff).
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  await env.DB.prepare(TABLE).run().catch(() => {});
  const params = new URL(request.url).searchParams;
  const forceCustomer = params.get("as") === "customer";

  const s = forceCustomer ? null : await getSession(request, env);
  if (s && params.get("scope") === "recap") {
    const isAdmin = s.is_admin || s.division === "admin" || s.division === "bisdev";
    // AI engineer boleh lihat rekap dirinya sendiri; admin/bisdev boleh semua.
    let staff = (params.get("staff") ?? "").trim().slice(0, 64);
    if (!isAdmin) {
      if (s.division !== "ai_engineer") {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors });
      }
      staff = s.username;
    }
    const period = (params.get("period") ?? "").slice(0, 7);
    const per = validPeriod(period) ? period : currentPeriod();
    const conds: string[] = ["period = ?"];
    const vals: unknown[] = [per];
    if (staff) {
      conds.push("staff_username = ?");
      vals.push(staff);
    }
    const rows = await env.DB.prepare(
      `SELECT staff_username, stars, message, customer_email, updated_at FROM support_ratings
       WHERE ${conds.join(" AND ")} ORDER BY updated_at DESC LIMIT 500`
    ).bind(...vals).all<{ staff_username: string; stars: number; message: string; customer_email: string; updated_at: string }>()
      .catch(() => ({ results: [] as never[] }));
    const list = rows.results ?? [];
    // Agregat per staff dihitung di sini (1 query, tanpa GROUP BY dinamis).
    const byStaff: Record<string, { count: number; sum: number; dist: number[] }> = {};
    for (const r of list) {
      const a = (byStaff[r.staff_username] ??= { count: 0, sum: 0, dist: [0, 0, 0, 0, 0, 0] });
      const st = Math.max(0, Math.min(5, Math.round(Number(r.stars ?? 0))));
      a.count += 1;
      a.sum += st;
      a.dist[st] += 1;
    }
    const summary = Object.entries(byStaff).map(([username, a]) => ({
      staff_username: username,
      count: a.count,
      avg: a.count > 0 ? Math.round((a.sum / a.count) * 10) / 10 : 0,
      dist: a.dist,
    })).sort((x, y) => y.count - x.count);
    // Pesan: admin/bisdev lihat semua; ai_engineer hanya miliknya (sudah difilter staff).
    return Response.json({ ok: true, period: per, summary, ratings: list }, { headers: cors });
  }

  const c = await getCustomerSession(request, env);
  if (!c) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  const email = c.email.toLowerCase();
  // PIC AI engineer customer ini (kalau belum ada -> belum bisa menilai).
  const picRow = await env.DB.prepare("SELECT ai_engineer FROM client_assignments WHERE email = ?")
    .bind(email).first<{ ai_engineer: string }>().catch(() => null);
  const aiEngineer = String(picRow?.ai_engineer ?? "").trim();
  let picName = "";
  if (aiEngineer) {
    const u = await env.DB.prepare("SELECT name FROM users WHERE username = ?")
      .bind(aiEngineer).first<{ name: string }>().catch(() => null);
    picName = String(u?.name ?? aiEngineer);
  }
  const per = currentPeriod();
  const mine = await env.DB.prepare(
    "SELECT stars, message, updated_at FROM support_ratings WHERE customer_email = ? AND staff_username = ? AND period = ?"
  ).bind(email, aiEngineer, per).first<{ stars: number; message: string; updated_at: string }>().catch(() => null);
  const history = await env.DB.prepare(
    "SELECT period, stars, message, updated_at FROM support_ratings WHERE customer_email = ? AND period != ? ORDER BY period DESC LIMIT 24"
  ).bind(email, per).all<{ period: string; stars: number; message: string; updated_at: string }>()
    .catch(() => ({ results: [] as never[] }));
  return Response.json({
    ok: true,
    period: per,
    ai_engineer: aiEngineer ? { username: aiEngineer, name: picName } : null,
    mine: mine ? { stars: mine.stars, message: mine.message, updated_at: mine.updated_at } : null,
    history: history.results ?? [],
  }, { headers: cors });
}

// POST — customer nilai / revisi periode berjalan.
export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  await env.DB.prepare(TABLE).run().catch(() => {});
  const c = await getCustomerSession(request, env);
  if (!c) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const stars = Math.round(Number(b.stars));
  if (!Number.isInteger(stars) || stars < 0 || stars > 5) {
    return new Response(JSON.stringify({ error: "bintang harus 0-5" }), { status: 400, headers: cors });
  }
  const message = String(b.message ?? "").trim().slice(0, 1000);
  const email = c.email.toLowerCase();
  const picRow = await env.DB.prepare("SELECT ai_engineer FROM client_assignments WHERE email = ?")
    .bind(email).first<{ ai_engineer: string }>().catch(() => null);
  const aiEngineer = String(picRow?.ai_engineer ?? "").trim();
  if (!aiEngineer) {
    return new Response(JSON.stringify({ error: "belum ada AI engineer yang ditugaskan — hubungi support" }), { status: 400, headers: cors });
  }
  const per = currentPeriod();
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO support_ratings (customer_email, staff_username, period, stars, message, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(customer_email, staff_username, period)
       DO UPDATE SET stars=excluded.stars, message=excluded.message, updated_at=excluded.updated_at`
    ).bind(email, aiEngineer, per, stars, message, now, now).run();
  } catch (e) {
    return new Response(JSON.stringify({ error: `gagal menyimpan: ${String(e).slice(0, 160)}` }), { status: 500, headers: cors });
  }
  return Response.json({ ok: true, period: per, stars }, { headers: cors });
}
