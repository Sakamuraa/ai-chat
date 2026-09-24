// language: TypeScript, file: lib/sub-options.ts, target: pilihan kuota langganan (aman untuk client & server)
export const TOKEN_OPTIONS = [
  { value: 10_000_000, label: "10 juta" },
  { value: 100_000_000, label: "100 juta" },
  { value: 1_000_000_000, label: "1 miliar" },
  { value: null, label: "Unlimited" },
] as const;

export const DURATION_OPTIONS = [
  { hours: 24, label: "24 jam" },
  { hours: 72, label: "3 hari" },
  { hours: 168, label: "7 hari" },
  { hours: 720, label: "30 hari" },
  { hours: 1440, label: "60 hari" },
  { hours: 2160, label: "90 hari" },
  { hours: 8760, label: "12 bulan" },
] as const;

export type TokenOption = (typeof TOKEN_OPTIONS)[number];
export type DurationOption = (typeof DURATION_OPTIONS)[number];

export function formatTokens(n: number | null): string {
  return n === null ? "Unlimited" : n.toLocaleString("id-ID");
}
