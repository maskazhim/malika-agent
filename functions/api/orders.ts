/* Cloudflare Pages Functions — /api/orders
   Menyimpan daftar order ke D1 (binding `DB`).
   Deploy: output statis Next (`out/`) + file ini sebagai Functions.
   Setup sekali:
     wrangler d1 create malika_orders
     wrangler d1 execute malika_orders --file=./migrations/0001_orders.sql
     # Pages > Settings > Functions > D1 database bindings: Variable `DB` -> malika_orders
     # Env: ADMIN_PASSCODE_HASH + SESSION_SECRET (untuk endpoint admin)

   Akses:
     POST   publik   — simpan/upsert order (checkout & konfirmasi bayar)
     GET    ?order_id=xxx publik (cek satu order); tanpa param = daftar (khusus admin)
     PATCH  khusus admin — update status order
*/

/* Minimal D1 types (agar lolos type-check Next tanpa @cloudflare/workers-types) */
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
}

/* --- Verifikasi sesi admin (disalin dari api/auth.ts agar tiap Function mandiri) --- */
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

interface OrderBody {
  order_id?: string;
  product?: string;
  amount?: number;
  nama?: string;
  bisnis?: string;
  telepon?: string;
  email?: string;
  method?: string;
  bukti_filename?: string;
  status?: string;
  created_at?: string;
  unique_code?: number;
  code_expires_at?: string;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const LIST_COLUMNS =
  "order_id, product, amount, nama, bisnis, telepon, email, method, bukti_filename, status, created_at, unique_code, code_expires_at";

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// GET /api/orders?order_id=xxx — cek satu order (publik).
// GET /api/orders[?status=xxx] — daftar order (khusus admin, perlu cookie sesi).
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const params = new URL(request.url).searchParams;
  const id = params.get("order_id") ?? "";
  if (id) {
    const row = await env.DB.prepare("SELECT * FROM orders WHERE order_id = ?").bind(id).first();
    if (!row) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
    return Response.json(row, { headers: cors });
  }
  if (!(await isAdmin(request, env))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  const status = (params.get("status") ?? "").slice(0, 32);
  const { results } = status
    ? await env.DB.prepare(`SELECT ${LIST_COLUMNS} FROM orders WHERE status = ? ORDER BY id DESC LIMIT 200`).bind(status).all()
    : await env.DB.prepare(`SELECT ${LIST_COLUMNS} FROM orders ORDER BY id DESC LIMIT 200`).all();
  return Response.json({ orders: results }, { headers: cors });
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  let b: OrderBody;
  try {
    b = (await request.json()) as OrderBody;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const order_id = String(b.order_id ?? "").slice(0, 64);
  if (!order_id) return new Response(JSON.stringify({ error: "order_id required" }), { status: 400, headers: cors });

  const row = {
    order_id,
    product: String(b.product ?? "-").slice(0, 64),
    amount: Number.isFinite(Number(b.amount)) ? Math.round(Number(b.amount)) : 0,
    nama: String(b.nama ?? "-").slice(0, 128),
    bisnis: String(b.bisnis ?? "-").slice(0, 128),
    telepon: String(b.telepon ?? "-").slice(0, 32),
    email: String(b.email ?? "-").slice(0, 128),
    method: String(b.method ?? "").slice(0, 16),
    bukti_filename: String(b.bukti_filename ?? "").slice(0, 256),
    status: String(b.status ?? "checkout").slice(0, 32),
    created_at: String(b.created_at ?? new Date().toISOString()).slice(0, 32),
    unique_code: Number.isFinite(Number(b.unique_code)) ? Math.round(Number(b.unique_code)) : null,
    code_expires_at: String(b.code_expires_at ?? "").slice(0, 32),
  };

  await env.DB.prepare(
    `INSERT INTO orders (order_id, product, amount, nama, bisnis, telepon, email, method, bukti_filename, status, created_at, unique_code, code_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(order_id) DO UPDATE SET
       product=excluded.product, amount=excluded.amount, nama=excluded.nama,
       bisnis=excluded.bisnis, telepon=excluded.telepon, email=excluded.email,
       method=excluded.method, bukti_filename=excluded.bukti_filename,
       status=excluded.status, created_at=excluded.created_at,
       unique_code=excluded.unique_code, code_expires_at=excluded.code_expires_at`
  )
    .bind(
      row.order_id, row.product, row.amount, row.nama, row.bisnis, row.telepon,
      row.email, row.method, row.bukti_filename, row.status, row.created_at,
      row.unique_code, row.code_expires_at
    )
    .run();

  return Response.json({ ok: true, order_id }, { headers: cors });
}

const ADMIN_STATUSES = ["checkout", "payment_proof", "verified", "cancelled"];

// PATCH /api/orders {order_id, status} — khusus admin (mis. tandai terverifikasi).
export async function onRequestPatch({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  if (!(await isAdmin(request, env))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  let b: { order_id?: unknown; status?: unknown };
  try {
    b = (await request.json()) as { order_id?: unknown; status?: unknown };
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const order_id = String(b.order_id ?? "").slice(0, 64);
  const status = String(b.status ?? "");
  if (!order_id || !ADMIN_STATUSES.includes(status)) {
    return new Response(JSON.stringify({ error: "order_id & status valid required" }), { status: 400, headers: cors });
  }
  // Order final (verified/cancelled) langsung membebaskan kode uniknya
  // agar bisa dipakai ulang oleh order lain.
  const freeCode = status === "verified" || status === "cancelled";
  const res = (await env.DB.prepare(
    freeCode
      ? "UPDATE orders SET status = ?, unique_code = NULL, code_expires_at = '' WHERE order_id = ?"
      : "UPDATE orders SET status = ? WHERE order_id = ?"
  )
    .bind(status, order_id)
    .run()) as { meta?: { changes?: number } };
  if (!res?.meta?.changes) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
  }
  return Response.json({ ok: true, order_id, status }, { headers: cors });
}
