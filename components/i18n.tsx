// language: TypeScript, file: components/i18n.tsx, target: provider ID/EN
"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { translate, type Lang } from "@/lib/i18n";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<Ctx>({ lang: "id", setLang: () => {}, t: (k) => k });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("id");

  // 1. localStorage (cepat, berlaku untuk tamu) 2. profil user (sinkron antar perangkat)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("lang");
      if (saved === "id" || saved === "en") setLangState(saved);
    } catch {}
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { user?: { language?: string } } | null) => {
        const l = b?.user?.language;
        if (l === "id" || l === "en") setLangState(l);
      })
      .catch(() => {});
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("lang", l);
    } catch {}
    document.documentElement.lang = l;
    // simpan ke profil kalau sedang login (gagal diam-diam)
    fetch("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ language: l }),
    }).catch(() => {});
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  return useContext(I18nContext);
}
