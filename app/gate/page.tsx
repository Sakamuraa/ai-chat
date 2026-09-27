// language: TypeScript, file: app/gate/page.tsx, target: gerbang password tahap pengembangan
// HAPUS halaman ini + app/api/gate/route.ts + blok GATE di proxy.ts saat rilis.
"use client";

import { useState } from "react";

export default function GatePage() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function submit() {
    if (busy || !password) return;
    setBusy(true);
    setErr(false);
    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.href = "/";
        return;
      }
      setErr(true);
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg)] p-6">
      <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--sidebar)] p-6">
        <p className="text-[13px] font-medium text-[var(--muted)]">OnheilAI</p>
        <h1 className="mt-1 text-lg font-semibold text-[var(--fg)]">Akses Pengembangan</h1>
        <p className="mt-1.5 text-[13px] text-[var(--muted)]">
          Situs masih tahap uji. Masukkan password untuk melanjutkan.
        </p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          placeholder="Password"
          className="mt-5 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-[var(--border-strong)]"
        />
        <button
          onClick={() => void submit()}
          disabled={busy || !password}
          className="mt-3 w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-fg)] transition hover:brightness-95 active:scale-[0.98] disabled:opacity-45"
        >
          {busy ? "Memeriksa…" : "Masuk"}
        </button>
        {err ? (
          <p className="mt-2.5 text-xs text-[var(--danger)]">Password salah.</p>
        ) : null}
      </div>
    </div>
  );
}
