export default function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-stone-950 text-stone-300">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2">
            <img src="/icon-192.png" alt="Malika" className="h-8 w-8 rounded-lg object-contain" />
            <span className="font-semibold text-white">Malika Agent</span>
          </div>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-stone-400">
            AI Agent yang kerja layaknya manusia — kerja 24/7 untuk bisnis Indonesia.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Produk</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><a href="#demo" className="hover:text-white">Demo interaktif</a></li>
            <li><a href="#harga" className="hover:text-white">Paket harga</a></li>
            <li><a href="#faq" className="hover:text-white">FAQ</a></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Kontak</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>WhatsApp: +6282211114681</li>
            <li>Email: halo@malika.ai</li>
            <li>Yogyakarta, Indonesia</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-2 px-4 py-5 text-xs text-stone-500 sm:flex-row sm:px-6">
          <span>© 2026 Malika AI.</span>
          <span>Syarat &amp; Ketentuan · Kebijakan Privasi</span>
        </div>
      </div>
    </footer>
  );
}
