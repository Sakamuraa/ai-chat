// language: TypeScript, file: lib/tools/files.ts, target: buat file docx/pdf/xlsx/csv/txt/md lalu simpan untuk diunduh
import { db } from "@/lib/db";
import type { ToolDef, ToolResult } from "./types";

type Row = { rows: { id: string }[] };

type Section = { heading?: string; paragraphs?: string[]; table?: { headers: string[]; rows: string[][] } };

const MAX_SECTION = 40;

function sectionsOf(args: Record<string, unknown>): Section[] {
  const raw = Array.isArray(args.sections) ? (args.sections as unknown[]) : [];
  const out: Section[] = [];
  for (const item of raw.slice(0, MAX_SECTION)) {
    const s = (item ?? {}) as Record<string, unknown>;
    const sec: Section = {};
    if (typeof s.heading === "string" && s.heading.trim()) sec.heading = s.heading.trim().slice(0, 200);
    if (Array.isArray(s.paragraphs)) {
      sec.paragraphs = s.paragraphs.filter((p): p is string => typeof p === "string").map((p) => p.slice(0, 4000)).slice(0, 60);
    }
    if (s.table && typeof s.table === "object") {
      const t = s.table as Record<string, unknown>;
      const headers = Array.isArray(t.headers) ? t.headers.map(String).slice(0, 20) : [];
      const rows = Array.isArray(t.rows)
        ? (t.rows as unknown[]).slice(0, 200).map((r) => (Array.isArray(r) ? r.map(String).slice(0, 20) : []))
        : [];
      if (headers.length || rows.length) sec.table = { headers, rows };
    }
    if (sec.heading || sec.paragraphs?.length || sec.table) out.push(sec);
  }
  return out;
}

async function makeDocx(title: string, sections: Section[]): Promise<Buffer> {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, Footer, PageNumber } = await import("docx");
  // kertas A4, margin gaya laporan: kiri 4 cm (2268 twip), kanan/atas/bawah 3 cm (1701 twip)
  const MARGIN = { top: 1701, right: 1701, bottom: 1701, left: 2268 };
  const line = { style: BorderStyle.SINGLE, size: 4, color: "000000" } as const;
  const borders = { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line };

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 120 },
      children: [new TextRun({ text: title, bold: true, size: 32 })], // 16 pt
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "9CA3AF", space: 6 } },
      children: [new TextRun({ text: "", size: 2 })],
    }),
  ];

  for (const s of sections) {
    if (s.heading) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 280, after: 120 },
          keepNext: true,
          children: [new TextRun({ text: s.heading, bold: true, size: 26 })], // 13 pt
        }),
      );
    }
    for (const p of s.paragraphs ?? []) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 140, line: 360, lineRule: "auto" }, // 1,5 spasi
          children: [new TextRun({ text: p, size: 24 })], // 12 pt
        }),
      );
    }
    if (s.table) {
      const { headers, rows } = s.table;
      const mk = (text: string, boldRow: boolean) =>
        new TableCell({
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          shading: boldRow ? { fill: "F3F4F6" } : undefined,
          borders: { top: line, bottom: line, left: line, right: line },
          children: [
            new Paragraph({
              alignment: AlignmentType.LEFT,
              children: [new TextRun({ text, bold: boldRow, size: 22 })],
            }),
          ],
        });
      const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: undefined,
        borders,
        rows: [
          new TableRow({ tableHeader: true, children: headers.map((h) => mk(h, true)) }),
          ...rows.map((r) => new TableRow({ children: r.map((c) => mk(c, false)) })),
        ],
      });
      children.push(table, new Paragraph({ text: "", spacing: { after: 200 }, children: [] }));
    }
  }

  const doc = new Document({
    creator: "OnheilAI",
    title,
    description: "Dokumen dibuat otomatis oleh OnheilAI",
    sections: [
      {
        properties: { page: { margin: MARGIN } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: [PageNumber.CURRENT], size: 18 })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

async function makePdf(title: string, sections: Section[]): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setProducer("OnheilAI");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // kertas A4 (595x842 pt); margin gaya laporan: kiri 4 cm (113 pt), kanan/atas/bawah 3 cm (85 pt)
  const PW = 595, PH = 842;
  const ML = 113, MR = 85, MT = 85, MB = 75;
  const X0 = ML;
  const XW = PW - ML - MR;
  const GRAY = rgb(0.85, 0.85, 0.85);
  const INK = rgb(0, 0, 0);

  // Helvetica hanya memuat WinAnsi — ganti karakter di luar jangkauan agar drawText tidak melempar
  const win = (s: string) => s.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/[^\u0020-\u00FF]/g, "?");

  let page = pdf.addPage([PW, PH]);
  let y = PH - MT;

  const ensure = (need: number) => {
    if (y - need < MB + 20) {
      page = pdf.addPage([PW, PH]);
      y = PH - MT;
    }
  };
  const wrap = (text: string, f: typeof font, size: number, width: number): string[] => {
    const lines: string[] = [];
    let line = "";
    for (const w of win(text).split(/\s+/)) {
      const cand = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(cand, size) > width) {
        if (line) lines.push(line);
        line = w;
      } else line = cand;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  };

  // judul: rata tengah, 16 pt tebal
  const tw = bold.widthOfTextAtSize(win(title), 16);
  page.drawText(win(title), { x: Math.max(X0, (PW - tw) / 2), y: y - 16, size: 16, font: bold, color: INK });
  y -= 26;
  page.drawLine({ start: { x: X0, y }, end: { x: X0 + XW, y }, thickness: 0.7, color: GRAY });
  y -= 24;

  for (const s of sections) {
    if (s.heading) {
      ensure(40);
      y -= 10;
      page.drawText(win(s.heading), { x: X0, y, size: 13, font: bold, color: INK });
      y -= 20;
    }
    for (const p of s.paragraphs ?? []) {
      for (const lineText of wrap(p, font, 11, XW)) {
        ensure(16);
        page.drawText(lineText, { x: X0, y, size: 11, font, color: INK });
        y -= 15;
      }
      y -= 8;
    }
    if (s.table) {
      const cols = Math.max(1, s.table.headers.length || s.table.rows[0]?.length || 1);
      const colW = XW / cols;
      const rows = [s.table.headers, ...s.table.rows];
      for (const r of rows) {
        const isHead = r === s.table.headers;
        const cellLines = r.map((c) => wrap(String(c), isHead ? bold : font, 10, colW - 10).slice(0, 2));
        const rowH = Math.max(18, ...cellLines.map((l) => l.length * 12 + 8));
        ensure(rowH + 4);
        const top = y;
        if (isHead) {
          page.drawRectangle({ x: X0, y: top - rowH, width: XW, height: rowH, color: rgb(0.95, 0.95, 0.96) });
        }
        for (let i = 0; i < cols; i++) {
          const cx = X0 + i * colW;
          const lines = cellLines[i] ?? [""];
          lines.forEach((l, li) => {
            page.drawText(l, { x: cx + 5, y: top - 13 - li * 12, size: 10, font: isHead ? bold : font, color: INK });
          });
          page.drawLine({ start: { x: cx, y: top }, end: { x: cx, y: top - rowH }, thickness: 0.5, color: GRAY });
        }
        page.drawLine({ start: { x: X0, y: top }, end: { x: X0 + XW, y: top }, thickness: 0.5, color: GRAY });
        y = top - rowH;
      }
      page.drawLine({ start: { x: X0, y }, end: { x: X0 + XW, y }, thickness: 0.5, color: GRAY });
      y -= 18;
    }
  }

  // nomor halaman di tengah bawah
  const pages = pdf.getPages();
  const total = pages.length;
  pages.forEach((pg, i) => {
    const label = `Halaman ${i + 1} / ${total}`;
    const w = font.widthOfTextAtSize(label, 9);
    pg.drawText(label, { x: (PW - w) / 2, y: 40, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  });

  return Buffer.from(await pdf.save());
}

async function makeXlsx(title: string, sections: Section[]): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "OnheilAI";
  const tables = sections.filter((s) => s.table);
  if (tables.length === 0) {
    // tanpa tabel: jadi sheet ringkasan teks
    const ws = wb.addWorksheet("Isi".slice(0, 31));
    ws.columns = [{ header: "Bagian", key: "bagian", width: 30 }, { header: "Teks", key: "teks", width: 90 }];
    ws.addRow({ bagian: title, teks: sections.map((s) => [s.heading ?? "", ...(s.paragraphs ?? [])].join(" — ")).join("\n") });
    ws.getRow(1).font = { bold: true };
  } else {
    tables.forEach((s, i) => {
      const name = (s.heading ?? `Tabel ${i + 1}`).replace(/[\\/*?:\[\]]/g, " ").slice(0, 31) || `Tabel ${i + 1}`;
      const ws = wb.addWorksheet(name);
      if (s.table!.headers.length) ws.columns = s.table!.headers.map((h, j) => ({ header: h, key: `c${j}`, width: 18 }));
      for (const row of s.table!.rows) ws.addRow(Object.fromEntries(row.map((c, j) => [`c${j}`, c])));
      ws.getRow(1).font = { bold: true };
      ws.eachRow((r) => (r.border = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } } }));
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

const create: ToolDef = {
  name: "create_file",
  description:
    "Buat berkas nyata untuk diunduh user: docx, pdf, xlsx, csv, txt, atau md. Isi disusun dari daftar bagian (judul bagian, paragraf, tabel). Setelah selesai, URL unduhan akan muncul di jawabanmu — sisipkan sebagai tautan Markdown.",
  parameters: {
    type: "object",
    properties: {
      filename: { type: "string", description: "Nama berkas tanpa folder, wajib berekstensi: docx/pdf/xlsx/csv/txt/md" },
      title: { type: "string", description: "Judul dokumen" },
      sections: {
        type: "array",
        maxItems: MAX_SECTION,
        items: {
          type: "object",
          properties: {
            heading: { type: "string" },
            paragraphs: { type: "array", items: { type: "string" } },
            table: {
              type: "object",
              properties: {
                headers: { type: "array", items: { type: "string" } },
                rows: { type: "array", items: { type: "array", items: { type: "string" } } },
              },
            },
          },
        },
      },
    },
    required: ["filename", "title", "sections"],
  },
  enabled: () => Boolean(process.env.DATABASE_URL),
  execute: async (args, ctx): Promise<ToolResult> => {
    const filename = String(args.filename ?? "").trim().replace(/[\\/]/g, "_").slice(0, 120);
    const title = String(args.title ?? filename).trim().slice(0, 300) || filename;
    const ext = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";
    const known = ["docx", "pdf", "xlsx", "csv", "txt", "md"];
    if (!known.includes(ext)) return { ok: false, error: `ekstensi tidak didukung: .${ext} (pakai ${known.join(", ")})` };
    const sections = sectionsOf(args);
    if (sections.length === 0) return { ok: false, error: "sections kosong" };

    let bytes: Buffer;
    try {
      if (ext === "docx") bytes = await makeDocx(title, sections);
      else if (ext === "pdf") bytes = await makePdf(title, sections);
      else if (ext === "xlsx") bytes = await makeXlsx(title, sections);
      else if (ext === "csv") {
        const t = sections.find((s) => s.table);
        if (!t?.table) return { ok: false, error: "csv butuh sections[].table" };
        const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
        bytes = Buffer.from([t.table.headers.map(esc).join(","), ...t.table.rows.map((r) => r.map(esc).join(","))].join("\n"), "utf8");
      } else {
        const lines: string[] = [`# ${title}`, ""];
        for (const s of sections) {
          if (s.heading) lines.push(`## ${s.heading}`, "");
          for (const p of s.paragraphs ?? []) lines.push(p, "");
          if (s.table) {
            lines.push(`| ${s.table.headers.join(" | ")} |`);
            lines.push(`| ${s.table.headers.map(() => "---").join(" | ")} |`);
            for (const r of s.table.rows) lines.push(`| ${r.join(" | ")} |`);
            lines.push("");
          }
        }
        bytes = Buffer.from(lines.join("\n"), "utf8");
      }
    } catch (e) {
      return { ok: false, error: `gagal menyusun berkas: ${(e as Error).message}` };
    }

    if (bytes.length > 12_000_000) return { ok: false, error: "berkas terlalu besar (maksimal 12 MB)" };

    const MIME: Record<string, string> = {
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      pdf: "application/pdf",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      csv: "text/csv; charset=utf-8",
      txt: "text/plain; charset=utf-8",
      md: "text/markdown; charset=utf-8",
    };

    const rows = (await db()`
      INSERT INTO generated_files (user_id, name, mime, data)
      VALUES (${ctx.userId}, ${filename}, ${MIME[ext]}, decode(${bytes.toString("base64")}, 'base64'))
      RETURNING id
    `) as unknown as { id: string }[];
    const id = rows[0]?.id;
    if (!id) return { ok: false, error: "gagal menyimpan berkas" };

    const url = `/api/files/${id}`;
    return {
      ok: true,
      fileUrl: url,
      fileName: filename,
      text: `Berkas "${filename}" (${ext.toUpperCase()}, ${(bytes.length / 1024).toFixed(0)} KB) berhasil dibuat. Unduh: ${url}`,
    };
  },
};

export const FILE_TOOLS: ToolDef[] = [create];
