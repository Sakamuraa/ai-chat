// language: TypeScript, file: app/layout.tsx, target: Next.js App Router
import type { Metadata, Viewport } from "next";
import "./globals.css";
import Sidebar from "@/components/sidebar";

export const metadata: Metadata = {
  title: "AI",
  description: "Chat interface",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#212121" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        {/* tema gelap ikut preferensi sistem — tanpa FOUC */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body className="antialiased">
        <div className="flex h-dvh w-full overflow-hidden">
          <Sidebar />
          <main className="relative flex min-w-0 flex-1 flex-col">{children}</main>
        </div>
      </body>
    </html>
  );
}
