// language: TypeScript, file: app/api/auth/google/route.ts, target: mulai OAuth Google
import { finishOAuthStart } from "@/lib/oauth-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return finishOAuthStart("google", req);
}
