import { USP, USE_CASES } from "@/data/demo";

const USP_ICONS = ["🖥️", "⏰", "🧠", "🧩", "🔑", "🔌"];

const TOOL_DOMAIN: Record<string, string> = {
  JobStreet: "jobstreet.co.id",
  "Jurnal.id": "jurnal.id",
  Instagram: "instagram.com",
  LinkedIn: "linkedin.com",
  "Google Maps": "maps.google.com",
  WhatsApp: "whatsapp.com",
  Accurate: "accurate.id",
};

export function UspGrid() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
        Kenapa Malika Agent?
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-stone-600 sm:text-base">
        Enam alasan bisnis Indonesia memilih AI teammate dibanding chatbot biasa atau otomasi kaku.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {USP.map((u, i) => (
          <div key={u.title} className="glass rounded-2xl p-6 transition hover:-translate-y-0.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm ring-1 ring-white">
              {USP_ICONS[i] ?? "✦"}
            </span>
            <h3 className="mt-4 text-base font-semibold">{u.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{u.desc}</p>
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
        Beri setiap agent pekerjaan.
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-stone-600 sm:text-base">
        Contoh pekerjaan nyata yang sudah disesuaikan dengan tools yang dipakai SMB Indonesia.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {USE_CASES.map((c) => (
          <div
            key={c.title}
            className="glass group rounded-2xl p-6 transition hover:-translate-y-0.5"
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-white py-1 pl-1.5 pr-3 shadow-sm ring-1 ring-white">
              <img
                src={`https://www.google.com/s2/favicons?domain=${TOOL_DOMAIN[c.tool] ?? "google.com"}&sz=128`}
                alt={`Logo ${c.tool}`}
                loading="lazy"
                className="h-5 w-5 rounded-full object-contain"
              />
              <span className="text-xs font-semibold text-stone-700">{c.tool}</span>
            </span>
            <h3 className="mt-3 text-base font-semibold">{c.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{c.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
