"use client";

import { useEffect, useState } from "react";

const HIDE_KEY = "malika-bubble-hide";

/* Bubble imut "Tanya Malika?" di atas ikon livechat (Aksoro).
   Widget pihak ketiga tidak expose API buka/tutup, jadi klik bubble
   diteruskan ke elemen launcher widget di dokumen (klik DOM biasa,
   bukan akses isi iframe sehingga aman dari batasan cross-origin).
   Setelah diklik bubble disembunyikan (asumsi chat terbuka). */
export default function ChatBubble() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(HIDE_KEY)) return;
    } catch {
      /* abaikan */
    }
    const t = setTimeout(() => setShow(true), 1800);
    return () => clearTimeout(t);
  }, []);

  function dismiss(permanent: boolean) {
    setShow(false);
    if (permanent) {
      try {
        localStorage.setItem(HIDE_KEY, "1");
      } catch {
        /* abaikan */
      }
    }
  }

  function openChat() {
    try {
      const launcher =
        document.getElementById("iframe2-chat-container") ??
        document.querySelector('iframe[src*="aksoro"]')?.parentElement ??
        null;
      (launcher as HTMLElement | null)?.click();
    } catch {
      /* abaikan */
    }
    dismiss(false);
  }

  if (!show) return null;

  return (
    <div className="feed-in fixed bottom-[128px] right-5 z-40 sm:bottom-[124px] sm:right-6">
      <div className="bubble-float relative">
        <button
          onClick={openChat}
          className="glass-strong flex items-center gap-1.5 rounded-full py-2 pl-3 pr-2 text-[13px] font-semibold text-stone-800 transition hover:scale-[1.03]"
        >
          <span className="live-dot inline-block h-2 w-2 rounded-full bg-emerald-500" />
          Tanya Malika? 👋
          <span
            role="button"
            tabIndex={0}
            aria-label="Tutup"
            onClick={(e) => {
              e.stopPropagation();
              dismiss(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                dismiss(true);
              }
            }}
            className="ml-1 rounded-full px-1.5 text-xs text-stone-400 hover:bg-white hover:text-stone-700"
          >
            ✕
          </span>
        </button>
        <span className="absolute -bottom-1 right-8 h-3 w-3 rotate-45 border-b border-r border-white/80 bg-white/75" />
      </div>
    </div>
  );
}
