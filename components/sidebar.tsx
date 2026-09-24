// language: TypeScript, file: components/sidebar.tsx, target: client component
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChatsCircle,
  Gear,
  List,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  SignOut,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useI18n } from "./i18n";

type Session = {
  id: string;
  title: string;
  model: string;
  updated_at: string;
  preview?: string | null;
};

function group(sessions: Session[]) {
  const now = Date.now();
  const day = 86_400_000;
  const out: { label: string; items: Session[] }[] = [
    { label: "today", items: [] },
    { label: "week", items: [] },
    { label: "older", items: [] },
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
      className="flex items-center justify-center overflow-hidden rounded-[10px] bg-[var(--accent)]"
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="OnheilAI"
        width={size}
        height={size}
        className="h-full w-full object-contain"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    </span>
  );
}

/** Judul sesi: kalau masih 'New chat', tampilkan potongan prompt pertama (preview). */
function displayTitle(s: Session): string {
  if (s.title && s.title !== "New chat") return s.title;
  return s.preview?.trim() || "…";
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [auth, setAuth] = useState<"unknown" | "in" | "out">("unknown");

  // mobile: mulai tertutup
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) setOpen(false);
  }, []);

  // state sidebar dipublikasikan ke <html data-sidebar> supaya header bisa
  // memberi ruang pada tombol toggle saat sidebar tertutup
  useEffect(() => {
    document.documentElement.dataset.sidebar = open ? "open" : "closed";
  }, [open]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      if (res.status === 401) {
        setAuth("out");
        setLoaded(true);
        return;
      }
      if (!res.ok) return;
      const body = (await res.json()) as { sessions: Session[] };
      setSessions(body.sessions);
      setAuth("in");
      setLoaded(true);
    } catch {
      setAuth("out");
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener("sessions-changed", onChange);
    window.addEventListener("profile-changed", onChange);
    return () => {
      window.removeEventListener("sessions-changed", onChange);
      window.removeEventListener("profile-changed", onChange);
    };
    // reload saat pindah halaman: login/register menaruh cookie baru
  }, [load, pathname]);

  const activeId = pathname.startsWith("/c/") ? pathname.slice(3) : "";
  const filtered = query
    ? sessions.filter((s) => displayTitle(s).toLowerCase().includes(query.toLowerCase()))
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
    if (!confirm(t("nav.deleteTitle"))) return;
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (id === activeId) {
      router.push("/");
      router.refresh();
    }
  }

  /** Tutup sidebar cuma di mobile; desktop biarkan terbuka (ropotan navigasi). */
  const closeOnMobile = () => {
    if (window.innerWidth < 768) setOpen(false);
  };

  function openProfile() {
    window.location.hash = "#settings";
    // sidebar desktop tetap terbuka; hanya drawer mobile yang ditutup
    if (window.innerWidth < 768) setOpen(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.dispatchEvent(new Event("profile-changed"));
    router.replace("/login");
    router.refresh();
  }

  const groupLabel: Record<string, string> = {
    today: t("nav.today"),
    week: t("nav.week"),
    older: t("nav.older"),
  };

  const panel = (
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)]">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label="OnheilAI">
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-tight">OnheilAI</span>
        </Link>
        <button
          onClick={() => setOpen(false)}
          className="ml-auto rounded-full p-1.5 text-[var(--muted)] transition hover:bg-[var(--border)] hover:text-[var(--fg)]"
          aria-label={t("nav.close")}
          title={t("nav.close")}
        >
          <X size={16} weight="bold" />
        </button>
      </div>

      {auth === "in" ? (
        <>
          <div className="px-3 pb-2">
            <Link
              href="/"
              onClick={closeOnMobile}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-fg)] transition hover:brightness-95 active:scale-[0.98]"
            >
              <Plus size={16} weight="bold" />
              {t("nav.newChat")}
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
                placeholder={t("nav.search")}
                aria-label={t("nav.search")}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] py-2 pl-9 pr-3 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-[var(--border-strong)]"
              />
            </div>
          </div>
        </>
      ) : auth === "out" ? (
        <div className="px-4 pb-4 pt-1">
          <p className="text-sm leading-relaxed text-[var(--muted)]">{t("nav.loginPrompt")}</p>
          <Link
            href="/login"
            onClick={closeOnMobile}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-fg)] transition hover:brightness-95 active:scale-[0.98]"
          >
            {t("nav.login")}
          </Link>
          <Link
            href="/register"
            onClick={closeOnMobile}
            className="mt-2 block w-full rounded-full border border-[var(--border)] px-4 py-2.5 text-center text-sm font-medium text-[var(--muted)] transition hover:text-[var(--fg)]"
          >
            {t("nav.createAccount")}
          </Link>
        </div>
      ) : null}

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {auth !== "in" ? null : !loaded ? (
          <div className="space-y-2 px-2 pt-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-7 animate-pulse rounded-xl bg-[var(--border)]/60" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-start gap-1.5 px-3 py-6 text-[var(--muted)]">
            <ChatsCircle size={20} weight="light" />
            <p className="text-sm">{query ? t("nav.noMatch") : t("nav.noSessions")}</p>
          </div>
        ) : (
          group(filtered).map((g) => (
            <div key={g.label} className="mb-4">
              <p className="px-3 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--faint)]">
                {groupLabel[g.label]}
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
                      s.id === activeId ? "bg-[var(--border)]/70" : "hover:bg-[var(--border)]/45"
                    }`}
                  >
                    <Link
                      href={`/c/${s.id}`}
                      onClick={closeOnMobile}
                      className="min-w-0 flex-1 truncate text-sm text-[var(--fg)]"
                      title={displayTitle(s)}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        setEditing(s.id);
                        setDraft(s.title === "New chat" ? "" : s.title);
                      }}
                    >
                      {displayTitle(s)}
                    </Link>
                    <button
                      onClick={() => {
                        setEditing(s.id);
                        setDraft(s.title === "New chat" ? "" : s.title);
                      }}
                      title={t("nav.editTitle")}
                      aria-label={t("nav.editTitle")}
                      className="rounded-full p-1 text-[var(--faint)] opacity-0 transition hover:bg-[var(--panel)] hover:text-[var(--fg)] focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <PencilSimple size={14} />
                    </button>
                    <button
                      onClick={() => remove(s.id)}
                      title={t("nav.deleteTitle")}
                      aria-label={t("nav.deleteTitle")}
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

      {auth === "in" ? (
        <div className="flex items-center gap-1 border-t border-[var(--border)] px-3 py-3">
          <button
            onClick={openProfile}
            className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--muted)] transition hover:bg-[var(--border)]/60 hover:text-[var(--fg)]"
          >
            <Gear size={15} />
            {t("nav.settings")}
          </button>
          <button
            onClick={logout}
            title={t("nav.logout")}
            aria-label={t("nav.logout")}
            className="rounded-xl p-2 text-[var(--muted)] transition hover:bg-[var(--border)]/60 hover:text-[var(--fg)]"
          >
            <SignOut size={15} />
          </button>
        </div>
      ) : null}
    </aside>
  );

  // Panel & toggle SELALU dirender supaya transisi slide in/out jalan
  // (bukan unmount/mount — itu yang bikin kemunculan mendadak).
  return (
    <>
      {/* Toggle global: tertutup -> logo OnheilAI, hover -> ikon sidebar */}
      <button
        onClick={() => setOpen(true)}
        aria-label={t("nav.open")}
        title={t("nav.open")}
        className={`group fixed left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-sm transition-all duration-300 hover:border-[var(--border-strong)] md:left-4 md:top-4 ${
          open ? "pointer-events-none -translate-x-1 opacity-0" : "translate-x-0 opacity-100"
        }`}
      >
        <span className="absolute inset-0 flex items-center justify-center transition-opacity group-hover:opacity-0">
          <BrandMark size={22} />
        </span>
        <List size={17} className="relative text-[var(--muted)] opacity-0 transition group-hover:opacity-100" />
      </button>

      {/* desktop: lebar melipat, isi digeser keluar (slide out) */}
      <div
        className={`hidden overflow-hidden transition-[width] duration-300 ease-out md:block ${
          open ? "w-[264px]" : "w-0"
        }`}
      >
        <div
          className={`h-full w-[264px] transition-transform duration-300 ease-out ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {panel}
        </div>
      </div>

      {/* mobile: overlay fade + panel slide */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={closeOnMobile}
        aria-hidden={!open}
      >
        <div
          className={`absolute inset-0 bg-black/45 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        />
        <div
          className={`absolute inset-y-0 left-0 transition-transform duration-300 ease-out ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {panel}
        </div>
      </div>
    </>
  );
}
