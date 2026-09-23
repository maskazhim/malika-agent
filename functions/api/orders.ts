/* Cloudflare Pages Functions — /api/orders
   Menyimpan daftar order ke D1 (binding `DB`).
   Pipeline: checkout -> payment_proof -> verified -> setup_server -> retensi
   (cabang retensi -> churn / resubscribe), plus cancelled.
   Akses dibatasi sesi staff + matriks divisi (lihat _auth.ts).

   Akses:
      POST   publik   — simpan/upsert order (checkout & konfirmasi bayar)
      GET    ?order_id=xxx publik (cek satu order); tanpa param = daftar (staff,
             difilter sesuai divisi; ?status=xxx opsional)
      PATCH  staff sesuai matriks — update status / flag onboard_done
      DELETE khusus admin — hapus order permanen
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
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
}

import {
  canDeleteOrder,
  canSetOnboard,
  canTransition,
  cors,
  getSession,
  visibleStages,
  type Session,
} from "./_auth";

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
  promo_code?: string;
}

const LIST_COLUMNS =
  "order_id, product, amount, nama, bisnis, telepon, email, method, bukti_filename, status, created_at, unique_code, code_expires_at, promo_code, onboard_done, retensi_at, renewal_count";

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// GET /api/orders?order_id=xxx — cek satu order (publik).
// GET /api/orders[?status=xxx] — daftar order (staff, difilter divisi).
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const params = new URL(request.url).searchParams;
  const id = params.get("order_id") ?? "";
  if (id) {
    const row = await env.DB.prepare("SELECT * FROM orders WHERE order_id = ?").bind(id).first();
    if (!row) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
    return Response.json(row, { headers: cors });
  }
  const s = await getSession(request, env);
  if (!s) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  const allowed = visibleStages(s);
  const status = (params.get("status") ?? "").slice(0, 32);
  const wanted = status ? [status] : null;
  const stages = wanted ?? allowed;
  let query = `SELECT ${LIST_COLUMNS} FROM orders`;
  const vals: unknown[] = [];
  if (stages) {
    if (stages.length === 0) return Response.json({ orders: [] }, { headers: cors });
    query += ` WHERE status IN (${stages.map(() => "?").join(",")})`;
    vals.push(...stages);
  }
  query += " ORDER BY id DESC LIMIT 200";
  const { results } = await env.DB.prepare(query)
    .bind(...vals)
    .all();
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
    promo_code: String(b.promo_code ?? "").trim().toUpperCase().slice(0, 32),
  };

  await env.DB.prepare(
    `INSERT INTO orders (order_id, product, amount, nama, bisnis, telepon, email, method, bukti_filename, status, created_at, unique_code, code_expires_at, promo_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(order_id) DO UPDATE SET
       product=excluded.product, amount=excluded.amount, nama=excluded.nama,
       bisnis=excluded.bisnis, telepon=excluded.telepon, email=excluded.email,
       method=excluded.method, bukti_filename=excluded.bukti_filename,
       status=excluded.status, created_at=excluded.created_at,
       unique_code=excluded.unique_code, code_expires_at=excluded.code_expires_at,
       promo_code=excluded.promo_code`
  )
    .bind(
      row.order_id, row.product, row.amount, row.nama, row.bisnis, row.telepon,
      row.email, row.method, row.bukti_filename, row.status, row.created_at,
      row.unique_code, row.code_expires_at, row.promo_code
    )
    .run();

  return Response.json({ ok: true, order_id }, { headers: cors });
}

const KNOWN_STATUSES = [
  "checkout",
  "payment_proof",
  "verified",
  "setup_server",
  "retensi",
  "churn",
  "resubscribe",
  "cancelled",
];

// PATCH /api/orders {order_id, status?, onboard_done?} — staff sesuai matriks.
export async function onRequestPatch({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s: Session | null = await getSession(request, env);
  if (!s) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  let b: { order_id?: unknown; status?: unknown; onboard_done?: unknown };
  try {
    b = (await request.json()) as { order_id?: unknown; status?: unknown; onboard_done?: unknown };
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const order_id = String(b.order_id ?? "").slice(0, 64);
  if (!order_id) return new Response(JSON.stringify({ error: "order_id required" }), { status: 400, headers: cors });

  // Ambil status + promo lama dulu (untuk guard transisi & hitung used_count tepat sekali).
  const before = await env.DB.prepare(
    "SELECT status, promo_code, retensi_at FROM orders WHERE order_id = ?"
  )
    .bind(order_id)
    .first<{ status: string; promo_code: string; retensi_at: string }>();
  if (!before) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });

  const changed: string[] = [];

  // 1) Flag onboarding paralel.
  if (b.onboard_done !== undefined) {
    if (!canSetOnboard(s)) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors });
    }
    await env.DB.prepare("UPDATE orders SET onboard_done = ? WHERE order_id = ?")
      .bind(b.onboard_done ? 1 : 0, order_id)
      .run();
    changed.push("onboard_done");
  }

  // 2) Pindah status pipeline.
  const status = b.status !== undefined ? String(b.status) : "";
  if (status) {
    if (!KNOWN_STATUSES.includes(status)) {
      return new Response(JSON.stringify({ error: "status tidak valid" }), { status: 400, headers: cors });
    }
    if (status !== before.status && !canTransition(s, before.status, status)) {
      return new Response(JSON.stringify({ error: "forbidden untuk divisimu" }), { status: 403, headers: cors });
    }
    if (status !== before.status) {
      // Order final (verified/cancelled) langsung membebaskan kode uniknya
      // agar bisa dipakai ulang oleh order lain.
      const freeCode = status === "verified" || status === "cancelled";
      const nowIso = new Date().toISOString();
      if (status === "resubscribe") {
        // Perpanjang: +1 hitungan, masa aktif 30 hari dihitung ulang dari sekarang.
        await env.DB.prepare(
          "UPDATE orders SET status = ?, renewal_count = renewal_count + 1, retensi_at = ? WHERE order_id = ?"
        )
          .bind(status, nowIso, order_id)
          .run();
      } else if (status === "retensi" && !before.retensi_at) {
        await env.DB.prepare("UPDATE orders SET status = ?, retensi_at = ? WHERE order_id = ?")
          .bind(status, nowIso, order_id)
          .run();
      } else if (freeCode) {
        await env.DB.prepare(
          "UPDATE orders SET status = ?, unique_code = NULL, code_expires_at = '' WHERE order_id = ?"
        )
          .bind(status, order_id)
          .run();
      } else {
        await env.DB.prepare("UPDATE orders SET status = ? WHERE order_id = ?")
          .bind(status, order_id)
          .run();
      }
      changed.push("status");
    }
  }

  if (changed.length === 0) {
    return new Response(JSON.stringify({ error: "tidak ada perubahan" }), { status: 400, headers: cors });
  }

  // Order baru saja verified -> kirim email konfirmasi pembayaran (best-effort).
  if (changed.includes("status") && status === "verified" && before.status !== "verified") {
    // Promo terpakai tepat sekali (transisi ke verified pertama kali).
    if (before.promo_code) {
      await env.DB.prepare("UPDATE promos SET used_count = used_count + 1 WHERE code = ?")
        .bind(before.promo_code)
        .run()
        .catch(() => {});
    }
    try {
      const order = await env.DB.prepare(
        "SELECT order_id, product, amount, nama, email FROM orders WHERE order_id = ?"
      )
        .bind(order_id)
        .first<{ order_id: string; product: string; amount: number; nama: string; email: string }>();
      if (order && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email)) {
        const { paymentConfirmedMail, sendMail } = await import("./_email");
        const mail = await sendMail(env, {
          to: order.email,
          ...paymentConfirmedMail({
            nama: order.nama,
            product: order.product,
            amount: order.amount,
            order_id: order.order_id,
          }),
        });
        console.log(`[orders] email verified ke ${order.email}: ${mail.ok ? "sent" : mail.error}`);
      }
    } catch (e) {
      console.log(`[orders] email verified gagal: ${String(e).slice(0, 200)}`);
    }
  }
  return Response.json({ ok: true, order_id, changed }, { headers: cors });
}

// DELETE /api/orders?order_id=xxx — khusus admin (hapus order permanen).
// Baris yang dihapus otomatis membebaskan kode uniknya.
export async function onRequestDelete({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s = await getSession(request, env);
  if (!s || !canDeleteOrder(s)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  const order_id = (new URL(request.url).searchParams.get("order_id") ?? "").slice(0, 64);
  if (!order_id) {
    return new Response(JSON.stringify({ error: "order_id required" }), { status: 400, headers: cors });
  }
  const res = (await env.DB.prepare("DELETE FROM orders WHERE order_id = ?")
    .bind(order_id)
    .run()) as { meta?: { changes?: number } };
  if (!res?.meta?.changes) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
  }
  return Response.json({ ok: true, order_id }, { headers: cors });
}
