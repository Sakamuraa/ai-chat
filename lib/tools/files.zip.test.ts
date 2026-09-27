// language: TypeScript, file: lib/tools/files.zip.test.ts, target: smoke test create_file ext=zip (butuh DATABASE_URL; auto-skip tanpa DB)
import { describe, it, expect } from "vitest";
import fs from "node:fs";

// muat .env.local bila dijalankan lokal (Vercel CI: DATABASE_URL sudah dari env, file tak ada)
if (!process.env.DATABASE_URL && fs.existsSync(".env.local")) {
  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (!line || line.startsWith("#") || i <= 0) continue;
    let v = line.slice(i + 1).trim();
    if (v.length > 1 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) v = v.slice(1, -1);
    process.env[line.slice(0, i)] = v;
  }
}

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("create_file .zip (smoke dgn DB nyata)", () => {
  it("menyimpan arsip, menolak path traversal, lalu dibersihkan", async () => {
    const { FILE_TOOLS } = await import("./files");
    const { db } = await import("@/lib/db");
    const tool = FILE_TOOLS[0];
    expect(tool.name).toBe("create_file");

    const users = (await db()`SELECT id FROM users ORDER BY created_at ASC LIMIT 1`) as unknown as {
      id: string;
    }[];
    const userId = users[0].id;

    const res = await tool.execute(
      {
        filename: "smoke-test-fflate.zip",
        title: "smoke",
        files: [
          { path: "hello.txt", content: "isi halo zip" },
          { path: "nested/dir/data.txt", content: "isian dalam" },
          { path: "../evil.txt", content: "harus dibuang" },
        ],
      },
      { userId, origin: "https://ai.onheil.fun" },
    );
    expect(res.ok).toBe(true);
    // expect() tak narrow union di tsc -> angkat manual ke varian { ok: true }
    const okRes = res as Extract<import("./types").ToolResult, { ok: true }>;
    const m = /\/api\/files\/([0-9a-f-]{36})/.exec(okRes.fileUrl ?? "");
    expect(m).toBeTruthy();
    const fileId = m![1];

    const rows = (await db()`
      SELECT name, mime, length(data) AS bytes, encode(data, 'base64') AS b64
      FROM generated_files WHERE id = ${fileId}
    `) as unknown as { name: string; mime: string; bytes: number; b64: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("smoke-test-fflate.zip");
    expect(rows[0].mime).toBe("application/zip");
    const buf = Buffer.from(rows[0].b64, "base64");
    // header zip PK\x03\x04
    expect(buf.slice(0, 2).toString("latin1")).toBe("PK");
    expect(rows[0].bytes).toBeGreaterThan(80);
    // isi arsip: dua file masuk, path traversal terbuang
    const { unzipSync, strFromU8 } = await import("fflate");
    const entries = Object.keys(unzipSync(new Uint8Array(buf)));
    expect(entries.sort()).toEqual(["hello.txt", "nested/dir/data.txt"]);
    expect(strFromU8(unzipSync(new Uint8Array(buf))["hello.txt"])).toBe("isi halo zip");

    await db()`DELETE FROM generated_files WHERE id = ${fileId}`;
  }, 30_000);
});
