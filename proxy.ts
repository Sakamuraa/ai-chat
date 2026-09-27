// language: TypeScript, file: proxy.ts, target: Next.js 16 edge guard
// *Next 16: konvensi middleware diganti proxy — validasi sesi SEBENARNYA di route handler / server component*
// Lapisan 1: API yang menulis data hanya boleh dipanggil dari halaman sendiri (same-origin).
// Lapisan 2: cookie wajib untuk rute terproteksi (cuma keberadaan; validasi sesi di handler).
import { NextResponse, type NextRequest } from "next/server";
import { checkSameOrigin } from "@/lib/request-guard";

const PROTECTED_PREFIX = ["/c/", "/api/chat", "/api/sessions"];
const PUBLIC_API = ["/api/auth/"];
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// ===== GATE PENGEMBANGAN (hapus blok ini + /gate + /api/gate saat rilis) =====
const GATE_HASH = "875e8b82b5c01fca0973ea93a946a81678d6b84d029a186659cc5b52449481e4";
const GATE_EXEMPT = ["/gate", "/api/gate"];
function isAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/og.png" ||
    pathname === "/logo.png" ||
    /\.[a-z0-9]{2,5}$/i.test(pathname)
  );
}
// ============================================================================

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // --- gate: semua rute butuh cookie gate (kecuali halaman gate & aset)
  if (!isAsset(pathname) && !GATE_EXEMPT.some((p) => pathname === p)) {
    const passed = req.cookies.get("gate")?.value === GATE_HASH;
    if (!passed) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "gate_locked" }, { status: 401 });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/gate";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }
  // ==========================================================================

  // --- gerbang same-origin: /api/chat, /api/sessions, /api/me, /api/auth/* yang menulis data
  if (pathname.startsWith("/api/") && WRITE_METHODS.has(req.method)) {
    const verdict = checkSameOrigin(req.headers);
    if (!verdict.ok) {
      console.warn(`[guard] 403 ${req.method} ${pathname} dari pemblokiran: ${verdict.reason}`);
      return NextResponse.json({ error: "forbidden", detail: "origin" }, { status: 403 });
    }
  }

  const isProtected = PROTECTED_PREFIX.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  // auth API sendiri diizinkan lewat (register/login tidak butuh cookie)
  if (PUBLIC_API.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const hasCookie = Boolean(req.cookies.get("ai_sid")?.value);
  if (hasCookie) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // gate + same-origin: semua path (aset & rute gate difilter di dalam handler)
  matcher: ["/((?!_next/static|_next/image).*)"],
};
