// language: TypeScript, file: app/api/auth/discord/callback/route.ts, target: kembali dari Discord
import { finishOAuthCallback } from "@/lib/oauth-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return finishOAuthCallback("discord", req);
}
