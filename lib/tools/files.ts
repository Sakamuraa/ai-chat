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
  const { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType } = await import("docx");
  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
  ];
  for (const s of sections) {
    if (s.heading) children.push(new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_1 }));
    for (const p of s.paragraphs ?? []) children.push(new Paragraph({ children: [new TextRun(p)], spacing: { after: 120 } }));
    if (s.table) {
      const headerRow = new TableRow({ tableHeader: true, children: s.table.headers.map((h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })) });
      const bodyRows = s.table.rows.map((r) => new TableRow({ children: r.map((c) => new TableCell({ children: [new Paragraph(c)] })) }));
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...bodyRows] }));
      children.push(new Paragraph({ text: "" }));
    }
  }
  const doc = new Document({ sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

async function makePdf(title: string, sections: Section[]): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]); // A4
  let y = 790;
  const W = 595 - 90;

  const ensure = (need: number) => {
    if (y - need < 60) {
      page = pdf.addPage([595, 842]);
      y = 790;
    }
  };
  const wrap = (text: string, f: typeof font, size: number): string[] => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(cand, size) > W) {
        if (line) lines.push(line);
        line = w;
      } else line = cand;
    }
    if (line) lines.push(line);
    return lines;
  };

  page.drawText(title, { x: 45, y, size: 18, font: bold, color: rgb(0, 0, 0) });
  y -= 30;

  for (const s of sections) {
    if (s.heading) {
      ensure(34);
      page.drawText(s.heading, { x: 45, y, size: 13, font: bold });
      y -= 20;
    }
    for (const p of s.paragraphs ?? []) {
      for (const line of wrap(p, font, 11)) {
        ensure(16);
        page.drawText(line, { x: 45, y, size: 11, font });
        y -= 15;
      }
      y -= 6;
    }
    if (s.table) {
      const cols = s.table.headers.length || (s.table.rows[0]?.length ?? 0);
      if (cols > 0) {
        const colW = W / cols;
        const rows = [s.table.headers, ...s.table.rows];
        for (const r of rows) {
          const cellLines = r.map((c) => wrap(String(c).slice(0, 60), font, 9)[0] ?? "");
          const h = 16;
          ensure(h + 2);
          r.forEach((_, i) => {
            page.drawText(cellLines[i] ?? "", { x: 45 + i * colW + 3, y: y - 11, size: 9, font, maxWidth: colW - 6 });
          });
          page.drawLine({ start: { x: 45, y: y - h }, end: { x: 45 + W, y: y - h }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
          y -= h;
        }
        y -= 8;
      }
    }
  }
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
      VALUES (${ctx.userId}, ${filename}, ${MIME[ext]}, ${bytes.toString("base64")}::bytea)
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
