/* Cloudflare Pages Functions — /api/customer-auth
   Login portal customer (email + password, tabel `customers`).
   Terpisah dari sesi staff (`malika_admin`).
   Sesi stateless 30 hari di cookie HttpOnly `malika_customer`.

   - POST {email, password} -> login (200 {ok, customer} / 401)
   - POST {email, password, order_id} -> klaim pertama: bila email belum punya
     akun tapi cocok dengan order_id tersebut, akun dibuat lalu login.
     (Untuk customer lama yang checkout sebelum ada password.)
   - GET cek sesi -> {ok, customer?}
   - DELETE logout
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
  SESSION_SECRET?: string;
  CUSTOMER_SESSION_SECRET?: string;
}

export interface CustomerSession {
  cid: number;
  email: string;
}

export const CUSTOMER_COOKIE = "malika_customer";
export const CUSTOMER_TTL = 30 * 24 * 3600; // detik (30 hari)

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return hex(sig);
}

export function secretOf(env: Env): string {
  return env.CUSTOMER_SESSION_SECRET ?? env.SESSION_SECRET ?? "";
}

export async function signCustomerSession(secret: string, c: CustomerSession): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + CUSTOMER_TTL;
  const randBytes = crypto.getRandomValues(new Uint8Array(16));
  const rand = [...randBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const body = `${exp.toString(16)}.${rand}.${c.cid}.${encodeURIComponent(c.email)}`;
  return `${body}.${await hmacHex(secret, body)}`;
}

export function customerCookie(token: string, maxAge: number): string {
  return `${CUSTOMER_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

/* Verifikasi cookie -> CustomerSession, pastikan akun masih ada. */
export async function getCustomerSession(req: Request, env: Env): Promise<CustomerSession | null> {
  const secret = secretOf(env);
  if (!secret || !env.DB) return null;
  const m = (req.headers.get("cookie") ?? "").match(/(?:^|;\s*)malika_customer=([^;]+)/);
  if (!m) return null;
  const parts = decodeURIComponent(m[1]).split(".");
  if (parts.length !== 5) return null;
  const [expHex, rand, cidStr, emailEnc, sig] = parts;
  const exp = parseInt(expHex, 16);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return null;
  if (!/^[0-9a-f]{32}$/.test(rand)) return null;
  if (!/^\d+$/.test(cidStr)) return null;
  const want = await hmacHex(secret, `${expHex}.${rand}.${cidStr}.${emailEnc}`);
  if (want.length !== sig.toLowerCase().length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.toLowerCase().charCodeAt(i);
  if (diff !== 0) return null;
  const email = decodeURIComponent(emailEnc).toLowerCase();
  const row = await env.DB.prepare("SELECT email FROM customers WHERE id = ?")
    .bind(Number(cidStr))
    .first<{ email: string }>()
    .catch(() => null);
  if (!row || row.email.toLowerCase() !== email) return null;
  return { cid: Number(cidStr), email };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// POST /api/customer-auth {email, password, order_id?}
export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  const secret = secretOf(env);
  if (!secret || !env.DB) {
    return Response.json({ error: "auth not configured" }, { status: 500, headers: cors });
  }
  let body: { email?: unknown; password?: unknown; order_id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400, headers: cors });
  }
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 128);
  const password = String(body.password ?? "");
  const order_id = String(body.order_id ?? "").slice(0, 64);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Email tidak valid." }, { status: 400, headers: cors });
  }
  if (!password) {
    return Response.json({ error: "Password wajib diisi." }, { status: 400, headers: cors });
  }

  const fail = () => Response.json({ error: "Email atau password salah." }, { status: 401, headers: cors });

  let row = await env.DB.prepare("SELECT id, email, pass_hash, name FROM customers WHERE email = ?")
    .bind(email)
    .first<{ id: number; email: string; pass_hash: string; name: string }>()
    .catch(() => null);

  // Klaim pertama: belum punya akun → cocokkan dengan order_id + email order.
  if (!row) {
    if (!order_id) {
      return Response.json(
        { error: "Akun belum ada. Masukkan Order ID dari email konfirmasi untuk aktivasi pertama." },
        { status: 401, headers: cors }
      );
    }
    if (password.length < 8) {
      return Response.json({ error: "Password minimal 8 karakter." }, { status: 400, headers: cors });
    }
    const ord = await env.DB.prepare("SELECT email, nama FROM orders WHERE order_id = ?")
      .bind(order_id)
      .first<{ email: string; nama: string }>()
      .catch(() => null);
    if (!ord || ord.email.toLowerCase() !== email) {
      return Response.json({ error: "Order ID tidak cocok dengan email ini." }, { status: 401, headers: cors });
    }
    const res = (await env.DB.prepare(
      "INSERT INTO customers (email, pass_hash, name, created_at) VALUES (?, ?, ?, ?)"
    )
      .bind(email, await sha256Hex(password), ord.nama || email, new Date().toISOString())
      .run()
      .catch(() => null)) as { meta?: { last_row_id?: number } } | null;
    if (!res?.meta?.last_row_id) return fail();
    row = { id: res.meta.last_row_id, email, pass_hash: await sha256Hex(password), name: ord.nama || email };
    const token = await signCustomerSession(secret, { cid: row.id, email });
    return Response.json(
      { ok: true, customer: { email: row.email, name: row.name }, claimed: true },
      { headers: { ...cors, "Set-Cookie": customerCookie(token, CUSTOMER_TTL) } }
    );
  }

  const t0 = Date.now();
  const ok = (await sha256Hex(password)).toLowerCase() === row.pass_hash.toLowerCase();
  const wait = Math.max(0, 300 - (Date.now() - t0));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  if (!ok) return fail();

  const token = await signCustomerSession(secret, { cid: row.id, email: row.email.toLowerCase() });
  return Response.json(
    { ok: true, customer: { email: row.email, name: row.name } },
    { headers: { ...cors, "Set-Cookie": customerCookie(token, CUSTOMER_TTL) } }
  );
}

// GET /api/customer-auth — cek sesi
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  const c = await getCustomerSession(request, env);
  if (!c) return Response.json({ ok: false }, { status: 401, headers: cors });
  const row = await env.DB.prepare("SELECT name FROM customers WHERE id = ?")
    .bind(c.cid)
    .first<{ name: string }>()
    .catch(() => null);
  return Response.json(
    { ok: true, customer: { email: c.email, name: row?.name ?? c.email } },
    { headers: cors }
  );
}

// DELETE /api/customer-auth — logout
export async function onRequestDelete() {
  return Response.json(
    { ok: true },
    { headers: { ...cors, "Set-Cookie": customerCookie("expired", 0) } }
  );
}

// PUT /api/customer-auth {password} — set/ubah password (harus login).
// Dipakai setelah magic link pertama (klaim) dan untuk ganti password.
export async function onRequestPut({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const c = await getCustomerSession(request, env);
  if (!c) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  let body: { password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400, headers: cors });
  }
  const password = String(body.password ?? "");
  if (password.length < 8) {
    return Response.json({ error: "Password minimal 8 karakter." }, { status: 400, headers: cors });
  }
  await env.DB.prepare("UPDATE customers SET pass_hash = ? WHERE id = ?")
    .bind(await sha256Hex(password), c.cid)
    .run();
  return Response.json({ ok: true }, { headers: cors });
}
