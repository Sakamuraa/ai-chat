// language: Node.js, file: scripts/exec-server.mjs, target: sidecar tool run_command (127.0.0.1:8901)
// Jalankan: EXEC_KEY=<token> node scripts/exec-server.mjs
// Wajib: X-Exec-Key cocok, batas timeout, output dipotong — sengaja minimal.
import { createServer } from "node:http";
import { exec } from "node:child_process";
import { randomBytes } from "node:crypto";

const PORT = Number(process.env.EXEC_PORT || 8901);
const KEY = process.env.EXEC_KEY || "";
const CWD = process.env.EXEC_CWD || "/home/container/work";

if (!KEY) {
  console.error("EXEC_KEY wajib diisi");
  process.exit(1);
}

const MAX_OUT = 120_000;

const server = createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/exec") {
    res.writeHead(404).end("{}");
    return;
  }
  if (req.headers["x-exec-key"] !== KEY) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "kunci salah" }));
    return;
  }
  let body = "";
  req.on("data", (c) => {
    body += c;
    if (body.length > 8192) req.destroy();
  });
  req.on("end", () => {
    let cmd = "";
    let timeout = 30;
    try {
      const j = JSON.parse(body || "{}");
      cmd = String(j.command || "");
      timeout = Math.min(60, Math.max(1, Number(j.timeout_seconds || j.timeout || 30)));
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "body bukan JSON" }));
      return;
    }
    if (!cmd || cmd.length > 4000) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "perintah tidak valid" }));
      return;
    }
    exec(cmd, { cwd: CWD, timeout: timeout * 1000, maxBuffer: MAX_OUT, shell: "/bin/bash" }, (err, stdout, stderr) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        exit_code: err && typeof err.code === "number" ? err.code : err ? 1 : 0,
        stdout: String(stdout || "").slice(0, MAX_OUT),
        stderr: String(stderr || "").slice(0, MAX_OUT),
      }));
    });
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`exec sidecar :${PORT} (cwd ${CWD})`));
