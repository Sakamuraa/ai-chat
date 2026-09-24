// language: TypeScript, file: app/api/api.test.ts, target: vitest
// *parser SSE diuji tanpa server dan tanpa gateway — impor relatif, pola SakuKampus*
import { describe, it, expect } from "vitest";
import { extractSseText } from "./chat/route";

const chunk = (content: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

describe("extractSseText", () => {
  it("gabungkan delta berurutan", () => {
    const raw = chunk("Halo") + chunk(", ") + chunk("dunia") + "data: [DONE]\n\n";
    expect(extractSseText(raw)).toBe("Halo, dunia");
  });

  it("abaikan baris bukan data dan JSON rusak", () => {
    const raw = ": comment\n\ndata: bukan-json\n\n" + chunk("ok") + "\n";
    expect(extractSseText(raw)).toBe("ok");
  });

  it("event tanpa delta.content tidak ikut", () => {
    const roleOnly = `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant" } }] })}\n\n`;
    expect(extractSseText(roleOnly + chunk("jawaban"))).toBe("jawaban");
  });

  it("string kosong untuk stream kosong", () => {
    expect(extractSseText("")).toBe("");
    expect(extractSseText("data: [DONE]\n\n")).toBe("");
  });
});
