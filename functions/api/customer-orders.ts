/* Cloudflare Pages Functions — /api/customer-orders
   Daftar langganan milik customer yang sedang login (cookie `malika_customer`).
   - GET -> {orders: [...]} (orders + access_url client + status pipeline)
*/

import { cors } from "./_auth";
import { getCustomerSession } from "./customer-auth";

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

const STATUS_LABEL: Record<string, string> = {
  checkout: "Belum bayar",
  payment_proof: "Menunggu verifikasi",
  verified: "Terverifikasi",
  setup_server: "Set up server",
  onboard: "Onboarding",
  retensi: "Aktif",
  churn: "Berhenti",
  resubscribe: "Aktif (diperpanjang)",
  cancelled: "Batal",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// GET /api/customer-orders — langganan milik sendiri.
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const c = await getCustomerSession(request, env);
  if (!c) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });

  const { results } = await env.DB.prepare(
    `SELECT order_id, product, amount, nama, bisnis, email, status, created_at,
            subdomain, promo_code, retensi_at, renewal_count
     FROM orders WHERE lower(email) = ? ORDER BY id DESC LIMIT 100`
  )
    .bind(c.email.toLowerCase())
    .all<{
      order_id: string;
      product: string;
      amount: number;
      nama: string;
      bisnis: string;
      email: string;
      status: string;
      created_at: string;
      subdomain: string;
      promo_code: string;
      retensi_at: string;
      renewal_count: number;
    }>()
    .catch(() => ({ results: [] as never[] }));

  const orders = (results ?? []) as {
    order_id: string;
    product: string;
    amount: number;
    nama: string;
    bisnis: string;
    email: string;
    status: string;
    created_at: string;
    subdomain: string;
    promo_code: string;
    retensi_at: string;
    renewal_count: number;
  }[];

  // Lengkapi access_url dari tabel clients (kalau credential sudah dikirim).
  const out = await Promise.all(
    orders.map(async (o) => {
      const cl = await env.DB.prepare("SELECT access_url, email_status FROM clients WHERE order_id = ?")
        .bind(o.order_id)
        .first<{ access_url: string; email_status: string }>()
        .catch(() => null);
      const access_url = cl?.access_url ?? (o.subdomain ? `https://${o.subdomain}.malika.ai` : "");
      return {
        ...o,
        status_label: STATUS_LABEL[o.status] ?? o.status,
        access_url,
        credential_sent: !!cl,
        active: ["retensi", "resubscribe", "onboard", "setup_server", "verified"].includes(o.status),
      };
    })
  );

  return Response.json({ orders: out }, { headers: cors });
}
