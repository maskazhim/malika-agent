export default function Hero() {
  return (
    <section id="top" className="mx-auto max-w-6xl px-4 pt-32 pb-10 sm:px-6 sm:pt-40">
      <div className="mx-auto max-w-3xl text-center">
        <p className="glass mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-stone-600">
          <span className="live-dot inline-block h-2 w-2 rounded-full bg-green-500" />
          Agent sedang bekerja 24/7 — bahkan saat kamu tidur
        </p>
        <h1 className="text-4xl font-semibold leading-[1.15] tracking-tight text-stone-950 sm:text-6xl">
          AI AGENT YANG BEKERJA
          <br />
          <span className="malika-gradient-text">SEPERTI MANUSIA.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-stone-600 sm:text-lg">
          Kasih instruksi sekali — agent yang buka aplikasi, klik, ketik, dan selesaikan
          kerjaan sampai beres. Seperti punya karyawan digital yang nggak pernah tidur,
          nggak perlu dipantengin.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <a
            href="#demo"
            className="malika-gradient rounded-full px-7 py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            Eksplor Demo Interaktif ↓
          </a>
          <a
            href="#harga"
            className="glass rounded-full px-7 py-3 text-sm font-semibold hover:bg-white/80"
          >
            Lihat Paket Harga
          </a>
        </div>
        <p className="mt-4 text-xs text-stone-500">
          Tanpa login · semua di bawah ini simulasi interaktif
        </p>
      </div>

      <div id="cara-kerja" className="mx-auto mt-12 grid max-w-4xl gap-3 sm:grid-cols-3">
        {[
          { n: "1", t: "Buat agent & beri pekerjaan", d: "Bikin agent mis. “Kazhim” sebagai Project Manager, kasih tugas pakai bahasa sehari-hari." },
          { n: "2", t: "Install skill & atur rutinitas", d: "Pasang skill biar langsung ahli, lalu jadwalkan mis. tiap pagi kumpulin data growth." },
          { n: "3", t: "Agent bekerja 24/7 di server", d: "Laptop kamu boleh mati — agent tetap kerja di server 24/7, klik & ketik sendiri sampai beres." },
        ].map((s) => (
          <div key={s.n} className="glass rounded-2xl p-5 text-left transition hover:-translate-y-0.5">
            <span className="malika-gradient flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white">
              {s.n}
            </span>
            <p className="mt-3 text-sm font-semibold">{s.t}</p>
            <p className="mt-1 text-sm text-stone-600">{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
