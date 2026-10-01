/* Cloudflare Pages Functions — /api/affiliate-tiers
   Jatah affiliate per tier jumlah referral (ditentukan admin Malika).
   - GET publik — daftar tier aktif (dipakai portal customer & checkout)
   - POST khusus admin — buat/update tier {id?, min_referrals, budget_percent, active?}
   - DELETE ?id=xxx khusus admin — hapus tier
*/

import { canManageCatalog, cors, getSession, type EnvBase } from "./_auth";

interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
interface D1Database {
  prepare(query: string): D1Prepared;
}
interface Env extends EnvBase {
  DB: D1Database;
  SESSION_SECRET?: string;
}

export interface TierRow {
  id: number;
  min_referrals: number;
  budget_percent: number;
  active: number;
  created_at: string;
}

/* Budget % untuk jumlah referral tertentu (tier tertinggi yang tercapai). */
export async function budgetFor(db: D1Database, referrals: number): Promise<number> {
  const { results } = await db
    .prepare("SELECT budget_percent, min_referrals FROM affiliate_tiers WHERE active = 1 ORDER BY min_referrals ASC")
    .all<{ budget_percent: number; min_referrals: number }>()
    .catch(() => ({ results: [] as { budget_percent: number; min_referrals: number }[] }));
  let budget = 0;
  for (const t of results ?? []) {
    if (referrals >= t.min_referrals) budget = t.budget_percent;
  }
  return budget;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// GET /api/affiliate-tiers — publik (tier aktif saja) atau admin (?all=1).
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const all = new URL(request.url).searchParams.get("all") === "1";
  if (all) {
    const sess = await getSession(request, env);
    if (!sess || !canManageCatalog(sess)) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
    }
    const { results } = await env.DB.prepare(
      "SELECT id, min_referrals, budget_percent, active, created_at FROM affiliate_tiers ORDER BY min_referrals ASC"
    ).all<TierRow>();
    return Response.json({ tiers: results ?? [] }, { headers: cors });
  }
  const { results } = await env.DB.prepare(
    "SELECT id, min_referrals, budget_percent, active, created_at FROM affiliate_tiers WHERE active = 1 ORDER BY min_referrals ASC"
  ).all<TierRow>();
  return Response.json({ tiers: results ?? [] }, { headers: cors });
}

// POST /api/affiliate-tiers {id?, min_referrals, budget_percent, active?} — admin.
export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const sess = await getSession(request, env);
  if (!sess || !canManageCatalog(sess)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  let b: { id?: unknown; min_referrals?: unknown; budget_percent?: unknown; active?: unknown };
  try {
    b = (await request.json()) as typeof b;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const min_referrals = Math.max(0, Math.round(Number(b.min_referrals ?? 0)));
  const budget_percent = Math.round(Number(b.budget_percent ?? NaN));
  if (!Number.isFinite(budget_percent) || budget_percent < 0 || budget_percent > 100) {
    return new Response(JSON.stringify({ error: "budget_percent 0-100" }), { status: 400, headers: cors });
  }
  if (!Number.isFinite(min_referrals)) {
    return new Response(JSON.stringify({ error: "min_referrals tidak valid" }), { status: 400, headers: cors });
  }
  const active = b.active === undefined ? 1 : b.active ? 1 : 0;
  const id = Number(b.id ?? 0);
  if (id) {
    const res = (await env.DB.prepare(
      "UPDATE affiliate_tiers SET min_referrals = ?, budget_percent = ?, active = ? WHERE id = ?"
    )
      .bind(min_referrals, budget_percent, active, id)
      .run()) as { meta?: { changes?: number } };
    if (!res?.meta?.changes) {
      return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
    }
    return Response.json({ ok: true, id }, { headers: cors });
  }
  const res = (await env.DB.prepare(
    "INSERT INTO affiliate_tiers (min_referrals, budget_percent, active, created_at) VALUES (?, ?, ?, ?)"
  )
    .bind(min_referrals, budget_percent, active, new Date().toISOString())
    .run()) as { meta?: { last_row_id?: number } };
  return Response.json({ ok: true, id: res?.meta?.last_row_id ?? 0 }, { headers: cors });
}

// DELETE /api/affiliate-tiers?id=xxx — admin.
export async function onRequestDelete({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const sess = await getSession(request, env);
  if (!sess || !canManageCatalog(sess)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  const id = Number(new URL(request.url).searchParams.get("id") ?? 0);
  if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400, headers: cors });
  const res = (await env.DB.prepare("DELETE FROM affiliate_tiers WHERE id = ?").bind(id).run()) as {
    meta?: { changes?: number };
  };
  if (!res?.meta?.changes) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
  }
  return Response.json({ ok: true, id }, { headers: cors });
}
