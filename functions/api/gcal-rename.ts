/* SEMENTARA — /api/gcal-rename (hapus setelah event yatim dibetulkan).
   Rename event kalender berdasarkan ID event atau potongan link Meet.
   - POST {eventId?, meet?, summary?, from?, to?}
     meet: mis. "idn-vnse-qgo". from/to: "YYYY-MM-DDTHH:MM" WIB
     (default 2026-10-01T00:00 s/d 2026-11-30T23:59).
   - Akses: admin saja (dipanggil dari console browser saat login admin).
*/

import { canManageUsers, cors, getSession, type EnvBase } from "./_auth";
import { findEventByMeet, patchEvent, type GcalEnv } from "./_gcal";

interface Env extends EnvBase, GcalEnv {}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  const s = await getSession(request, env);
  if (!s || (!canManageUsers(s) && s.division !== "admin")) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors });
  }
  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const summary = String(b.summary ?? "Support Malika Agent — Wahib Kazhim").slice(0, 200);
  if (!summary) return new Response(JSON.stringify({ error: "summary kosong" }), { status: 400, headers: cors });
  try {
    let eventId = String(b.eventId ?? "").trim();
    let oldSummary = "";
    if (!eventId) {
      const meet = String(b.meet ?? "").trim();
      if (!meet) return new Response(JSON.stringify({ error: "meet/eventId required" }), { status: 400, headers: cors });
      const from = String(b.from ?? "2026-10-01T00:00").slice(0, 16);
      const to = String(b.to ?? "2026-11-30T23:59").slice(0, 16);
      const found = await findEventByMeet(env, meet, from, to);
      if (!found) return new Response(JSON.stringify({ error: "event tidak ketemu untuk meet tsb" }), { status: 404, headers: cors });
      eventId = found.id;
      oldSummary = found.summary;
    }
    await patchEvent(env, eventId, { summary });
    return Response.json({ ok: true, eventId, oldSummary, summary }, { headers: cors });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "gagal rename";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: cors });
  }
}
