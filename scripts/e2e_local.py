#!/usr/bin/env python3
# language: python3, file: scripts/e2e_local.py, target: uji end-to-end lokal (dev server :3103)
# Register 2 user -> sesi -> stream chat -> judul auto -> isolasi user -> bersih-bersih.
# Tidak mencetak rahasia; hanya status & bentuk data.
import http.cookiejar, json, sys, time, urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3103"
PWR = "e2e-pass-2026"
results = []


def client():
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def call(op, path, body=None, raw=False, method=None):
    data = json.dumps(body).encode() if body is not None else None
    verb = method or ("POST" if body is not None else "GET")
    req = urllib.request.Request(BASE + path, data=data, method=verb)
    if body is not None:
        req.add_header("content-type", "application/json")
    try:
        with op.open(req, timeout=180) as r:
            payload = r.read()
            return r.status, (payload if raw else json.loads(payload or b"{}"))
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:300].decode("utf8", "ignore")


A, B = client(), client()

# 1. register dua user (kalau sudah ada dari run sebelumnya -> login)
for name, op in (("e2e_alice", A), ("e2e_bob", B)):
    st, _ = call(op, "/api/auth/register", {"username": name, "password": PWR})
    if st != 200:
        st, _ = call(op, "/api/auth/login", {"username": name, "password": PWR})
        results.append((f"register/login {name}", f"register!=200 -> login {st}"))
    else:
        results.append((f"register {name}", st))

# 2. model list
st, body = call(A, "/api/models")
models = [m["id"] for m in body.get("models", [])] if isinstance(body, dict) else []
results.append(("GET /api/models", f"{st} source={body.get('source')} n={len(models)}"))

# 3. buat sesi
st, body = call(A, "/api/sessions", {"model": "free"})
sid = body.get("session", {}).get("id")
results.append(("POST /api/sessions", f"{st} sid={'ada' if sid else 'GAGAL'}"))
if not sid:
    print(json.dumps(dict(results), indent=1))
    sys.exit(1)

# 4. stream chat
st, raw = call(A, "/api/chat", {"sessionId": sid, "model": "free", "content": "Sebutkan warna langit, satu kalimat."}, raw=True)
if isinstance(raw, str):  # HTTPError -> body teks
    results.append(("POST /api/chat", f"{st} ERROR: {raw[:200]}"))
    print(json.dumps(dict(results), indent=1, ensure_ascii=False))
    sys.exit(1)
text = raw.decode("utf8", "ignore")
deltas = text.count('"content"')
first = text[:160].replace("\n", " ")
results.append(("POST /api/chat", f"{st} bytes={len(raw)} delta_chunks={deltas}"))

# 5. judul auto (after() di belakang respons) — poll sampai 25 detik
title = None
for _ in range(13):
    time.sleep(2)
    st, body = call(A, f"/api/sessions/{sid}")
    sess = body.get("session", {}) if isinstance(body, dict) else {}
    title = sess.get("title")
    if title and title != "New chat":
        break
msgs = body.get("messages", []) if isinstance(body, dict) else []
results.append(("GET sesi (A)", f"{st} title={title!r} msgs={len(msgs)} roles={[m['role'] for m in msgs]}"))
results.append(("judul auto", "OK" if title not in (None, "New chat") else "MASIH New chat"))
results.append(("judul <=6 kata", len((title or "").split()) <= 6))

# 6. isolasi user: B coba baca sesi A
st, _ = call(B, f"/api/sessions/{sid}")
results.append(("isolasi B->sesi A (harus 404)", st))
st, _ = call(B, f"/api/sessions/{sid}", {"title": "hijack"}, method="PATCH")
results.append(("PATCH B->sesi A (harus 404)", st))
st, _ = call(B, f"/api/sessions/{sid}", method="DELETE")
results.append(("DELETE B->sesi A (harus 404)", st))

# 7. list sesi masing-masing
st, body = call(A, "/api/sessions")
results.append(("list A", f"{st} n={len(body.get('sessions', []))}"))
st, body = call(B, "/api/sessions")
results.append(("list B", f"{st} n={len(body.get('sessions', []))}"))

# 8. tanpa cookie
st, _ = call(client(), "/api/sessions")
results.append(("tanpa cookie (harus 401)", st))

# 9. bersih-bersih baris uji (via register API tidak bisa hapus user; lewat SQL nanti)
print(json.dumps(dict(results), indent=1, ensure_ascii=False))
