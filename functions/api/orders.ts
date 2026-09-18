/* Cloudflare Pages Functions — POST /api/orders
   Menyimpan daftar order ke D1 (binding `DB`).
   Deploy: output statis Next (`out/`) + file ini sebagai Functions.
   Setup sekali:
     wrangler d1 create malika_orders
     wrangler d1 execute malika_orders --file=./migrations/0001_orders.sql
     # Pages > Settings > Functions > D1 database bindings: Variable `DB` -> malika_orders
*/

/* Minimal D1 types (agar lolos type-check Next tanpa @cloudflare/workers-types) */
interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
interface D1Database {
  prepare(query: string): D1Prepared;
}

interface Env {
  DB: D1Database;
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
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// GET /api/orders?order_id=xxx — cek satu order (tanpa list agar tidak bocor).
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  const id = new URL(request.url).searchParams.get("order_id") ?? "";
  if (!id) return new Response(JSON.stringify({ error: "order_id required" }), { status: 400, headers: cors });
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const row = await env.DB.prepare("SELECT * FROM orders WHERE order_id = ?").bind(id).first();
  if (!row) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
  return Response.json(row, { headers: cors });
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
  };

  await env.DB.prepare(
    `INSERT INTO orders (order_id, product, amount, nama, bisnis, telepon, email, method, bukti_filename, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(order_id) DO UPDATE SET
       product=excluded.product, amount=excluded.amount, nama=excluded.nama,
       bisnis=excluded.bisnis, telepon=excluded.telepon, email=excluded.email,
       method=excluded.method, bukti_filename=excluded.bukti_filename,
       status=excluded.status, created_at=excluded.created_at`
  )
    .bind(
      row.order_id, row.product, row.amount, row.nama, row.bisnis, row.telepon,
      row.email, row.method, row.bukti_filename, row.status, row.created_at
    )
    .run();

  return Response.json({ ok: true, order_id }, { headers: cors });
}
