'use client';

import { useState } from 'react';
import { SHOWCASE_VIDEOS } from '@/data/demo';

export default function VideoShowcase() {
  const [activeId, setActiveId] = useState(SHOWCASE_VIDEOS[0]?.id);
  const active =
    SHOWCASE_VIDEOS.find((v) => v.id === activeId) ?? SHOWCASE_VIDEOS[0];

  if (!active) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6" id="showcase">
      <div className="glass-strong overflow-hidden rounded-3xl">
        <div className="flex flex-wrap items-center gap-2 px-6 pt-5 text-xs sm:px-8">
          <span className="font-semibold uppercase tracking-widest text-teal-700">
            Video Showcase
          </span>
          <span className="rounded-full bg-white/70 px-3 py-1 ring-1 ring-white">
            {SHOWCASE_VIDEOS.length} video
          </span>
          <span className="rounded-full bg-white/70 px-3 py-1 ring-1 ring-white">
            {active.badge}
          </span>
        </div>
        <h2 className="px-6 pt-2 text-2xl font-semibold sm:px-8 sm:text-3xl">
          Lihat Malika Agent bekerja.
        </h2>
        <p className="px-6 pt-2 text-sm leading-relaxed text-stone-600 sm:px-8">
          Contoh nyata gimana agent kerja — mulai dari {active.title.toLowerCase()}.
          Pilih video lain kalau sudah tersedia.
        </p>

        <div className="p-4 sm:p-6">
          {/* Main player */}
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-stone-950 ring-1 ring-stone-900/10">
            <iframe
              key={active.youtubeId}
              className="absolute inset-0 h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${active.youtubeId}?rel=0`}
              title={active.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>

          {/* Title + link */}
          <div className="flex flex-col gap-1 px-1 pt-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-base font-semibold">{active.title}</h3>
              <p className="mt-1 max-w-2xl text-sm text-stone-600">{active.desc}</p>
            </div>
            <a
              href={`https://youtu.be/${active.youtubeId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 shrink-0 rounded-full bg-white/70 px-4 py-2 text-xs font-semibold ring-1 ring-white hover:bg-white sm:mt-0"
            >
              Buka di YouTube ↗
            </a>
          </div>

          {/* Selector — siap untuk banyak video */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SHOWCASE_VIDEOS.map((v) => {
              const isActive = v.id === active.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setActiveId(v.id)}
                  className={`group flex gap-3 rounded-2xl p-3 text-left ring-1 transition ${
                    isActive
                      ? 'bg-stone-900 text-white ring-stone-900'
                      : 'bg-white/60 ring-white hover:bg-white'
                  }`}
                  aria-pressed={isActive}
                >
                  <span className="relative block h-16 w-28 shrink-0 overflow-hidden rounded-xl bg-stone-900">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg`}
                      alt={v.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-lg text-white drop-shadow">
                      ▶
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {v.title}
                    </span>
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${
                        isActive ? 'bg-white/15' : 'bg-stone-900/5'
                      }`}
                    >
                      {v.badge}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <p className="px-1 pt-3 text-xs text-stone-500">
            Mau nambah video baru? Tambahkan entri ke{' '}
            <code className="rounded bg-stone-900/5 px-1">SHOWCASE_VIDEOS</code> di{' '}
            <code className="rounded bg-stone-900/5 px-1">src/data/demo.ts</code> — cukup isi youtubeId, judul, dan deskripsi.
          </p>
        </div>
      </div>
    </section>
  );
}
