// language: TypeScript, file: components/sidebar.tsx, target: client component
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type Session = { id: string; title: string; model: string; updated_at: string };

function group(sessions: Session[]) {
  const now = Date.now();
  const day = 86_400_000;
  const out: { label: string; items: Session[] }[] = [
    { label: "Today", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Older", items: [] },
  ];
  for (const s of sessions) {
    const age = now - new Date(s.updated_at).getTime();
    if (age < day) out[0].items.push(s);
    else if (age < 7 * day) out[1].items.push(s);
    else out[2].items.push(s);
  }
  return out.filter((g) => g.items.length > 0);
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      if (!res.ok) return;
      const body = (await res.json()) as { sessions: Session[] };
      setSessions(body.sessions);
    } catch {
      /* diam — sidebar tidak boleh merusak halaman */
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
    if (id === activeId) window.dispatchEvent(new CustomEvent("session-title-changed", { detail: title }));
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
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)]">
      <div className="flex items-center gap-2 px-3 py-3">
        <Link href="/" className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-black/5 dark:hover:bg-white/10">
          <span className="h-6 w-6 rounded-md bg-[#facc15]" />
          <span className="text-sm font-semibold">AI</span>
        </Link>
        <button
          onClick={() => setOpen(false)}
          className="ml-auto rounded-md px-2 py-1 text-xs text-[var(--muted)] hover:bg-black/5 md:hidden"
        >
          ✕
        </button>
      </div>

      <div className="px-3 pb-2">
        <Link
          href="/"
          className="flex w-full items-center gap-2 rounded-lg bg-[#facc15] px-3 py-2 text-sm font-semibold text-black transition hover:brightness-95"
        >
          <span className="text-base leading-none">＋</span> Chat baru
        </Link>
      </div>

      <div className="px-3 pb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari sesi…"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm outline-none focus:border-[#facc15]"
        />
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {filtered.length === 0 ? (
          <p className="px-2 py-4 text-xs text-[var(--muted)]">Belum ada sesi.</p>
        ) : (
          group(filtered).map((g) => (
            <div key={g.label} className="mb-3">
              <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
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
                    className="mb-0.5 w-full rounded-md border border-[#facc15] bg-[var(--bg)] px-2 py-1.5 text-sm outline-none"
                  />
                ) : (
                  <div
                    key={s.id}
                    className={`group mb-0.5 flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${
                      s.id === activeId ? "bg-black/10 dark:bg-white/10" : "hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    <Link
                      href={`/c/${s.id}`}
                      onClick={() => setOpen(false)}
                      className="min-w-0 flex-1 truncate"
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
                      className="hidden rounded px-1 text-xs text-[var(--muted)] hover:text-[var(--fg)] group-hover:block"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => remove(s.id)}
                      title="Hapus sesi"
                      className="hidden rounded px-1 text-xs text-[var(--muted)] hover:text-red-500 group-hover:block"
                    >
                      🗑
                    </button>
                  </div>
                ),
              )}
            </div>
          ))
        )}
      </nav>

      <div className="border-t border-[var(--border)] px-3 py-2.5">
        <button
          onClick={logout}
          className="w-full rounded-md px-2 py-1.5 text-left text-sm text-[var(--muted)] hover:bg-black/5 dark:hover:bg-white/5"
        >
          Keluar
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* desktop */}
      <div className="hidden md:block">{panel}</div>

      {/* mobile trigger */}
      <button
        onClick={() => setOpen(true)}
        className="fixed left-3 top-3 z-30 rounded-md border border-[var(--border)] bg-[var(--sidebar)] px-2.5 py-1.5 text-sm md:hidden"
        aria-label="Buka menu sesi"
      >
        ☰
      </button>

      {/* mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute inset-y-0 left-0" onClick={(e) => e.stopPropagation()}>
            {panel}
          </div>
        </div>
      ) : null}
    </>
  );
}
