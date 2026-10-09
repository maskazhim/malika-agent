/* Cloudflare Pages Functions — /api/customer-portal-link
   Link sekali pakai untuk masuk portal customer LANGSUNG dari halaman
   konfirmasi pembayaran (tanpa login / tanpa buka email).
   - POST {order_id} -> {ok, url} (url = /customer/login/verify?token=xxx)
   Order ID berupa UUID yang tak bisa ditebak; token sekali pakai,
   kedaluwarsa 30 menit, dibatasi 5x/jam per email (anti spam).
*/

import { cors, sha256Hex } from "./_auth";

interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
interface D1Database {
  prepare(query: string): D1Prepared;
}
interface Env {
  DB: D1Database;
}

const EXPIRY_MIN = 30;
const MAX_PER_HOUR = 5;

function randToken(): string {
  const buf = crypto.getRandomValues(new Uint8Array(32));
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// POST /api/customer-portal-link {order_id} — publik (UUID tak tertebak).
export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  let b: { order_id?: unknown };
  try {
    b = (await request.json()) as typeof b;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const order_id = String(b.order_id ?? "").slice(0, 64);
  if (!order_id) return new Response(JSON.stringify({ error: "order_id required" }), { status: 400, headers: cors });

  const ord = await env.DB.prepare("SELECT email FROM orders WHERE order_id = ?")
    .bind(order_id)
    .first<{ email: string }>()
    .catch(() => null);
  const email = (ord?.email ?? "").trim().toLowerCase();
  if (!ord || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: "order tidak ditemukan" }), { status: 404, headers: cors });
  }

  // Sapu token kedaluwarsa + rate limit per email (best-effort).
  const now = new Date();
  await env.DB.prepare("DELETE FROM customer_tokens WHERE expires_at < ?")
    .bind(now.toISOString())
    .run()
    .catch(() => {});
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM customer_tokens WHERE email = ? AND created_at > ?"
  )
    .bind(email, new Date(now.getTime() - 3600e3).toISOString())
    .first<{ n: number }>()
    .catch(() => ({ n: 99 }));
  if (Number(recent?.n ?? 99) >= MAX_PER_HOUR) {
    return new Response(JSON.stringify({ error: "Terlalu sering. Coba lagi sejam lagi." }), { status: 429, headers: cors });
  }

  const token = randToken();
  await env.DB.prepare(
    `INSERT INTO customer_tokens (token_hash, email, purpose, expires_at, used_at, created_at)
     VALUES (?, ?, 'login', ?, '', ?)`
  )
    .bind(
      await sha256Hex(token),
      email,
      new Date(now.getTime() + EXPIRY_MIN * 60e3).toISOString(),
      now.toISOString()
    )
    .run();

  const origin = new URL(request.url).origin;
  return Response.json(
    { ok: true, url: `${origin}/customer/login/verify?token=${token}` },
    { headers: cors }
  );
}
