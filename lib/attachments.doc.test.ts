// language: TypeScript, file: lib/attachments.doc.test.ts, target: uji ekstraksi docx/xlsx klien
import { describe, expect, it } from "vitest";
import { classifyFile, extractDocText, isDocFile } from "./attachments";

// ZIP STORE (tanpa kompresi) minimal: CRC boleh 0 — pembaca tak memeriksa CRC.
function crc32(): number {
  return 0;
}
function zip(files: { name: string; content: string }[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const nameB = enc.encode(f.name);
    const data = enc.encode(f.content);
    const local = new Uint8Array(30 + nameB.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 0, true); // method: store
    lv.setUint32(14, crc32(), true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameB.length, true);
    local.set(nameB, 30);
    local.set(data, 30 + nameB.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameB.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc32(), true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameB.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameB, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const all = [...locals, ...centrals, eocd];
  const out = new Uint8Array(all.reduce((s, a) => s + a.length, 0));
  let pos = 0;
  for (const a of all) {
    out.set(a, pos);
    pos += a.length;
  }
  return out;
}

describe("ekstraksi dokumen", () => {
  it("docx dan xlsx dikenali sebagai teks, apk/mp4/zip tetap ditolak", () => {
    expect(classifyFile("laporan.docx", "")).toBe("text");
    expect(classifyFile("tabel.xlsx", "")).toBe("text");
    expect(classifyFile("app.apk", "application/vnd.android.package-archive")).toBe("unsupported");
    expect(classifyFile("video.mp4", "video/mp4")).toBe("unsupported");
    expect(isDocFile("a.docx")).toBe(true);
    expect(isDocFile("a.txt")).toBe(false);
  });

  it("docx: word/document.xml -> teks tanpa tag", async () => {
    const bytes = zip([
      { name: "word/document.xml", content: "<w:document><w:body><w:p><w:r><w:t>Halo docx</w:t></w:r></w:p></w:body></w:document>" },
    ]);
    const txt = await extractDocText(new File([bytes as BlobPart], "laporan.docx"));
    expect(txt).toContain("Halo docx");
    expect(txt).not.toContain("<w:t>");
  });

  it("xlsx: sharedStrings + sheet -> nilai sel per baris", async () => {
    const bytes = zip([
      { name: "xl/sharedStrings.xml", content: "<sst><si><t>Nilai A</t></si><si><t>Nilai B</t></si></sst>" },
      { name: "xl/worksheets/sheet1.xml", content:
        '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row><c r="A2"><v>42</v></c></row></sheetData></worksheet>' },
    ]);
    const txt = await extractDocText(new File([bytes as BlobPart], "tabel.xlsx"));
    expect(txt).toContain("Nilai A | Nilai B");
    expect(txt).toContain("42");
  });

  it("bukan zip (file teks berkedok docx) -> null (ditolak UI)", async () => {
    const bytes = new TextEncoder().encode("bukan zip sama sekali");
    const txt = await extractDocText(new File([bytes as BlobPart], "palsu.docx"));
    expect(txt).toBeNull();
  });
});
