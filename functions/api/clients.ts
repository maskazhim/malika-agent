/* Cloudflare Pages Functions — /api/clients
   Kelola akses Malika Agent per klien (khusus admin).
   - GET    daftar akses (tanpa password hash)
   - POST   {client_name, access_url, email, password, order_id?}
            simpan + kirim email detail akses otomatis via Resend
   - DELETE ?id=xxx — hapus akses
*/

import { accountReadyMail, fetchOnboardingPdf, sendMail, sha256Hex } from "./_email";
import {
  canSendCredential,
  canViewClients,
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
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// GET /api/clients — staff pelaksana akses + admin.
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s = await getSession(request, env);
  if (!s || !canViewClients(s)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  const { results } = await env.DB.prepare(
    "SELECT id, order_id, client_name, access_url, email, email_status, created_at, subdomain FROM clients ORDER BY id DESC LIMIT 200"
  ).all();
  return Response.json({ clients: results ?? [] }, { headers: cors });
}

// POST /api/clients — kirim credential (divisi pelaksana saat setup_server / admin).
// Mode auto (order baru punya subdomain): body {order_id} saja, atau
// {order_id, password?} untuk override password custom (mis. disamakan dengan
// password customer atas permintaan mereka). Nama/email/URL diambil dari order,
// password agent digenerate acak bila tidak diisi (plain hanya dipakai untuk
// email, yang disimpan hanya hash). Password checkout TIDAK bisa dipakai
// otomatis karena yang tersimpan hanya hash SHA-256 (tak bisa dikembalikan).
// URL agent selalu https://agent-{subdomain}.malika.ai.
// Mode legacy (order lama tanpa subdomain): body lengkap
// {client_name, access_url, email, password, order_id?} seperti sebelumnya.
export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s = await getSession(request, env);
  if (!s) {
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

  const order_id = String(b.order_id ?? "").slice(0, 64);
  const manualPassword = String(b.password ?? "");

  let client_name = String(b.client_name ?? "").trim().slice(0, 128);
  let access_url = String(b.access_url ?? "").trim().slice(0, 256);
  let email = String(b.email ?? "").trim().slice(0, 128);
  let password = manualPassword;
  let subdomain = "";

  // Mode auto: order punya subdomain → semua diambil dari order.
  // Password opsional: diisi = pakai custom (min. 8), kosong = generate acak.
  const ordSub = order_id
    ? await env.DB.prepare("SELECT nama, email, subdomain FROM orders WHERE order_id = ?")
        .bind(order_id)
        .first<{ nama: string; email: string; subdomain: string }>()
        .catch(() => null)
    : null;
  if (order_id && !ordSub) {
    return new Response(JSON.stringify({ error: "order tidak ditemukan" }), { status: 404, headers: cors });
  }
  if (ordSub?.subdomain) {
    subdomain = ordSub.subdomain;
    client_name = (ordSub.nama || "").slice(0, 128);
    email = (ordSub.email || "").trim().slice(0, 128);
    access_url = `https://agent-${subdomain}.malika.ai`;
    if (!password) password = genPassword(14);
    else if (password.length < 8) {
      return new Response(JSON.stringify({ error: "password minimal 8 karakter" }), { status: 400, headers: cors });
    }
    if (!client_name) return new Response(JSON.stringify({ error: "nama klien kosong di order" }), { status: 400, headers: cors });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "email order tidak valid" }), { status: 400, headers: cors });
    }
  } else {
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
    const m = access_url.match(/^https?:\/\/([a-z0-9-]+)\.malika\.ai\/?$/i);
    // Kupas prefix layanan (agent-/router-/connector-/gowa-) agar subdomain dasarnya benar.
    if (m) subdomain = m[1].toLowerCase().replace(/^(agent|router|connector|gowa)-/, "");
  }

  // Gate: pelaksana (support/it/ai_engineer) hanya saat order di tahap setup_server/onboard.
  if (order_id) {
    const ord = await env.DB.prepare("SELECT status FROM orders WHERE order_id = ?")
      .bind(order_id)
      .first<{ status: string }>()
      .catch(() => null);
    if (!ord) return new Response(JSON.stringify({ error: "order tidak ditemukan" }), { status: 404, headers: cors });
    if (!canSendCredential(s, ord.status)) {
      return new Response(JSON.stringify({ error: "kirim credential hanya saat tahap set up server / onboarding" }), { status: 403, headers: cors });
    }
  } else if (!canSendCredential(s, "setup_server")) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors });
  }

  const created_at = new Date().toISOString();
  const res = (await env.DB.prepare(
    `INSERT INTO clients (order_id, client_name, access_url, email, password_hash, email_status, created_at, subdomain)
     VALUES (?, ?, ?, ?, ?, 'sending', ?, ?)`
  )
    .bind(order_id, client_name, access_url, email, await sha256Hex(password), created_at, subdomain)
    .run()) as { meta?: { last_row_id?: number } };
  const id = res?.meta?.last_row_id ?? 0;

  // Kirim email detail akses (password asli hanya dipakai di sini, tidak disimpan).
  // PDF onboarding diambil live dari Drive dan dilampirkan.
  const pdf = await fetchOnboardingPdf();
  const mail = await sendMail(env, {
    to: email,
    ...accountReadyMail({ client_name, access_url, email, password }),
    attachments: pdf ? [pdf] : [],
  });
  await env.DB.prepare("UPDATE clients SET email_status = ? WHERE id = ?")
    .bind(mail.ok ? "sent" : "failed", id)
    .run();

  return Response.json(
    {
      ok: true,
      id,
      email_status: mail.ok ? "sent" : "failed",
      email_error: mail.error ?? null,
      access_url,
      email,
      // Password plain dikembalikan sekali agar admin bisa melihat/menyimpan;
      // tidak disimpan di DB (hanya hash).
      password,
      auto: order_id !== "" && !!ordSub?.subdomain,
    },
    { headers: cors }
  );
}

/* Password acak aman untuk akun agent (huruf+angka, tanpa karakter ambigu). */
function genPassword(len: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const buf = crypto.getRandomValues(new Uint8Array(len));
  return [...buf].map((b) => chars[b % chars.length]).join("");
}

// DELETE /api/clients?id=xxx — khusus admin.
export async function onRequestDelete({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s = await getSession(request, env);
  if (!s || !(s.is_admin || s.division === "admin")) {
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
