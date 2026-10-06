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

/* Shortcut 4 layanan Malika per langganan.
   Sumber utama: tabel deploy_configs (ditulis otomatisasi deploy eksternal),
   kolom web_domain (agent), router_domain, connector_domain, gowa_domain.
   Bila kolom/baris kosong (mis. gowa yang masih rencana), fallback derive
   `{prefix}-{base}.malika.ai` dengan base = short_name, else orders.subdomain. */
export interface ServiceLink {
  key: "agent" | "router" | "connector" | "gowa";
  label: string;
  url: string;
}

const SERVICES: { key: ServiceLink["key"]; label: string; column: string }[] = [
  { key: "agent", label: "Malika Agent", column: "web_domain" },
  { key: "router", label: "Router", column: "router_domain" },
  { key: "connector", label: "Connector", column: "connector_domain" },
  { key: "gowa", label: "Gowa", column: "gowa_domain" },
];

function toHttps(raw: unknown): string {
  const h = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  if (!h || !h.includes(".")) return "";
  return `https://${h}`;
}

function derivedUrl(base: string, prefix: string): string {
  const b = String(base ?? "").trim().toLowerCase();
  if (!b) return "";
  return `https://${prefix}-${b}.malika.ai`;
}

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

  // Lengkapi access_url dari tabel clients (kalau credential sudah dikirim)
  // + 4 shortcut layanan dari tabel deploy_configs (keyed by order_id).
  const out = await Promise.all(
    orders.map(async (o) => {
      const cl = await env.DB.prepare("SELECT access_url, email_status FROM clients WHERE order_id = ?")
        .bind(o.order_id)
        .first<{ access_url: string; email_status: string }>()
        .catch(() => null);
      // deploy_configs belum ada di DB lama → catch jadi null, fallback ke derive.
      const dep = await env.DB.prepare(
        "SELECT short_name, web_domain, connector_domain, router_domain, gowa_domain, deploy_status FROM deploy_configs WHERE order_id = ?"
      )
        .bind(o.order_id)
        .first<{
          short_name: string;
          web_domain: string;
          connector_domain: string;
          router_domain: string;
          gowa_domain: string;
          deploy_status: string;
        }>()
        .catch(() => null);
      const access_url = cl?.access_url ?? (o.subdomain ? `https://${o.subdomain}.malika.ai` : "");
      const base = (dep?.short_name || o.subdomain || "").trim().toLowerCase();
      const domains: Record<string, string> = {
        web_domain: String(dep?.web_domain ?? ""),
        router_domain: String(dep?.router_domain ?? ""),
        connector_domain: String(dep?.connector_domain ?? ""),
        gowa_domain: String(dep?.gowa_domain ?? ""),
      };
      const services: ServiceLink[] = SERVICES.map((s) => ({
        key: s.key,
        label: s.label,
        url: toHttps(domains[s.column]) || derivedUrl(base, s.key),
      }));
      return {
        ...o,
        status_label: STATUS_LABEL[o.status] ?? o.status,
        access_url,
        credential_sent: !!cl,
        active: ["retensi", "resubscribe", "onboard", "setup_server", "verified"].includes(o.status),
        deploy_status: dep?.deploy_status ?? "",
        short_name: dep?.short_name ?? "",
        services,
      };
    })
  );

  return Response.json({ orders: out }, { headers: cors });
}
