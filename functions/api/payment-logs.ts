/* Cloudflare Pages Functions — GET /api/payment-logs
   Daftar log email notifikasi pembayaran (khusus admin).
   Diisi oleh worker malika-payment-watcher.
*/

import {
  canViewLogs,
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
}


export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// GET /api/payment-logs[?action=verified|needs_review|ignored] — khusus admin.
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  { const sess = await getSession(request, env);
  if (!sess || !canViewLogs(sess)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  }
  const action = (new URL(request.url).searchParams.get("action") ?? "").slice(0, 32);
  const { results } = action
    ? await env.DB.prepare(
        "SELECT id, received_at, from_addr, subject, parsed_amounts, matched_order, action, note FROM payment_logs WHERE action = ? ORDER BY id DESC LIMIT 200"
      )
        .bind(action)
        .all()
    : await env.DB.prepare(
        "SELECT id, received_at, from_addr, subject, parsed_amounts, matched_order, action, note FROM payment_logs ORDER BY id DESC LIMIT 200"
      ).all();
  return Response.json({ logs: results ?? [] }, { headers: cors });
}
