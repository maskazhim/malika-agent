/* Cloudflare Pages Functions — /api/customer-magic
   Magic link login via email untuk customer (klaim pertama customer lama
   + lupa password). Tanpa Order ID: cukup email yang cocok dengan order.

   - POST {email} -> kirim link sekali pakai (selalu respons generik ok,
     agar tidak bisa dipakai enumerasi email)
   - GET ?token=xxx -> verifikasi, buat akun bila belum ada, set cookie sesi.
     Return {ok, perlu_set_password}
*/

import { cors, sha256Hex } from "./_auth";
import { magicLinkMail, sendMail } from "./_email";
import {
  CUSTOMER_TTL,
  customerCookie,
  secretOf,
  signCustomerSession,
} from "./customer-auth";

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
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
}

const EXPIRY_MIN = 30;
const MAX_PER_HOUR = 3;

function randToken(): string {
  const buf = crypto.getRandomValues(new Uint8Array(32));
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const GENERIC_OK = { ok: true, message: "Kalau email terdaftar, link login dikirim. Cek inbox/spam ya." };

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// POST /api/customer-magic {email} — minta link login.
export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  let body: { email?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 128);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: "Email tidak valid." }), { status: 400, headers: cors });
  }

  // Sapu token kedaluwarsa (best-effort).
  await env.DB.prepare("DELETE FROM customer_tokens WHERE expires_at < ?")
    .bind(new Date().toISOString())
    .run()
    .catch(() => {});

  // Rate limit per email (anti spam) — tetap balas generik.
  const hourAgo = new Date(Date.now() - 3600e3).toISOString();
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM customer_tokens WHERE email = ? AND created_at > ?"
  )
    .bind(email, hourAgo)
    .first<{ n: number }>()
    .catch(() => ({ n: 99 }));
  if (Number(recent?.n ?? 99) >= MAX_PER_HOUR) {
    return Response.json(GENERIC_OK, { headers: cors });
  }

  // Email dikenal? (akun customers ATAU pernah order). Tidak dikenal → diam.
  const known =
    (await env.DB.prepare("SELECT id FROM customers WHERE email = ?").bind(email).first().catch(() => null)) ??
    (await env.DB.prepare("SELECT order_id FROM orders WHERE lower(email) = ? LIMIT 1")
      .bind(email)
      .first()
      .catch(() => null));
  if (!known) {
    return Response.json(GENERIC_OK, { headers: cors });
  }

  const token = randToken();
  const now = new Date();
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

  // Nama untuk sapaan email (dari akun / order terbaru).
  const who =
    (await env.DB.prepare("SELECT name FROM customers WHERE email = ?").bind(email).first<{ name: string }>().catch(() => null)) ??
    (await env.DB.prepare("SELECT nama AS name FROM orders WHERE lower(email) = ? ORDER BY id DESC LIMIT 1")
      .bind(email)
      .first<{ name: string }>()
      .catch(() => null));
  const origin = new URL(request.url).origin;
  const link = `${origin}/customer/login/verify?token=${token}`;
  const mail = await sendMail(env, {
    to: email,
    ...magicLinkMail({ nama: who?.name || email, link, expiry_menit: EXPIRY_MIN }),
  });
  // Sengaja tidak membocorkan status kirim email (anti enumeration).
  // Log server-side agar kegagalan Resend bisa ditelusuri di Pages Logs.
  if (mail.ok) {
    console.log(`[customer-magic] magic link terkirim ke ${email}`);
  } else {
    console.error(`[customer-magic] GAGAL kirim ke ${email}: ${mail.error}`);
  }
  return Response.json(GENERIC_OK, { headers: cors });
}

// GET /api/customer-magic?token=xxx — verifikasi + login.
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const secret = secretOf(env);
  if (!secret) return new Response(JSON.stringify({ error: "auth not configured" }), { status: 500, headers: cors });
  const token = String(new URL(request.url).searchParams.get("token") ?? "").trim();
  if (!/^[0-9a-f]{32,128}$/i.test(token)) {
    return new Response(JSON.stringify({ ok: false, error: "Link tidak valid." }), { status: 400, headers: cors });
  }
  const row = await env.DB.prepare(
    "SELECT email, expires_at, used_at FROM customer_tokens WHERE token_hash = ?"
  )
    .bind(await sha256Hex(token.toLowerCase()))
    .first<{ email: string; expires_at: string; used_at: string }>()
    .catch(() => null);
  if (!row || row.used_at) {
    return new Response(
      JSON.stringify({ ok: false, error: "Link sudah dipakai / tidak valid. Minta link baru ya." }),
      { status: 401, headers: cors }
    );
  }
  if (!row.expires_at || row.expires_at <= new Date().toISOString()) {
    return new Response(
      JSON.stringify({ ok: false, error: "Link kedaluwarsa. Minta link baru ya." }),
      { status: 401, headers: cors }
    );
  }
  // Tandai terpakai (sekali pakai).
  await env.DB.prepare("UPDATE customer_tokens SET used_at = ? WHERE token_hash = ?")
    .bind(new Date().toISOString(), await sha256Hex(token.toLowerCase()))
    .run();

  const email = row.email.toLowerCase();
  let cust = await env.DB.prepare("SELECT id, email, pass_hash FROM customers WHERE email = ?")
    .bind(email)
    .first<{ id: number; email: string; pass_hash: string }>()
    .catch(() => null);
  let perlu_set_password = false;
  if (!cust) {
    // Klaim pertama: email cocok dengan order → buatkan akun (tanpa password).
    const ord = await env.DB.prepare("SELECT nama FROM orders WHERE lower(email) = ? ORDER BY id DESC LIMIT 1")
      .bind(email)
      .first<{ nama: string }>()
      .catch(() => null);
    if (!ord) {
      return new Response(JSON.stringify({ ok: false, error: "Email tidak terdaftar." }), { status: 401, headers: cors });
    }
    const res = (await env.DB.prepare(
      "INSERT INTO customers (email, pass_hash, name, created_at) VALUES (?, '', ?, ?)"
    )
      .bind(email, ord.nama || email, new Date().toISOString())
      .run()) as { meta?: { last_row_id?: number } };
    cust = { id: res?.meta?.last_row_id ?? 0, email, pass_hash: "" };
    perlu_set_password = true;
  } else if (!cust.pass_hash) {
    perlu_set_password = true;
  }

  // Langsung set sesi baru (menggantikan sesi lama bila ada).
  const session = await signCustomerSession(secret, { cid: cust.id, email: cust.email.toLowerCase() });
  return Response.json(
    { ok: true, perlu_set_password },
    { headers: { ...cors, "Set-Cookie": customerCookie(session, CUSTOMER_TTL) } }
  );
}
