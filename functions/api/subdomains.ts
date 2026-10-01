/* Cloudflare Pages Functions — /api/subdomains
   Booking subdomain *.malika.ai (reservasi saja, routing belakangan).
   - GET ?check=xxx publik — cek ketersediaan (debounce dari form checkout)
   - GET (tanpa check) khusus admin — daftar booking
   - POST {order_id, subdomain, email?} publik-terbatas — reservasi
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

const RESERVED = new Set([
  "www", "api", "admin", "app", "mail", "malika", "agent", "agents",
  "dashboard", "login", "static", "assets", "docs", "help", "support",
  "blog", "status", "dev", "staging", "test", "demo", "ftp", "ns1", "ns2",
]);

export function normSubdomain(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase().replace(/\.malika\.ai$/i, "");
}

function invalidReason(sub: string): string | null {
  if (!/^[a-z0-9-]{3,30}$/.test(sub)) {
    return "Subdomain 3-30 karakter (huruf kecil, angka, strip).";
  }
  if (sub.startsWith("-") || sub.endsWith("-") || sub.includes("--")) {
    return "Subdomain tidak boleh diawali/diakhiri strip atau mengandung strip ganda.";
  }
  if (RESERVED.has(sub)) return "Subdomain ini tidak tersedia.";
  return null;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// GET /api/subdomains?check=xxx — publik (cek ketersediaan).
// GET /api/subdomains — khusus admin (daftar booking).
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const params = new URL(request.url).searchParams;
  const check = params.get("check");
  if (check !== null) {
    const sub = normSubdomain(check);
    const reason = invalidReason(sub);
    if (reason) {
      return Response.json({ ok: true, available: false, subdomain: sub, reason }, { headers: cors });
    }
    const taken =
      (await env.DB.prepare("SELECT subdomain FROM subdomains WHERE subdomain = ?")
        .bind(sub)
        .first<{ subdomain: string }>()
        .catch(() => null)) ??
      (await env.DB.prepare("SELECT order_id FROM orders WHERE subdomain = ? LIMIT 1")
        .bind(sub)
        .first<{ order_id: string }>()
        .catch(() => null));
    if (taken) {
      return Response.json(
        { ok: true, available: false, subdomain: sub, reason: "Subdomain sudah dipakai." },
        { headers: cors }
      );
    }
    return Response.json({ ok: true, available: true, subdomain: sub }, { headers: cors });
  }
  const sess = await getSession(request, env);
  if (!sess || !canManageCatalog(sess)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  const { results } = await env.DB.prepare(
    "SELECT subdomain, order_id, email, status, access_url, created_at FROM subdomains ORDER BY created_at DESC LIMIT 500"
  ).all();
  return Response.json({ subdomains: results ?? [] }, { headers: cors });
}

// POST /api/subdomains {order_id, subdomain, email?} — reservasi (dipakai saat checkout/payment).
export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  let b: { order_id?: unknown; subdomain?: unknown; email?: unknown };
  try {
    b = (await request.json()) as typeof b;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const order_id = String(b.order_id ?? "").slice(0, 64);
  if (!order_id) return new Response(JSON.stringify({ error: "order_id required" }), { status: 400, headers: cors });
  const sub = normSubdomain(b.subdomain);
  const reason = invalidReason(sub);
  if (reason) return new Response(JSON.stringify({ error: reason }), { status: 400, headers: cors });
  const email = String(b.email ?? "").trim().slice(0, 128);
  const created_at = new Date().toISOString();
  const access_url = `https://${sub}.malika.ai`;

  // Cek tabrakan di kedua tabel (subdomains + orders) agar booking lama tetap dihormati.
  const clash =
    (await env.DB.prepare("SELECT subdomain FROM subdomains WHERE subdomain = ?")
      .bind(sub)
      .first()
      .catch(() => null)) ??
    (await env.DB.prepare("SELECT order_id FROM orders WHERE subdomain = ? AND order_id != ? LIMIT 1")
      .bind(sub, order_id)
      .first()
      .catch(() => null));
  if (clash) {
    return new Response(JSON.stringify({ error: "Subdomain sudah dipakai." }), { status: 409, headers: cors });
  }

  // Upsert: satu order hanya pegang satu subdomain; kalau ganti, bebaskan yang lama.
  const prev = await env.DB.prepare("SELECT subdomain FROM orders WHERE order_id = ?")
    .bind(order_id)
    .first<{ subdomain: string }>()
    .catch(() => null);
  if (prev?.subdomain && prev.subdomain !== sub) {
    await env.DB.prepare("DELETE FROM subdomains WHERE subdomain = ? AND order_id = ?")
      .bind(prev.subdomain, order_id)
      .run()
      .catch(() => {});
  }
  await env.DB.prepare(
    `INSERT INTO subdomains (subdomain, order_id, email, status, access_url, created_at)
     VALUES (?, ?, ?, 'reserved', ?, ?)
     ON CONFLICT(subdomain) DO UPDATE SET order_id=excluded.order_id, email=excluded.email`
  )
    .bind(sub, order_id, email, access_url, created_at)
    .run();
  // Sinkronkan kolom orders.subdomain (agar credential 1-klik bisa baca).
  await env.DB.prepare("UPDATE orders SET subdomain = ? WHERE order_id = ?")
    .bind(sub, order_id)
    .run()
    .catch(() => {});
  return Response.json({ ok: true, subdomain: sub, access_url }, { headers: cors });
}
