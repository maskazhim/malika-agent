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
          <span className="malika-gradient-text">LAYAKNYA MANUSIA.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-stone-600 sm:text-lg">
          AI Agent yang kerjain kerjaan manusia, tanpa drama. Seperti punya karyawan
          digital yang nggak pernah tidur, nggak perlu dipantengin.
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
          { icon: "📋", t: "Ganti karyawan, bukan ganti sistem", d: "Malika Agent screening 40 CV tiap pagi, tolak yang gak cocok, undang yang lolos interview — sebelum kamu buka laptop." },
          { icon: "🌙", t: "Kerja walau kamu lagi tidur (tanpa diminta)", d: "Jam 3 pagi agent udah rekonsiliasi mutasi bank sendiri, tanpa disuruh. Jam 8 pagi laporannya nunggu di chat — kamu tinggal baca." },
          { icon: "🎯", t: "Bisa Prospecting sampai closing", d: "Agent cari 50 calon klien di LinkedIn, petakan decision maker-nya, tulis pesan personal ke tiap orang — kamu tinggal klik approve, kirim, dan tunggu balasan." },
        ].map((s) => (
          <div key={s.t} className="glass rounded-2xl p-5 text-left transition hover:-translate-y-0.5">
            <span className="malika-gradient flex h-7 w-7 items-center justify-center rounded-full text-sm text-white">
              {s.icon}
            </span>
            <p className="mt-3 text-sm font-semibold">{s.t}</p>
            <p className="mt-1 text-sm text-stone-600">{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
