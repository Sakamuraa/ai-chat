// language: TypeScript, file: components/app-chrome.tsx, target: client — provider + modal profil
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { I18nProvider } from "./i18n";
import ProfileModal, { type Me } from "./profile-modal";

/** Bungkus seluruh app: i18n (ID/EN) + modal profil /#settings + logout. */
export default function AppChrome({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/me")
        .then((r) => (r.ok ? r.json() : { user: null }))
        .then((b: { user?: Me | null }) => setMe(b.user ?? null))
        .catch(() => setMe(null));
    load();
    window.addEventListener("profile-changed", load);
    return () => window.removeEventListener("profile-changed", load);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe(null);
    window.dispatchEvent(new Event("profile-changed"));
    router.replace("/login");
    router.refresh();
  }

  return (
    <I18nProvider>
      {children}
      <ProfileModal me={me} onSaved={(m) => setMe(m)} onLogout={logout} />
    </I18nProvider>
  );
}
