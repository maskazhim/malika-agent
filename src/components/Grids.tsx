const KARYAWAN_CARDS = [
  { src: "/karyawan-1.png", alt: "01 — Instruksi kayak chat ke manusia" },
  { src: "/karyawan-2.png", alt: "02 — Tambah agent, semudah klik tombol" },
  { src: "/karyawan-3.png", alt: "03 — Kerja sendiri sesuai jadwal" },
  { src: "/karyawan-4.png", alt: "04 — Punya komputer dan browser sendiri" },
  { src: "/karyawan-5.png", alt: "05 — Otak yang bisa disetel per agent" },
  { src: "/karyawan-6.png", alt: "06 — Pakai langganan yang sudah kamu punya" },
];

const PEKERJAAN_CARDS = [
  { src: "/pekerjaan-1a.png", alt: "Rekrutmen — screening CV otomatis via JobStreet" },
  { src: "/pekerjaan-2a.png", alt: "Keuangan — laporan laba-rugi via Jurnal.id" },
  { src: "/pekerjaan-3a.png", alt: "Riset & Posting Sosmed via Instagram" },
  { src: "/pekerjaan-4a.png", alt: "Prospecting B2B via LinkedIn" },
  { src: "/pekerjaan-5a.png", alt: "Riset Lokasi & Bisnis via Google Maps" },
  { src: "/pekerjaan-6a.png", alt: "Akuntansi Accurate" },
];

export function UspGrid() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
        Kerja kayak karyawan. <span className="malika-gradient-text">Tanpa ribet ngatur.</span>
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-stone-600 sm:text-base">
        Enam alasan Malika Agent berasa kayak nambah karyawan, bukan nambah software.
      </p>
      <div className="group mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {KARYAWAN_CARDS.map((c) => (
          <div
            key={c.src}
            className="relative overflow-hidden rounded-2xl transition-all duration-300 group-hover:blur-[3px] group-hover:brightness-90 hover:z-10 hover:scale-[1.04] hover:shadow-xl hover:!blur-none hover:!brightness-100"
          >
            <img src={c.src} alt={c.alt} loading="lazy" className="h-auto w-full scale-[1.05] object-cover" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function UseCaseGrid() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
        Beri setiap agent <span className="malika-gradient-text">pekerjaan.</span>
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-stone-600 sm:text-base">
        Contoh pekerjaan nyata yang sudah disesuaikan dengan tools yang dipakai SMB Indonesia.
      </p>
      <div className="group mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {PEKERJAAN_CARDS.map((c) => (
          <div
            key={c.src}
            className="relative overflow-hidden rounded-2xl transition-all duration-300 group-hover:blur-[3px] group-hover:brightness-90 hover:z-10 hover:scale-[1.04] hover:shadow-xl hover:!blur-none hover:!brightness-100"
          >
            <img src={c.src} alt={c.alt} loading="lazy" className="h-auto w-full scale-[1.05] object-cover" />
          </div>
        ))}
      </div>
    </section>
  );
}
