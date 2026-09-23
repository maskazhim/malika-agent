/* Cloudflare Pages Functions — /api/promos
   Kode promo potongan harga checkout.
   - GET ?code=XXX publik — validasi kode (dipakai form checkout)
   - GET (tanpa code) khusus admin — daftar semua promo
   - POST khusus admin — buat/update promo
   - DELETE ?code=XXX khusus admin — hapus promo
*/

import {
  canManageCatalog,
  cors,
  getSession,
  type EnvBase,
} from "./_auth";

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


interface PromoRow {
  code: string;
  type: string;
  value: number;
  max_uses: number;
  used_count: number;
  active: number;
  expires_at: string;
  created_at: string;
}

function normCode(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase().slice(0, 32);
}

// Hitung diskon (rupiah) untuk harga dasar tertentu.
export function calcDiscount(p: { type: string; value: number }, base: number): number {
  if (p.type === "fixed") return Math.max(0, Math.min(Math.round(p.value), base));
  const pct = Math.max(0, Math.min(100, Math.round(p.value)));
  return Math.round((base * pct) / 100);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// GET /api/promos?code=XXX — publik (validasi saat checkout).
// GET /api/promos — khusus admin (daftar).
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const code = normCode(new URL(request.url).searchParams.get("code"));
  if (!code) {
    { const sess = await getSession(request, env);
  if (!sess || !canManageCatalog(sess)) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
    }
    const { results } = await env.DB.prepare(
      "SELECT code, type, value, max_uses, used_count, active, expires_at, created_at FROM promos ORDER BY created_at DESC LIMIT 200"
    ).all<PromoRow>();
    return Response.json({ promos: results ?? [] }, { headers: cors });
  }
  const row = await env.DB.prepare(
    "SELECT code, type, value, max_uses, used_count, active, expires_at FROM promos WHERE code = ?"
  )
    .bind(code)
    .first<PromoRow>();
  if (!row) return new Response(JSON.stringify({ ok: false, error: "Kode promo tidak ditemukan." }), { status: 404, headers: cors });
  if (!row.active) {
    return new Response(JSON.stringify({ ok: false, error: "Kode promo sudah nonaktif." }), { status: 410, headers: cors });
  }
  if (row.expires_at && row.expires_at <= new Date().toISOString()) {
    return new Response(JSON.stringify({ ok: false, error: "Kode promo sudah kedaluwarsa." }), { status: 410, headers: cors });
  }
  if (row.max_uses > 0 && row.used_count >= row.max_uses) {
    return new Response(JSON.stringify({ ok: false, error: "Kuota kode promo sudah habis." }), { status: 410, headers: cors });
  }
  return Response.json(
    { ok: true, code: row.code, type: row.type, value: row.value },
    { headers: cors }
  );
}

// POST /api/promos {code, type, value, max_uses?, expires_at?, active?} — admin (buat/update).
export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  { const sess = await getSession(request, env);
  if (!sess || !canManageCatalog(sess)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  }
  let b: {
    code?: unknown;
    type?: unknown;
    value?: unknown;
    max_uses?: unknown;
    expires_at?: unknown;
    active?: unknown;
  };
  try {
    b = (await request.json()) as typeof b;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const code = normCode(b.code);
  if (!/^[A-Z0-9]{3,32}$/.test(code)) {
    return new Response(JSON.stringify({ error: "code 3-32 karakter (huruf/angka)" }), { status: 400, headers: cors });
  }
  const type = String(b.type ?? "percent") === "fixed" ? "fixed" : "percent";
  const value = Math.round(Number(b.value));
  if (!Number.isFinite(value) || value <= 0 || (type === "percent" && value > 100)) {
    return new Response(JSON.stringify({ error: "value tidak valid (percent 1-100, fixed rupiah)" }), { status: 400, headers: cors });
  }
  const max_uses = Math.max(0, Math.round(Number(b.max_uses ?? 0)) || 0);
  const expires_at = String(b.expires_at ?? "").slice(0, 32);
  const active = b.active === undefined ? 1 : b.active ? 1 : 0;
  await env.DB.prepare(
    `INSERT INTO promos (code, type, value, max_uses, used_count, active, expires_at, created_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET type=excluded.type, value=excluded.value,
       max_uses=excluded.max_uses, active=excluded.active, expires_at=excluded.expires_at`
  )
    .bind(code, type, value, max_uses, active, expires_at, new Date().toISOString())
    .run();
  return Response.json({ ok: true, code }, { headers: cors });
}

// DELETE /api/promos?code=XXX — khusus admin.
export async function onRequestDelete({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  { const sess = await getSession(request, env);
  if (!sess || !canManageCatalog(sess)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  }
  const code = normCode(new URL(request.url).searchParams.get("code"));
  if (!code) return new Response(JSON.stringify({ error: "code required" }), { status: 400, headers: cors });
  const res = (await env.DB.prepare("DELETE FROM promos WHERE code = ?").bind(code).run()) as {
    meta?: { changes?: number };
  };
  if (!res?.meta?.changes) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
  }
  return Response.json({ ok: true, code }, { headers: cors });
}
