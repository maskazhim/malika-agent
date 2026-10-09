/* Cloudflare Pages Functions — /api/customer-orders
   Daftar langganan milik customer yang sedang login (cookie `malika_customer`).
   - GET -> {orders: [...]} (orders + access_url + status pipeline + masa aktif)
   Masa aktif: server_due dari cache IndoVM (deploy_configs.vps_tempo_at,
   disinkron 1x sehari) bila ada; fallback retensi_at + 30 hari.
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

/* Akses Malika Agent per langganan (tanpa credential — customer signup sendiri).
   Sumber utama: deploy_configs.web_domain; fallback derive agent-{base}.malika.ai
   dengan base = short_name, else orders.subdomain. */
export interface ServiceLink {
  key: "agent";
  label: string;
  url: string;
}

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

  // PIC staff untuk email ini (ai_engineer + retensi sebagai account executive),
  // beserta nama untuk tampilan booking support. Best-effort.
  let pics: Record<string, { username: string; name: string }> = {};
  try {
    const pa = await env.DB.prepare(
      "SELECT ai_engineer, retensi FROM client_assignments WHERE email = ?"
    ).bind(c.email.toLowerCase()).first<{ ai_engineer: string; retensi: string }>().catch(() => null);
    const names = [pa?.ai_engineer, pa?.retensi].map((u) => String(u ?? "").trim()).filter(Boolean);
    const nameMap: Record<string, string> = {};
    if (names.length > 0) {
      const us = await env.DB.prepare(
        `SELECT username, name FROM users WHERE username IN (${names.map(() => "?").join(",")})`
      ).bind(...names).all<{ username: string; name: string }>().catch(() => ({ results: [] as never[] }));
      for (const u of us.results ?? []) nameMap[u.username] = u.name;
    }
    if (pa?.ai_engineer?.trim()) {
      pics.ai_engineer = { username: pa.ai_engineer.trim(), name: nameMap[pa.ai_engineer.trim()] ?? pa.ai_engineer.trim() };
    }
    if (pa?.retensi?.trim()) {
      pics.account_executive = { username: pa.retensi.trim(), name: nameMap[pa.retensi.trim()] ?? pa.retensi.trim() };
    }
  } catch {
    /* abaikan — booking tetap diblok di API bila PIC kosong */
  }

  // URL akses agent + masa aktif server dari deploy_configs (keyed by order_id).
  // Tanpa credential — customer signup sendiri. Tabel clients tidak dipakai lagi.
  // Kolom vps_* belum ada di DB lama → catch jadi null, fallback ke derive/retensi.
  const out = await Promise.all(
    orders.map(async (o) => {
      // deploy_configs belum ada di DB lama → catch jadi null, fallback ke derive.
      const dep = await env.DB.prepare(
        "SELECT short_name, web_domain, deploy_status, vps_tempo, vps_tempo_at, vps_synced_at FROM deploy_configs WHERE order_id = ?"
      )
        .bind(o.order_id)
        .first<{
          short_name: string;
          web_domain: string;
          deploy_status: string;
          vps_tempo: string;
          vps_tempo_at: string;
          vps_synced_at: string;
        }>()
        .catch(() => null);
      const base = (dep?.short_name || o.subdomain || "").trim().toLowerCase();
      const services: ServiceLink[] = [
        {
          key: "agent",
          label: "Malika Agent",
          url: toHttps(dep?.web_domain) || derivedUrl(base, "agent"),
        },
      ];
      // Masa aktif: server_due (ISO yyyy-mm-dd) bila valid, else retensi_at + 30 hari.
      let server_due_at = "";
      let server_due_label = "";
      let active_until = "";
      const tempoAt = String(dep?.vps_tempo_at ?? "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(tempoAt)) {
        server_due_at = tempoAt;
        server_due_label = String(dep?.vps_tempo ?? tempoAt);
        active_until = tempoAt;
      } else if (o.retensi_at) {
        const exp = new Date(new Date(o.retensi_at).getTime() + 30 * 864e5);
        if (Number.isFinite(exp.getTime())) active_until = exp.toISOString().slice(0, 10);
      }
      return {
        ...o,
        status_label: STATUS_LABEL[o.status] ?? o.status,
        access_url: services[0].url,
        credential_sent: false,
        active: ["retensi", "resubscribe", "onboard", "setup_server", "verified"].includes(o.status),
        deploy_status: dep?.deploy_status ?? "",
        short_name: dep?.short_name ?? "",
        server_due_at,
        server_due_label,
        active_until,
        services,
      };
    })
  );

  return Response.json({ orders: out, pics }, { headers: cors });
}
