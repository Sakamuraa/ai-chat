// language: TypeScript, file: middleware.ts, target: Next.js Edge middleware (hanya cek keberadaan cookie)
// *validasi sesi SEBENARNYA ada di route handler / server component (node:crypto tidak jalan di Edge)*
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIX = ["/c/", "/api/chat", "/api/sessions"];
const PUBLIC_API = ["/api/auth/"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
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
  matcher: ["/c/:path*", "/api/chat/:path*", "/api/sessions/:path*"],
};
