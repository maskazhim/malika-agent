export default function VideoShowcase() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="glass-strong overflow-hidden rounded-3xl">
        <div className="flex flex-wrap items-center gap-2 px-6 pt-5 text-xs sm:px-8">
          <span className="font-semibold uppercase tracking-widest text-teal-700">Video Showcase</span>
          <span className="rounded-full bg-white/70 px-3 py-1 ring-1 ring-white">Durasi ±2 menit</span>
          <span className="rounded-full bg-white/70 px-3 py-1 ring-1 ring-white">Dengan narasi BI</span>
        </div>
        <h2 className="px-6 pt-2 text-2xl font-semibold sm:px-8 sm:text-3xl">
          Lihat dashboard asli Malika Agent bekerja.
        </h2>
        <p className="px-6 pt-2 text-sm leading-relaxed text-stone-600 sm:px-8">
          Video demo disiapkan terpisah oleh tim Malika. Slot ini placeholder — ganti dengan
          embed YouTube / MP4 saat video sudah siap.
        </p>
        <div className="p-4 sm:p-6">
          <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-teal-950 via-stone-900 to-blue-950">
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                background:
                  "radial-gradient(500px 300px at 20% 10%, rgba(190,242,100,.25), transparent 60%), radial-gradient(500px 300px at 85% 90%, rgba(59,130,246,.3), transparent 60%)",
              }}
            />
            <div className="relative rounded-2xl border border-dashed border-white/25 bg-white/5 p-8 text-center text-white backdrop-blur-sm sm:p-12">
              <button
                className="malika-gradient mx-auto flex h-20 w-20 items-center justify-center rounded-full text-2xl text-white shadow-xl transition hover:scale-105"
                aria-label="Putar video"
              >
                ▶
              </button>
              <p className="mt-5 text-base font-medium">Video placeholder</p>
              <p className="mt-1 text-xs text-stone-300">
                Ganti div ini dengan &lt;iframe&gt; / &lt;video&gt; saat file siap.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
