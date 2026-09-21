/* Cloudflare Pages Functions — POST /api/allocate-code
   Alokasi kode unik QRIS 1–999 untuk satu order.
   - Pilih angka TERKECIL yang tidak dipakai order AKTIF lain
     (status checkout/payment_proof dan code_expires_at > now).
   - Kode milik order verified/cancelled/expired (>1 hari) bebas dipakai ulang.
   - UNIQUE INDEX di unique_code + retry loop menangani race antar request.
   - Kode expired 24 jam setelah alokasi (code_expires_at).

   Request:  { "order_id": "..." }
   Response: { ok, unique_code, expires_at, base, amount(total) }
*/

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

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ACTIVE_STATUSES = ["checkout", "payment_proof"];
const FINAL_STATUSES = ["verified", "cancelled"];
const CODE_MIN = 1;
const CODE_MAX = 999;
const CODE_TTL_MS = 24 * 60 * 60 * 1000;

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });

  let body: { order_id?: unknown };
  try {
    body = (await request.json()) as { order_id?: unknown };
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const order_id = String(body.order_id ?? "").slice(0, 64);
  if (!order_id) return new Response(JSON.stringify({ error: "order_id required" }), { status: 400, headers: cors });

  const nowIso = new Date().toISOString();
  const row = await env.DB.prepare(
    "SELECT order_id, amount, unique_code, code_expires_at, status FROM orders WHERE order_id = ?"
  )
    .bind(order_id)
    .first<{
      order_id: string;
      amount: number;
      unique_code: number | null;
      code_expires_at: string;
      status: string;
    }>();
  if (!row) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
  if (FINAL_STATUSES.includes(row.status)) {
    return new Response(JSON.stringify({ error: "order already finalized" }), { status: 409, headers: cors });
  }

  // Kode lama masih hidup → pakai ulang, tidak perlu alokasi baru.
  if (
    row.unique_code != null &&
    row.code_expires_at > nowIso &&
    ACTIVE_STATUSES.includes(row.status)
  ) {
    return Response.json(
      {
        ok: true,
        reused: true,
        unique_code: row.unique_code,
        expires_at: row.code_expires_at,
        base: row.amount - row.unique_code,
        amount: row.amount,
      },
      { headers: cors }
    );
  }

  const base = row.unique_code != null ? row.amount - row.unique_code : row.amount;
  const expires_at = new Date(Date.now() + CODE_TTL_MS).toISOString();

  const used = await env.DB.prepare(
    `SELECT unique_code FROM orders
     WHERE unique_code IS NOT NULL
       AND status IN ('checkout','payment_proof')
       AND code_expires_at > ?`
  )
    .bind(nowIso)
    .all<{ unique_code: number }>();
  const taken = new Set((used.results ?? []).map((r) => r.unique_code));

  for (let attempt = 0; attempt < 25; attempt++) {
    let code = -1;
    for (let c = CODE_MIN; c <= CODE_MAX; c++) {
      if (!taken.has(c)) {
        code = c;
        break;
      }
    }
    if (code < 0) {
      return new Response(JSON.stringify({ error: "no code available" }), { status: 503, headers: cors });
    }
    try {
      await env.DB.prepare(
        "UPDATE orders SET unique_code = ?, code_expires_at = ?, amount = ? WHERE order_id = ?"
      )
        .bind(code, expires_at, base + code, order_id)
        .run();
      return Response.json(
        { ok: true, reused: false, unique_code: code, expires_at, base, amount: base + code },
        { headers: cors }
      );
    } catch (e) {
      // Race: request lain mengambil kode yang sama duluan → coba kode berikutnya.
      if (String(e).includes("UNIQUE")) {
        taken.add(code);
        continue;
      }
      throw e;
    }
  }
  return new Response(JSON.stringify({ error: "allocation failed, retry" }), { status: 503, headers: cors });
}
