"use client";

import { useEffect, useState } from "react";

const LINKS = [
  { label: "Produk", href: "#demo" },
  { label: "Cara Kerja", href: "#cara-kerja" },
  { label: "Paket Harga", href: "#harga" },
  { label: "FAQ", href: "#faq" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth >= 768) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open ]);

  return (
    <div className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:pt-4">
      {/* lapisan kaca di belakang navbar: konten yang lewat di bawah jadi blur */}
      <div className="pointer-events-none absolute inset-0 bg-white/30 backdrop-blur-xl [mask-image:linear-gradient(to_bottom,black_70%,transparent)]" />
      <div className="relative mx-auto w-full max-w-4xl">
        <header className="glass-strong w-full rounded-full py-2 pl-4 pr-2 sm:pl-5">
          <div className="flex h-12 items-center justify-between gap-2">
            <a href="#top" className="flex min-w-0 items-center gap-2" onClick={() => setOpen(false)}>
              <img src="/icon-192.png" alt="Malika" className="h-8 w-8 shrink-0 rounded-full object-contain" />
              <span className="truncate text-base font-semibold tracking-tight">
                Malika <span className="text-stone-500">Agent</span>
              </span>
            </a>
            <nav className="hidden items-center gap-1 text-sm text-stone-600 md:flex">
              {LINKS.map((l) => (
                <a key={l.href} href={l.href} className="rounded-full px-3 py-2 hover:bg-white/70 hover:text-stone-950">
                  {l.label}
                </a>
              ))}
            </nav>
            <div className="hidden items-center md:flex">
              <a
                href="#harga"
                className="malika-gradient rounded-full px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
              >
                Mulai Sekarang
              </a>
            </div>
            <button
              onClick={() => setOpen(!open)}
              aria-label={open ? "Tutup menu" : "Buka menu"}
              aria-expanded={open}
              aria-controls="mobile-menu"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/70 ring-1 ring-white transition hover:bg-white md:hidden"
            >
              <span className="relative block h-4 w-5">
                <span
                  className={`absolute left-0 top-0 h-0.5 w-5 rounded-full bg-stone-900 transition-all duration-200 ${open ? "top-1.5 rotate-45" : ""}`}
                />
                <span
                  className={`absolute left-0 top-1.5 h-0.5 w-5 rounded-full bg-stone-900 transition-all duration-200 ${open ? "opacity-0" : ""}`}
                />
                <span
                  className={`absolute left-0 top-3 h-0.5 w-5 rounded-full bg-stone-900 transition-all duration-200 ${open ? "top-1.5 -rotate-45" : ""}`}
                />
              </span>
            </button>
          </div>
        </header>
        {open && (
          <>
            <button
              aria-label="Tutup menu"
              onClick={() => setOpen(false)}
              className="fixed inset-0 -z-10 cursor-default md:hidden"
            />
            <div id="mobile-menu" className="absolute inset-x-0 top-full mt-2 md:hidden">
              <nav className="glass-strong feed-in rounded-3xl p-2 shadow-xl">
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-widest text-stone-400">
                  Menu
                </p>
                <ul className="flex flex-col gap-0.5 text-[15px]">
                  {LINKS.map((l) => (
                    <li key={l.href}>
                      <a
                        href={l.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center justify-between rounded-2xl px-3 py-3 font-medium text-stone-800 transition hover:bg-white"
                      >
                        {l.label}
                        <span className="text-stone-300">›</span>
                      </a>
                    </li>
                  ))}
                </ul>
                <div className="mt-1 border-t border-white/70 p-2">
                  <a
                    href="#harga"
                    onClick={() => setOpen(false)}
                    className="malika-gradient block rounded-2xl px-3 py-3 text-center text-[15px] font-semibold text-white transition hover:opacity-90"
                  >
                    Mulai Sekarang
                  </a>
                </div>
              </nav>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
