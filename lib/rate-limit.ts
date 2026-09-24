// language: TypeScript, file: lib/rate-limit.ts, target: Vercel Node runtime
/**
 * Rate-limit in-process.
 * CATATAN: instance Vercel ephemeral + multi-instance → ini best-effort, bukan jaminan.
 * Kalau nanti perlu ketat, pindahkan counter ke Neon/Upstash.
 */

type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

const WINDOW_MS = 10 * 60_000;
const MAX_HITS = 10;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    b.hits = b.hits.filter((t) => now - t < WINDOW_MS);
    if (b.hits.length === 0) buckets.delete(k);
  }
}

/** true = masih di dalam kuota (dan dicatat), false = melebihi. */
export function allow(key: string, max: number = MAX_HITS): boolean {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key) ?? { hits: [] };
  b.hits = b.hits.filter((t) => now - t < WINDOW_MS);
  if (b.hits.length >= max) {
    buckets.set(key, b);
    return false;
  }
  b.hits.push(now);
  buckets.set(key, b);
  return true;
}

/** Untuk tes. */
export function reset(): void {
  buckets.clear();
  lastSweep = 0;
}

export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
