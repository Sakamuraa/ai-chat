// language: TypeScript, file: app/api/usage.test.ts, target: vitest — parser pemakaian token dari SSE
import { describe, it, expect } from "vitest";
import { extractUsage } from "./chat/route";

const wrap = (chunks: object[]) => chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";

describe("extractUsage", () => {
  it("jumlahkan prompt+completion kalau hanya keduanya dikirim", () => {
    const raw = wrap([
      { choices: [{ delta: { content: "hai" } }] },
      { usage: { prompt_tokens: 120, completion_tokens: 30 } },
    ]);
    expect(extractUsage(raw)).toBe(150);
  });

  it("pakai total_tokens kalau ada", () => {
    expect(extractUsage(wrap([{ usage: { total_tokens: 500 } }]))).toBe(500);
  });

  it("ambil nilai terakhir (bukan akumulasi dobel dari beberapa event)", () => {
    const raw =
      wrap([{ usage: { prompt_tokens: 10, completion_tokens: 5 } }]) +
      wrap([{ usage: { prompt_tokens: 10, completion_tokens: 7 } }]);
    expect(extractUsage(raw)).toBe(17);
  });

  it("null kalau gateway tidak menyertakan usage (pemakaai jatuh ke perkiraan)", () => {
    expect(extractUsage(wrap([{ choices: [{ delta: { content: "jawaban" } }] }]))).toBeNull();
    expect(extractUsage("")).toBeNull();
    expect(extractUsage("data: {rusak\n")).toBeNull();
  });

  it("usage nol dianggap tidak ada", () => {
    expect(extractUsage(wrap([{ usage: { prompt_tokens: 0, completion_tokens: 0 } }]))).toBeNull();
  });
});
