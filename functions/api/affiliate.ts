/* Cloudflare Pages Functions — /api/affiliate
   Kode affiliate milik customer + statistik referral.
   - GET (sesi customer) -> {code?, discount_percent, commission_percent,
     referrals, budget, tiers, stats, referrals_list}
   - POST (sesi customer) {discount_percent, commission_percent} — buat/update
     kode saya. discount + commission harus == budget tier saya saat ini.
     Kode dibuat otomatis dari email (atau {code} custom bila diberikan).
   - GET ?all=1 (admin) -> semua kode + referral (untuk tab admin)
   - PATCH (admin) {referral_id, status} — tandai paid/payable
*/

import { canManageCatalog, cors, getSession, type EnvBase } from "./_auth";
import { getCustomerSession } from "./customer-auth";
import { budgetFor } from "./affiliate-tiers";

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
  CUSTOMER_SESSION_SECRET?: string;
}

function codeFromEmail(email: string): string {
  const base = email.split("@")[0].toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
  return (base || "MALIKA").slice(0, 20);
}

async function referralCount(db: D1Database, code: string): Promise<number> {
  const r = await db
    .prepare("SELECT COUNT(*) AS n FROM affiliate_referrals WHERE code = ?")
    .bind(code)
    .first<{ n: number }>()
    .catch(() => null);
  return Number(r?.n ?? 0);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// GET /api/affiliate — customer (kode saya) atau admin (?all=1).
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const params = new URL(request.url).searchParams;
  if (params.get("all") === "1") {
    const sess = await getSession(request, env);
    if (!sess || !canManageCatalog(sess)) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
    }
    const { results: codes } = await env.DB.prepare(
      "SELECT code, customer_id, email, discount_percent, commission_percent, active, created_at FROM affiliate_codes ORDER BY created_at DESC LIMIT 500"
    ).all();
    const { results: refs } = await env.DB.prepare(
      "SELECT id, code, order_id, discount_amount, commission_amount, status, created_at FROM affiliate_referrals ORDER BY id DESC LIMIT 500"
    ).all();
    return Response.json({ codes: codes ?? [], referrals: refs ?? [] }, { headers: cors });
  }
  const c = await getCustomerSession(request, env);
  if (!c) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });

  const mine = await env.DB.prepare("SELECT code, discount_percent, commission_percent, active FROM affiliate_codes WHERE customer_id = ?")
    .bind(c.cid)
    .first<{ code: string; discount_percent: number; commission_percent: number; active: number }>()
    .catch(() => null);
  const count = mine ? await referralCount(env.DB, mine.code) : 0;
  const budget = await budgetFor(env.DB, count);
  const { results: tiers } = await env.DB.prepare(
    "SELECT min_referrals, budget_percent FROM affiliate_tiers WHERE active = 1 ORDER BY min_referrals ASC"
  ).all<{ min_referrals: number; budget_percent: number }>();

  let refs: unknown[] = [];
  let payable = 0;
  let paid = 0;
  if (mine) {
    const r = await env.DB.prepare(
      "SELECT order_id, discount_amount, commission_amount, status, created_at FROM affiliate_referrals WHERE code = ? ORDER BY id DESC LIMIT 200"
    )
      .bind(mine.code)
      .all()
      .catch(() => ({ results: [] as unknown[] }));
    refs = r.results ?? [];
    for (const x of refs as { commission_amount: number; status: string }[]) {
      if (x.status === "paid") paid += Number(x.commission_amount ?? 0);
      else payable += Number(x.commission_amount ?? 0);
    }
  }
  return Response.json(
    {
      code: mine?.code ?? null,
      discount_percent: mine?.discount_percent ?? 0,
      commission_percent: mine?.commission_percent ?? 0,
      active: mine ? !!mine.active : true,
      referrals: count,
      budget,
      tiers: tiers ?? [],
      payable,
      paid,
      referrals_list: refs,
    },
    { headers: cors }
  );
}

// POST /api/affiliate {discount_percent, commission_percent, code?} — customer.
export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const c = await getCustomerSession(request, env);
  if (!c) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  let b: { discount_percent?: unknown; commission_percent?: unknown; code?: unknown };
  try {
    b = (await request.json()) as typeof b;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const discount = Math.round(Number(b.discount_percent ?? NaN));
  const commission = Math.round(Number(b.commission_percent ?? NaN));
  if (!Number.isFinite(discount) || !Number.isFinite(commission) || discount < 0 || commission < 0) {
    return new Response(JSON.stringify({ error: "diskon & komisi harus angka >= 0" }), { status: 400, headers: cors });
  }
  const mine = await env.DB.prepare("SELECT code FROM affiliate_codes WHERE customer_id = ?")
    .bind(c.cid)
    .first<{ code: string }>()
    .catch(() => null);
  const count = mine ? await referralCount(env.DB, mine.code) : 0;
  const budget = await budgetFor(env.DB, count);
  if (discount + commission !== budget) {
    return new Response(
      JSON.stringify({ error: `Diskon + komisi harus pas ${budget}% (jatah tier kamu saat ini).` }),
      { status: 400, headers: cors }
    );
  }
  let code = mine?.code ?? "";
  if (!code) {
    const custom = String(b.code ?? "").trim().toUpperCase().slice(0, 20);
    code = /^[A-Z0-9]{3,20}$/.test(custom) ? custom : codeFromEmail(c.email);
    // Pastikan unik (tambah angka bila tabrakan dengan kode orang lain/promo).
    for (let i = 0; i < 10; i++) {
      const clash =
        (await env.DB.prepare("SELECT code FROM affiliate_codes WHERE code = ?").bind(code).first().catch(() => null)) ??
        (await env.DB.prepare("SELECT code FROM promos WHERE code = ?").bind(code).first().catch(() => null));
      if (!clash) break;
      code = `${codeFromEmail(c.email)}${i + 1}`.slice(0, 20);
    }
    await env.DB.prepare(
      `INSERT INTO affiliate_codes (code, customer_id, email, discount_percent, commission_percent, active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`
    )
      .bind(code, c.cid, c.email, discount, commission, new Date().toISOString())
      .run();
  } else {
    await env.DB.prepare(
      "UPDATE affiliate_codes SET discount_percent = ?, commission_percent = ?, active = 1 WHERE code = ?"
    )
      .bind(discount, commission, code)
      .run();
  }
  return Response.json({ ok: true, code, discount_percent: discount, commission_percent: commission, budget }, { headers: cors });
}

// PATCH /api/affiliate {referral_id, status} — admin (tandai paid/payable).
export async function onRequestPatch({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const sess = await getSession(request, env);
  if (!sess || !canManageCatalog(sess)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  let b: { referral_id?: unknown; status?: unknown };
  try {
    b = (await request.json()) as typeof b;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const id = Number(b.referral_id ?? 0);
  const status = String(b.status ?? "");
  if (!id || (status !== "paid" && status !== "payable")) {
    return new Response(JSON.stringify({ error: "referral_id + status (paid/payable) required" }), { status: 400, headers: cors });
  }
  const res = (await env.DB.prepare("UPDATE affiliate_referrals SET status = ? WHERE id = ?")
    .bind(status, id)
    .run()) as { meta?: { changes?: number } };
  if (!res?.meta?.changes) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
  }
  return Response.json({ ok: true, id, status }, { headers: cors });
}
