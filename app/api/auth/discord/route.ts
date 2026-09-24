// language: TypeScript, file: app/api/auth/discord/route.ts, target: mulai OAuth Discord
import { finishOAuthStart } from "@/lib/oauth-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return finishOAuthStart("discord", req);
}
