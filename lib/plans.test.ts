// language: TypeScript, file: lib/plans.test.ts, target: vitest — hak akses model per paket
import { describe, it, expect } from "vitest";
import { allowedModels, effectivePlan, modelAllowed, PLAN_MODELS } from "./plans";

describe("paket model", () => {
  it("free hanya 1.1; pro menambah 1.5 selenia+solaria; max menambah asteria+celestia", () => {
    expect(PLAN_MODELS.free).toEqual(["onheil-1.1-luna"]);
    expect(PLAN_MODELS.pro).toEqual(["onheil-1.1-luna", "onheil-1.5-selenia", "onheil-1.5-solaria"]);
    expect(PLAN_MODELS.max).toEqual([
      "onheil-1.1-luna",
      "onheil-1.5-selenia",
      "onheil-1.5-solaria",
      "onheil-2-asteria",
      "onheil-2.5-celestia",
    ]);
  });

  it("model dibatasi paket", () => {
    expect(modelAllowed("free", "onheil-1.5-selenia")).toBe(false);
    expect(modelAllowed("pro", "onheil-1.5-selenia")).toBe(true);
    expect(modelAllowed("pro", "onheil-2-asteria")).toBe(false);
    expect(modelAllowed("max", "onheil-2-asteria")).toBe(true);
    expect(modelAllowed("pro", "onheil-1.5-solaria")).toBe(true);
    expect(modelAllowed("pro", "onheil-2.5-celestia")).toBe(false);
    expect(modelAllowed("max", "onheil-2.5-celestia")).toBe(true);
    expect(modelAllowed("free", "onheil-1.5-solaria")).toBe(false);
  });

  it("pakai langganan aktif untuk menaikkan paket", () => {
    const now = new Date("2026-09-24T00:00:00Z");
    expect(effectivePlan("free", "max", "2026-12-31T00:00:00Z", now)).toBe("max");
    expect(effectivePlan("free", "pro", "2026-12-31T00:00:00Z", now)).toBe("pro");
  });

  it("langganan tak boleh menurunkan paket akun", () => {
    const now = new Date("2026-09-24T00:00:00Z");
    expect(effectivePlan("max", "pro", "2026-12-31T00:00:00Z", now)).toBe("max");
  });

  it("langganan kadaluarsa -> paket akun", () => {
    const now = new Date("2026-09-24T00:00:00Z");
    expect(effectivePlan("free", "max", "2026-09-23T00:00:00Z", now)).toBe("free");
    expect(effectivePlan(null, null, null, now)).toBe("free");
    expect(effectivePlan("kotoran", null, null, now)).toBe("free");
  });

  it("allowedModels selalu berisi minimal 1.1", () => {
    (["free", "pro", "max"] as const).forEach((p) => {
      expect(allowedModels(p)).toContain("onheil-1.1-luna");
    });
  });
});
