/* Cloudflare Pages Functions — /api/support-bookings
   Booking jadwal support customer dengan PIC-nya (AI engineer / retaining AE).

   - GET — customer: booking miliknya. Staff: ?scope=mine (ditugaskan ke saya)
     atau ?scope=all (admin saja). Filter ?status=.
   - POST {staff_username, pic_type, scheduled_at, order_id?, description}
     — customer buat booking (staff harus PIC-nya, slot harus tersedia).
   - PATCH {id, status} — PIC yang ditugaskan / admin (pending->confirmed->
     done, atau cancelled). Customer boleh cancel miliknya (pending/confirmed).
*/

import { canManageUsers, cors, getSession, type EnvBase } from "./_auth";
import { getCustomerSession } from "./customer-auth";
import { createMeetEvent, deleteEvent, type GcalEnv } from "./_gcal";
import {
  busyRanges, daySlots, effectiveWindows, ensureSupportTables, getSettings,
  hhmmToMin, isPicType, picColumn, subtractBreak, validHHMM, wibNow,
} from "./_support";

interface Env extends EnvBase, GcalEnv {}

const ACTIVE = ["pending", "confirmed"] as const;
const ALL_STATUS = ["pending", "confirmed", "done", "cancelled"] as const;

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

/* HopToDesk hanya untuk: customer pemilik, PIC yang ditugaskan, admin.
   Panggil untuk tiap baris sebelum dikirim ke client. */
function maskHop<T extends Record<string, unknown>>(
  r: T, viewer: { customer?: string; staff?: string; isAdmin?: boolean }
): T {
  const owner = String(r.customer_email ?? "").toLowerCase() === (viewer.customer ?? "").toLowerCase();
  const assigned = String(r.staff_username ?? "") !== "" && r.staff_username === viewer.staff;
  if (owner || assigned || viewer.isAdmin) return r;
  return { ...r, hoptodesk_id: "", hoptodesk_pass: "" };
}
async function customerPic(env: Env, email: string, pic: string): Promise<string> {
  const row = await env.DB.prepare(
    `SELECT ${picColumn(pic)} AS pic FROM client_assignments WHERE email = ?`
  ).bind(email.toLowerCase()).first<{ pic: string }>().catch(() => null);
  return String(row?.pic ?? "").trim();
}

// GET — daftar booking.
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  await ensureSupportTables(env.DB);
  const params = new URL(request.url).searchParams;
  const status = (params.get("status") ?? "").slice(0, 16);

  const s = await getSession(request, env);
  if (s) {
    const scope = params.get("scope") ?? "mine";
    if (scope === "all" && !canManageUsers(s) && s.division !== "admin") {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors });
    }
    let q = "SELECT * FROM support_bookings";
    const conds: string[] = [];
    const vals: unknown[] = [];
    if (scope === "mine") {
      conds.push("staff_username = ?");
      vals.push(s.username);
    }
    if (status && (ALL_STATUS as readonly string[]).includes(status)) {
      conds.push("status = ?");
      vals.push(status);
    }
    if (conds.length > 0) q += " WHERE " + conds.join(" AND ");
    q += " ORDER BY scheduled_at ASC LIMIT 200";
    const { results } = await env.DB.prepare(q).bind(...vals).all().catch(() => ({ results: [] as never[] }));
    const isAdmin = canManageUsers(s) || s.division === "admin";
    const out = ((results ?? []) as Record<string, unknown>[]).map((r) =>
      maskHop(r, { staff: s.username, isAdmin })
    );
    return Response.json({ ok: true, bookings: out, scope }, { headers: cors });
  }

  const c = await getCustomerSession(request, env);
  if (!c) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  let q = "SELECT * FROM support_bookings WHERE customer_email = ?";
  const vals: unknown[] = [c.email.toLowerCase()];
  if (status && (ALL_STATUS as readonly string[]).includes(status)) {
    q += " AND status = ?";
    vals.push(status);
  }
  q += " ORDER BY scheduled_at ASC LIMIT 100";
  const { results } = await env.DB.prepare(q).bind(...vals).all().catch(() => ({ results: [] as never[] }));
  const out = ((results ?? []) as Record<string, unknown>[]).map((r) =>
    maskHop(r, { customer: c.email })
  );
  return Response.json({ ok: true, bookings: out }, { headers: cors });
}

// POST — customer buat booking.
export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const c = await getCustomerSession(request, env);
  if (!c) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const pic = String(b.pic_type ?? "ai_engineer");
  const staff = String(b.staff_username ?? "").trim().slice(0, 64);
  const at = String(b.scheduled_at ?? "").slice(0, 16);
  const order_id = String(b.order_id ?? "").slice(0, 64);
  const desc = String(b.description ?? "").trim().slice(0, 2000);
  // HopToDesk opsional (ID + password untuk remote desktop oleh AI engineer).
  const hopId = String(b.hoptodesk_id ?? "").trim().slice(0, 32);
  const hopPass = String(b.hoptodesk_pass ?? "").trim().slice(0, 64);
  if (!isPicType(pic)) return new Response(JSON.stringify({ error: "pic_type tidak valid" }), { status: 400, headers: cors });
  if (!staff) return new Response(JSON.stringify({ error: "staff wajib dipilih" }), { status: 400, headers: cors });
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at)) {
    return new Response(JSON.stringify({ error: "jadwal tidak valid" }), { status: 400, headers: cors });
  }
  if (desc.length < 10) {
    return new Response(JSON.stringify({ error: "jelaskan kebutuhan support (min. 10 karakter)" }), { status: 400, headers: cors });
  }
  await ensureSupportTables(env.DB);

  // Staff harus PIC customer tsb (anti booking ke staff orang lain).
  const expect = await customerPic(env, c.email, pic);
  if (!expect) {
    return new Response(JSON.stringify({ error: "PIC belum ditentukan — hubungi support" }), { status: 400, headers: cors });
  }
  if (expect !== staff) {
    return new Response(JSON.stringify({ error: "hanya bisa booking dengan PIC masing-masing" }), { status: 403, headers: cors });
  }
  // Order (opsional) harus milik email ini.
  if (order_id) {
    const own = await env.DB.prepare("SELECT order_id FROM orders WHERE order_id = ? AND lower(email) = ?")
      .bind(order_id, c.email.toLowerCase()).first().catch(() => null);
    if (!own) return new Response(JSON.stringify({ error: "order tidak ditemukan" }), { status: 404, headers: cors });
  }

  const st = await getSettings(env.DB);
  const day = at.slice(0, 10);
  const t = at.slice(11, 16);
  if (!validHHMM(t)) return new Response(JSON.stringify({ error: "jam tidak valid" }), { status: 400, headers: cors });
  const now = wibNow();
  if (at <= now) return new Response(JSON.stringify({ error: "jadwal harus di masa depan" }), { status: 400, headers: cors });
  // Slot harus pas di dalam availability (di luar jam istirahat & cuti) & belum terisi.
  let wins = await effectiveWindows(env.DB, staff, day, st);
  if (st.break_start && st.break_end) wins = subtractBreak(wins, st.break_start, st.break_end);
  const startMin = hhmmToMin(t);
  const inside = wins.some((w) => startMin >= hhmmToMin(w.start) && startMin + st.slot_minutes <= hhmmToMin(w.end));
  if (!inside) {
    return new Response(JSON.stringify({ error: "di luar jam availability PIC (termasuk istirahat/cuti)" }), { status: 400, headers: cors });
  }
  const busy = await busyRanges(env.DB, staff, day);
  if (busy.some((x) => startMin < x.e && x.s < startMin + st.slot_minutes)) {
    return new Response(JSON.stringify({ error: "slot sudah terisi — pilih jam lain" }), { status: 409, headers: cors });
  }
  // Sanity: slot harus cocok dengan grid yang dihitung server.
  const grid = await daySlots(env.DB, staff, day, st.slot_minutes, now);
  if (!grid.some((g) => g.start === at)) {
    return new Response(JSON.stringify({ error: "slot tidak tersedia — muat ulang jadwal" }), { status: 409, headers: cors });
  }

  const ts = new Date().toISOString();
  const r = (await env.DB.prepare(
    `INSERT INTO support_bookings (customer_email, order_id, staff_username, pic_type, scheduled_at, duration_min, description, hoptodesk_id, hoptodesk_pass, status, created_at, updated_at, handled_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, '')`
  ).bind(c.email.toLowerCase(), order_id, staff, pic, at, st.slot_minutes, desc, hopId, hopPass, ts, ts).run()) as {
    meta?: { last_row_id?: number };
  };
  const id = r?.meta?.last_row_id ?? 0;
  const row = await env.DB.prepare("SELECT * FROM support_bookings WHERE id = ?").bind(id).first().catch(() => null);
  return Response.json({ ok: true, id, booking: row }, { headers: cors });
}

// PATCH {id, status} — PIC/admin; customer hanya boleh cancel miliknya.
export async function onRequestPatch({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  let b: { id?: unknown; status?: unknown };
  try {
    b = (await request.json()) as typeof b;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const id = Math.round(Number(b.id ?? 0));
  const next = String(b.status ?? "");
  if (!id || !(ALL_STATUS as readonly string[]).includes(next)) {
    return new Response(JSON.stringify({ error: "id/status tidak valid" }), { status: 400, headers: cors });
  }
  await ensureSupportTables(env.DB);
  const row = await env.DB.prepare("SELECT * FROM support_bookings WHERE id = ?").bind(id)
    .first<{
      staff_username: string; customer_email: string; status: string;
      scheduled_at: string; duration_min: number; description: string;
      pic_type: string; order_id: string; gcal_event_id: string;
    }>().catch(() => null);
  if (!row) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });

  const s = await getSession(request, env);
  const by = s ? s.username : "";
  if (s) {
    const isOwner = row.staff_username === s.username;
    const isAdmin = canManageUsers(s) || s.division === "admin";
    if (!isOwner && !isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors });
    }
    // Alur wajar: pending->confirmed/cancelled, confirmed->done/cancelled.
    const ok =
      (row.status === "pending" && (next === "confirmed" || next === "cancelled")) ||
      (row.status === "confirmed" && (next === "done" || next === "cancelled")) ||
      isAdmin;
    if (!ok) return new Response(JSON.stringify({ error: "transisi tidak valid" }), { status: 400, headers: cors });
  } else {
    const c = await getCustomerSession(request, env);
    if (!c || c.email.toLowerCase() !== String(row.customer_email).toLowerCase()) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
    }
    if (next !== "cancelled" || !(ACTIVE as readonly string[]).includes(row.status as (typeof ACTIVE)[number])) {
      return new Response(JSON.stringify({ error: "hanya bisa membatalkan booking aktif" }), { status: 400, headers: cors });
    }
  }
  await env.DB.prepare("UPDATE support_bookings SET status = ?, updated_at = ?, handled_by = ? WHERE id = ?")
    .bind(next, new Date().toISOString(), by, id).run();

  // Confirm (staff/admin) -> buatkan event kalender + link Meet (idempoten).
  // Booking tetap confirmed walau GCal gagal; caller dapat gcal_warning + retry
  // cukup PATCH confirmed lagi.
  let gmeet_url = "";
  let gcal_warning: string | null = null;
  if (s && next === "confirmed") {
    try {
      const cur = await env.DB.prepare("SELECT gcal_event_id, gmeet_url FROM support_bookings WHERE id = ?")
        .bind(id).first<{ gcal_event_id: string; gmeet_url: string }>().catch(() => null);
      if (cur?.gcal_event_id) {
        gmeet_url = cur.gmeet_url ?? "";
      } else {
        let product = "Malika Agent";
        if (row.order_id) {
          const o = await env.DB.prepare("SELECT product, nama FROM orders WHERE order_id = ?")
            .bind(row.order_id).first<{ product: string; nama: string }>().catch(() => null);
          if (o?.product) product = o.product;
        }
        const who = await env.DB.prepare("SELECT name FROM customers WHERE lower(email) = ?")
          .bind(String(row.customer_email).toLowerCase()).first<{ name: string }>().catch(() => null);
        const picLabel = row.pic_type === "account_executive" ? "Account Executive" : "AI Engineer";
        const ev = await createMeetEvent(env, {
          summary: `Support ${product} — ${who?.name || row.customer_email}`,
          description:
            `Booking support Malika Agent\nPIC: ${picLabel} (@${row.staff_username})\n` +
            `Customer: ${row.customer_email}\nOrder: ${row.order_id || "-"}\n\nKebutuhan:\n${row.description}`,
          customerEmail: row.customer_email,
          startWib: String(row.scheduled_at).slice(0, 16),
          durationMin: Number(row.duration_min) || 30,
          requestId: `bk-${id}`,
        });
        await env.DB.prepare("UPDATE support_bookings SET gcal_event_id = ?, gmeet_url = ?, gcal_error = '' WHERE id = ?")
          .bind(ev.eventId, ev.meetUrl, id).run();
        gmeet_url = ev.meetUrl;
      }
    } catch (e) {
      gcal_warning = e instanceof Error ? e.message : "gagal membuat event kalender";
      console.log(`[support-bookings] gcal gagal untuk #${id}: ${gcal_warning}`);
      await env.DB.prepare("UPDATE support_bookings SET gcal_error = ? WHERE id = ?")
        .bind(String(gcal_warning).slice(0, 500), id).run().catch(() => {});
    }
  }

  // Cancel (siapa pun) -> hapus event kalender best-effort.
  if (next === "cancelled") {
    try {
      const cur = await env.DB.prepare("SELECT gcal_event_id FROM support_bookings WHERE id = ?")
        .bind(id).first<{ gcal_event_id: string }>().catch(() => null);
      if (cur?.gcal_event_id) {
        await deleteEvent(env, cur.gcal_event_id);
        await env.DB.prepare("UPDATE support_bookings SET gcal_event_id = '', gmeet_url = '' WHERE id = ?")
          .bind(id).run();
      }
    } catch (e) {
      console.log(`[support-bookings] hapus event #${id} dilewati: ${String(e).slice(0, 200)}`);
    }
  }
  return Response.json({ ok: true, id, status: next, gmeet_url, gcal_warning }, { headers: cors });
}
