"use client";

import { useCallback, useEffect, useState } from "react";

const SLIDES = [
  { src: "/deck-1.png", alt: "Malika Agent — deck 1" },
  { src: "/deck-3.png", alt: "Malika Agent — deck 2" },
  { src: "/deck-2.png", alt: "Malika Agent — deck 3" },
];

const AUTOPLAY_MS = 4500;

export default function Hero() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = useCallback((dir: number) => {
    setIndex((i) => (i + dir + SLIDES.length) % SLIDES.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [paused]);

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

      <div
        id="cara-kerja"
        className="mx-auto mt-12 max-w-4xl scroll-mt-24"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="overflow-hidden">
          <div
            className="-mx-2 flex transition-transform duration-700"
            style={{ transform: `translateX(-${index * 50}%)` }}
          >
            {[...SLIDES, SLIDES[0]].map((s, i) => (
              <div key={`${s.src}-${i}`} className="w-1/2 shrink-0 px-2">
                <div className="aspect-[640/303] w-full overflow-hidden rounded-2xl">
                  <img
                    src={s.src}
                    alt={s.alt}
                    loading={i <= 1 ? "eager" : "lazy"}
                    className="h-full w-full scale-[1.04] object-cover"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            onClick={() => go(-1)}
            aria-label="Slide sebelumnya"
            className="rounded-full bg-white/70 px-3 py-1 text-sm shadow-sm ring-1 ring-white transition hover:bg-white"
          >
            ‹
          </button>
          <div className="flex items-center gap-2">
            {SLIDES.map((s, i) => (
              <button
                key={s.src}
                onClick={() => setIndex(i)}
                aria-label={`Ke slide ${i + 1}`}
                className={`h-2 rounded-full transition-all ${
                  i === index ? "w-6 bg-teal-600" : "w-2 bg-stone-300 hover:bg-stone-400"
                }`}
              />
            ))}
          </div>
          <button
            onClick={() => go(1)}
            aria-label="Slide berikutnya"
            className="rounded-full bg-white/70 px-3 py-1 text-sm shadow-sm ring-1 ring-white transition hover:bg-white"
          >
            ›
          </button>
        </div>
      </div>
    </section>
  );
}
