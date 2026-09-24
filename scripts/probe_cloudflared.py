// language: python3, file: scripts/probe_cloudflared.py, target: container tanpa pgrep/ps
# Hitung proses cloudflared hidup + relasi parent-child tanpa loop shell /proc.
import pathlib

rows = []
for p in sorted(pathlib.Path("/proc").glob("[0-9]*")):
    try:
        comm = (p / "comm").read_text().strip()
    except Exception:
        continue
    if comm != "cloudflared":
        continue
    try:
        cmd = (p / "cmdline").read_bytes().replace(b"\0", b" ").decode()[:140]
        status = (p / "status").read_text()
        ppid = next(ln.split()[1] for ln in status.splitlines() if ln.startswith("PPid:"))
    except Exception as exc:
        cmd, ppid = f"<err {exc}>", "?"
    rows.append((p.name, ppid, cmd))

my_pids = {r[0] for r in rows}
top = [r for r in rows if r[1] not in my_pids]
print(f"cloudflared processes = {len(rows)}, independent instances = {len(top)}")
for pid, ppid, cmd in rows:
    print(f"PID {pid:>7} PPID {ppid:>7} {cmd}")
