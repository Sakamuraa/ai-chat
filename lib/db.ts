// language: TypeScript, file: lib/db.ts, target: Vercel Node runtime (Neon HTTP driver)
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | null = null;

/** Lazy — jangan throw saat import supaya `next build` tetap jalan kalau env belum terisi. */
export function db(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL missing");
    client = neon(url);
  }
  return client;
}
