"use client";

import { useState } from "react";

const LINKS = [
  { label: "Produk", href: "#demo" },
  { label: "Cara Kerja", href: "#cara-kerja" },
  { label: "Paket Harga", href: "#harga" },
  { label: "FAQ", href: "#faq" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed inset-x-0 top-3 z-50 px-3 sm:top-4">
      <header className="glass-strong mx-auto w-full max-w-4xl rounded-full py-2 pl-4 pr-2 sm:pl-5">
        <div className="flex h-12 items-center justify-between gap-2">
          <a href="#top" className="flex min-w-0 items-center gap-2">
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
            className="rounded-full bg-white/70 px-4 py-2 text-sm ring-1 ring-white md:hidden"
            aria-label="Menu"
          >
            {open ? "Tutup" : "Menu"}
          </button>
        </div>
        {open && (
          <div className="px-2 pb-2 pt-1 md:hidden">
            <div className="flex flex-col gap-1 rounded-3xl bg-white/70 p-2 text-sm ring-1 ring-white">
              {LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-2xl px-3 py-2.5 hover:bg-white"
                >
                  {l.label}
                </a>
              ))}
              <a
                href="#harga"
                onClick={() => setOpen(false)}
                className="malika-gradient mt-1 rounded-2xl px-3 py-2.5 text-center font-medium text-white"
              >
                Mulai Sekarang
              </a>
            </div>
          </div>
        )}
      </header>
    </div>
  );
}
