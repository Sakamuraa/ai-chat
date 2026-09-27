// language: TypeScript, file: lib/sub-options.ts, target: pilihan durasi langganan (aman untuk client & server)
// Limit token TIDAK dipilih di sini — angkanya diturunkan dari plan
// (lib/plans.ts: FREE_TOKEN_LIMIT · pro=2× · max=5× pro).
export const DURATION_OPTIONS = [
  { hours: 24, label: "24 jam" },
  { hours: 72, label: "3 hari" },
  { hours: 168, label: "7 hari" },
  { hours: 720, label: "30 hari" },
  { hours: 1440, label: "60 hari" },
  { hours: 2160, label: "90 hari" },
  { hours: 8760, label: "12 bulan" },
] as const;

export type DurationOption = (typeof DURATION_OPTIONS)[number];

export function formatTokens(n: number | null): string {
  if (n === null) return "\u221e";
  if (n >= 1_000_000_000) return (n / 1e9) + "B";
  if (n >= 1_000_000) return (n / 1e6) + "M";
  return n.toLocaleString("id-ID");
}
