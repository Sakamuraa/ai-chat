// language: TypeScript, file: app/api/auth/google/callback/route.ts, target: kembali dari Google
import { finishOAuthCallback } from "@/lib/oauth-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return finishOAuthCallback("google", req);
}
