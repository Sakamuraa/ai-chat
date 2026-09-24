// language: TypeScript, file: lib/gateway.test.ts, target: vitest — sanitasi judul sesi
import { describe, it, expect } from "vitest";
import { sanitizeTitle } from "./gateway";

describe("sanitizeTitle", () => {
  it("membuang markdown, petik, dan simbol", () => {
    expect(sanitizeTitle('**Closure** = fungsi yang "ingat"')).toBe("Closure Fungsi Yang Ingat");
    expect(sanitizeTitle("# Judul: Rest Vs Graphql!")).toBe("Judul Rest Vs Graphql");
    expect(sanitizeTitle("`code` | bentrok (dua)")).toBe("Code Bentrok Dua");
  });

  it("maksimal 5 kata", () => {
    const long = "satu dua tiga empat lima enam tujuh";
    expect(sanitizeTitle(long).split(" ")).toHaveLength(5);
  });

  it("maksimal 60 karakter", () => {
    const s = sanitizeTitle("aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll");
    expect(s.length).toBeLessThanOrEqual(60);
  });

  it("Title Case pada kata pertama", () => {
    // Title Case per kata; kata 1 karakter (mis. "c") dibiarkan
    expect(sanitizeTitle("pointer dalam bahasa c")).toBe("Pointer Dalam Bahasa c");
  });

  it("input kosong / hanya simbol -> string kosong (fail-open)", () => {
    expect(sanitizeTitle("")).toBe("");
    expect(sanitizeTitle("   ")).toBe("");
    expect(sanitizeTitle("``` ```")).toBe("");
    expect(sanitizeTitle("**")).toBe("");
  });

  it("kode blok utuh dibuang, bukan dijadikan judul", () => {
    expect(sanitizeTitle("```js\nconst a = 1;\n```")).toBe("");
  });
});
