"use client";

import { useState } from "react";
import { FAQS } from "@/data/demo";

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-12 sm:px-6">
      <h2 className="text-center text-3xl font-semibold tracking-tight">Pertanyaan Umum</h2>
      <div className="mt-8 space-y-2">
        {FAQS.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className="glass overflow-hidden rounded-2xl">
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-semibold"
              >
                {f.q}
                <span className="shrink-0 text-stone-400">{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen && (
                <p className="border-t border-stone-100 px-5 py-4 text-sm leading-relaxed text-stone-600">
                  {f.a}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
