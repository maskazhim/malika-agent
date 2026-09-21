"use client";

import MalikaSimulator from "@/components/MalikaSimulator";

export default function InteractiveDemo() {
  return (
    <section id="demo" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-12 sm:px-6">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">
          Preview dashboard · bukan AI beneran, cuma simulasi
        </p>
        <h2 className="mx-auto mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Intip dulu tampilannya.
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-stone-600 sm:text-base">
          Biar kebayang gimana rasanya kasih tugas ke agent dan lihat dia kerja, kita bikin
          simulasi dengan skenario siap pakai. Klik saran di bawah chat atau ketik sendiri,
          lalu buka tab Running buat lihat layar komputernya.
        </p>
      </div>

      <div className="mt-8">
        <MalikaSimulator />
      </div>

      <div className="mx-auto mt-4 grid max-w-6xl gap-2 text-center text-xs text-stone-500 sm:grid-cols-3">
        <p>← Kiri: search, badge <strong>running</strong>, 3 bot Malika + Joko</p>
        <p>Tengah: chat + kartu laporan (tabel, insight, tombol aksi)</p>
        <p>Kanan: Settings ↔ Running (live screen tiap agent)</p>
      </div>
    </section>
  );
}
