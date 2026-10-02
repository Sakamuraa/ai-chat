// language: TypeScript, file: app/layout.tsx, target: Next.js App Router
// Font lewat next/font (self-host, no <link> Google Fonts di produksi).
// Redesign 2026-10-01: Roboto — kesan Google/Gemini (Google Sans tak berlisensi bebas).
import type { Metadata, Viewport } from "next";
import { Roboto, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppChrome from "@/components/app-chrome";
import Sidebar from "@/components/sidebar";
import WelcomeModal from "@/components/welcome-modal";

const sans = Roboto({
  subsets: ["latin"],
  variable: "--font-roboto",
  display: "swap",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://ai.onheil.fun"),
  title: { default: "OnheilAI", template: "%s · OnheilAI" },
  description: "Chat OnheilAI: sesi tersimpan per akun, judul otomatis, banyak model.",
  openGraph: { title: "OnheilAI", images: ["/og.png"] },
  icons: { icon: "/logo.png", apple: "/logo.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#131314" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <AppChrome>
          <div className="flex h-dvh w-full overflow-hidden">
            <Sidebar />
            <main className="relative flex min-w-0 flex-1 flex-col">{children}</main>
          </div>
          <WelcomeModal />
        </AppChrome>
      </body>
    </html>
  );
}
