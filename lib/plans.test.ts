// language: TypeScript, file: lib/plans.test.ts, target: vitest — hak akses model per paket
import { describe, it, expect } from "vitest";
import {
  allowedModels,
  effectivePlan,
  FREE_TOKEN_LIMIT,
  modelAllowed,
  PLAN_MODELS,
  PLAN_LIMIT_PERCENT,
  planTokenLimit,
} from "./plans";

describe("paket model", () => {
  it("free = luna+aria; pro menambah selenia+asteria; max menambah 2 model Claude", () => {
    expect(PLAN_MODELS.free).toEqual(["onheil-1.1-luna", "onheil-1.1-aria"]);
    expect(PLAN_MODELS.pro).toEqual([
      "onheil-1.1-luna",
      "onheil-1.1-aria",
      "onheil-1.5-selenia",
      "onheil-2-asteria",
    ]);
    expect(PLAN_MODELS.max).toEqual([
      "onheil-1.1-luna",
      "onheil-1.1-aria",
      "onheil-1.5-selenia",
      "onheil-2-asteria",
      "claude-opus-5-5",
      "claude-fable-5-1",
    ]);
  });

  it("model dibatasi paket", () => {
    expect(modelAllowed("free", "onheil-1.5-selenia")).toBe(false);
    expect(modelAllowed("free", "onheil-2-asteria")).toBe(false);
    expect(modelAllowed("pro", "onheil-1.5-selenia")).toBe(true);
    expect(modelAllowed("pro", "onheil-2-asteria")).toBe(true);
    expect(modelAllowed("pro", "claude-opus-5-5")).toBe(false);
    expect(modelAllowed("max", "claude-opus-5-5")).toBe(true);
    expect(modelAllowed("free", "claude-opus-5-5")).toBe(false);
    expect(modelAllowed("pro", "claude-fable-5-1")).toBe(false);
    expect(modelAllowed("max", "claude-fable-5-1")).toBe(true);
    expect(modelAllowed("free", "claude-fable-5-1")).toBe(false);
    // model yang dihapus dari daftar frontend tidak lolos paket mana pun
    expect(modelAllowed("max", "onheil-1.5-solaria")).toBe(false);
    expect(modelAllowed("max", "onheil-2.5-celestia")).toBe(false);
    expect(modelAllowed("max", "onheil-3-istaroth")).toBe(false);
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

  it("limit token diturunkan dari paket Standard: free 1jt, pro 2x free, max 5x pro", () => {
    expect(FREE_TOKEN_LIMIT).toBe(1_000_000);
    expect(planTokenLimit("free")).toBe(1_000_000);
    expect(planTokenLimit("pro")).toBe(2_000_000);
    expect(planTokenLimit("max")).toBe(10_000_000);
    expect(planTokenLimit("pro")).toBe(2 * planTokenLimit("free"));
    expect(planTokenLimit("max")).toBe(5 * planTokenLimit("pro"));
  });

  it("persentase limit selalu 100% — yang membedakan plan hanya token", () => {
    expect(PLAN_LIMIT_PERCENT).toBe(100);
  });
});
