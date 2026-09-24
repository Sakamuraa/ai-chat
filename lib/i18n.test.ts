// language: TypeScript, file: lib/i18n.test.ts, target: vitest — paritas bahasa + klasifikasi lampiran
import { describe, it, expect } from "vitest";
import { DICT, translate, missingKeys } from "./i18n";
import { classifyFile, TEXT_EXTS, MAX_MB } from "./attachments";

describe("i18n", () => {
  it("id dan en punya kunci yang sama", () => {
    const miss = missingKeys();
    expect(miss.id).toEqual([]);
    expect(miss.en).toEqual([]);
  });

  it("placeholder {name} terisi", () => {
    expect(translate("id", "landing.greeting", { name: "Manuel" })).toContain("Manuel");
    expect(translate("en", "landing.greeting", { name: "Manuel" })).toContain("Manuel");
  });

  it("placeholder {n} dan {mb}", () => {
    expect(translate("id", "chat.attached", { n: 3 })).toContain("3");
    expect(translate("en", "chat.attachTooBig", { mb: MAX_MB })).toContain(String(MAX_MB));
  });

  it("kunci hilang jatuh ke kunci itu sendiri, tidak crash", () => {
    expect(translate("en", "tidak.ada")).toBe("tidak.ada");
  });

  it("deskripsi memory memakai teks yang diminta Manuel (identik di kedua bahasa)", () => {
    const desc = "Let OnheilAI personalize your experience based on your chats, files, and connected apps.";
    expect(DICT.id["profile.memoryDesc"]).toBe(desc);
    expect(DICT.en["profile.memoryDesc"]).toBe(desc);
  });

  it("disclaimer memakai teks persis yang diminta", () => {
    const d = "OnheilAI can make mistakes. Check important info.";
    expect(DICT.id["chat.disclaimer"]).toBe(d);
    expect(DICT.en["chat.disclaimer"]).toBe(d);
  });
});

describe("classifyFile", () => {
  it("gambar dikenali dari mime", () => {
    expect(classifyFile("foto.png", "image/png")).toBe("image");
    expect(classifyFile("scan.jpg", "image/jpeg")).toBe("image");
  });

  it("teks dikenali dari mime maupun ekstensi", () => {
    expect(classifyFile("a.txt", "text/plain")).toBe("text");
    expect(classifyFile("b.json", "application/json")).toBe("text");
    expect(classifyFile("c.py", "")).toBe("text");
    expect(classifyFile("d.ts", "application/octet-stream")).toBe("text");
    expect(classifyFile("e.md", "")).toBe("text");
  });

  it("format tak didukung ditolak", () => {
    expect(classifyFile("app.apk", "application/vnd.android.package-archive")).toBe("unsupported");
    expect(classifyFile("video.mp4", "video/mp4")).toBe("unsupported");
    expect(classifyFile("archive.zip", "application/zip")).toBe("unsupported");
    expect(classifyFile("docx.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(
      "unsupported",
    );
  });

  it("daftar ekstensi teks tidak kosong dan huruf kecil", () => {
    expect(TEXT_EXTS.length).toBeGreaterThan(10);
    expect(TEXT_EXTS.every((e) => e === e.toLowerCase())).toBe(true);
  });
});
