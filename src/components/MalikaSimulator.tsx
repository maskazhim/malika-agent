"use client";

import { useEffect, useId, useRef, useState } from "react";

const LOGO = "/icon-192.png";

type AgentKey = "kazhim" | "gilang" | "rahma";

/* ---------- Ikon robot Malika (bisa divariasi warnanya) ---------- */
function AgentBotIcon({
  c1,
  c2,
  glow,
  size = 32,
}: {
  c1: string;
  c2: string;
  glow: string;
  size?: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const g = (n: string) => `${n}-${uid}`;
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 400 300" aria-hidden>
      <defs>
        <linearGradient id={g("b")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
        <linearGradient id={g("h")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="65%" stopColor="#F7F7FA" />
          <stop offset="100%" stopColor="#D9DCF0" />
        </linearGradient>
        <linearGradient id={g("v")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22242C" />
          <stop offset="100%" stopColor="#08090D" />
        </linearGradient>
        <filter id={g("e")} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={g("s")} x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#101014" floodOpacity=".18" />
        </filter>
      </defs>
      <g>
        <rect x="61" y="49" width="15" height="52" rx="7.5" transform="rotate(-10 68.5 75)" fill={`url(#${g("b")})`} />
        <circle cx="60" cy="43" r="17" fill={`url(#${g("b")})`} />
        <rect x="324" y="49" width="15" height="52" rx="7.5" transform="rotate(10 331.5 75)" fill={`url(#${g("b")})`} />
        <circle cx="340" cy="43" r="17" fill={`url(#${g("b")})`} />
      </g>
      <g>
        <rect x="47" y="108" width="57" height="83" rx="27" fill={`url(#${g("b")})`} />
        <ellipse cx="53" cy="149" rx="13" ry="23" fill={c2} />
        <ellipse cx="51" cy="143" rx="5" ry="12" fill={glow} opacity=".7" />
        <rect x="296" y="108" width="57" height="83" rx="27" fill={`url(#${g("b")})`} />
        <ellipse cx="347" cy="149" rx="13" ry="23" fill={c2} />
        <ellipse cx="349" cy="143" rx="5" ry="12" fill={glow} opacity=".7" />
      </g>
      <g filter={`url(#${g("s")})`}>
        <rect x="55" y="48" width="290" height="205" rx="78" fill={`url(#${g("h")})`} />
      </g>
      <g>
        <rect x="82" y="81" width="236" height="130" rx="45" fill={`url(#${g("v")})`} />
      </g>
      <g filter={`url(#${g("e")})`}>
        <path d="M125 151 C132 128 157 128 166 151" fill="none" stroke={glow} strokeWidth="13" strokeLinecap="round" />
        <path d="M234 151 C241 128 266 128 275 151" fill="none" stroke={glow} strokeWidth="13" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/* ---------- Tipe data ---------- */
interface ChatMsg {
  id: string;
  from: "user" | "agent";
  text?: string;
  time: string;
  report?: "growth" | "ig" | "expiry";
}

interface ScreenStep {
  app: string;
  text: string;
  time: string;
  done: boolean;
}

const AGENT_STYLE: Record<AgentKey, { c1: string; c2: string; glow: string; role: string }> = {
  kazhim: { c1: "#5EEAD4", c2: "#0F766E", glow: "#8FFFE0", role: "Project Manager" },
  gilang: { c1: "#718AFF", c2: "#263DAD", glow: "#8FFFE0", role: "Marketing Expert" },
  rahma: { c1: "#C4B5FD", c2: "#7C3AED", glow: "#F9A8D4", role: "Support Specialist" },
};

const AGENT_NAME: Record<AgentKey, string> = {
  kazhim: "Kazhim",
  gilang: "Gilang",
  rahma: "Rahma",
};

const INITIAL_CHATS: Record<AgentKey, ChatMsg[]> = {
  kazhim: [
    {
      id: "k1",
      from: "user",
      text: "Kazhim, kumpulin data growth customer baru bulan ini ya. Saya butuh lengkap dengan analisisnya.",
      time: "09:02 AM",
    },
    {
      id: "k2",
      from: "agent",
      text: "Siap! Saya tarik data customer baru 1–17 September dari CRM + spreadsheet sales, lalu saya analisis per channel. Ini hasilnya:",
      time: "09:14 AM",
    },
    { id: "k3", from: "agent", time: "09:14 AM", report: "growth" },
  ],
  gilang: [
    {
      id: "g1",
      from: "user",
      text: "Gil, cek performa postingan IG seminggu terakhir dong",
      time: "10:05 AM",
    },
    {
      id: "g2",
      from: "agent",
      text: "Beres! Saya buka Instagram, tarik 9 postingan 10–17 September, dan rangkum performanya. Nih ringkasannya:",
      time: "10:19 AM",
    },
    { id: "g3", from: "agent", time: "10:19 AM", report: "ig" },
  ],
  rahma: [
    {
      id: "r1",
      from: "user",
      text: "Rahma, list down klien yang mendekati masa expired ya",
      time: "08:30 AM",
    },
    {
      id: "r2",
      from: "agent",
      text: "Sudah saya cek database langganan. Ada 4 klien yang expired dalam 30 hari ke depan:",
      time: "08:36 AM",
    },
    { id: "r3", from: "agent", time: "08:36 AM", report: "expiry" },
  ],
};

const INITIAL_STEPS: Record<AgentKey, ScreenStep[]> = {
  kazhim: [
    { app: "CRM", text: "Menarik data customer baru 1–17 Sep…", time: "09:03", done: true },
    { app: "Spreadsheet", text: "Menggabung data sales per channel…", time: "09:08", done: true },
    { app: "Kazhim", text: "Menyusun analisis + rekomendasi…", time: "09:14", done: false },
  ],
  gilang: [
    { app: "Browser", text: "Membuka browser aman Gilang…", time: "10:06", done: true },
    { app: "Instagram", text: "Menarik 9 postingan 10–17 Sep…", time: "10:12", done: true },
    { app: "Gilang", text: "Menghitung reach & engagement…", time: "10:19", done: false },
  ],
  rahma: [
    { app: "Database", text: "Mengecek tanggal expired langganan…", time: "08:31", done: true },
    { app: "WhatsApp", text: "Menyiapkan template reminder…", time: "08:34", done: true },
    { app: "Rahma", text: "Menunggu approval kirim reminder…", time: "08:36", done: false },
  ],
};

const ROUTINES: Record<AgentKey, [string, string][]> = {
  kazhim: [
    ["00:00", "Rekap closing + sinkron CRM"],
    ["04:00", "Validasi data sales semalam"],
    ["08:00", "Update data growth pagi"],
    ["12:00", "Cek pipeline siang"],
    ["16:00", "Follow-up progres ke tim sales"],
    ["20:00", "Laporan sore + analisis"],
    ["23:00", "Backup data harian"],
  ],
  gilang: [
    ["00:00", "Riset tren konten malam"],
    ["07:00", "Draft 3 ide konten"],
    ["12:00", "Posting siang + cek performa"],
    ["15:00", "Balas komentar & DM"],
    ["19:00", "Posting malam"],
    ["22:00", "Rekap engagement harian"],
  ],
  rahma: [
    ["00:00", "Scan klien expired tengah malam"],
    ["06:00", "Kirim reminder pagi"],
    ["09:00", "Rekap pembayaran masuk"],
    ["12:00", "Follow-up invoice siang"],
    ["15:00", "Cek tiket support"],
    ["18:00", "Laporan harian"],
    ["21:00", "Standby + jaga malam"],
  ],
};

const SUGGESTIONS: Record<AgentKey, string[]> = {  kazhim: ["Update data growth minggu ini", "Bandingkan dengan bulan lalu", "Buatkan deck ringkasannya"],
  gilang: ["Cek performa postingan seminggu terakhir", "Jadwalkan posting jam 12 siang", "Riset 5 kompetitor"],
  rahma: ["Kirim reminder ke semua klien", "List klien expired bulan depan", "Rekap pembayaran masuk"],
};

function nowTime() {
  const d = new Date();
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

function Avatar({ k, size = 32 }: { k: AgentKey; size?: number }) {
  const s = AGENT_STYLE[k];
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-stone-200" style={{ width: size, height: size }}>
      <AgentBotIcon c1={s.c1} c2={s.c2} glow={s.glow} size={size * 0.92} />
    </span>
  );
}

/* ---------- Kartu laporan ---------- */
function GrowthReport({ onAsk }: { onAsk: (t: string) => void }) {
  const rows = [
    { ch: "Website", leads: 184, close: 31, conv: "16,8%" },
    { ch: "Instagram", leads: 226, close: 28, conv: "12,4%" },
    { ch: "Referral", leads: 97, close: 26, conv: "26,8%" },
    { ch: "WhatsApp", leads: 143, close: 22, conv: "15,4%" },
  ];
  return (
    <div className="overflow-hidden rounded-2xl rounded-tl-md bg-[#f1f0ee]">
      <div className="malika-gradient px-3.5 py-2.5 text-white">
        <p className="text-[13px] font-bold">Growth Customer Baru</p>
        <p className="text-[11px] opacity-90">1–17 September 2026 · 650 leads → 107 closing</p>
      </div>
      <div className="p-3.5">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-stone-400">
              <th className="pb-1 font-medium">Channel</th>
              <th className="pb-1 text-right font-medium">Leads</th>
              <th className="pb-1 text-right font-medium">Closing</th>
              <th className="pb-1 text-right font-medium">Conv.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ch} className="border-t border-stone-200/70">
                <td className="py-1.5 font-semibold">{r.ch}</td>
                <td className="py-1.5 text-right">{r.leads}</td>
                <td className="py-1.5 text-right">{r.close}</td>
                <td className="py-1.5 text-right font-semibold text-teal-700">{r.conv}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2.5 text-[12px] font-bold">📊 Analisis</p>
        <ul className="mt-1 space-y-1 text-[12px] leading-relaxed text-stone-600">
          <li>• Referral konversinya paling tinggi (26,8%) — kualitas prospek terbaik.</li>
          <li>• Instagram leads terbanyak tapi konversi terendah — perlu follow-up lebih cepat.</li>
          <li>• Total closing naik 14% vs periode yang sama bulan lalu.</li>
        </ul>
        <p className="mt-2.5 text-[12px] font-bold">💡 Rekomendasi</p>
        <ul className="mt-1 space-y-1 text-[12px] leading-relaxed text-stone-600">
          <li>• Gandakan program referral — insentif Rp150rb per closing.</li>
          <li>• Auto follow-up &lt; 1 jam untuk leads Instagram.</li>
        </ul>
        <button onClick={() => onAsk("Buatkan deck ringkasannya")} className="malika-gradient mt-3 w-full rounded-lg py-1.5 text-[12px] font-semibold text-white">
          Buatkan deck ringkasannya
        </button>
      </div>
    </div>
  );
}

function IgReport({ onAsk }: { onAsk: (t: string) => void }) {
  const stats = [
    { v: "48,2K", l: "Reach", up: "+18%" },
    { v: "3,1K", l: "Likes", up: "+9%" },
    { v: "765", l: "Comments", up: "+32%" },
    { v: "+860", l: "Follower baru", up: "+12%" },
  ];
  return (
    <div className="overflow-hidden rounded-2xl rounded-tl-md bg-[#f1f0ee]">
      <div className="malika-gradient px-3.5 py-2.5 text-white">
        <p className="text-[13px] font-bold">Performa Instagram</p>
        <p className="text-[11px] opacity-90">10–17 September 2026 · 9 postingan</p>
      </div>
      <div className="grid grid-cols-2 gap-1.5 p-3.5 pb-1">
        {stats.map((s) => (
          <div key={s.l} className="rounded-xl bg-white px-2.5 py-2 ring-1 ring-stone-200/70">
            <p className="text-[15px] font-bold">{s.v} <span className="text-[10px] font-semibold text-emerald-600">{s.up}</span></p>
            <p className="text-[11px] text-stone-500">{s.l}</p>
          </div>
        ))}
      </div>
      <div className="px-3.5 pb-3.5">
        <div className="mt-1 flex gap-2 rounded-xl bg-white p-2 ring-1 ring-stone-200/70">
          <img src="/ig-post.webp" alt="Top post" className="h-14 w-14 rounded-lg object-cover" />
          <div className="text-[12px]">
            <p className="font-bold">🏆 Top post: “Teman Saya Mecat 80%…”</p>
            <p className="text-stone-500">1,1K likes · 210 comments · 98 shares</p>
          </div>
        </div>
        <p className="mt-2.5 text-[12px] font-bold">💡 Insight & saran</p>
        <ul className="mt-1 space-y-1 text-[12px] leading-relaxed text-stone-600">
          <li>• Konten story-based perform 3× lipat vs promo hard-sell.</li>
          <li>• Jam posting terbaik: 12.00 & 19.30 WIB.</li>
        </ul>
        <button onClick={() => onAsk("Jadwalkan posting jam 12 siang")} className="malika-gradient mt-3 w-full rounded-lg py-1.5 text-[12px] font-semibold text-white">
          Jadwalkan posting jam 12 siang
        </button>
      </div>
    </div>
  );
}

function ExpiryReport({ onAsk }: { onAsk: (t: string) => void }) {
  const clients = [
    { n: "PT Maju Jaya", d: "24 Sep 2026", left: "7 hari", hot: true },
    { n: "CV Berkah Abadi", d: "29 Sep 2026", left: "12 hari", hot: true },
    { n: "PT Sinar Abadi", d: "3 Okt 2026", left: "16 hari", hot: false },
    { n: "Toko Laris Manis", d: "9 Okt 2026", left: "22 hari", hot: false },
  ];
  return (
    <div className="overflow-hidden rounded-2xl rounded-tl-md bg-[#f1f0ee]">
      <div className="malika-gradient px-3.5 py-2.5 text-white">
        <p className="text-[13px] font-bold">Klien Mendekati Expired</p>
        <p className="text-[11px] opacity-90">4 klien · 30 hari ke depan</p>
      </div>
      <div className="space-y-1.5 p-3.5">
        {clients.map((c) => (
          <div key={c.n} className="flex items-center gap-2 rounded-xl bg-white px-2.5 py-2 ring-1 ring-stone-200/70">
            <span className={`h-2 w-2 shrink-0 rounded-full ${c.hot ? "bg-red-500" : "bg-amber-400"}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold">{c.n}</p>
              <p className="text-[11px] text-stone-500">Expired {c.d} · {c.left} lagi</p>
            </div>
          </div>
        ))}
        <p className="pt-1 text-[12px] leading-relaxed text-stone-600">
          Mau saya kirim <strong>reminder perpanjangan langganan</strong> via WhatsApp ke semuanya?
        </p>
        <div className="flex gap-1.5">
          <button onClick={() => onAsk("Kirim reminder ke semua klien")} className="malika-gradient flex-1 rounded-lg py-1.5 text-[12px] font-semibold text-white">
            Kirim ke semua
          </button>
          <button onClick={() => onAsk("Nanti dulu")} className="flex-1 rounded-lg bg-white py-1.5 text-[12px] font-semibold text-stone-600 ring-1 ring-stone-200">
            Nanti dulu
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Simulator utama ---------- */
const COLOR_DOTS = ["#14b8a6", "#f59e0b", "#3b82f6", "#8b5cf6", "#f97316", "#2563eb", "#ec4899"];

export default function MalikaSimulator() {
  const [active, setActive] = useState<AgentKey>("kazhim");
  const [chats, setChats] = useState(INITIAL_CHATS);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState<Record<AgentKey, boolean>>({ kazhim: true, gilang: false, rahma: false });
  const [rightMode, setRightMode] = useState<"settings" | "running">("running");
  const [name, setName] = useState("Kazhim");
  const [title, setTitle] = useState("Project Manager");
  const [desc, setDesc] = useState("");
  const [search, setSearch] = useState("");
  const [typing, setTyping] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [steps, setSteps] = useState(INITIAL_STEPS);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Navigasi khusus mobile: daftar agent → chat utama → layar komputer (data + routines).
  // Desktop selalu tampil 3 kolom, jadi state ini hanya dipakai di bawah breakpoint md.
  const [mobileView, setMobileView] = useState<"list" | "chat" | "computer">("list");

  useEffect(() => {
    setName(AGENT_NAME[active]);
    setTitle(AGENT_STYLE[active].role);
    setRightMode(running[active] ? "running" : "settings");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    setRightMode(running[active] ? "running" : "settings");
  }, [running, active]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" });
  }, [chats, active, typing]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const order: AgentKey[] = ["kazhim", "gilang", "rahma"];
  const filtered = order.filter((k) =>
    (AGENT_NAME[k] + AGENT_STYLE[k].role).toLowerCase().includes(search.toLowerCase())
  );

  function pushMsg(key: AgentKey, msg: ChatMsg) {
    setChats((c) => ({ ...c, [key]: [...c[key], msg] }));
  }

  // Pilih agent dari daftar (mobile: sekaligus masuk ke halaman chat utama).
  function pickAgent(key: AgentKey) {
    setActive(key);
    setMobileView("chat");
  }

  function replyFor(key: AgentKey, text: string): { text?: string; report?: ChatMsg["report"] } {
    const l = text.toLowerCase();
    if (key === "kazhim") {
      if (l.includes("banding")) return { text: "Bulan lalu closing 94 dari 590 leads (15,9%). Bulan ini 107 dari 650 (16,5%) — naik tipis tapi stabil. Channel referral yang paling melonjak (+8 closing). Mau saya breakdown per sales juga?" };
      if (l.includes("deck")) return { text: "Deck ringkasan 6 slide sudah jadi — tabel growth, grafik tren, analisis & rekomendasi. File siap diunduh di panel kanan. Mau saya kirim ke email kamu juga?" };
      if (l.includes("growth") || l.includes("data") || l.includes("customer") || l.includes("update"))
        return { text: "Data terbaru sudah saya tarik ulang — total 650 leads, 107 closing. Detail tabel + analisis + rekomendasi ada di atas. Ada yang mau didalami per channel?", report: "growth" };
      if (l === "oke" || l === "ok") return { text: "Oke, saya standby. Butuh analisis tambahan, tinggal bilang saja." };
      return { text: "Siap! Saya kumpulkan datanya dari CRM + spreadsheet sales, lalu susun analisis dan rekomendasinya. Progresnya bisa dipantau di panel kanan." };
    }
    if (key === "gilang") {
      if (l.includes("jadwal") || l.includes("posting jam")) return { text: "Berhasil dijadwalkan! 3 konten antri jam 12.00 siang — publish hanya jalan setelah kamu approve di panel kanan. Mau saya siapkan caption-nya sekalian?" };
      if (l.includes("kompetitor") || l.includes("riset")) return { text: "Siap! Saya riset 5 kompetitor kopi — 120 postingan dianalisis. Tren terkuat: konten behind-the-bar + bundling. Ringkasan lengkap saya susun setelah selesai." };
      if (l.includes("performa") || l.includes("postingan") || l.includes("instagram") || l.includes("ig"))
        return { text: "Ringkasan 7 hari terakhir: reach 48,2K (+18%), 765 comments (+32%). Top post soal efisiensi karyawan. Detail + saran konten ada di kartu atas ya.", report: "ig" };
      if (l === "oke" || l === "ok") return { text: "Oke! Ada brief konten berikutnya?" };
      return { text: "Siap! Saya buka Instagram di komputer saya dan kerjakan — hasilnya saya rangkum di sini + layarnya bisa diintip live di kanan." };
    }
    if (l.includes("kirim") && l.includes("reminder")) return { text: "Reminder perpanjangan terkirim ke 4 klien via WhatsApp — PT Maju Jaya, CV Berkah Abadi, PT Sinar Abadi, Toko Laris Manis. Saya follow-up lagi H-3 sebelum expired masing-masing. ✅" };
    if (l.includes("nanti")) return { text: "Siap, saya tunda. Saya ingatkan lagi besok pagi ya biar tidak kelewat." };
    if (l.includes("bayar") || l.includes("pembayaran") || l.includes("rekap")) return { text: "Rekap minggu ini: 11 pembayaran masuk (total Rp38,4jt), 2 invoice menunggu (PT Maju Jaya & Toko Laris). Mau saya kirimkan invoice reminder-nya juga?" };
    if (l.includes("expired") || l.includes("klien") || l.includes("list") || l.includes("bulan depan"))
      return { text: "Sudah saya cek ulang — 4 klien expired ≤ 30 hari, paling dekat PT Maju Jaya (7 hari). Daftar lengkap + tombol kirim reminder ada di kartu atas.", report: "expiry" };
    if (l === "oke" || l === "ok") return { text: "Oke, saya standby 24/7. Ada klien yang perlu difollow-up?" };
    return { text: "Siap! Saya cek database langganan dan siapkan datanya — progresnya live di panel kanan ya." };
  }

  function handleSend(raw?: string) {
    const text = (raw ?? input).trim();
    if (!text || typing) return;
    const key = active;
    pushMsg(key, { id: `${Date.now()}`, from: "user", text, time: nowTime() });
    setInput("");
    setTyping(true);
    setRunning((r) => ({ ...r, [key]: true }));
    setSteps((s) => ({
      ...s,
      [key]: [
        { app: AGENT_NAME[key], text: `Mengerjakan: “${text.slice(0, 40)}”…`, time: nowTime(), done: true },
        ...s[key].slice(0, 2),
      ],
    }));
    setTimeout(() => {
      const r = replyFor(key, text);
      pushMsg(key, { id: `${Date.now()}-r`, from: "agent", text: r.text, time: nowTime() });
      if (r.report) pushMsg(key, { id: `${Date.now()}-rep`, from: "agent", time: nowTime(), report: r.report });
      setTyping(false);
    }, 1400);
  }

  function clearChat() {
    setChats((c) => ({ ...c, [active]: [] }));
    setToast("Percakapan dihapus");
  }

  const chat = chats[active];

  return (
    <div className="glass-strong overflow-hidden rounded-3xl">
      <div className="flex items-center gap-2 border-b border-white/60 bg-white/40 px-4 py-2.5">
        <span className="flex gap-1.5">
          <i className="block h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <i className="block h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <i className="block h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="mx-auto flex items-center gap-2 text-xs font-medium text-stone-500">
          <img src={LOGO} alt="Malika" className="h-4 w-4 rounded object-contain" />
          Malika Agent — simulasi interaktif
        </span>
        <span className="hidden items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-stone-500 ring-1 ring-white sm:flex">
          <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Live demo
        </span>
      </div>

      <div className="thin-scroll overflow-x-auto">
        <div className="flex h-[620px] sm:h-[660px] md:h-[680px] md:min-w-[1024px]">
          {/* KIRI — daftar agent. Mobile: halaman default, collapse via tombol kembali di chat. */}
          <aside
            className={`${
              mobileView === "list" ? "flex" : "hidden"
            } w-full shrink-0 flex-col border-white/60 bg-white/40 md:flex md:w-[262px] md:border-r`}
          >
            <div className="flex items-center gap-1.5 p-3">
              <div className="flex flex-1 items-center gap-2 rounded-lg bg-white/80 px-2.5 py-1.5 text-[13px] text-stone-500 ring-1 ring-white">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="w-full bg-transparent outline-none placeholder:text-stone-400" />
              </div>
              <button className="rounded-lg p-1.5 text-stone-500 hover:bg-white/70" title="Filter">◧</button>
              <button className="rounded-lg p-1.5 text-stone-500 hover:bg-white/70" title="Baru">＋</button>
            </div>

            <div className="thin-scroll flex-1 overflow-y-auto px-2 pb-2">
              <p className="px-2 pb-1 text-[11px] font-medium text-stone-400">Malika</p>
              {filtered.map((k) => (
                <button
                  key={k}
                  onClick={() => pickAgent(k)}
                  className={`mb-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${
                    active === k ? "bg-white/90 shadow-sm ring-1 ring-white" : "hover:bg-white/60"
                  }`}
                >
                  <Avatar k={k} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-stone-800">
                      {AGENT_NAME[k]}
                      {running[k] && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-700">running</span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-stone-500">{AGENT_STYLE[k].role}</span>
                  </span>
                </button>
              ))}
              {filtered.length === 0 && <p className="px-2 py-4 text-center text-xs text-stone-400">Tidak ketemu.</p>}
            </div>

            <div className="border-t border-white/60 p-2 text-[13px] text-stone-600">
              <button onClick={() => setToast("Integrations — segera hadir di demo")} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-white/70">
                <span>◍</span> Integrations
              </button>
              <button onClick={() => setActive("kazhim")} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-white/70">
                <Avatar k="kazhim" size={18} /> Joko
              </button>
            </div>
          </aside>

          {/* TENGAH — chat utama. Mobile: tampil setelah pilih agent. */}
          <main
            className={`${
              mobileView === "chat" ? "flex" : "hidden"
            } min-w-0 flex-1 flex-col bg-white/30 md:flex`}
          >
            <div className="relative flex items-center border-b border-white/60 px-3 py-2.5 sm:px-4">
              <button
                onClick={() => setMobileView("list")}
                aria-label="Kembali ke daftar agent"
                className="mr-1 rounded-md px-2 py-1.5 text-sm font-semibold text-stone-500 hover:bg-white/70 md:hidden"
              >
                ‹
              </button>
              <button
                onClick={() => setMobileView("list")}
                aria-label="Kembali ke daftar agent"
                title="Daftar agent"
                className="rounded-full hover:ring-2 hover:ring-teal-200 md:cursor-default md:hover:ring-0"
              >
                <Avatar k={active} size={22} />
              </button>
              <p className="absolute left-1/2 -translate-x-1/2 text-[13px] font-semibold">
                {AGENT_NAME[active]} <span className="font-normal text-stone-400">· {AGENT_STYLE[active].role}</span>
              </p>
              <div className="ml-auto flex items-center gap-1 text-stone-400">
                <button
                  onClick={() => setMobileView("computer")}
                  aria-label="Buka layar komputer agent"
                  title="Layar komputer"
                  className="rounded-md px-2 py-1.5 text-sm hover:bg-white/70 md:hidden"
                >
                  🖥️
                </button>
                <button className="hidden rounded-md p-1.5 hover:bg-white/70 md:block" title="History">◫</button>
                <button onClick={() => setRightMode(rightMode === "running" ? "settings" : "running")} className="hidden rounded-md p-1.5 hover:bg-white/70 md:block" title="Toggle panel">◐</button>
              </div>
            </div>

            <div ref={scrollRef} className="thin-scroll flex-1 space-y-2.5 overflow-y-auto px-3 py-5 sm:px-6">
              {chat.length === 0 && (
                <p className="mx-auto mt-20 max-w-[260px] text-center text-[13px] text-stone-400">
                  Percakapan dikosongkan. Ketik pesan di bawah untuk mulai simulasi baru.
                </p>
              )}
              {chat.map((m) =>
                m.report ? (
                  <div key={m.id} className="feed-in max-w-[360px]">
                    <div className="mb-1 ml-9 flex items-center gap-1.5">
                      <Avatar k={active} size={20} />
                    </div>
                    <div className="ml-9">
                      {m.report === "growth" && <GrowthReport onAsk={(t) => handleSend(t)} />}
                      {m.report === "ig" && <IgReport onAsk={(t) => handleSend(t)} />}
                      {m.report === "expiry" && <ExpiryReport onAsk={(t) => handleSend(t)} />}
                      <p className="mt-1 text-[10px] text-stone-400">{m.time}</p>
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                    {m.from === "agent" && (
                      <div className="mr-2 mt-1"><Avatar k={active} size={20} /></div>
                    )}
                    <div className={`feed-in max-w-[75%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                      m.from === "user" ? "rounded-br-md bg-[#efeeec] text-stone-800" : "rounded-tl-md bg-[#f1f0ee] text-stone-800"
                    }`}>
                      <p className="whitespace-pre-wrap">{m.text}</p>
                      <p className="mt-1 text-right text-[10px] text-stone-400">{m.time}</p>
                    </div>
                  </div>
                )
              )}
              {typing && (
                <div className="flex justify-start">
                  <div className="mr-2 mt-1"><Avatar k={active} size={20} /></div>
                  <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-[#f1f0ee] px-4 py-3">
                    <span className="live-dot h-1.5 w-1.5 rounded-full bg-stone-400" />
                    <span className="live-dot h-1.5 w-1.5 rounded-full bg-stone-400" style={{ animationDelay: "0.2s" }} />
                    <span className="live-dot h-1.5 w-1.5 rounded-full bg-stone-400" style={{ animationDelay: "0.4s" }} />
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-white/60 p-3">
              <div className="glass flex items-center gap-1 rounded-full px-2 py-1.5 focus-within:ring-2 focus-within:ring-teal-200">
                <button onClick={() => setToast("Lampiran — nonaktif di simulasi")} className="rounded-full p-1.5 text-lg leading-none text-stone-400 hover:bg-white/70">＋</button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder={`Message ${AGENT_NAME[active]}`}
                  className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-stone-400"
                />
                <button onClick={() => setToast("Voice — nonaktif di simulasi")} className="rounded-full p-1.5 text-stone-400 hover:bg-white/70">◉</button>
                <button onClick={() => handleSend()} className="malika-gradient flex h-7 w-7 items-center justify-center rounded-full text-white transition hover:opacity-90" aria-label="Kirim">↑</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 px-1">
                {SUGGESTIONS[active].map((s) => (
                  <button key={s} onClick={() => handleSend(s)} className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] text-stone-600 ring-1 ring-white hover:bg-white">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </main>

          {/* KANAN — layar komputer (data + routines). Mobile: halaman sendiri via tombol 🖥️. */}
          <aside
            className={`${
              mobileView === "computer" ? "flex" : "hidden"
            } w-full shrink-0 flex-col border-white/60 bg-white/40 md:flex md:w-[302px] md:border-l`}
          >
            {rightMode === "settings" ? (
              <div className="thin-scroll flex-1 overflow-y-auto">
                <div className="flex items-center px-3 py-2.5 sm:px-4">
                  <button
                    onClick={() => setMobileView("chat")}
                    aria-label="Kembali ke chat"
                    className="mr-1 rounded-md px-2 py-1.5 text-sm font-semibold text-stone-500 hover:bg-white/70 md:hidden"
                  >
                    ‹
                  </button>
                  <p className="text-[13px] font-medium text-stone-500">Settings</p>
                  <div className="ml-auto flex gap-1 text-stone-400">
                    <button onClick={() => setRightMode("running")} className="rounded-md p-1.5 hover:bg-white/70" title="Lihat layar">◫</button>
                    <button onClick={() => setMobileView("chat")} className="rounded-md p-1.5 hover:bg-white/70" title="Tutup" aria-label="Kembali ke chat">✕</button>
                  </div>
                </div>
                <div className="flex justify-center py-2">
                  <span className="relative overflow-hidden rounded-full bg-white ring-1 ring-stone-200">
                    <AgentBotIcon c1={AGENT_STYLE[active].c1} c2={AGENT_STYLE[active].c2} glow={AGENT_STYLE[active].glow} size={64} />
                    <span className="absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
                  </span>
                </div>
                <div className="space-y-3 px-4 pb-4">
                  <label className="block">
                    <span className="mb-1 block text-xs text-stone-500">Name</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-stone-200 bg-white/80 px-2.5 py-1.5 text-[13px] outline-none focus:border-teal-400" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-stone-500">Title</span>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-stone-200 bg-white/80 px-2.5 py-1.5 text-[13px] outline-none focus:border-teal-400" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-stone-500">Description</span>
                    <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className="w-full resize-none rounded-lg border border-stone-200 bg-white/80 px-2.5 py-1.5 text-[13px] outline-none focus:border-teal-400" />
                  </label>
                  <div>
                    <p className="mb-1.5 text-xs text-stone-500">Color</p>
                    <div className="flex gap-2">
                      {COLOR_DOTS.map((c) => (
                        <button key={c} onClick={() => setToast("Warna ikon tiap agent sudah dikunci sesuai template")} className="h-5 w-5 rounded-full transition hover:scale-110" style={{ background: c }} aria-label={c} />
                      ))}
                    </div>
                  </div>
                  <button onClick={() => setToast("Advanced — nonaktif di simulasi")} className="text-xs text-stone-500 hover:text-stone-800">Advanced</button>
                  <button onClick={() => setToast(`Agent ${name || "baru"} tersimpan`)} className="malika-gradient w-full rounded-lg py-2 text-[13px] font-semibold text-white transition hover:opacity-90">
                    Save
                  </button>
                  <div className="pt-1 text-[13px]">
                    <p className="mb-1 text-xs text-stone-500">Export</p>
                    <button onClick={() => setToast("Export — nonaktif di simulasi")} className="block py-0.5 text-stone-700 hover:underline">Export</button>
                    <button onClick={clearChat} className="block py-0.5 font-medium text-red-500 hover:underline">Clear conversation</button>
                  </div>
                  {running[active] && (
                    <button onClick={() => setRightMode("running")} className="w-full rounded-xl bg-amber-50/80 px-3 py-2 text-xs font-medium text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100">
                      ● Agent sedang running — intip layarnya →
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="thin-scroll flex flex-1 flex-col overflow-y-auto">
                <div className="flex items-center px-3 py-2.5 sm:px-4">
                  <button
                    onClick={() => setMobileView("chat")}
                    aria-label="Kembali ke chat"
                    className="mr-1 rounded-md px-2 py-1.5 text-sm font-semibold text-stone-500 hover:bg-white/70 md:hidden"
                  >
                    ‹
                  </button>
                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-stone-500">
                    <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" /> running
                  </p>
                  <div className="ml-auto flex gap-1 text-stone-400">
                    <button onClick={() => setRightMode("settings")} className="rounded-md p-1.5 hover:bg-white/70" title="Settings">⚙</button>
                    <button onClick={() => setMobileView("chat")} className="rounded-md p-1.5 hover:bg-white/70" title="Tutup" aria-label="Kembali ke chat">✕</button>
                  </div>
                </div>
                <div className="px-3">
                  {active === "gilang" ? (
                    <div className="overflow-hidden rounded-xl ring-1 ring-stone-200">
                      <div className="flex items-center gap-1.5 bg-[#eef2ff] px-2.5 py-1.5">
                        <span className="flex gap-1">
                          <i className="block h-2 w-2 rounded-full bg-stone-300" />
                          <i className="block h-2 w-2 rounded-full bg-stone-300" />
                        </span>
                        <span className="mx-auto flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[10px] text-stone-500 ring-1 ring-stone-200">
                          <span className="text-pink-500">◍</span> instagram.com
                        </span>
                        <span className="w-6" />
                      </div>
                      <img src="/ig-post.webp" alt="Instagram — performa postingan" className="w-full object-cover" />
                    </div>
                  ) : active === "kazhim" ? (
                    <div className="overflow-hidden rounded-xl bg-white/80 ring-1 ring-white">
                      <div className="flex items-center gap-1.5 border-b border-stone-100 px-2.5 py-1.5">
                        <span className="flex gap-1">
                          <i className="block h-2 w-2 rounded-full bg-stone-300" />
                          <i className="block h-2 w-2 rounded-full bg-stone-300" />
                        </span>
                        <span className="mx-auto rounded-md bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500">crm.malika.ai</span>
                        <span className="w-6" />
                      </div>
                      <div className="p-2.5">
                        <div className="flex gap-1.5">
                          {[["650", "Leads"], ["107", "Closing"], ["16,5%", "Conv."]].map(([v, l]) => (
                            <div key={l} className="flex-1 rounded-lg bg-gradient-to-br from-lime-50 via-teal-50 to-sky-50 p-1.5 text-center ring-1 ring-stone-100">
                              <p className="text-[13px] font-bold">{v}</p>
                              <p className="text-[9px] text-stone-500">{l}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 flex h-20 items-end gap-1.5 rounded-lg bg-stone-50 p-2 ring-1 ring-stone-100">
                          {[35, 55, 42, 70, 58, 85, 64, 92, 74, 100, 82, 95].map((h, i) => (
                            <div key={i} className="malika-gradient flex-1 rounded-sm opacity-80" style={{ height: `${h}%` }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl bg-white/80 ring-1 ring-white">
                      <div className="flex items-center gap-1.5 border-b border-stone-100 px-2.5 py-1.5">
                        <span className="flex gap-1">
                          <i className="block h-2 w-2 rounded-full bg-stone-300" />
                          <i className="block h-2 w-2 rounded-full bg-stone-300" />
                        </span>
                        <span className="mx-auto rounded-md bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500">billing.malika.ai</span>
                        <span className="w-6" />
                      </div>
                      <div className="space-y-1.5 p-2.5">
                        {[["PT Maju Jaya", "7 hari", true], ["CV Berkah Abadi", "12 hari", true], ["PT Sinar Abadi", "16 hari", false]].map(([n, l, hot]) => (
                          <div key={n as string} className="flex items-center gap-2 rounded-lg bg-stone-50 px-2 py-1.5 text-[11px] ring-1 ring-stone-100">
                            <span className={`h-1.5 w-1.5 rounded-full ${hot ? "bg-red-500" : "bg-amber-400"}`} />
                            <span className="font-medium">{n}</span>
                            <span className="ml-auto text-stone-500">{l}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-stone-500">{AGENT_NAME[active]}&apos;s screen</p>
                  <div className="mt-2 space-y-1.5">
                    {steps[active].map((s, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-[11px] ring-1 ring-white">
                        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${s.done ? "bg-emerald-500" : "live-dot bg-amber-400"}`} />
                        <span>
                          <span className="font-medium text-stone-700">{s.app} · </span>
                          <span className="text-stone-500">{s.text}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-3 border-t border-white/60 px-4 py-3">
                  <div className="flex items-center">
                    <p className="text-[13px] font-medium text-stone-600">Routines · 24 jam nonstop</p>
                    <button onClick={() => setToast("Tambah routine — nonaktif di simulasi")} className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-white/70 text-sm text-stone-500 ring-1 ring-white hover:bg-white">＋</button>
                  </div>
                  <div className="thin-scroll mt-2 max-h-[168px] space-y-1 overflow-y-auto pr-0.5">
                    {ROUTINES[active].map(([t, label]) => (
                      <div key={t} className="flex items-center gap-2 rounded-lg bg-white/70 px-2 py-1 text-[11px] ring-1 ring-white">
                        <span className="malika-gradient rounded-md px-1.5 py-0.5 font-bold text-white">{t}</span>
                        <span className="text-stone-600">{label}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => { setRunning((r) => ({ ...r, [active]: false })); setToast("Running dihentikan"); }}
                    className="mt-2 w-full rounded-lg bg-stone-900 py-1.5 text-xs font-medium text-white hover:bg-stone-700"
                  >
                    Stop running
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>

      {toast && (
        <div className="feed-in fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-stone-900 px-4 py-2 text-[13px] text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
