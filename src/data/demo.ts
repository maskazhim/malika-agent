export type AgentId = "rekrutmen" | "finance" | "sosmed" | "sales";

export interface ChatMsg {
  role: "user" | "agent";
  text: string;
  time: string;
}

export interface ComputerStep {
  app: string;
  appColor: string;
  action: string;
  detail: string;
  time: string;
  status: "done" | "active" | "queued";
}

export interface Routine {
  title: string;
  schedule: string;
  lastRun: string;
  status: "Aktif" | "Jeda";
}

export interface AgentDemo {
  id: AgentId;
  name: string;
  job: string;
  avatar: string;
  status: "working" | "idle";
  statusText: string;
  model: string;
  skill: string;
  chat: ChatMsg[];
  computer: ComputerStep[];
  routines: Routine[];
}

export const AGENTS: AgentDemo[] = [
  {
    id: "rekrutmen",
    name: "Talent Scout",
    job: "Rekrutmen · JobStreet",
    avatar: "TS",
    status: "working",
    statusText: "Working — screening 24 CV baru",
    model: "Claude Sonnet 4.5",
    skill: "Ahli Rekrutmen JobStreet v2.3",
    chat: [
      {
        role: "user",
        text: "Setiap jam 8 pagi, screening pelamar barista baru di JobStreet. Yang pengalamannya < 1 tahun langsung tolak halus.",
        time: "07:58",
      },
      {
        role: "agent",
        text: "Siap! Rutinitas 08:00 aktif. Saya akan buka JobStreet, tarik 24 pelamar baru, nilai pengalaman & domisili, lalu kirim pesan penolakan halus + undangan interview untuk yang lolos.",
        time: "07:59",
      },
      {
        role: "agent",
        text: "Selesai screening pagi ini: 24 CV → 6 lolos interview, 18 ditolak halus. Ringkasan + link CV sudah saya susun di bawah. Mau saya jadwalkan interview-nya?",
        time: "08:14",
      },
    ],
    computer: [
      {
        app: "JobStreet",
        appColor: "bg-blue-600",
        action: "Membuka dashboard employer JobStreet…",
        detail: "Login tersimpan · sesi aman · cabang Jakarta Selatan",
        time: "08:00",
        status: "done",
      },
      {
        app: "JobStreet",
        appColor: "bg-blue-600",
        action: "Menarik 24 pelamar baru posisi Barista",
        detail: "Filter: 7 hari terakhir · full-time · Jakarta",
        time: "08:03",
        status: "done",
      },
      {
        app: "Talent Scout",
        appColor: "bg-stone-900",
        action: "Menilai 24 CV satu per satu",
        detail: "Pengalaman, domisili, ketersediaan shift — 6 lolos",
        time: "08:09",
        status: "done",
      },
      {
        app: "JobStreet",
        appColor: "bg-blue-600",
        action: "Mengirim 18 pesan penolakan halus",
        detail: "Template sopan BI + ajakan melamar posisi lain",
        time: "08:12",
        status: "active",
      },
      {
        app: "WhatsApp",
        appColor: "bg-green-600",
        action: "Menunggu approval: kirim undangan interview",
        detail: "6 kandidat · butuh 1 klik approve dari kamu",
        time: "08:14",
        status: "queued",
      },
    ],
    routines: [
      {
        title: "Screening pelamar baru",
        schedule: "Setiap hari · 08:00 WIB",
        lastRun: "Hari ini 08:14 · sukses",
        status: "Aktif",
      },
      {
        title: "Follow-up kandidat tahap interview",
        schedule: "Senin–Jumat · 16:00 WIB",
        lastRun: "Kemarin 16:02 · sukses",
        status: "Aktif",
      },
    ],
  },
  {
    id: "finance",
    name: "Finance Bot",
    job: "Keuangan · Jurnal.id",
    avatar: "FB",
    status: "working",
    statusText: "Working — rekonsiliasi 132 transaksi",
    model: "GPT-5.2 · mode hemat",
    skill: "Ahli Pembukuan Jurnal.id v1.8",
    chat: [
      {
        role: "user",
        text: "Tolong input semua struk QRIS minggu ini ke Jurnal.id dan cocokkan dengan mutasi bank.",
        time: "09:02",
      },
      {
        role: "agent",
        text: "Baik, saya tarik 132 transaksi QRIS + mutasi BCA minggu ini. Saya input ke Jurnal.id lalu rekonsiliasi satu per satu.",
        time: "09:03",
      },
      {
        role: "agent",
        text: "Rekonsiliasi selesai: 129 cocok otomatis, 3 selisih nominal (total Rp47.500) saya tandai untuk review kamu. Laporan siap diunduh.",
        time: "09:21",
      },
    ],
    computer: [
      {
        app: "Jurnal.id",
        appColor: "bg-teal-600",
        action: "Membuka Jurnal.id perusahaan…",
        detail: "PT Kopi Nusantara · periode September 2026",
        time: "09:04",
        status: "done",
      },
      {
        app: "BCA",
        appColor: "bg-sky-700",
        action: "Mengunduh mutasi rekening 7 hari",
        detail: "132 transaksi masuk terdeteksi",
        time: "09:08",
        status: "done",
      },
      {
        app: "Jurnal.id",
        appColor: "bg-teal-600",
        action: "Input 132 transaksi ke jurnal",
        detail: "Kategori otomatis: penjualan, supplier, operasional",
        time: "09:15",
        status: "done",
      },
      {
        app: "Finance Bot",
        appColor: "bg-stone-900",
        action: "Mencocokkan nominal satu per satu",
        detail: "129 cocok · 3 selisih ditandai kuning",
        time: "09:20",
        status: "active",
      },
      {
        app: "Jurnal.id",
        appColor: "bg-teal-600",
        action: "Menunggu review: 3 selisih nominal",
        detail: "Klik untuk lihat bukti struk vs mutasi",
        time: "09:21",
        status: "queued",
      },
    ],
    routines: [
      {
        title: "Rekonsiliasi harian QRIS",
        schedule: "Setiap hari · 09:00 WIB",
        lastRun: "Hari ini 09:21 · sukses",
        status: "Aktif",
      },
      {
        title: "Laporan laba-rugi mingguan",
        schedule: "Senin · 07:00 WIB",
        lastRun: "Senin 07:05 · sukses",
        status: "Aktif",
      },
    ],
  },
  {
    id: "sosmed",
    name: "Social Ace",
    job: "Sosial Media · Instagram",
    avatar: "SA",
    status: "idle",
    statusText: "Idle — posting terjadwal jam 12:00",
    model: "Grok 4.1",
    skill: "Ahli Riset & Posting Instagram v3.0",
    chat: [
      {
        role: "user",
        text: "Riset 5 kompetitor kopi di Instagram, lalu buatkan 3 ide konten promo kemerdekaan + jadwalkan posting jam 12 siang.",
        time: "10:15",
      },
      {
        role: "agent",
        text: "Riset selesai! Tren: konten behind-the-bar + bundling merah-putih. Saya buatkan 3 draf caption + visual, sudah terjadwal jam 12:00. Draf menunggu approve kamu.",
        time: "10:42",
      },
    ],
    computer: [
      {
        app: "Instagram",
        appColor: "bg-pink-600",
        action: "Riset 5 akun kompetitor kopi",
        detail: "@kopiA … @kopiE · 120 postingan dianalisis",
        time: "10:16",
        status: "done",
      },
      {
        app: "Social Ace",
        appColor: "bg-stone-900",
        action: "Menyusun 3 ide konten + caption",
        detail: "Tone santai, Bahasa Indonesia, CTA ke WhatsApp",
        time: "10:30",
        status: "done",
      },
      {
        app: "Instagram",
        appColor: "bg-pink-600",
        action: "Menjadwalkan posting jam 12:00",
        detail: "Carousel 3 slide · hashtag lokal Jakarta",
        time: "10:40",
        status: "active",
      },
      {
        app: "Instagram",
        appColor: "bg-pink-600",
        action: "Menunggu approval sebelum publish",
        detail: "Aksi publik butuh 1 klik approve — aman",
        time: "10:42",
        status: "queued",
      },
    ],
    routines: [
      {
        title: "Posting konten harian",
        schedule: "Setiap hari · 12:00 WIB",
        lastRun: "Kemarin 12:00 · sukses",
        status: "Aktif",
      },
      {
        title: "Riset tren kompetitor",
        schedule: "Jumat · 10:00 WIB",
        lastRun: "Jumat 10:20 · sukses",
        status: "Aktif",
      },
    ],
  },
  {
    id: "sales",
    name: "Prospector",
    job: "Sales B2B · LinkedIn + Maps",
    avatar: "PR",
    status: "working",
    statusText: "Working — 40 prospek kafe baru",
    model: "Claude Opus 4.1",
    skill: "Ahli Prospecting LinkedIn & Maps v2.1",
    chat: [
      {
        role: "user",
        text: "Cari 40 prospek kafe baru di Bandung lewat Google Maps + LinkedIn owner-nya. Kirim draf pesan kenalan, jangan kirim sebelum saya approve.",
        time: "11:00",
      },
      {
        role: "agent",
        text: "Mengerti — mode aman: saya hanya riset + buat draf, tidak kirim sebelum approve. Mulai dari Google Maps radius 10 km, lalu cari owner di LinkedIn.",
        time: "11:01",
      },
      {
        role: "agent",
        text: "Dapat 40 prospek (32 ada owner LinkedIn). 40 draf pesan personal sudah jadi — menyebut nama kafe + menu andalan mereka. Silakan review sebelum kirim.",
        time: "11:38",
      },
    ],
    computer: [
      {
        app: "Google Maps",
        appColor: "bg-emerald-600",
        action: "Scanning kafe baru di Bandung…",
        detail: "Radius 10 km · rating 4.0+ · buka < 1 tahun",
        time: "11:05",
        status: "done",
      },
      {
        app: "LinkedIn",
        appColor: "bg-blue-800",
        action: "Mencari owner dari 40 kafe",
        detail: "32 owner ketemu · 8 tanpa profil publik",
        time: "11:22",
        status: "done",
      },
      {
        app: "Prospector",
        appColor: "bg-stone-900",
        action: "Menulis 40 draf pesan personal",
        detail: "Bahasa Indonesia sopan · tanpa spam",
        time: "11:35",
        status: "active",
      },
      {
        app: "LinkedIn",
        appColor: "bg-blue-800",
        action: "Menunggu approval pengiriman",
        detail: "0 terkirim · 40 draf siap review",
        time: "11:38",
        status: "queued",
      },
    ],
    routines: [
      {
        title: "Riset prospek mingguan",
        schedule: "Senin · 09:00 WIB",
        lastRun: "Senin 09:40 · sukses",
        status: "Aktif",
      },
      {
        title: "Follow-up prospek hangat",
        schedule: "Rabu · 14:00 WIB",
        lastRun: "— · belum jalan",
        status: "Jeda",
      },
    ],
  },
];

export interface ShowcaseVideo {
  id: string;
  youtubeId: string;
  title: string;
  desc: string;
  badge: string;
  duration: string;
}

export const SHOWCASE_VIDEOS: ShowcaseVideo[] = [
  {
    id: "content-researcher",
    youtubeId: "CMWUcbHz8aI",
    title: "Content Researcher — Malika Agent",
    desc: "Lihat gimana Malika Agent riset konten secara otomatis: dari riset topik sampai jadi bahan konten siap pakai.",
    badge: "Riset Konten",
    duration: "YouTube",
  },
];

export const USP = [
  {
    title: "Instruksi kayak chat ke manusia",
    desc: "Nggak perlu prompt rumit atau alur teknis. Tulis \u201ctolong screening CV yang masuk hari ini\u201d, agent langsung jalan.",
  },
  {
    title: "Nambah agent, semudah klik tombol",
    desc: "Butuh tenaga baru? Kasih nama, kasih tugas. Nggak ada setup teknis, nggak ada coding.",
  },
  {
    title: "Kerja sendiri sesuai jadwal",
    desc: "Atur jadwal sekali, jalan tiap hari di server. Kamu nggak perlu minta, agent kerjain sesuai jadwal.",
  },
  {
    title: "Punya komputer dan browser sendiri",
    desc: "Hampir semua kerjaan kita sekarang lewat browser. Agent pakai browser yang sama, jadi bisa kerjakan apa pun yang bisa dikerjakan manusia. Nggak butuh integrasi khusus. Laptop-mu nggak perlu nyala.",
  },
  {
    title: "Otak yang bisa disetel per agent",
    desc: "Bisa pakai model paling pintar untuk kerjaan rumit. Bisa pakai model hemat untuk kerjaan remeh tapi banyak. Tagihan tetap terkendali.",
  },
  {
    title: "Pakai langganan yang sudah kamu punya",
    desc: "Sambungkan ChatGPT, Claude, atau Grok yang sudah kamu bayar. Nggak bayar dobel.",
  },
];

export const USE_CASES = [
  {
    title: "Rekrutmen",
    tool: "JobStreet",
    color: "bg-blue-600",
    desc: "Screening CV, tolak halus yang tak cocok, undang interview yang lolos — tiap pagi otomatis.",
  },
  {
    title: "Keuangan",
    tool: "Jurnal.id",
    color: "bg-teal-600",
    desc: "Input struk, rekonsiliasi mutasi, susun laporan laba-rugi mingguan tanpa buka spreadsheet.",
  },
  {
    title: "Riset & Posting Sosmed",
    tool: "Instagram",
    color: "bg-pink-600",
    desc: "Pantau kompetitor, tulis caption, jadwalkan posting. Publish hanya setelah kamu approve.",
  },
  {
    title: "Prospecting B2B",
    tool: "LinkedIn",
    color: "bg-blue-800",
    desc: "Cari prospek, petakan decision-maker, tulis pesan personal. Kirim setelah review.",
  },
  {
    title: "Riset Lokasi & Bisnis",
    tool: "Google Maps",
    color: "bg-emerald-600",
    desc: "Petakan kompetitor & calon pelanggan per area — lengkap dengan rating dan jam buka.",
  },
  {
    title: "Akuntansi Accurate",
    tool: "Accurate",
    color: "bg-teal-700",
    desc: "Input data, update data, cek data, dan bikin laporan langsung dari Accurate — tanpa buka aplikasinya.",
  },
];

export const PRICING = [
  {
    name: "Starter",
    price: "Rp1.799.000",
    period: "/bulan",
    desc: "Setara 2 karyawan kerja 24/7 — cuma ¼ UMR Jakarta.",
    features: [
      "1 user",
      "2 komputer AI aktif 24 jam",
      "Koneksi internet 2 komputer AI 30 hari",
      "Jalankan berbagai pekerjaan rutin secara otomatis",
      "Akses model AI pilihan Malika",
      "Pilih model AI Anda sendiri (Grok, GPT, Claude)",
      "Integrasi MCP",
      "Support Standard",
    ],
    cta: "Pilih Starter",
    popular: false,
  },
  {
    name: "Growth",
    price: "Rp4.599.000",
    period: "/bulan",
    desc: "Setara 6 karyawan manusia bekerja 24/7 nonstop — cuma ¼ UMR Jakarta.",
    features: [
      "Kuota penggunaan AI 3× lebih besar dari Starter",
      "3 user",
      "6 komputer AI aktif 24 jam",
      "Koneksi internet 6 komputer AI 30 hari",
      "Jalankan berbagai pekerjaan rutin secara otomatis",
      "Akses model AI pilihan Malika",
      "Pilih model AI Anda sendiri (Grok, GPT, Claude)",
      "Integrasi MCP",
      "Support Prioritas",
    ],
    cta: "Pilih Growth",
    popular: true,
  },
  {
    name: "Scale",
    price: "Rp10.999.000",
    period: "/bulan",
    desc: "Setara 12 karyawan manusia bekerja 24/7 nonstop — cuma ¼ UMR Jakarta.",
    features: [
      "Kuota penggunaan AI 9× lebih besar dari Starter",
      "6 user",
      "12 komputer AI aktif 24 jam",
      "Koneksi internet 12 komputer AI 30 hari",
      "Jalankan berbagai pekerjaan rutin secara otomatis",
      "Gunakan model AI pilihan Malika",
      "Pilih model AI Anda sendiri (Grok, GPT, Claude)",
      "Integrasi MCP",
      "Integrasi khusus sesuai dengan kebutuhan bisnis Anda",
      "Pendamping khusus untuk bisnis Anda",
    ],
    cta: "Pilih Scale",
    popular: false,
  },
];

export const FAQS = [
  {
    q: "Agent ini sebenarnya bisa kerja apa saja? Ada batasannya?",
    a: "Selama pekerjaannya bisa dilakukan manusia lewat browser (buka web, login, klik, isi form, baca data, buat laporan), agent bisa mengerjakannya. Yang belum bisa: tugas yang butuh verifikasi fisik, CAPTCHA berat, aplikasi desktop yang tidak berbasis web, dll.",
  },
  {
    q: "Bagaimana cara memberi tugas? Apakah harus pakai perintah khusus?",
    a: "Cukup tulis seperti chat ke karyawan: \u201cTolong screening CV yang masuk hari ini\u201d. Tidak perlu format khusus atau kode. Jika pekerjaan kompleks, bisa berikan SOP / buat skill, lalu AI akan mengerjakannya dengan cepat.",
  },
  {
    q: "Berapa lama setup awal sampai agent bisa mulai kerja?",
    a: "Setup akun Malika Agent memakan waktu 1-3 hari kerja termasuk onboarding. Setiap klien mendapatkan server masing-masing, sehingga data tidak tercampur dengan data klien lain.",
  },
  {
    q: "Bagaimana cara menambah agent baru?",
    a: "Semudah klik tombol buat agent baru. Beri nama dan peran, lalu beri tugas. Tidak perlu setup teknis.",
  },
  {
    q: "Bagaimana kalau agent salah mengerjakan sesuatu?",
    a: "Aksi sensitif (kirim pesan, posting, transaksi) bisa diatur untuk meminta approval kamu dulu. Semua aktivitas tercatat, jadi kamu bisa cek dan koreksi.",
  },
  {
    q: "Bisa dipantau saat agent bekerja?",
    a: "Bisa. Kamu bisa buka live activity feed dan intip layar komputer agent kapan saja.",
  },
  {
    q: "Data bisnis saya disimpan di mana? Dipakai untuk melatih AI?",
    a: "Data bisnis disimpan di server yang berada di Indonesia. Masing-masing klien mendapatkan server sendiri, sehingga data tidak tercampur. Data tidak digunakan untuk melatih AI jika menggunakan model pilihan Malika. Jika menggunakan langganan sendiri (GPT, Claude, Grok), berlaku ketentuan masing-masing. Jika memakai model gratis, data bisa saja dipakai untuk melatih AI.",
  },
  {
    q: "Kalau agent butuh kode OTP / verifikasi 2 langkah, bagaimana?",
    a: "Kamu bisa takeover / mengendalikan komputer AI Agent untuk menyelesaikan verifikasi — baik CAPTCHA, OTP, atau 2FA. Setelahnya, serahkan lagi akses komputer ke agent.",
  },
  {
    q: "Apa yang dimaksud \u201ckomputer aktif\u201d dan \u201ckuota\u201d?",
    a: "Setiap paket punya spesifikasi server tersendiri. Komputer aktif adalah batas komputer yang bisa dipakai bersamaan — lebih dari itu server bisa crash atau error. Malika membatasi via sistem agar kamu tidak membuat komputer melebihi langganan. Satu komputer bisa dipakai beberapa agent secara bergantian.",
  },
  {
    q: "Apa yang terjadi kalau kuota habis?",
    a: "Agent akan berhenti bekerja jika kuota habis. Akan ada keterangan jika kuota sudah habis.",
  },
  {
    q: "Apakah ada kontrak? Bisa berhenti kapan saja? Ada trial atau garansi?",
    a: "Langganan Malika bisa bulanan, 6 bulan, dan 1 tahun sekaligus.",
  },
  {
    q: "Apakah ada biaya di luar paket (biaya model AI, setup)?",
    a: "Biaya di luar paket adalah: kelebihan kredit AI yang dibutuhkan, custom integrasi jika diperlukan, jasa setup AI Agent jika diperlukan, dan langganan MCP Composio jika digunakan.",
  },
  {
    q: "Apa itu Composio MCP?",
    a: "Ini penghubung yang memungkinkan agent terkoneksi ke ratusan aplikasi (Gmail, Google Sheets, Slack, dll.) selain lewat browser.",
  },
  {
    q: "Bisa dipakai untuk aplikasi/website internal saya?",
    a: "Bisa. Malika Agent punya komputer dan browsernya sendiri, jadi bisa melakukan aktivitas apa pun yang memerlukan komputer dan browser — termasuk website atau aplikasi internal kamu.",
  },
  {
    q: "Apakah bisa terhubung ke WhatsApp atau CRM saya?",
    a: "Bisa, Malika bisa dihubungkan ke aplikasi eksternal melalui API atau MCP.",
  },
];
