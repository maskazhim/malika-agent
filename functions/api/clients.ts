/* Cloudflare Pages Functions — /api/clients
   Kelola akses Malika Agent per klien (khusus admin).
   - GET    daftar akses (tanpa password hash)
   - POST   {client_name, access_url, email, password, order_id?}
            simpan + kirim email detail akses otomatis via Resend
   - DELETE ?id=xxx — hapus akses
*/

import { accountReadyMail, sendMail, sha256Hex } from "./_email";

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
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
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
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function isAdmin(req: Request, env: Env): Promise<boolean> {
  const secret = env.SESSION_SECRET ?? "";
  if (!secret) return false;
  const m = (req.headers.get("cookie") ?? "").match(/(?:^|;\s*)malika_admin=([^;]+)/);
  if (!m) return false;
  const parts = decodeURIComponent(m[1]).split(".");
  if (parts.length !== 3) return false;
  const [expHex, rand, sig] = parts;
  const exp = parseInt(expHex, 16);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  if (!/^[0-9a-f]{32}$/.test(rand)) return false;
  return timingSafeEqual(await hmacHex(secret, `${expHex}.${rand}`), sig.toLowerCase());
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// GET /api/clients — khusus admin.
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  if (!(await isAdmin(request, env))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  const { results } = await env.DB.prepare(
    "SELECT id, order_id, client_name, access_url, email, email_status, created_at FROM clients ORDER BY id DESC LIMIT 200"
  ).all();
  return Response.json({ clients: results ?? [] }, { headers: cors });
}

// POST /api/clients — khusus admin. Simpan + kirim email otomatis.
export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  if (!(await isAdmin(request, env))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  let b: {
    client_name?: unknown;
    access_url?: unknown;
    email?: unknown;
    password?: unknown;
    order_id?: unknown;
  };
  try {
    b = (await request.json()) as typeof b;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }

  const client_name = String(b.client_name ?? "").trim().slice(0, 128);
  let access_url = String(b.access_url ?? "").trim().slice(0, 256);
  const email = String(b.email ?? "").trim().slice(0, 128);
  const password = String(b.password ?? "");
  const order_id = String(b.order_id ?? "").slice(0, 64);

  if (!client_name) return new Response(JSON.stringify({ error: "nama klien wajib diisi" }), { status: 400, headers: cors });
  if (!/^https?:\/\/.+\..+/.test(access_url)) {
    // Boleh input "namaklien.malika.ai" saja — otomatis jadi https://...
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(access_url)) access_url = `https://${access_url}`;
    else return new Response(JSON.stringify({ error: "URL akses tidak valid" }), { status: 400, headers: cors });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: "email tidak valid" }), { status: 400, headers: cors });
  }
  if (password.length < 8) {
    return new Response(JSON.stringify({ error: "password minimal 8 karakter" }), { status: 400, headers: cors });
  }

  const created_at = new Date().toISOString();
  const res = (await env.DB.prepare(
    `INSERT INTO clients (order_id, client_name, access_url, email, password_hash, email_status, created_at)
     VALUES (?, ?, ?, ?, ?, 'sending', ?)`
  )
    .bind(order_id, client_name, access_url, email, await sha256Hex(password), created_at)
    .run()) as { meta?: { last_row_id?: number } };
  const id = res?.meta?.last_row_id ?? 0;

  // Kirim email detail akses (password asli hanya dipakai di sini, tidak disimpan).
  const mail = await sendMail(env, {
    to: email,
    ...accountReadyMail({ client_name, access_url, email, password }),
  });
  await env.DB.prepare("UPDATE clients SET email_status = ? WHERE id = ?")
    .bind(mail.ok ? "sent" : "failed", id)
    .run();

  return Response.json(
    { ok: true, id, email_status: mail.ok ? "sent" : "failed", email_error: mail.error ?? null },
    { headers: cors }
  );
}

// DELETE /api/clients?id=xxx — khusus admin.
export async function onRequestDelete({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  if (!(await isAdmin(request, env))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  const id = Number(new URL(request.url).searchParams.get("id") ?? 0);
  if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400, headers: cors });
  const res = (await env.DB.prepare("DELETE FROM clients WHERE id = ?").bind(id).run()) as {
    meta?: { changes?: number };
  };
  if (!res?.meta?.changes) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
  }
  return Response.json({ ok: true, id }, { headers: cors });
}
