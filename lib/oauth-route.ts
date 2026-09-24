// language: TypeScript, file: lib/oauth-route.ts, target: pembungkus rute OAuth (origin dari request)
import { finishOAuth, startOAuth, type Provider } from "./oauth";

function originOf(req: Request): string {
  const u = new URL(req.url);
  const fwd = req.headers.get("x-forwarded-proto");
  const proto = fwd ? fwd.split(",")[0].trim() : u.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  return `${proto}://${host}`;
}

export function finishOAuthStart(p: Provider, req: Request) {
  return startOAuth(p, originOf(req));
}

export function finishOAuthCallback(p: Provider, req: Request) {
  return finishOAuth(p, req, originOf(req));
}
