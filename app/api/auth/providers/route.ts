// language: TypeScript, file: app/api/auth/providers/route.ts, target: tombol mana yang boleh tampil
import { NextResponse } from "next/server";
import { oauthConfigured } from "@/lib/oauth";
import { mailReady } from "@/lib/mail";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    google: oauthConfigured("google"),
    discord: oauthConfigured("discord"),
    smtp: mailReady(),
  });
}
