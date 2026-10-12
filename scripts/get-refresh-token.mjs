#!/usr/bin/env node
/* Ambil GCAL_REFRESH_TOKEN via OAuth Web flow (sekali pakai, jalan lokal).
 *
 * Prasyarat di Google Cloud Console:
 *  1. Enable Google Calendar API.
 *  2. OAuth consent screen = Internal (Workspace), scope calendar.events.
 *  3. Create OAuth Client ID = Web application, tambahkan redirect URI:
 *       http://localhost:53682/oauth2callback
 *
 * Cara pakai:
 *   node scripts/get-refresh-token.mjs --client-id XXX --client-secret YYY [--port 53682]
 *   atau via env: GCAL_OAUTH_CLIENT_ID / GCAL_OAUTH_CLIENT_SECRET
 *
 * Login sebagai halo@malika.ai saat browser terbuka. Refresh token dicetak
 * di terminal — simpan ke Cloudflare Pages secrets (jangan commit).
 */

import http from "node:http";

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const TOKEN_URI = "https://oauth2.googleapis.com/token";

function arg(name, def = "") {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return String(process.argv[i + 1]);
  return def;
}

const clientId = arg("client-id", process.env.GCAL_OAUTH_CLIENT_ID ?? "").trim();
const clientSecret = arg("client-secret", process.env.GCAL_OAUTH_CLIENT_SECRET ?? "").trim();
const port = Number(arg("port", process.env.GCAL_OAUTH_PORT ?? "53682")) || 53682;

if (!clientId || !clientSecret) {
  console.error(
    "Butuh --client-id dan --client-secret (atau env GCAL_OAUTH_CLIENT_ID / GCAL_OAUTH_CLIENT_SECRET)."
  );
  process.exit(1);
}

const redirectUri = `http://localhost:${port}/oauth2callback`;
const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}` +
  `&redirect_uri=${encodeURIComponent(redirectUri)}` +
  `&response_type=code&scope=${encodeURIComponent(SCOPE)}` +
  `&access_type=offline&prompt=consent`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  if (url.pathname !== "/oauth2callback") {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found. Buka URL auth dari terminal.");
    return;
  }
  const code = url.searchParams.get("code") ?? "";
  const err = url.searchParams.get("error") ?? "";
  if (err || !code) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(`<h3>Gagal: ${err || "tanpa code"}</h3><p>Coba ulangi dan login sebagai halo@malika.ai</p>`);
    console.error(`Auth gagal: ${err || "tanpa code"}`);
    return;
  }
  try {
    const r = await fetch(TOKEN_URI, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:
        `grant_type=authorization_code&code=${encodeURIComponent(code)}` +
        `&client_id=${encodeURIComponent(clientId)}` +
        `&client_secret=${encodeURIComponent(clientSecret)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}`,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.refresh_token) {
      throw new Error(data.error_description ?? data.error ?? `HTTP ${r.status} tanpa refresh_token`);
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      "<h3>Berhasil!</h3><p>Refresh token sudah dicetak di terminal. Tab ini bisa ditutup.</p>"
    );
    console.log("\n=== SUKSES ===");
    console.log(`refresh_token: ${data.refresh_token}`);
    console.log("\nSet di Cloudflare Pages > Settings > Variables & Secrets (Production):");
    console.log(`  GCAL_OAUTH_CLIENT_ID=${clientId}`);
    console.log(`  GCAL_OAUTH_CLIENT_SECRET=<yang kamu pakai tadi>`);
    console.log(`  GCAL_REFRESH_TOKEN=${data.refresh_token}`);
    console.log(`  GCAL_CALENDAR_ID=c_8644435e1d32056adcb2806d0576be32d39a15924979b75142c4116a12af2895@group.calendar.google.com`);
    console.log("\nLalu redeploy Pages agar Pages Functions baca secret baru.");
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end(`<h3>Tukar code gagal</h3><p>${String(e).slice(0, 300)}</p>`);
    console.error(`Tukar code gagal: ${e instanceof Error ? e.message : e}`);
  } finally {
    server.close();
  }
});

server.listen(port, () => {
  console.log(`Callback listen di ${redirectUri}`);
  console.log("\n1. Pastikan redirect URI di atas terdaftar di Google Cloud > Credentials > OAuth Web client.");
  console.log("2. Buka URL ini sebagai halo@malika.ai:\n");
  console.log(authUrl + "\n");
  // Coba buka browser otomatis (best-effort, macOS).
  import("node:child_process").then(({ exec }) => {
    exec(`open "${authUrl.replace(/"/g, "")}"`, () => {});
  }).catch(() => {});
});
