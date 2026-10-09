/* Google Calendar via Service Account (tanpa library, fetch + JWT RS256).
   File underscore = tidak jadi route, hanya untuk diimpor.
   Env: GCAL_SERVICE_ACCOUNT = JSON service account (cukup client_email +
   private_key; field lain opsional), GCAL_CALENDAR_ID = ID kalender,
   GCAL_INVITE_EMAIL = email Malika untuk attendee tim (opsional).

   Semua fungsi best-effort di sisi caller: throw {message} yang ramah
   (API belum enabled / kalender belum di-share / secret salah format).
*/

export interface GcalEnv {
  GCAL_SERVICE_ACCOUNT?: string;
  GCAL_CALENDAR_ID?: string;
  GCAL_INVITE_EMAIL?: string;
}

export const GCAL_INVITE_DEFAULT = "halo@malika.ai";
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";
const TZ = "Asia/Jakarta";

/* Cache token per isolate (secret sama -> pakai ulang sampai expiry). */
let cached: { token: string; exp: number; key: string } | null = null;

function b64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function accessToken(clientEmail: string, privateKey: string): Promise<string> {
  const cacheKey = `${clientEmail}`;
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.key === cacheKey && cached.exp - 60 > now) return cached.token;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: clientEmail,
    sub: clientEmail,
    aud: TOKEN_URI,
    scope: "https://www.googleapis.com/auth/calendar.events",
    iat: now - 30,
    exp: now + 3600,
  }));
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToDer(privateKey), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${payload}`));
  const jwt = `${header}.${payload}.${b64url(sig)}`;
  const res = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(jwt)}`,
  });
  if (!res.ok) throw new Error("service account ditolak Google (cek client_email/private_key)");
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Google tidak mengembalikan access token");
  cached = { token: data.access_token, exp: now + Number(data.expires_in ?? 3600), key: cacheKey };
  return data.access_token;
}

function creds(env: GcalEnv): { email: string; key: string; calId: string; invite: string } {
  let raw = String(env.GCAL_SERVICE_ACCOUNT ?? "").trim();
  if (!raw) throw new Error("secret GCAL_SERVICE_ACCOUNT belum diset di Pages");
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("GCAL_SERVICE_ACCOUNT bukan JSON valid");
  }
  const email = String(j.client_email ?? "").trim();
  const key = String(j.private_key ?? "");
  if (!email || !key.includes("BEGIN PRIVATE KEY")) {
    throw new Error("GCAL_SERVICE_ACCOUNT butuh client_email + private_key yang valid");
  }
  const calId = String(env.GCAL_CALENDAR_ID ?? "").trim();
  if (!calId) throw new Error("var GCAL_CALENDAR_ID belum diset di Pages");
  const invite = String(env.GCAL_INVITE_EMAIL ?? "").trim() || GCAL_INVITE_DEFAULT;
  return { email, key, calId, invite };
}

export interface MeetEvent {
  summary: string;
  description: string;
  customerEmail: string;
  startWib: string; // "YYYY-MM-DDTHH:MM"
  durationMin: number;
  requestId: string; // idempotency per booking, mis. "bk-123"
}

/* Buat event + link Meet. Return {eventId, meetUrl}. */
export async function createMeetEvent(
  env: GcalEnv, e: MeetEvent
): Promise<{ eventId: string; meetUrl: string }> {
  const c = creds(env);
  const token = await accessToken(c.email, c.key);
  const [d, t] = e.startWib.split("T");
  const [hh, mm] = t.split(":").map(Number);
  const startMin = hh * 60 + mm + Math.max(10, Math.min(240, Math.round(e.durationMin) || 30));
  const end = `${d}T${String(Math.floor(startMin / 60)).padStart(2, "0")}:${String(startMin % 60).padStart(2, "0")}`;
  const res = await fetch(
    `${CAL_BASE}/calendars/${encodeURIComponent(c.calId)}/events?conferenceDataVersion=1&sendUpdates=all`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: e.summary.slice(0, 200),
        description: e.description.slice(0, 2000),
        start: { dateTime: `${e.startWib}:00`, timeZone: TZ },
        end: { dateTime: `${end}:00`, timeZone: TZ },
        attendees: [{ email: e.customerEmail }, { email: c.invite }],
        conferenceData: {
          createRequest: { requestId: e.requestId.slice(0, 64), conferenceSolutionKey: { type: "hangoutsMeet" } },
        },
      }),
    }
  );
  if (res.status === 404) throw new Error("kalender tidak ditemukan / belum di-share ke service account");
  if (!res.ok) {
    // Sertakan alasan dari Google (mis. "The service account does not have access...").
    let reason = "";
    try {
      const body = (await res.json()) as { error?: { message?: string; status?: string } };
      reason = String(body?.error?.message ?? "").slice(0, 200);
    } catch {
      /* abaikan */
    }
    if (res.status === 403) {
      throw new Error(
        `ditolak Google (cek enable Calendar API + share kalender sebagai Make changes to events)${reason ? `: ${reason}` : ""}`
      );
    }
    throw new Error(`Google Calendar error ${res.status}${reason ? `: ${reason}` : ""}`);
  }
  const data = (await res.json()) as {
    id?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: { uri?: string; entryPointType?: string }[] };
  };
  const meet =
    data.hangoutLink ??
    data.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ??
    "";
  if (!data.id) throw new Error("Google tidak mengembalikan event id");
  return { eventId: data.id, meetUrl: meet };
}

/* Hapus event (best-effort, 404/410 = sudah hilang, anggap sukses). */
export async function deleteEvent(env: GcalEnv, eventId: string): Promise<void> {
  if (!eventId) return;
  const c = creds(env);
  const token = await accessToken(c.email, c.key);
  const res = await fetch(
    `${CAL_BASE}/calendars/${encodeURIComponent(c.calId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.ok || res.status === 404 || res.status === 410) return;
  throw new Error(`gagal hapus event (${res.status})`);
}
