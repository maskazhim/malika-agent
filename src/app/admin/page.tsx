"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatRp } from "@/lib/qris";

interface Order {
  order_id: string;
  product: string;
  amount: number;
  nama: string;
  bisnis: string;
  telepon: string;
  email: string;
  method: string;
  bukti_filename: string;
  status: string;
  created_at: string;
  unique_code: number | null;
  code_expires_at: string;
  promo_code: string;
  subdomain: string;
  onboard_done: number;
  greeting_done: number;
  retensi_at: string;
  renewal_count: number;
}

interface MeUser {
  username: string;
  name: string;
  division: string;
  is_admin: boolean;
}

const DIVISION_LABEL: Record<string, string> = {
  marketing: "Marketing",
  sales: "Sales",
  support: "Support",
  it: "IT",
  ai_engineer: "AI Engineer",
  retensi: "Retensi",
  bisdev: "Bisdev",
  admin: "Admin",
};

const FILTERS = [
  { key: "", label: "Semua" },
  { key: "payment_proof", label: "Perlu verifikasi" },
  { key: "verified", label: "Terverifikasi" },
  { key: "setup_server", label: "Set up server" },
  { key: "onboard", label: "Onboarding" },
  { key: "retensi", label: "Retensi" },
  { key: "churn", label: "Churn" },
  { key: "resubscribe", label: "Resubscribe" },
  { key: "checkout", label: "Belum bayar" },
  { key: "cancelled", label: "Batal" },
];

const STATUS_STYLE: Record<string, string> = {
  payment_proof: "bg-amber-100 text-amber-800",
  verified: "bg-teal-100 text-teal-800",
  setup_server: "bg-blue-100 text-blue-800",
  onboard: "bg-indigo-100 text-indigo-800",
  retensi: "bg-emerald-100 text-emerald-800",
  churn: "bg-stone-300 text-stone-700",
  resubscribe: "bg-violet-100 text-violet-800",
  checkout: "bg-stone-200 text-stone-600",
  cancelled: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  payment_proof: "Perlu verifikasi",
  verified: "Terverifikasi",
  setup_server: "Set up server",
  onboard: "Onboarding",
  retensi: "Retensi",
  churn: "Churn",
  resubscribe: "Resubscribe",
  checkout: "Belum bayar",
  cancelled: "Batal",
};

// Izin aksi di UI (server tetap menegakkan via matriks — ini hanya tampilan).
function canVerify(me: MeUser | null): boolean {
  return !!me && (me.is_admin || me.division === "admin" || me.division === "sales");
}
function canStartSetup(me: MeUser | null): boolean {
  return !!me && (me.is_admin || ["admin", "support", "it", "ai_engineer"].includes(me.division));
}
function canFinishSetup(me: MeUser | null): boolean {
  return !!me && (me.is_admin || ["admin", "it", "ai_engineer", "support"].includes(me.division));
}
function canFinishOnboard(me: MeUser | null): boolean {
  return !!me && (me.is_admin || ["admin", "support"].includes(me.division));
}
function canGreet(me: MeUser | null): boolean {
  return !!me && (me.is_admin || ["admin", "support", "it", "ai_engineer"].includes(me.division));
}
function canRetensiMove(me: MeUser | null): boolean {
  return !!me && (me.is_admin || ["admin", "retensi"].includes(me.division));
}
function canCancel(me: MeUser | null, status: string): boolean {
  if (!me) return false;
  if (me.is_admin || me.division === "admin") return true;
  if (me.division === "sales" && (status === "checkout" || status === "payment_proof")) return true;
  return false;
}
function expiryOf(o: Order): string {
  if (!o.retensi_at) return "-";
  const exp = new Date(new Date(o.retensi_at).getTime() + 30 * 864e5);
  return exp.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

interface ClientAccess {
  id: number;
  order_id: string;
  client_name: string;
  access_url: string;
  email: string;
  email_status: string;
  created_at: string;
  subdomain?: string;
}

// Field deploy_configs yang bisa diedit via popup Config (dikelompokkan).
type CfgKind = "text" | "check" | "area" | "view";
const CFG_GROUPS: { title: string; fields: { key: string; label: string; kind: CfgKind }[] }[] = [
  {
    title: "Identitas",
    fields: [
      { key: "client_name", label: "Nama klien", kind: "text" },
      { key: "short_name", label: "Short name", kind: "text" },
      { key: "server_name", label: "Server name", kind: "text" },
      { key: "project_name", label: "Project name", kind: "text" },
      { key: "compose_name", label: "Compose name", kind: "text" },
      { key: "environment_name", label: "Environment", kind: "text" },
    ],
  },
  {
    title: "Server",
    fields: [
      { key: "vps_id", label: "VPS ID (service_id IndoVM)", kind: "text" },
      { key: "server_ip", label: "Server IP", kind: "text" },
      { key: "server_user", label: "SSH user", kind: "text" },
      { key: "ssh_port", label: "SSH port", kind: "text" },
      { key: "ssh_key_ref", label: "SSH key ref", kind: "text" },
    ],
  },
  {
    title: "Domain",
    fields: [
      { key: "web_domain", label: "Web domain", kind: "text" },
      { key: "connector_domain", label: "Connector domain", kind: "text" },
      { key: "router_domain", label: "Router domain", kind: "text" },
      { key: "gowa_domain", label: "Gowa domain", kind: "text" },
      { key: "cloudflare_zone", label: "Cloudflare zone", kind: "text" },
      { key: "letsencrypt_email", label: "LetsEncrypt email", kind: "text" },
      { key: "proxy_awal", label: "Proxy awal (1 = proxied)", kind: "check" },
    ],
  },
  {
    title: "Compose",
    fields: [
      { key: "compose_provider", label: "Provider", kind: "text" },
      { key: "compose_repo", label: "Repo", kind: "text" },
      { key: "compose_branch", label: "Branch", kind: "text" },
      { key: "compose_trigger", label: "Trigger", kind: "text" },
      { key: "env_template", label: "Env template", kind: "text" },
    ],
  },
  {
    title: "Secrets",
    fields: [
      { key: "secrets_json", label: "secrets.json", kind: "area" },
      { key: "secrets_is_dummy", label: "Secrets masih dummy", kind: "check" },
    ],
  },
  {
    title: "Dokploy",
    fields: [
      { key: "dokploy_server_id", label: "Server ID", kind: "text" },
      { key: "dokploy_project_id", label: "Project ID", kind: "text" },
      { key: "dokploy_env_id", label: "Env ID", kind: "text" },
      { key: "dokploy_compose_id", label: "Compose ID", kind: "text" },
    ],
  },
  {
    title: "Status",
    fields: [
      { key: "deploy_status", label: "Deploy status", kind: "text" },
      { key: "last_log", label: "Last log", kind: "view" },
    ],
  },
];
const CFG_KEYS = CFG_GROUPS.flatMap((g) => g.fields.map((f) => f.key));

export default function AdminPage() {
  const router = useRouter();
  const [auth, setAuth] = useState<"checking" | "ok">("checking");
  const [me, setMe] = useState<MeUser | null>(null);
  const [view, setView] = useState<"orders" | "pricing" | "logs" | "promos" | "users" | "affiliate" | "servers">("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Pilih multiple untuk aksi bulk (edit status / hapus).
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState("verified");
  const [bulkBusy, setBulkBusy] = useState(false);
  const headBoxRef = useRef<HTMLInputElement>(null);
  // Menu titik-tiga (panel expandable pendorong container) + panel kredensial per order.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientAccess[]>([]);
  const [credFor, setCredFor] = useState<string | null>(null);
  const [credForm, setCredForm] = useState({ access_url: "", email: "", password: "" });
  const [credSending, setCredSending] = useState(false);
  const [credMsg, setCredMsg] = useState<string | null>(null);
  const [sentCred, setSentCred] = useState<Record<string, { access_url: string; email: string; password: string }>>({});
  // Popup Config: edit deploy_configs per order.
  const [cfgFor, setCfgFor] = useState<string | null>(null);
  // Notes per order (cuplikan 1 baris di tabel + popup editor).
  const [snippets, setSnippets] = useState<Record<string, { snippet: string; count: number }>>({});
  const [notesFor, setNotesFor] = useState<string | null>(null);
  const [notesList, setNotesList] = useState<
    { id: number; note: string; created_by: string; created_at: string; updated_at: string }[]
  >([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesMsg, setNotesMsg] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});  const [cfgForm, setCfgForm] = useState<Record<string, string>>({});
  const [cfgLoading, setCfgLoading] = useState(false);
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfgMsg, setCfgMsg] = useState<string | null>(null);

  const load = useCallback(
    async (status: string) => {
      setLoading(true);
      setError(null);
      try {
        const url = status ? `/api/orders?status=${encodeURIComponent(status)}` : "/api/orders";
        const res = await fetch(url);
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) throw new Error("gagal");
        const data = (await res.json()) as { orders?: Order[] };
        setOrders(data.orders ?? []);
        // Buang pilihan yang tidak ada lagi di hasil terbaru.
        setSelected((sel) => sel.filter((id) => (data.orders ?? []).some((o) => o.order_id === id)));
      } catch {
        setError("Gagal memuat order. Coba muat ulang.");
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  // Cuplikan notes semua order (1 request, best-effort).
  const loadSnippets = useCallback(async () => {
    try {
      const res = await fetch("/api/order-notes?latest=1");
      if (!res.ok) return;
      const data = (await res.json()) as {
        snippets?: { order_id: string; snippet: string; count: number }[];
      };
      const m: Record<string, { snippet: string; count: number }> = {};
      for (const sn of data.snippets ?? []) {
        m[sn.order_id] = { snippet: sn.snippet, count: sn.count };
      }
      setSnippets(m);
    } catch {
      /* abaikan — kolom notes tetap tampil kosong */
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json().catch(() => null))
      .then((data: { ok?: boolean; user?: MeUser } | null) => {
        if (!data?.ok) router.replace("/login");
        else {
          setMe(data.user ?? null);
          setAuth("ok");
          void load("");
          void loadSnippets();
          // Daftar akses klien (untuk panel kredensial per order).
          fetch("/api/clients")
            .then((r) => (r.ok ? r.json() : null))
            .then((cdata: { clients?: ClientAccess[] } | null) => {
              if (cdata?.clients) setClients(cdata.clients);
            })
            .catch(() => {});
        }
      })
      .catch(() => router.replace("/login"));
  }, [router, load, loadSnippets]);

  function changeFilter(key: string) {
    setFilter(key);
    setSelected([]);
    setNotice(null);
    void load(key);
  }

  function closeMenu() {
    setMenuFor(null);
  }

  async function setStatus(order_id: string, status: string) {
    closeMenu();
    setUpdating(order_id);
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id, status }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.status === 403) {
        setError("Aksi ini di luar wewenang divisimu.");
        return;
      }
      if (!res.ok) throw new Error("gagal");
      setOrders((os) =>
        os.map((o) =>
          o.order_id === order_id
            ? {
                ...o,
                status,
                renewal_count: status === "resubscribe" ? o.renewal_count + 1 : o.renewal_count,
                retensi_at:
                  status === "resubscribe" || (status === "retensi" && !o.retensi_at)
                    ? new Date().toISOString()
                    : o.retensi_at,
              }
            : o
        )
      );
    } catch {
      setError("Gagal update status.");
    } finally {
      setUpdating(null);
    }
  }

  async function setGreeting(order_id: string, done: boolean) {
    setUpdating(order_id);
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id, greeting_done: done }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.status === 403) {
        setError("Aksi ini di luar wewenang divisimu.");
        return;
      }
      if (!res.ok) throw new Error("gagal");
      setOrders((os) => os.map((o) => (o.order_id === order_id ? { ...o, greeting_done: done ? 1 : 0, onboard_done: done ? 1 : 0 } : o)));
    } catch {
      setError("Gagal update greeting.");
    } finally {
      setUpdating(null);
    }
  }

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" }).catch(() => {});
    router.replace("/login");
  }

  async function removeOrder(order_id: string) {
    if (!window.confirm("Hapus order ini permanen? Kode uniknya ikut dibebaskan.")) return;
    closeMenu();
    setDeleting(order_id);
    try {
      const res = await fetch(`/api/orders?order_id=${encodeURIComponent(order_id)}`, { method: "DELETE" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) throw new Error("gagal");
      setOrders((os) => os.filter((o) => o.order_id !== order_id));
    } catch {
      setError("Gagal menghapus order.");
    } finally {
      setDeleting(null);
    }
  }

  // --- Aksi bulk untuk order yang dicentang ---
  function toggleSelect(order_id: string) {
    setSelected((sel) => (sel.includes(order_id) ? sel.filter((id) => id !== order_id) : [...sel, order_id]));
  }

  // visibleOrders didefinisikan di bawah; helper pilih-semua memakai daftar tampil.
  function toggleSelectVisible(list: Order[]) {
    const ids = list.map((o) => o.order_id);
    const allIn = ids.length > 0 && ids.every((id) => selected.includes(id));
    setSelected((sel) => (allIn ? sel.filter((id) => !ids.includes(id)) : [...new Set([...sel, ...ids])]));
  }

  async function bulkApplyStatus() {
    if (selected.length === 0 || !bulkStatus) return;
    setBulkBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_ids: selected, status: bulkStatus }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = (await res.json()) as {
        ok?: boolean; updated?: number; failed?: number;
        results?: { order_id: string; ok: boolean; error?: string }[];
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "gagal");
      const fails = (data.results ?? []).filter((r) => !r.ok);
      setNotice(
        fails.length === 0
          ? `${data.updated} order dipindah ke "${STATUS_LABEL[bulkStatus] ?? bulkStatus}".`
          : `${data.updated} berhasil, ${fails.length} dilewati (${fails.slice(0, 3).map((f) => f.error ?? "ditolak").join("; ")}${fails.length > 3 ? "…" : ""}).`
      );
      setSelected([]);
      await load(filter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal bulk update.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    if (selected.length === 0) return;
    if (!window.confirm(`Hapus ${selected.length} order yang dipilih permanen? Kode uniknya ikut dibebaskan.`)) return;
    setBulkBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/orders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_ids: selected }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = (await res.json()) as { ok?: boolean; deleted?: string[]; not_found?: string[]; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "gagal");
      setNotice(
        `${(data.deleted ?? []).length} order dihapus${(data.not_found ?? []).length > 0 ? `, ${(data.not_found ?? []).length} tidak ditemukan` : ""}.`
      );
      setSelected([]);
      await load(filter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal bulk hapus.");
    } finally {
      setBulkBusy(false);
    }
  }

  // Buka panel kirim credential untuk satu order.
  // Order baru (ada subdomain booking) → mode 1-klik, tanpa input.
  // Order lama (tanpa subdomain) → mode legacy, isi manual subdomain + password.
  function openCred(o: Order) {
    closeMenu();
    setCredMsg(null);
    const existing = clients.find((c) => c.order_id === o.order_id);
    setCredForm({
      access_url: existing?.access_url ?? (o.subdomain ? `https://${o.subdomain}.malika.ai` : ""),
      email: existing?.email || o.email,
      password: "",
    });
    setCredFor(o.order_id);
  }

  // Kirim credential: simpan akses + email otomatis ke email order.
  async function sendCred(o: Order) {
    setCredSending(true);
    setCredMsg(null);
    try {
      // Aturan tegas: 1-klik bila order punya subdomain DAN admin tidak
      // mengisi password manual. Order lama tanpa subdomain → wajib isi manual.
      const useOneClick = !!o.subdomain && !credForm.password;
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: useOneClick
          ? JSON.stringify({ order_id: o.order_id })
          : JSON.stringify({
              client_name: o.nama,
              access_url: credForm.access_url || (o.subdomain ? `https://${o.subdomain}.malika.ai` : ""),
              email: credForm.email,
              password: credForm.password,
              order_id: o.order_id,
            }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        id?: number;
        error?: string;
        email_status?: string;
        email_error?: string;
        access_url?: string;
        email?: string;
        password?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "gagal");
      const finalUrl = data.access_url ?? credForm.access_url;
      const finalEmail = data.email ?? credForm.email;
      const finalPass = data.password ?? credForm.password;
      setClients((cs) => [
        {
          id: data.id ?? 0,
          order_id: o.order_id,
          client_name: o.nama,
          access_url: finalUrl,
          email: finalEmail,
          email_status: data.email_status ?? "sent",
          created_at: new Date().toISOString(),
        },
        ...cs.filter((c) => c.order_id !== o.order_id),
      ]);
      // Tampilkan detail yang baru dikirim di bawah order.
      setSentCred((s) => ({
        ...s,
        [o.order_id]: { access_url: finalUrl, email: finalEmail, password: finalPass },
      }));
      setCredForm((f) => ({ ...f, password: "" }));
      setCredMsg(
        data.email_status === "sent"
          ? "Email credential terkirim ke klien."
          : `Akses tersimpan, tapi email gagal (${data.email_error ?? "unknown"}).`
      );
    } catch (err) {
      setCredMsg(err instanceof Error ? err.message : "Gagal mengirim credential.");
    } finally {
      setCredSending(false);
    }
  }

  // Buka popup Config: muat deploy_configs order ini (atau form kosong bila belum ada).
  async function openCfg(order_id: string) {
    closeMenu();
    setCfgMsg(null);
    setCfgFor(order_id);
    setCfgLoading(true);
    try {
      const res = await fetch(`/api/deploy-configs?order_id=${encodeURIComponent(order_id)}`);
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = (await res.json()) as { ok?: boolean; config?: Record<string, unknown>; error?: string };
      const f: Record<string, string> = {};
      if (res.ok && data.config) {
        for (const k of CFG_KEYS) f[k] = String(data.config[k] ?? "");
      } else {
        for (const k of CFG_KEYS) f[k] = "";
        setCfgMsg("Belum ada config untuk order ini — isi lalu simpan untuk membuat baru.");
      }
      setCfgForm(f);
    } catch {
      const f: Record<string, string> = {};
      for (const k of CFG_KEYS) f[k] = "";
      setCfgForm(f);
      setCfgMsg("Gagal memuat config.");
    } finally {
      setCfgLoading(false);
    }
  }

  // Simpan popup Config ke D1.
  async function saveCfg() {
    if (!cfgFor) return;
    setCfgSaving(true);
    setCfgMsg(null);
    try {
      const res = await fetch("/api/deploy-configs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: cfgFor, ...cfgForm }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "gagal");
      setCfgFor(null);
    } catch (err) {
      setCfgMsg(err instanceof Error ? err.message : "Gagal menyimpan config.");
    } finally {
      setCfgSaving(false);
    }
  }

  // Buka popup notes satu order.
  async function openNotes(order_id: string) {
    closeMenu();
    setNotesMsg(null);
    setNewNote("");
    setShowAdd(false);
    setDrafts({});
    setNotesFor(order_id);
    setNotesLoading(true);
    try {
      const res = await fetch(`/api/order-notes?order_id=${encodeURIComponent(order_id)}`);
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = (await res.json()) as {
        notes?: { id: number; note: string; created_by: string; created_at: string; updated_at: string }[];
      };
      const list = data.notes ?? [];
      setNotesList(list);
      const d: Record<number, string> = {};
      for (const n of list) d[n.id] = n.note;
      setDrafts(d);
      // Belum ada notes -> langsung tampilkan form tambah.
      if (list.length === 0) setShowAdd(true);
    } catch {
      setNotesList([]);
      setShowAdd(true);
      setNotesMsg("Gagal memuat notes.");
    } finally {
      setNotesLoading(false);
    }
  }

  // Tambah note baru.
  async function addNote() {
    if (!notesFor || !newNote.trim()) return;
    setNoteSaving(true);
    setNotesMsg(null);
    try {
      const res = await fetch("/api/order-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: notesFor, note: newNote.trim() }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; id?: number; error?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "gagal");
      setNewNote("");
      setShowAdd(false);
      await openNotes(notesFor);
      void loadSnippets();
    } catch (err) {
      setNotesMsg(err instanceof Error ? err.message : "Gagal menambah note.");
    } finally {
      setNoteSaving(false);
    }
  }

  // Simpan hasil edit satu note.
  async function saveNoteEdit(id: number) {
    const text = (drafts[id] ?? "").trim();
    if (!text) return;
    setNoteSaving(true);
    setNotesMsg(null);
    try {
      const res = await fetch("/api/order-notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, note: text }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "gagal");
      setNotesList((ns) => ns.map((n) => (n.id === id ? { ...n, note: text, updated_at: new Date().toISOString() } : n)));
      void loadSnippets();
    } catch (err) {
      setNotesMsg(err instanceof Error ? err.message : "Gagal menyimpan note.");
    } finally {
      setNoteSaving(false);
    }
  }

  // Hapus satu note (admin).
  async function removeNote(id: number) {
    if (!window.confirm("Hapus note ini permanen?")) return;
    setNotesMsg(null);
    try {
      const res = await fetch(`/api/order-notes?id=${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "gagal");
      setNotesList((ns) => ns.filter((n) => n.id !== id));
      void loadSnippets();
    } catch (err) {
      setNotesMsg(err instanceof Error ? err.message : "Gagal menghapus note.");
    }
  }

  const visibleOrders = orders.filter((o) => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return [o.nama, o.email, o.telepon, o.bisnis, o.product, o.order_id]
      .join(" ")
      .toLowerCase()
      .includes(s);
  });

  // Indeterminate pada checkbox header bila sebagian baris tampil yang dipilih.
  useEffect(() => {
    if (headBoxRef.current) {
      const n = visibleOrders.filter((o) => selected.includes(o.order_id)).length;
      headBoxRef.current.indeterminate = n > 0 && n < visibleOrders.length;
    }
  }, [visibleOrders, selected]);

  if (auth === "checking") {
    return <main className="mx-auto max-w-6xl px-4 py-20 text-center text-sm text-stone-500">Memeriksa sesi…</main>;
  }

  const isAdmin = !!me && (me.is_admin || me.division === "admin");
  const canLogs = !!me && (me.is_admin || ["admin", "support", "it", "ai_engineer", "retensi", "bisdev"].includes(me.division));
  const canServer = !!me && (me.is_admin || ["admin", "it", "ai_engineer", "bisdev"].includes(me.division));
  const tabs = (["orders", "pricing", "logs", "promos", "affiliate", "users", "servers"] as const).filter((v) => {
    if (v === "orders" || v === "logs") return v === "orders" ? true : canLogs;
    if (v === "servers") return canServer;
    return isAdmin;
  });
  const tabLabel = (v: string): string =>
    v === "orders" ? "Order" : v === "pricing" ? "Harga Paket" : v === "logs" ? "Log Pembayaran" : v === "promos" ? "Kode Promo" : v === "affiliate" ? "Affiliate" : v === "servers" ? "Server" : "Staff";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Malika · Internal</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Dashboard Order</h1>
          {me && (
            <p className="mt-1 text-xs text-stone-500">
              {me.name} · {DIVISION_LABEL[me.division] ?? me.division}
              {me.is_admin ? " · Admin" : ""}
            </p>
          )}
        </div>
        <button
          onClick={logout}
          className="rounded-full bg-white/70 px-5 py-2 text-sm font-semibold ring-1 ring-white hover:bg-white"
        >
          Keluar
        </button>
      </div>

      <div className="glass mt-5 flex flex-wrap gap-1 rounded-2xl p-1 text-sm font-semibold">
        {tabs.map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-xl px-4 py-2 transition ${
              view === v ? "malika-gradient text-white shadow" : "text-stone-500 hover:bg-white/70 hover:text-stone-900"
            }`}
          >
            {tabLabel(v)}
          </button>
        ))}
      </div>

      {view === "pricing" && isAdmin ? (
        <PricingManager />
      ) : view === "logs" && canLogs ? (
        <PaymentLogs />
      ) : view === "promos" && isAdmin ? (
        <PromoManager />
      ) : view === "affiliate" && isAdmin ? (
        <AffiliateManager />
      ) : view === "users" && isAdmin ? (
        <UsersManager meUsername={me?.username ?? ""} />
      ) : view === "servers" && canServer ? (
        <ServerManager />
      ) : (
        <>
      <div className="glass mt-5 flex flex-wrap gap-1 rounded-2xl p-1 text-sm font-semibold">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => changeFilter(f.key)}
            className={`rounded-xl px-4 py-2 transition ${
              filter === f.key ? "malika-gradient text-white shadow" : "text-stone-500 hover:bg-white/70 hover:text-stone-900"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600 ring-1 ring-red-100">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-4 rounded-xl bg-teal-50 px-3 py-2 text-xs font-medium text-teal-700 ring-1 ring-teal-100">
          {notice}
        </p>
      )}

      <div className="glass mt-4 flex items-center gap-2 rounded-2xl p-2">
        <span className="pl-2 text-sm text-stone-400">🔍</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari order: nama, email, telepon, bisnis, produk, order ID…"
          className="w-full bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-stone-400"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="shrink-0 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold ring-1 ring-white hover:bg-white"
          >
            ✕
          </button>
        )}
      </div>

      {selected.length > 0 && (
        <div className="glass-strong mt-4 flex flex-wrap items-center gap-2 rounded-2xl p-3">
          <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-bold text-white">
            {selected.length} dipilih
          </span>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-stone-600">
            Status
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              className="rounded-xl border border-stone-200 bg-white/80 px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-teal-400"
            >
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <button
            onClick={bulkApplyStatus}
            disabled={bulkBusy}
            className="rounded-full bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {bulkBusy ? "…" : "Terapkan status"}
          </button>
          {isAdmin && (
            <button
              onClick={bulkDelete}
              disabled={bulkBusy}
              className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-60"
            >
              Hapus
            </button>
          )}
          <button
            onClick={() => setSelected([])}
            className="rounded-full bg-white/70 px-4 py-1.5 text-xs font-semibold text-stone-500 ring-1 ring-white hover:bg-white"
          >
            Batalkan pilihan
          </button>
        </div>
      )}

      <div className="glass-strong mt-4 overflow-x-auto rounded-3xl">
        {loading ? (
          <p className="p-8 text-center text-sm text-stone-500">Memuat order…</p>
        ) : visibleOrders.length === 0 ? (
          <p className="p-8 text-center text-sm text-stone-500">
            {orders.length === 0 ? "Belum ada order pada filter ini." : "Tidak ada order yang cocok dengan pencarian."}
          </p>
        ) : (
          <table className="w-full min-w-3xl text-left text-sm">
            <thead>
              <tr className="border-b border-white/70 text-xs uppercase tracking-wider text-stone-400">
                <th className="px-4 py-3 font-semibold">
                  <input
                    ref={headBoxRef}
                    type="checkbox"
                    aria-label="Pilih semua yang tampil"
                    checked={visibleOrders.length > 0 && visibleOrders.every((o) => selected.includes(o.order_id))}
                    onChange={() => toggleSelectVisible(visibleOrders)}
                    className="h-4 w-4 align-middle accent-teal-600"
                  />
                </th>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Kontak</th>
                <th className="px-4 py-3 font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Notes</th>
                <th className="px-4 py-3 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((o) => {
                const existing = clients.find((c) => c.order_id === o.order_id);
                const sent = sentCred[o.order_id];
                const expanded = credFor === o.order_id;
                return (
                <Fragment key={o.order_id}>
                <tr className={`border-b border-white/50 last:border-0 hover:bg-white/40 ${selected.includes(o.order_id) ? "bg-teal-50/50" : ""}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Pilih order ${o.order_id.slice(0, 8)}`}
                      checked={selected.includes(o.order_id)}
                      onChange={() => toggleSelect(o.order_id)}
                      className="h-4 w-4 align-middle accent-teal-600"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{o.product}</p>
                    <p className="font-mono text-[11px] text-stone-400">{o.order_id.slice(0, 8)}…</p>
                    {o.subdomain && (
                      <p className="font-mono text-[11px] font-semibold text-teal-700">{o.subdomain}.malika.ai</p>
                    )}
                    <p className="text-[11px] text-stone-400">
                      {o.method === "transfer" ? "Transfer Bank" : o.method === "qris" ? "QRIS" : "-"} ·{" "}
                      {o.created_at ? new Date(o.created_at).toLocaleString("id-ID") : "-"}
                    </p>
                    {existing && (
                      <p className="mt-0.5 inline-block rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                        akses {existing.email_status === "sent" ? "terkirim" : existing.email_status}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{o.nama}</p>
                    <p className="text-xs text-stone-500">{o.bisnis}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <p>{o.telepon}</p>
                    <p className="text-stone-500">{o.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold">{formatRp(o.amount)}</p>
                    {o.unique_code != null && (
                      <p className="mt-0.5 inline-block rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                        kode +{o.unique_code}
                      </p>
                    )}
                    {o.promo_code && (
                      <p className="mt-0.5 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                        {o.promo_code}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[o.status] ?? "bg-stone-200 text-stone-600"}`}
                    >
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                    {(o.status === "verified" || o.status === "setup_server" || o.status === "onboard") && canGreet(me) && (
                      <button
                        onClick={() => setGreeting(o.order_id, !(o.greeting_done || o.onboard_done))}
                        disabled={updating === o.order_id}
                        title="Tandai sudah menyapa customer baru (berjalan paralel dengan setup)"
                        className={`mt-1 block rounded-full px-2 py-0.5 text-[11px] font-semibold disabled:opacity-60 ${
                          o.greeting_done || o.onboard_done ? "bg-teal-100 text-teal-800" : "bg-white/70 text-stone-500 ring-1 ring-white hover:bg-white"
                        }`}
                      >
                        {o.greeting_done || o.onboard_done ? "✓ Sudah disapa" : "○ Sapa?"}
                      </button>
                    )}
                    {(o.status === "retensi" || o.status === "resubscribe" || o.status === "churn") && (
                      <p className="mt-1 text-[11px] text-stone-500">
                        {o.renewal_count > 0 ? `Perpanjangan ke-${o.renewal_count} · ` : ""}
                        {o.status === "churn" ? "berhenti" : `aktif s/d ${expiryOf(o)}`}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const sn = snippets[o.order_id];
                      return (
                        <button
                          onClick={() => void openNotes(o.order_id)}
                          title={sn ? "Buka notes" : "Tambah note"}
                          className="block w-40 text-left"
                        >
                          {sn ? (
                            <>
                              <p className="truncate text-xs text-stone-700">{sn.snippet || "(kosong)"}</p>
                              {sn.count > 1 && (
                                <span className="mt-0.5 inline-block rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
                                  +{sn.count - 1} lagi
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-[11px] font-medium text-stone-400 hover:text-teal-700">+ Catatan</span>
                          )}
                        </button>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                      <button
                        onClick={() => setMenuFor(menuFor === o.order_id ? null : o.order_id)}
                        aria-label="Menu aksi"
                        aria-expanded={menuFor === o.order_id}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/70 text-base font-bold tracking-widest text-stone-600 ring-1 ring-white hover:bg-white"
                      >
                        {menuFor === o.order_id ? "✕" : "⋮"}
                      </button>
                  </td>
                </tr>
                {menuFor === o.order_id && (
                  <tr className="border-b border-white/50 bg-stone-50/60">
                    <td colSpan={8} className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                            {o.status === "payment_proof" && canVerify(me) && (
                              <button
                                onClick={() => {
                                  void setStatus(o.order_id, "verified");
                                }}
                                disabled={updating === o.order_id}
                                className="rounded-full bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
                              >
                                {updating === o.order_id ? "…" : "✓ Verifikasi pembayaran"}
                              </button>
                            )}
                            {o.status === "verified" && canStartSetup(me) && (
                              <button
                                onClick={() => {
                                  void setStatus(o.order_id, "setup_server");
                                }}
                                disabled={updating === o.order_id}
                                className="rounded-full bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                              >
                                🖥 Mulai set up server
                              </button>
                            )}
                            {o.status === "setup_server" && canFinishSetup(me) && (
                              <>
                                <button
                                  onClick={() => openCred(o)}
                                  className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100"
                                >
                                  ✉ Kirim credential
                                </button>
                                <button
                                  onClick={() => {
                                    void openCfg(o.order_id);
                                  }}
                                  className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100"
                                >
                                  ⚙ Config
                                </button>
                                <button
                                  onClick={() => {
                                    void setStatus(o.order_id, "onboard");
                                  }}
                                  disabled={updating === o.order_id}
                                  className="rounded-full bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                                >
                                  ✓ Setup selesai → Onboard
                                </button>
                              </>
                            )}
                            {o.status === "onboard" && canFinishOnboard(me) && (
                              <>
                                <button
                                  onClick={() => openCred(o)}
                                  className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100"
                                >
                                  ✉ Kirim credential
                                </button>
                                <button
                                  onClick={() => {
                                    void setStatus(o.order_id, "retensi");
                                  }}
                                  disabled={updating === o.order_id}
                                  className="rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                >
                                  ✓ Onboard selesai → Retensi
                                </button>
                              </>
                            )}
                            {(o.status === "retensi" || o.status === "resubscribe") && canRetensiMove(me) && (
                              <>
                                <button
                                  onClick={() => {
                                    void setStatus(o.order_id, "resubscribe");
                                  }}
                                  disabled={updating === o.order_id}
                                  className="rounded-full bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                                >
                                  ↻ Resubscribe (+1)
                                </button>
                                <button
                                  onClick={() => {
                                    void setStatus(o.order_id, "churn");
                                  }}
                                  disabled={updating === o.order_id}
                                  className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-500 ring-1 ring-stone-200 hover:bg-stone-100 disabled:opacity-60"
                                >
                                  ✕ Churn
                                </button>
                              </>
                            )}
                            {canCancel(me, o.status) && (
                              <button
                                onClick={() => {
                                  void setStatus(o.order_id, "cancelled");
                                }}
                                disabled={updating === o.order_id}
                                className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-60"
                              >
                                Batal
                              </button>
                            )}
                            {isAdmin && (
                            <button
                              onClick={() => removeOrder(o.order_id)}
                              disabled={deleting === o.order_id}
                              className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-500 ring-1 ring-stone-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                            >
                              {deleting === o.order_id ? "…" : "Hapus"}
                            </button>
                            )}
                      </div>
                    </td>
                  </tr>
                )}
                {expanded && (
                  <tr className="border-b border-white/50 bg-teal-50/40">
                    <td colSpan={8} className="px-4 py-4">
                      <div className="rounded-2xl bg-white/80 p-4 ring-1 ring-white">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold">Kirim credential akses</p>
                          <button
                            onClick={() => {
                              setCredFor(null);
                              setCredMsg(null);
                            }}
                            className="rounded-lg bg-white/70 px-2.5 py-1 text-xs ring-1 ring-white hover:bg-white"
                            aria-label="Tutup"
                          >
                            ✕
                          </button>
                        </div>
                        {existing && !sent && (
                          <p className="mt-1 text-xs text-stone-500">
                            Sudah pernah dikirim ke <span className="font-semibold">{existing.email}</span> ({existing.email_status}).
                            Isi ulang untuk kirim lagi / perbarui.
                          </p>
                        )}
                        {sent && (
                          <div className="mt-2 rounded-xl bg-teal-50 p-3 text-xs ring-1 ring-teal-100">
                            <p className="font-bold text-teal-800">Terkirim — detail di bawah ini:</p>
                            <dl className="mt-1 space-y-0.5">
                              <div className="flex gap-2"><dt className="w-20 text-stone-500">URL akses</dt><dd className="font-semibold">{sent.access_url}</dd></div>
                              <div className="flex gap-2"><dt className="w-20 text-stone-500">Email</dt><dd className="font-semibold">{sent.email}</dd></div>
                              <div className="flex gap-2"><dt className="w-20 text-stone-500">Password</dt><dd className="font-mono font-semibold">{sent.password}</dd></div>
                            </dl>
                          </div>
                        )}
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <label className="block">
                            <span className="mb-1 block text-[11px] font-medium text-stone-500">URL akses</span>
                            <input
                              value={credForm.access_url}
                              onChange={(e) => setCredForm((f) => ({ ...f, access_url: e.target.value }))}
                              placeholder="kopi.malika.ai"
                              disabled={!!o.subdomain && !credForm.password}
                              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-400 disabled:bg-stone-100 disabled:text-stone-500"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-[11px] font-medium text-stone-500">Email (dari order)</span>
                            <input
                              value={credForm.email}
                              onChange={(e) => setCredForm((f) => ({ ...f, email: e.target.value }))}
                              type="email"
                              disabled={!!o.subdomain && !credForm.password}
                              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-400 disabled:bg-stone-100 disabled:text-stone-500"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-[11px] font-medium text-stone-500">
                              Password {o.subdomain ? "(kosongkan = 1-klik generate)" : "(wajib — order lama)"}
                            </span>
                            <input
                              value={credForm.password}
                              onChange={(e) => setCredForm((f) => ({ ...f, password: e.target.value }))}
                              placeholder={o.subdomain ? "kosongkan untuk 1-klik" : "min. 8 karakter"}
                              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-400"
                            />
                          </label>
                        </div>
                        {o.subdomain && !credForm.password && (
                          <p className="mt-2 rounded-xl bg-teal-50 px-3 py-2 text-xs font-medium text-teal-800 ring-1 ring-teal-100">
                            Mode 1-klik: kirim ke {o.email} via https://{o.subdomain}.malika.ai — password agent digenerate otomatis. Isi password di atas hanya bila mau override manual (order lama).
                          </p>
                        )}
                        {!o.subdomain && (
                          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 ring-1 ring-amber-100">
                            Order lama tanpa booking subdomain — wajib isi URL + email + password manual.
                          </p>
                        )}
                        {credFor === o.order_id && credMsg && (
                          <p className="mt-2 text-xs font-medium text-stone-600">{credMsg}</p>
                        )}
                        <button
                          onClick={() => sendCred(o)}
                          disabled={credSending}
                          className="malika-gradient mt-3 rounded-full px-5 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                        >
                          {credSending ? "Mengirim…" : o.subdomain && !credForm.password ? "✉ Kirim credential (1-klik)" : "✉ Simpan + kirim email credential"}
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
        </>
      )}
      {notesFor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold">🗒 Notes — <span className="font-mono">{notesFor.slice(0, 8)}…</span></p>
              <button
                onClick={() => {
                  setNotesFor(null);
                  setNotesMsg(null);
                }}
                className="rounded-lg bg-white/70 px-2.5 py-1 text-xs ring-1 ring-stone-200 hover:bg-stone-100"
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>
            {showAdd ? (
            <div className="mt-3">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={3}
                placeholder="Tulis note baru…"
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-400"
              />
              <div className="mt-2 flex justify-end gap-2">
                {notesList.length > 0 && (
                  <button
                    onClick={() => {
                      setShowAdd(false);
                      setNewNote("");
                    }}
                    className="rounded-full bg-white px-5 py-2 text-xs font-semibold text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
                  >
                    Batal
                  </button>
                )}
                <button
                  onClick={() => void addNote()}
                  disabled={noteSaving || !newNote.trim()}
                  className="malika-gradient rounded-full px-5 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {noteSaving ? "Menyimpan…" : "+ Tambah note"}
                </button>
              </div>
            </div>
            ) : (
              !notesLoading && (
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => setShowAdd(true)}
                    className="rounded-full bg-white px-5 py-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100"
                  >
                    + Tambah note
                  </button>
                </div>
              )
            )}
            {notesLoading ? (
              <p className="mt-4 text-center text-sm text-stone-500">Memuat notes…</p>
            ) : notesList.length === 0 ? (
              <p className="mt-4 text-center text-sm text-stone-500">Belum ada note untuk order ini.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {notesList.map((n) => {
                  const cur = drafts[n.id] ?? n.note;
                  const dirty = cur !== n.note;
                  return (
                  <div key={n.id} className="rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-100">
                    <textarea
                      value={cur}
                      onChange={(e) => setDrafts((d) => ({ ...d, [n.id]: e.target.value }))}
                      rows={3}
                      className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-400"
                    />
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <p className="text-[11px] text-stone-400">
                        {n.created_by || "-"} · {n.created_at ? new Date(n.created_at).toLocaleString("id-ID") : "-"}
                        {n.updated_at && n.updated_at !== n.created_at ? " (diubah)" : ""}
                      </p>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          onClick={() => void saveNoteEdit(n.id)}
                          disabled={noteSaving || !cur.trim() || !dirty}
                          className="malika-gradient rounded-full px-3 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                        >
                          {noteSaving ? "…" : "Simpan"}
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => void removeNote(n.id)}
                            className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-stone-500 ring-1 ring-stone-200 hover:bg-red-50 hover:text-red-600"
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
            {notesMsg && <p className="mt-3 text-xs font-medium text-stone-600">{notesMsg}</p>}
          </div>
        </div>
      )}
      {cfgFor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold">⚙ Config deploy — <span className="font-mono">{cfgFor}</span></p>
              <button
                onClick={() => {
                  setCfgFor(null);
                  setCfgMsg(null);
                }}
                className="rounded-lg bg-white/70 px-2.5 py-1 text-xs ring-1 ring-stone-200 hover:bg-stone-100"
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>
            {cfgLoading ? (
              <p className="mt-4 text-center text-sm text-stone-500">Memuat config…</p>
            ) : (
              <div className="mt-3 space-y-4">
                {CFG_GROUPS.map((g) => (
                  <div key={g.title} className="rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-100">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-stone-400">{g.title}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {g.fields.map((f) =>
                        f.kind === "check" ? (
                          <label key={f.key} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-stone-200">
                            <input
                              type="checkbox"
                              checked={cfgForm[f.key] === "1"}
                              onChange={(e) => setCfgForm((prev) => ({ ...prev, [f.key]: e.target.checked ? "1" : "0" }))}
                              className="h-4 w-4 accent-teal-600"
                            />
                            <span className="text-xs font-medium text-stone-600">{f.label}</span>
                          </label>
                        ) : f.kind === "area" ? (
                          <label key={f.key} className="block sm:col-span-2">
                            <span className="mb-1 block text-[11px] font-medium text-stone-500">{f.label}</span>
                            <textarea
                              value={cfgForm[f.key] ?? ""}
                              onChange={(e) => setCfgForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                              rows={3}
                              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-teal-400"
                            />
                          </label>
                        ) : f.kind === "view" ? (
                          <div key={f.key} className="rounded-xl bg-stone-100 px-3 py-2 sm:col-span-2">
                            <p className="text-[11px] font-medium text-stone-500">{f.label}</p>
                            <p className="whitespace-pre-wrap font-mono text-xs text-stone-700">{cfgForm[f.key] || "-"}</p>
                          </div>
                        ) : (
                          <label key={f.key} className="block">
                            <span className="mb-1 block text-[11px] font-medium text-stone-500">{f.label}</span>
                            <input
                              value={cfgForm[f.key] ?? ""}
                              onChange={(e) => setCfgForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-400"
                            />
                          </label>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {cfgMsg && <p className="mt-3 text-xs font-medium text-stone-600">{cfgMsg}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setCfgFor(null);
                  setCfgMsg(null);
                }}
                className="rounded-full bg-white px-5 py-2 text-xs font-semibold text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
              >
                Batal
              </button>
              <button
                onClick={() => void saveCfg()}
                disabled={cfgLoading || cfgSaving}
                className="malika-gradient rounded-full px-5 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {cfgSaving ? "Menyimpan…" : "Simpan config"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

interface StaffUser {
  id: number;
  username: string;
  name: string;
  division: string;
  is_admin: number;
  active: number;
  created_at: string;
}

const DIVISIONS = ["marketing", "sales", "support", "it", "ai_engineer", "retensi", "bisdev", "admin"];

function UsersManager({ meUsername }: { meUsername: string }) {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ username: "", password: "", name: "", division: "support", is_admin: false });
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [editForm, setEditForm] = useState({ name: "", division: "support", is_admin: false, active: true });
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("gagal");
      const data = (await res.json()) as { users?: StaffUser[] };
      setUsers(data.users ?? []);
    } catch {
      setMsg("Gagal memuat staff.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "gagal");
      setForm({ username: "", password: "", name: "", division: "support", is_admin: false });
      setMsg("Akun staff dibuat. Beri tahu username + passwordnya secara aman.");
      void load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: StaffUser) {
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id, active: !u.active }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "gagal");
      void load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Gagal update.");
    }
  }

  async function resetPass(u: StaffUser) {
    const p = window.prompt(`Password baru untuk ${u.username} (min. 6 karakter):`);
    if (!p) return;
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id, password: p }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "gagal");
      setMsg(`Password ${u.username} diperbarui.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Gagal update.");
    }
  }

  function startEdit(u: StaffUser) {
    setEditing(u);
    setMsg(null);
    setEditForm({
      name: u.name,
      division: u.division,
      is_admin: !!u.is_admin,
      active: !!u.active,
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          name: editForm.name,
          division: editForm.division,
          is_admin: editForm.is_admin,
          active: editForm.active,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "gagal");
      setEditing(null);
      setMsg(`Staff ${editing.username} diperbarui.`);
      void load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Gagal menyimpan perubahan.");
    } finally {
      setEditSaving(false);
    }
  }

  async function remove(id: number, username: string) {
    if (!window.confirm(`Hapus akun ${username}?`)) return;
    try {
      const res = await fetch(`/api/users?id=${id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "gagal");
      setUsers((us) => us.filter((u) => u.id !== id));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Gagal menghapus.");
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {msg && (
        <p className="rounded-xl bg-white/70 px-4 py-2 text-xs font-medium text-stone-600 ring-1 ring-white">{msg}</p>
      )}
      <form onSubmit={submit} className="glass-strong rounded-3xl p-6">
        <h2 className="text-base font-bold">Tambah staff</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Username</span>
            <input value={form.username} onChange={(e) => setForm((s) => ({ ...s, username: e.target.value }))} placeholder="cth. budi" className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Password awal</span>
            <input value={form.password} onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))} type="text" placeholder="min. 6 karakter" className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Nama</span>
            <input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="cth. Budi Santoso" className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Divisi</span>
            <select value={form.division} onChange={(e) => setForm((s) => ({ ...s, division: e.target.value }))} className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400">
              {DIVISIONS.map((d) => (
                <option key={d} value={d}>{DIVISION_LABEL[d] ?? d}</option>
              ))}
            </select>
          </label>
          <label className="flex items-end gap-2 pb-2 text-xs font-semibold text-stone-600">
            <input type="checkbox" checked={form.is_admin} onChange={(e) => setForm((s) => ({ ...s, is_admin: e.target.checked }))} className="h-4 w-4 accent-teal-600" />
            Jadikan admin (akses penuh)
          </label>
        </div>
        <button type="submit" disabled={saving} className="malika-gradient mt-4 rounded-full px-6 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
          {saving ? "Menyimpan…" : "Buat akun"}
        </button>
      </form>

      <div className="glass-strong overflow-x-auto rounded-3xl">
        {loading ? (
          <p className="p-8 text-center text-sm text-stone-500">Memuat staff…</p>
        ) : (
          <table className="w-full min-w-3xl text-left text-sm">
            <thead>
              <tr className="border-b border-white/70 text-xs uppercase tracking-wider text-stone-400">
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Divisi</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-white/50 last:border-0 hover:bg-white/40">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{u.name} {u.username === meUsername && <span className="text-[11px] text-stone-400">(kamu)</span>}</p>
                    <p className="font-mono text-[11px] text-stone-400">@{u.username}{u.is_admin ? " · admin" : ""}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">{DIVISION_LABEL[u.division] ?? u.division}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${u.active ? "bg-teal-100 text-teal-800" : "bg-stone-200 text-stone-500"}`}>
                      {u.active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => startEdit(u)} className="rounded-full bg-white/70 px-3 py-1.5 text-[11px] font-semibold ring-1 ring-white hover:bg-white">
                        Edit
                      </button>
                      <button onClick={() => toggleActive(u)} disabled={u.username === meUsername} className="rounded-full bg-white/70 px-3 py-1.5 text-[11px] font-semibold ring-1 ring-white hover:bg-white disabled:opacity-40">
                        {u.active ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                      <button onClick={() => resetPass(u)} className="rounded-full bg-white/70 px-3 py-1.5 text-[11px] font-semibold ring-1 ring-white hover:bg-white">
                        Reset password
                      </button>
                      <button onClick={() => remove(u.id, u.username)} disabled={u.username === meUsername} className="rounded-full bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-stone-500 ring-1 ring-white hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <div className="glass-strong w-full max-w-md rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Edit staff</p>
                <h3 className="mt-1 text-lg font-bold">@{editing.username}</h3>
              </div>
              <button onClick={() => setEditing(null)} className="rounded-lg bg-white/70 px-2.5 py-1 text-sm ring-1 ring-white hover:bg-white" aria-label="Tutup">✕</button>
            </div>
            <form onSubmit={saveEdit} className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-stone-500">Nama</span>
                <input value={editForm.name} onChange={(e) => setEditForm((s) => ({ ...s, name: e.target.value }))} className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-stone-500">Divisi</span>
                <select value={editForm.division} onChange={(e) => setEditForm((s) => ({ ...s, division: e.target.value }))} className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400">
                  {DIVISIONS.map((d) => (
                    <option key={d} value={d}>{DIVISION_LABEL[d] ?? d}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-stone-600">
                <input type="checkbox" checked={editForm.is_admin} disabled={editing.username === meUsername && !editForm.is_admin} onChange={(e) => setEditForm((s) => ({ ...s, is_admin: e.target.checked }))} className="h-4 w-4 accent-teal-600" />
                Admin (akses penuh)
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-stone-600">
                <input type="checkbox" checked={editForm.active} disabled={editing.username === meUsername && !editForm.active} onChange={(e) => setEditForm((s) => ({ ...s, active: e.target.checked }))} className="h-4 w-4 accent-teal-600" />
                Akun aktif
              </label>
              <button type="submit" disabled={editSaving} className="malika-gradient w-full rounded-full py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
                {editSaving ? "Menyimpan…" : "Simpan perubahan"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

interface PayLog {
  id: number;
  received_at: string;
  from_addr: string;
  subject: string;
  parsed_amounts: string;
  matched_order: string;
  action: string;
  note: string;
}

const LOG_STYLE: Record<string, string> = {
  verified: "bg-teal-100 text-teal-800",
  needs_review: "bg-amber-100 text-amber-800",
  ignored: "bg-stone-200 text-stone-600",
};

const LOG_FILTERS = [
  { key: "", label: "Semua" },
  { key: "verified", label: "Terverifikasi" },
  { key: "needs_review", label: "Perlu review" },
  { key: "ignored", label: "Diabaikan" },
];

interface DeployConfig {
  order_id: string;
  client_name: string;
  short_name: string;
  server_name: string;
  project_name: string;
  vps_id: string;
  server_ip: string;
  web_domain: string;
  connector_domain: string;
  router_domain: string;
  gowa_domain: string;
  deploy_status: string;
  updated_at: string;
}

const DEPLOY_STYLE: Record<string, string> = {
  pending: "bg-stone-200 text-stone-600",
  provisioning: "bg-blue-100 text-blue-800",
  ready: "bg-teal-100 text-teal-800",
  failed: "bg-red-100 text-red-700",
};

function ServerManager() {
  const [configs, setConfigs] = useState<DeployConfig[]>([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("tempo");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vps, setVps] = useState<Record<string, { status: string; periode: string; tempo: string; ip: string; online: boolean }>>({});
  const [vpsAt, setVpsAt] = useState("");
  const [vpsLoading, setVpsLoading] = useState(false);
  const [vpsMsg, setVpsMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyId(order_id: string) {
    try {
      await navigator.clipboard.writeText(order_id);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = order_id;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiedId(order_id);
    setTimeout(() => setCopiedId((c) => (c === order_id ? null : c)), 1500);
  }
  const [editFor, setEditFor] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/deploy-configs");
      if (!res.ok) throw new Error("gagal");
      const data = (await res.json()) as { configs?: DeployConfig[] };
      setConfigs(data.configs ?? []);
    } catch {
      setError("Gagal memuat config server. Coba muat ulang.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Lookup status VPS IndoVM (mapping service_id = vps_id). Best-effort:
  // tabel config tetap tampil walau lookup gagal/lambat.
  const loadVps = useCallback(async () => {
    setVpsLoading(true);
    setVpsMsg(null);
    try {
      const res = await fetch("/api/vps-status");
      const data = (await res.json()) as {
        ok?: boolean;
        vps?: Record<string, { status: string; periode: string; tempo: string; ip: string; online: boolean }>;
        diambil_pada?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "gagal");
      setVps(data.vps ?? {});
      setVpsAt(data.diambil_pada ?? "");
    } catch (err) {
      setVpsMsg(err instanceof Error ? err.message : "Gagal lookup VPS.");
    } finally {
      setVpsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVps();
  }, [loadVps]);

  async function openEdit(order_id: string) {
    setEditMsg(null);
    setEditFor(order_id);
    setEditLoading(true);
    try {
      const res = await fetch(`/api/deploy-configs?order_id=${encodeURIComponent(order_id)}`);
      const data = (await res.json()) as { ok?: boolean; config?: Record<string, unknown> };
      const f: Record<string, string> = {};
      if (res.ok && data.config) {
        for (const k of CFG_KEYS) f[k] = String(data.config[k] ?? "");
      } else {
        for (const k of CFG_KEYS) f[k] = "";
        setEditMsg("Belum ada config untuk order ini — isi lalu simpan untuk membuat baru.");
      }
      setEditForm(f);
    } catch {
      const f: Record<string, string> = {};
      for (const k of CFG_KEYS) f[k] = "";
      setEditForm(f);
      setEditMsg("Gagal memuat config.");
    } finally {
      setEditLoading(false);
    }
  }

  async function saveEdit() {
    if (!editFor) return;
    setEditSaving(true);
    setEditMsg(null);
    try {
      const res = await fetch("/api/deploy-configs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: editFor, ...editForm }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "gagal");
      setEditFor(null);
      void load();
    } catch (err) {
      setEditMsg(err instanceof Error ? err.message : "Gagal menyimpan config.");
    } finally {
      setEditSaving(false);
    }
  }

  const visible = configs.filter((c) => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return [c.order_id, c.client_name, c.short_name, c.server_name, c.server_ip, c.web_domain, c.vps_id]
      .join(" ")
      .toLowerCase()
      .includes(s);
  });

  // Nilai dd/mm/yyyy -> angka yyyymmdd (invalid = paling belakang).
  function tempoVal(t: string): number {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((t || "").trim());
    if (!m) return Number.MAX_SAFE_INTEGER;
    return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]);
  }

  function vpsOf(c: DeployConfig) {
    return c.vps_id ? vps[String(c.vps_id)] : undefined;
  }

  const sorted = [...visible].sort((a, b) => {
    const va = vpsOf(a);
    const vb = vpsOf(b);
    switch (sortKey) {
      case "server_asc":
        return (a.server_name || "").localeCompare(b.server_name || "", "id");
      case "tempo":
        return tempoVal(va?.tempo ?? "") - tempoVal(vb?.tempo ?? "");
      default:
        return (a.client_name || "").localeCompare(b.client_name || "", "id");
    }
  });

  return (
    <div className="mt-4">
      <div className="glass flex items-center gap-2 rounded-2xl p-2">
        <span className="pl-2 text-sm text-stone-400">🔍</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari server: klien, server name, IP, domain, VPS ID, order ID…"
          className="w-full bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-stone-400"
        />
        <button
          onClick={() => void loadVps()}
          disabled={vpsLoading}
          title="Refresh status VPS dari IndoVM"
          className="shrink-0 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold ring-1 ring-white hover:bg-white disabled:opacity-60"
        >
          {vpsLoading ? "…" : "🔄 Reload"}
        </button>
        <label className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-stone-500">
          Urut
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            className="rounded-xl border border-stone-200 bg-white/80 px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-teal-400"
          >
            <option value="client_asc">Klien A–Z</option>
            <option value="server_asc">Server A–Z</option>
            <option value="tempo">Jatuh tempo</option>
          </select>
        </label>
        {search && (
          <button
            onClick={() => setSearch("")}
            className="shrink-0 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold ring-1 ring-white hover:bg-white"
          >
            ✕
          </button>
        )}
      </div>
      {error && (
        <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600 ring-1 ring-red-100">{error}</p>
      )}
      {(vpsMsg || vpsAt) && (
        <p className="mt-4 rounded-xl bg-stone-100 px-3 py-2 text-xs font-medium text-stone-500 ring-1 ring-stone-200">
          {vpsMsg ?? `Status VPS per ${new Date(vpsAt).toLocaleString("id-ID")}`}
        </p>
      )}
      <div className="glass-strong mt-4 overflow-x-auto rounded-3xl">
        {loading ? (
          <p className="p-8 text-center text-sm text-stone-500">Memuat config server…</p>
        ) : visible.length === 0 ? (
          <p className="p-8 text-center text-sm text-stone-500">Belum ada config deploy. Config dibuat otomatis saat checkout.</p>
        ) : (
          <table className="w-full min-w-3xl text-left text-sm">
            <thead>
              <tr className="border-b border-white/70 text-xs uppercase tracking-wider text-stone-400">
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Klien / Server</th>
                <th className="px-4 py-3 font-semibold">Layanan</th>
                <th className="px-4 py-3 font-semibold">Periode</th>
                <th className="px-4 py-3 font-semibold">Jatuh tempo</th>
                <th className="px-4 py-3 font-semibold">IP</th>
                <th className="px-4 py-3 font-semibold">Online</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const v = c.vps_id ? vps[String(c.vps_id)] : undefined;
                const vpsPending = vpsLoading && !v;
                const skel = <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-teal-600" />;
                return (
                <tr key={c.order_id} className="border-b border-white/50 last:border-0 hover:bg-white/40">
                  <td className="px-4 py-3">
                    <span className="font-mono text-[11px] text-stone-500" title={c.order_id}>
                      {c.order_id.slice(0, 8)}…
                    </span>
                    <button
                      onClick={() => void copyId(c.order_id)}
                      title="Salin order ID"
                      aria-label="Salin order ID"
                      className="ml-1 rounded-md px-1 text-[11px] text-stone-400 hover:bg-white hover:text-stone-700"
                    >
                      {copiedId === c.order_id ? "✓" : "⧉"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-semibold">{c.client_name || "-"}</p>
                    <p className="text-[11px] text-stone-500">{c.server_name || "-"}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">{vpsPending ? skel : v?.status ?? "-"}</td>
                  <td className="px-4 py-3 text-xs">{vpsPending ? skel : v?.periode ?? "-"}</td>
                  <td className="px-4 py-3 text-xs">{vpsPending ? skel : v?.tempo ?? "-"}</td>
                  <td className="px-4 py-3 font-mono text-[11px]">{vpsPending ? skel : v?.ip || c.server_ip || "-"}</td>
                  <td className="px-4 py-3 text-sm">{vpsPending ? skel : v ? (v.online ? "🟢" : "🔴") : "-"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${DEPLOY_STYLE[c.deploy_status] ?? "bg-stone-200 text-stone-600"}`}
                    >
                      {c.deploy_status || "pending"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {c.vps_id && (
                        <a
                          href={`https://www.indovm.com/myaccount/myproducts-detail/${encodeURIComponent(c.vps_id)}?m_page=home`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Buka di IndoVM"
                          className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100"
                        >
                          IndoVM ↗
                        </a>
                      )}
                      <button
                        onClick={() => void openEdit(c.order_id)}
                        className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100"
                      >
                        ⚙ Config
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {editFor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold">⚙ Config deploy — <span className="font-mono">{editFor}</span></p>
              <button
                onClick={() => {
                  setEditFor(null);
                  setEditMsg(null);
                }}
                className="rounded-lg bg-white/70 px-2.5 py-1 text-xs ring-1 ring-stone-200 hover:bg-stone-100"
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>
            {editLoading ? (
              <p className="mt-4 text-center text-sm text-stone-500">Memuat config…</p>
            ) : (
              <div className="mt-3 space-y-4">
                {CFG_GROUPS.map((g) => (
                  <div key={g.title} className="rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-100">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-stone-400">{g.title}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {g.fields.map((f) =>
                        f.kind === "check" ? (
                          <label key={f.key} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-stone-200">
                            <input
                              type="checkbox"
                              checked={editForm[f.key] === "1"}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, [f.key]: e.target.checked ? "1" : "0" }))}
                              className="h-4 w-4 accent-teal-600"
                            />
                            <span className="text-xs font-medium text-stone-600">{f.label}</span>
                          </label>
                        ) : f.kind === "area" ? (
                          <label key={f.key} className="block sm:col-span-2">
                            <span className="mb-1 block text-[11px] font-medium text-stone-500">{f.label}</span>
                            <textarea
                              value={editForm[f.key] ?? ""}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                              rows={3}
                              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-teal-400"
                            />
                          </label>
                        ) : f.kind === "view" ? (
                          <div key={f.key} className="rounded-xl bg-stone-100 px-3 py-2 sm:col-span-2">
                            <p className="text-[11px] font-medium text-stone-500">{f.label}</p>
                            <p className="whitespace-pre-wrap font-mono text-xs text-stone-700">{editForm[f.key] || "-"}</p>
                          </div>
                        ) : (
                          <label key={f.key} className="block">
                            <span className="mb-1 block text-[11px] font-medium text-stone-500">{f.label}</span>
                            <input
                              value={editForm[f.key] ?? ""}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-400"
                            />
                          </label>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {editMsg && <p className="mt-3 text-xs font-medium text-stone-600">{editMsg}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setEditFor(null);
                  setEditMsg(null);
                }}
                className="rounded-full bg-white px-5 py-2 text-xs font-semibold text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
              >
                Batal
              </button>
              <button
                onClick={() => void saveEdit()}
                disabled={editLoading || editSaving}
                className="malika-gradient rounded-full px-5 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {editSaving ? "Menyimpan…" : "Simpan config"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentLogs() {
  const [logs, setLogs] = useState<PayLog[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (action: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = action ? `/api/payment-logs?action=${encodeURIComponent(action)}` : "/api/payment-logs";
      const res = await fetch(url);
      if (!res.ok) throw new Error("gagal");
      const data = (await res.json()) as { logs?: PayLog[] };
      setLogs(data.logs ?? []);
    } catch {
      setError("Gagal memuat log. Coba muat ulang.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  function changeFilter(key: string) {
    setFilter(key);
    void load(key);
  }

  function fmtAmounts(raw: string): string {
    try {
      const arr: unknown = JSON.parse(raw);
      if (!Array.isArray(arr) || arr.length === 0) return "-";
      return arr.map((n) => formatRp(Number(n))).join(", ");
    } catch {
      return "-";
    }
  }

  return (
    <div className="mt-4">
      <div className="glass flex flex-wrap gap-1 rounded-2xl p-1 text-sm font-semibold">
        {LOG_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => changeFilter(f.key)}
            className={`rounded-xl px-4 py-2 transition ${
              filter === f.key ? "malika-gradient text-white shadow" : "text-stone-500 hover:bg-white/70 hover:text-stone-900"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {error && (
        <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600 ring-1 ring-red-100">{error}</p>
      )}
      <div className="glass-strong mt-4 overflow-x-auto rounded-3xl">
        {loading ? (
          <p className="p-8 text-center text-sm text-stone-500">Memuat log…</p>
        ) : logs.length === 0 ? (
          <p className="p-8 text-center text-sm text-stone-500">
            Belum ada email diproses. Forward notifikasi pembayaran ke alamat Email Routing worker untuk mulai mencatat.
          </p>
        ) : (
          <table className="w-full min-w-3xl text-left text-sm">
            <thead>
              <tr className="border-b border-white/70 text-xs uppercase tracking-wider text-stone-400">
                <th className="px-4 py-3 font-semibold">Waktu</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Nominal terdeteksi</th>
                <th className="px-4 py-3 font-semibold">Order cocok</th>
                <th className="px-4 py-3 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-white/50 last:border-0 hover:bg-white/40">
                  <td className="px-4 py-3 text-xs text-stone-500">
                    {l.received_at ? new Date(l.received_at).toLocaleString("id-ID") : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-55 truncate text-xs font-medium">{l.subject || "(tanpa subjek)"}</p>
                    <p className="max-w-55 truncate text-[11px] text-stone-400">{l.from_addr}</p>
                    {l.note && <p className="mt-0.5 max-w-55 truncate text-[11px] text-stone-500">{l.note}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium">{fmtAmounts(l.parsed_amounts)}</td>
                  <td className="px-4 py-3 font-mono text-[11px]">
                    {l.matched_order ? l.matched_order.slice(0, 8) + "…" : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${LOG_STYLE[l.action] ?? "bg-stone-200 text-stone-600"}`}
                    >
                      {l.action === "verified" ? "Terverifikasi" : l.action === "needs_review" ? "Perlu review" : "Diabaikan"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


interface PromoRow {
  code: string;
  type: string;
  value: number;
  max_uses: number;
  used_count: number;
  active: number;
  expires_at: string;
  created_at: string;
}

function PromoManager() {
  const [promos, setPromos] = useState<PromoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ code: "", type: "percent", value: "", max_uses: "", expires_at: "", active: true });
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/promos");
      if (!res.ok) throw new Error("gagal");
      const data = (await res.json()) as { promos?: PromoRow[] };
      setPromos(data.promos ?? []);
    } catch {
      setMsg("Gagal memuat kode promo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/promos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          type: form.type,
          value: Number(form.value),
          max_uses: Number(form.max_uses || 0),
          expires_at: form.expires_at,
          active: form.active,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "gagal");
      setForm({ code: "", type: "percent", value: "", max_uses: "", expires_at: "", active: true });
      setEditing(null);
      setMsg("Kode promo tersimpan — langsung bisa dipakai saat checkout.");
      void load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(p: PromoRow) {
    setEditing(p.code);
    setMsg(null);
    setForm({
      code: p.code,
      type: p.type,
      value: String(p.value),
      max_uses: String(p.max_uses || ""),
      expires_at: (p.expires_at ?? "").slice(0, 10),
      active: !!p.active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditing(null);
    setForm({ code: "", type: "percent", value: "", max_uses: "", expires_at: "", active: true });
  }

  async function toggle(p: PromoRow) {
    try {
      const res = await fetch("/api/promos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: p.code, type: p.type, value: p.value, max_uses: p.max_uses, expires_at: p.expires_at, active: !p.active }),
      });
      if (!res.ok) throw new Error("gagal");
      void load();
    } catch {
      setMsg("Gagal mengubah status.");
    }
  }

  async function remove(code: string) {
    if (!window.confirm(`Hapus kode ${code}?`)) return;
    try {
      const res = await fetch(`/api/promos?code=${encodeURIComponent(code)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("gagal");
      setPromos((ps) => ps.filter((p) => p.code !== code));
    } catch {
      setMsg("Gagal menghapus.");
    }
  }

  const set = (k: "code" | "type" | "value" | "max_uses" | "expires_at") => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((s) => ({ ...s, [k]: k === "code" ? e.target.value.toUpperCase() : e.target.value }));

  function desc(p: PromoRow): string {
    return p.type === "fixed" ? `Potongan ${formatRp(p.value)}` : `Diskon ${p.value}%`;
  }

  return (
    <div className="mt-4 space-y-3">
      {msg && (
        <p className="rounded-xl bg-white/70 px-4 py-2 text-xs font-medium text-stone-600 ring-1 ring-white">{msg}</p>
      )}
      <form onSubmit={submit} className="glass-strong rounded-3xl p-6">
        <h2 className="text-base font-bold">{editing ? `Edit kode ${editing}` : "Buat / update kode promo"}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Kode</span>
            <input value={form.code} onChange={set("code")} disabled={!!editing} placeholder="cth. HEMAT20" className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm uppercase outline-none focus:border-teal-400 disabled:bg-stone-100 disabled:text-stone-400" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Tipe</span>
            <select value={form.type} onChange={set("type")} className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400">
              <option value="percent">Persen (%)</option>
              <option value="fixed">Nominal (Rp)</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Nilai {form.type === "fixed" ? "(Rp)" : "(1-100)"}</span>
            <input value={form.value} onChange={set("value")} type="number" min={1} placeholder={form.type === "fixed" ? "cth. 200000" : "cth. 20"} className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Maks. pakai (0 = tanpa batas)</span>
            <input value={form.max_uses} onChange={set("max_uses")} type="number" min={0} placeholder="cth. 50" className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Kedaluwarsa (opsional)</span>
            <input value={form.expires_at} onChange={set("expires_at")} type="date" className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400" />
          </label>
          <label className="flex items-end gap-2 pb-2 text-xs font-semibold text-stone-600">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((s) => ({ ...s, active: e.target.checked }))} className="h-4 w-4 accent-teal-600" />
            Aktif
          </label>
        </div>
        <button type="submit" disabled={saving} className="malika-gradient mt-4 rounded-full px-6 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
          {saving ? "Menyimpan…" : editing ? `Simpan perubahan ${editing}` : "Simpan kode promo"}
        </button>
        {editing && (
          <button type="button" onClick={cancelEdit} className="ml-2 mt-4 rounded-full bg-white/70 px-6 py-2 text-sm font-semibold ring-1 ring-white hover:bg-white">
            Batal edit
          </button>
        )}
      </form>

      <div className="glass-strong overflow-x-auto rounded-3xl">
        {loading ? (
          <p className="p-8 text-center text-sm text-stone-500">Memuat kode promo…</p>
        ) : promos.length === 0 ? (
          <p className="p-8 text-center text-sm text-stone-500">Belum ada kode promo.</p>
        ) : (
          <table className="w-full min-w-3xl text-left text-sm">
            <thead>
              <tr className="border-b border-white/70 text-xs uppercase tracking-wider text-stone-400">
                <th className="px-4 py-3 font-semibold">Kode</th>
                <th className="px-4 py-3 font-semibold">Potongan</th>
                <th className="px-4 py-3 font-semibold">Terpakai</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <tr key={p.code} className="border-b border-white/50 last:border-0 hover:bg-white/40">
                  <td className="px-4 py-3 font-mono font-bold">{p.code}</td>
                  <td className="px-4 py-3 text-xs">{desc(p)}</td>
                  <td className="px-4 py-3 text-xs font-medium">
                    {p.used_count}{p.max_uses > 0 ? ` / ${p.max_uses}` : " / ∞"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${p.active ? "bg-teal-100 text-teal-800" : "bg-stone-200 text-stone-500"}`}>
                      {p.active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => startEdit(p)} className="rounded-full bg-white/70 px-3 py-1.5 text-[11px] font-semibold ring-1 ring-white hover:bg-white">
                        Edit
                      </button>
                      <button onClick={() => toggle(p)} className="rounded-full bg-white/70 px-3 py-1.5 text-[11px] font-semibold ring-1 ring-white hover:bg-white">
                        {p.active ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                      <button onClick={() => remove(p.code)} className="rounded-full bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-stone-500 ring-1 ring-white hover:bg-red-50 hover:text-red-600">
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

interface AffTierRow {
  id: number;
  min_referrals: number;
  budget_percent: number;
  active: number;
  created_at: string;
}

interface AffCodeRow {
  code: string;
  customer_id: number;
  email: string;
  discount_percent: number;
  commission_percent: number;
  active: number;
  created_at: string;
}

interface AffRefRow {
  id: number;
  code: string;
  order_id: string;
  discount_amount: number;
  commission_amount: number;
  status: string;
  created_at: string;
}

function AffiliateManager() {
  const [tiers, setTiers] = useState<AffTierRow[]>([]);
  const [codes, setCodes] = useState<AffCodeRow[]>([]);
  const [refs, setRefs] = useState<AffRefRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tForm, setTForm] = useState({ min_referrals: "", budget_percent: "" });
  const [editingTier, setEditingTier] = useState<AffTierRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tr, af] = await Promise.all([
        fetch("/api/affiliate-tiers?all=1").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/affiliate?all=1").then((r) => (r.ok ? r.json() : null)),
      ]);
      setTiers((tr as { tiers?: AffTierRow[] } | null)?.tiers ?? []);
      setCodes((af as { codes?: AffCodeRow[] } | null)?.codes ?? []);
      setRefs((af as { referrals?: AffRefRow[] } | null)?.referrals ?? []);
    } catch {
      setMsg("Gagal memuat data affiliate.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveTier(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/affiliate-tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingTier ? { id: editingTier.id } : {}),
          min_referrals: Number(tForm.min_referrals),
          budget_percent: Number(tForm.budget_percent),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "gagal");
      setTForm({ min_referrals: "", budget_percent: "" });
      setEditingTier(null);
      setMsg("Tier tersimpan.");
      void load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Gagal menyimpan tier.");
    } finally {
      setSaving(false);
    }
  }

  function startEditTier(t: AffTierRow) {
    setEditingTier(t);
    setTForm({ min_referrals: String(t.min_referrals), budget_percent: String(t.budget_percent) });
  }

  async function removeTier(id: number) {
    if (!window.confirm("Hapus tier ini?")) return;
    try {
      const res = await fetch(`/api/affiliate-tiers?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("gagal");
      void load();
    } catch {
      setMsg("Gagal menghapus tier.");
    }
  }

  async function markPaid(r: AffRefRow) {
    const next = r.status === "paid" ? "payable" : "paid";
    try {
      const res = await fetch("/api/affiliate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referral_id: r.id, status: next }),
      });
      if (!res.ok) throw new Error("gagal");
      setRefs((xs) => xs.map((x) => (x.id === r.id ? { ...x, status: next } : x)));
    } catch {
      setMsg("Gagal update status komisi.");
    }
  }

  const totalPayable = refs.filter((r) => r.status !== "paid").reduce((a, r) => a + r.commission_amount, 0);
  const totalPaid = refs.filter((r) => r.status === "paid").reduce((a, r) => a + r.commission_amount, 0);

  return (
    <div className="mt-4 space-y-3">
      {msg && (
        <p className="rounded-xl bg-white/70 px-4 py-2 text-xs font-medium text-stone-600 ring-1 ring-white">{msg}</p>
      )}
      <form onSubmit={saveTier} className="glass-strong rounded-3xl p-6">
        <h2 className="text-base font-bold">
          {editingTier ? `Edit tier (≥ ${editingTier.min_referrals} referral)` : "Tambah tier jatah affiliate"}
        </h2>
        <p className="mt-1 text-xs text-stone-500">
          Jatah = total % yang dibagi referrer menjadi diskon teman + komisi. Contoh: 0+ referral → 10%, 20+ → 15%, 50+ → 20%.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Min. referral</span>
            <input value={tForm.min_referrals} onChange={(e) => setTForm((s) => ({ ...s, min_referrals: e.target.value }))} type="number" min={0} placeholder="cth. 20" className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Jatah budget (%)</span>
            <input value={tForm.budget_percent} onChange={(e) => setTForm((s) => ({ ...s, budget_percent: e.target.value }))} type="number" min={0} max={100} placeholder="cth. 15" className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400" />
          </label>
        </div>
        <button type="submit" disabled={saving} className="malika-gradient mt-4 rounded-full px-6 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
          {saving ? "Menyimpan…" : editingTier ? "Simpan perubahan" : "Tambah tier"}
        </button>
        {editingTier && (
          <button type="button" onClick={() => { setEditingTier(null); setTForm({ min_referrals: "", budget_percent: "" }); }} className="ml-2 mt-4 rounded-full bg-white/70 px-6 py-2 text-sm font-semibold ring-1 ring-white hover:bg-white">
            Batal edit
          </button>
        )}
      </form>

      <div className="glass-strong overflow-x-auto rounded-3xl">
        <p className="px-4 pt-4 text-sm font-bold">Tier aktif ({tiers.length})</p>
        {loading ? (
          <p className="p-8 text-center text-sm text-stone-500">Memuat…</p>
        ) : tiers.length === 0 ? (
          <p className="p-8 text-center text-sm text-stone-500">Belum ada tier — tambah tier pertama di atas.</p>
        ) : (
          <table className="w-full min-w-3xl text-left text-sm">
            <thead>
              <tr className="border-b border-white/70 text-xs uppercase tracking-wider text-stone-400">
                <th className="px-4 py-3 font-semibold">Min. referral</th>
                <th className="px-4 py-3 font-semibold">Jatah</th>
                <th className="px-4 py-3 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t) => (
                <tr key={t.id} className="border-b border-white/50 last:border-0 hover:bg-white/40">
                  <td className="px-4 py-3 font-semibold">≥ {t.min_referrals}</td>
                  <td className="px-4 py-3 text-teal-700 font-bold">{t.budget_percent}%</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => startEditTier(t)} className="rounded-full bg-white/70 px-3 py-1.5 text-[11px] font-semibold ring-1 ring-white hover:bg-white">Edit</button>
                      <button onClick={() => removeTier(t.id)} className="rounded-full bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-stone-500 ring-1 ring-white hover:bg-red-50 hover:text-red-600">Hapus</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="glass-strong overflow-x-auto rounded-3xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <p className="text-sm font-bold">Kode affiliate ({codes.length})</p>
          <p className="text-xs text-stone-500">Menunggu cair {formatRp(totalPayable)} · Sudah cair {formatRp(totalPaid)}</p>
        </div>
        {codes.length === 0 ? (
          <p className="p-8 text-center text-sm text-stone-500">Belum ada kode affiliate.</p>
        ) : (
          <table className="w-full min-w-3xl text-left text-sm">
            <thead>
              <tr className="border-b border-white/70 text-xs uppercase tracking-wider text-stone-400">
                <th className="px-4 py-3 font-semibold">Kode</th>
                <th className="px-4 py-3 font-semibold">Pemilik</th>
                <th className="px-4 py-3 font-semibold">Split</th>
                <th className="px-4 py-3 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((cd) => {
                const mine = refs.filter((r) => r.code === cd.code);
                const n = mine.length;
                return (
                  <tr key={cd.code} className="border-b border-white/50 last:border-0 hover:bg-white/40">
                    <td className="px-4 py-3 font-mono font-bold">{cd.code}</td>
                    <td className="px-4 py-3 text-xs">{cd.email} · {n} referral</td>
                    <td className="px-4 py-3 text-xs">diskon {cd.discount_percent}% + komisi {cd.commission_percent}%</td>
                    <td className="px-4 py-3 text-xs text-stone-400">{cd.active ? "Aktif" : "Nonaktif"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="glass-strong overflow-x-auto rounded-3xl">
        <p className="px-4 pt-4 text-sm font-bold">Referral & komisi ({refs.length})</p>
        {refs.length === 0 ? (
          <p className="p-8 text-center text-sm text-stone-500">Belum ada referral terverifikasi.</p>
        ) : (
          <table className="w-full min-w-3xl text-left text-sm">
            <thead>
              <tr className="border-b border-white/70 text-xs uppercase tracking-wider text-stone-400">
                <th className="px-4 py-3 font-semibold">Kode</th>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Komisi</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {refs.map((r) => (
                <tr key={r.id} className="border-b border-white/50 last:border-0 hover:bg-white/40">
                  <td className="px-4 py-3 font-mono font-bold">{r.code}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.order_id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 font-bold text-teal-700">{formatRp(r.commission_amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${r.status === "paid" ? "bg-teal-100 text-teal-800" : "bg-amber-100 text-amber-800"}`}>
                      {r.status === "paid" ? "Cair" : "Menunggu"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => markPaid(r)} className="rounded-full bg-white/70 px-3 py-1.5 text-[11px] font-semibold ring-1 ring-white hover:bg-white">
                      {r.status === "paid" ? "Batalkan cair" : "Tandai cair"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

interface PlanRow {
  key: string;
  name: string;
  price: number;  period: string;
  description: string;
  features: string[];
  cta: string;
  popular: boolean;
}

function PricingManager() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pricing")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { plans?: PlanRow[] } | null) => setPlans(data?.plans ?? []))
      .catch(() => setMsg("Gagal memuat harga paket."))
      .finally(() => setLoading(false));
  }, []);

  function edit(key: string, patch: Partial<PlanRow>) {
    setPlans((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  async function save(p: PlanRow) {
    const price = Math.round(Number(p.price));
    if (!price || price <= 0) {
      setMsg(`Harga ${p.name} harus angka > 0.`);
      return;
    }
    setSaving(p.key);
    setMsg(null);
    try {
      const res = await fetch("/api/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: p.key,
          price,
          description: p.description,
          features: p.features,
          cta: p.cta,
          popular: p.popular,
        }),
      });
      if (!res.ok) throw new Error("gagal");
      setMsg(`${p.name} tersimpan — halaman #harga ikut update otomatis.`);
    } catch {
      setMsg(`Gagal menyimpan ${p.name}.`);
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <p className="p-8 text-center text-sm text-stone-500">Memuat harga paket…</p>;

  return (
    <div className="mt-4 space-y-3">
      {msg && (
        <p className="rounded-xl bg-white/70 px-4 py-2 text-xs font-medium text-stone-600 ring-1 ring-white">{msg}</p>
      )}
      {plans.map((p) => (
        <div key={p.key} className="glass-strong rounded-3xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">
              {p.name} <span className="text-xs font-normal text-stone-400">({p.key})</span>
            </h2>
            <label className="flex items-center gap-2 text-xs font-semibold text-stone-600">
              <input
                type="checkbox"
                checked={p.popular}
                onChange={(e) => edit(p.key, { popular: e.target.checked })}
                className="h-4 w-4 accent-teal-600"
              />
              Paling Populer
            </label>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-500">Harga (Rp, angka saja)</span>
              <input
                type="number"
                min={1}
                value={p.price}
                onChange={(e) => edit(p.key, { price: Number(e.target.value) })}
                className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-500">Tombol CTA</span>
              <input
                value={p.cta}
                onChange={(e) => edit(p.key, { cta: e.target.value })}
                className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-stone-500">Deskripsi</span>
              <input
                value={p.description}
                onChange={(e) => edit(p.key, { description: e.target.value })}
                className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-stone-500">Fitur (satu per baris)</span>
              <textarea
                rows={Math.min(12, Math.max(4, p.features.length + 1))}
                value={p.features.join("\n")}
                onChange={(e) =>
                  edit(p.key, { features: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })
                }
                className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400"
              />
            </label>
          </div>
          <button
            onClick={() => save(p)}
            disabled={saving === p.key}
            className="malika-gradient mt-4 rounded-full px-6 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {saving === p.key ? "Menyimpan…" : `Simpan ${p.name}`}
          </button>
        </div>
      ))}
    </div>
  );
}
