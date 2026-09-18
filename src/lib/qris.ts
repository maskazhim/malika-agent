/* Util QRIS / EMVCo — diadaptasi dari skill qris-manipulation (maskazhim/opencode-skills).
   Aturan: tag 52 (MCC) wajib dipertahankan, nominal tag 54 format 2 desimal,
   CRC-16/CCITT-FALSE dihitung termasuk literal "6304". */

export type QrisField = { id: string; len: number; value: string };

export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function parseQris(payload: string): QrisField[] {
  const fields: QrisField[] = [];
  let i = 0;
  while (i + 4 <= payload.length) {
    const id = payload.slice(i, i + 2);
    const len = parseInt(payload.slice(i + 2, i + 4), 10);
    if (!Number.isFinite(len) || i + 4 + len > payload.length) break;
    fields.push({ id, len, value: payload.slice(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  return fields;
}

export function isValidQris(payload: string): boolean {
  const t = payload.trim();
  if (t.length < 20) return false;
  const f = parseQris(t);
  if (f.length === 0) return false;
  if (f.find((x) => x.id === "00")?.value !== "01") return false;
  if (!f.some((x) => x.id === "26")) return false;
  const c = f.find((x) => x.id === "63");
  if (!c || !/^[0-9A-F]{4}$/.test(c.value)) return false;
  if (!t.endsWith(`6304${c.value}`)) return false;
  return crc16(t.slice(0, -4)) === c.value;
}

export function buildDynamicQris(staticPayload: string, amount: number): string | null {
  const trimmed = staticPayload.trim();
  if (!trimmed.startsWith("0002")) return null;
  const fields = parseQris(trimmed);
  if (fields.length === 0 || !fields.some((f) => f.id === "00")) return null;

  // Tag 52 = MCC (wajib EMVCo) — PERTAHANKAN. Yang dibuang hanya 63 (CRC lama).
  const out = fields.filter((f) => f.id !== "63");
  const init = out.find((f) => f.id === "01");
  if (init) {
    init.value = "12";
    init.len = 2;
  } else out.push({ id: "01", len: 2, value: "12" });

  const amt = Math.max(0, Math.round(amount)).toFixed(2);
  const af = out.find((f) => f.id === "54");
  if (af) {
    af.value = amt;
    af.len = amt.length;
  } else out.push({ id: "54", len: amt.length, value: amt });

  const order = ["00", "01", "02", "26", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63"];
  out.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

  const base = out.map((f) => `${f.id}${String(f.len).padStart(2, "0")}${f.value}`).join("");
  return `${base}6304${crc16(`${base}6304`)}`;
}

function tlv(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/* Payload statis fallback (DEMO). Ganti dengan payload QRIS merchant asli
   lewat env NEXT_PUBLIC_QRIS_STATIC agar dana masuk ke rekening yang benar. */
function demoStaticPayload(): string {
  const acct = tlv("00", "ID.CO.QRIS.WWW") + tlv("01", "MALIKAAGENT001") + tlv("02", "UMI");
  const base =
    tlv("00", "01") +
    tlv("01", "11") +
    tlv("26", acct) +
    tlv("52", "5411") +
    tlv("53", "360") +
    tlv("58", "ID") +
    tlv("59", "MALIKA AI") +
    tlv("60", "JAKARTA") +
    tlv("62", tlv("05", "INV-MALIKA")) +
    "6304";
  return `${base}${crc16(base)}`;
}

export function getStaticPayload(): { payload: string; isDemo: boolean } {
  const env = (process.env.NEXT_PUBLIC_QRIS_STATIC ?? "").trim();
  if (env && env.startsWith("0002")) return { payload: env, isDemo: false };
  return { payload: demoStaticPayload(), isDemo: true };
}

export function formatRp(n: number): string {
  return "Rp" + n.toLocaleString("id-ID");
}
