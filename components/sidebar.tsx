// language: TypeScript, file: components/sidebar.tsx, target: client component
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChatsCircle,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  SignOut,
  Sparkle,
  Trash,
  X,
} from "@phosphor-icons/react";

type Session = { id: string; title: string; model: string; updated_at: string };

function group(sessions: Session[]) {
  const now = Date.now();
  const day = 86_400_000;
  const out: { label: string; items: Session[] }[] = [
    { label: "Hari ini", items: [] },
    { label: "7 hari terakhir", items: [] },
    { label: "Lebih lama", items: [] },
  ];
  for (const s of sessions) {
    const age = now - new Date(s.updated_at).getTime();
    if (age < day) out[0].items.push(s);
    else if (age < 7 * day) out[1].items.push(s);
    else out[2].items.push(s);
  }
  return out.filter((g) => g.items.length > 0);
}

export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-[10px] bg-[var(--accent)] text-[var(--accent-fg)]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Sparkle weight="fill" size={size * 0.58} />
    </span>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      if (!res.ok) return;
      const body = (await res.json()) as { sessions: Session[] };
      setSessions(body.sessions);
      setLoaded(true);
    } catch {
      /* sidebar tidak boleh merusak halaman */
    }
  }, []);

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener("sessions-changed", onChange);
    return () => window.removeEventListener("sessions-changed", onChange);
  }, [load]);

  const activeId = pathname.startsWith("/c/") ? pathname.slice(3) : "";
  const filtered = query
    ? sessions.filter((s) => s.title.toLowerCase().includes(query.toLowerCase()))
    : sessions;

  async function rename(id: string) {
    const title = draft.trim();
    setEditing(null);
    if (!title) return;
    await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
    if (id === activeId) {
      window.dispatchEvent(new CustomEvent("session-title-changed", { detail: title }));
    }
  }

  async function remove(id: string) {
    if (!confirm("Hapus sesi ini? Pesan di dalamnya ikut hilang.")) return;
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (id === activeId) {
      router.push("/");
      router.refresh();
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const panel = (
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)]">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Beranda">
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-tight">AI</span>
        </Link>
        <button
          onClick={() => setOpen(false)}
          className="ml-auto rounded-full p-1.5 text-[var(--muted)] transition hover:bg-[var(--border)] hover:text-[var(--fg)] md:hidden"
          aria-label="Tutup menu"
        >
          <X size={16} weight="bold" />
        </button>
      </div>

      <div className="px-3 pb-2">
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-fg)] transition hover:brightness-95 active:scale-[0.98]"
        >
          <Plus size={16} weight="bold" />
          Chat baru
        </Link>
      </div>

      <div className="px-3 pb-3">
        <div className="relative">
          <MagnifyingGlass
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--faint)]"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari sesi"
            aria-label="Cari sesi"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] py-2 pl-9 pr-3 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-[var(--border-strong)]"
          />
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {!loaded ? (
          <div className="space-y-2 px-2 pt-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-7 rounded-xl bg-[var(--border)]/60" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-start gap-1.5 px-3 py-6 text-[var(--muted)]">
            <ChatsCircle size={20} weight="light" />
            <p className="text-sm">{query ? "Tidak ada sesi cocok." : "Belum ada sesi."}</p>
          </div>
        ) : (
          group(filtered).map((g) => (
            <div key={g.label} className="mb-4">
              <p className="px-3 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--faint)]">
                {g.label}
              </p>
              {g.items.map((s) =>
                editing === s.id ? (
                  <input
                    key={s.id}
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => rename(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") rename(s.id);
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="mb-1 w-full rounded-xl border border-[var(--accent)] bg-[var(--panel)] px-3 py-1.5 text-sm outline-none"
                  />
                ) : (
                  <div
                    key={s.id}
                    className={`group mb-1 flex items-center gap-1 rounded-xl px-3 py-2 transition ${
                      s.id === activeId
                        ? "bg-[var(--border)]/70"
                        : "hover:bg-[var(--border)]/45"
                    }`}
                  >
                    <Link
                      href={`/c/${s.id}`}
                      onClick={() => setOpen(false)}
                      className="min-w-0 flex-1 truncate text-sm text-[var(--fg)]"
                      title={s.title}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        setEditing(s.id);
                        setDraft(s.title);
                      }}
                    >
                      {s.title}
                    </Link>
                    <button
                      onClick={() => {
                        setEditing(s.id);
                        setDraft(s.title);
                      }}
                      title="Ubah judul"
                      aria-label={`Ubah judul ${s.title}`}
                      className="rounded-full p-1 text-[var(--faint)] opacity-0 transition hover:bg-[var(--panel)] hover:text-[var(--fg)] focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <PencilSimple size={14} />
                    </button>
                    <button
                      onClick={() => remove(s.id)}
                      title="Hapus sesi"
                      aria-label={`Hapus sesi ${s.title}`}
                      className="rounded-full p-1 text-[var(--faint)] opacity-0 transition hover:bg-[var(--panel)] hover:text-[var(--danger)] focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                ),
              )}
            </div>
          ))
        )}
      </nav>

      <div className="border-t border-[var(--border)] px-3 py-3">
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--muted)] transition hover:bg-[var(--border)]/60 hover:text-[var(--fg)]"
        >
          <SignOut size={15} />
          Keluar
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden md:block">{panel}</div>

      <button
        onClick={() => setOpen(true)}
        className="fixed left-3 top-3 z-30 rounded-full border border-[var(--border)] bg-[var(--panel)] p-2 text-[var(--muted)] shadow-sm transition hover:text-[var(--fg)] md:hidden"
        aria-label="Buka daftar sesi"
      >
        <ChatsCircle size={17} />
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/45" />
          <div className="absolute inset-y-0 left-0" onClick={(e) => e.stopPropagation()}>
            {panel}
          </div>
        </div>
      ) : null}
    </>
  );
}
