# ai-chat — ai.onheil.fun

Chat interface bergaya chatgpt.com: sesi per user, judul sesi otomatis + bisa diedit
(tampil di tab), model picker, streaming token-per-token, tema `#FACC15`.

## Stack

- Next.js 16 (App Router, TypeScript) — build & runtime di **Vercel**
- Neon Postgres via `@neondatabase/serverless` (HTTP driver, tanpa koneksi panjang)
- Gateway inferensi: `https://router.onheil.fun/v1` (9router di container), key hanya di env

## Env (Vercel → Settings → Environment Variables)

| Key | Nilai |
|---|---|
| `DATABASE_URL` | connection string Neon |
| `GATEWAY_BASE` | `https://router.onheil.fun/v1` |
| `GATEWAY_KEY` | key gateway khusus (scoped, bukan key internal) |
| `TITLE_MODEL` | opsional, default `onheil-1.1-luna` |

`GATEWAY_KEY` / `DATABASE_URL` tidak boleh diberi prefix `NEXT_PUBLIC_`.

## Database

Jalankan `db/schema.sql` sekali di Neon SQL Editor (idempoten). Tabel: `users`,
`auth_tokens`, `sessions`, `messages`. User pertama yang register otomatis `is_admin`.

## Aturan

- `npm run build` **hanya di Vercel**. Panel/local: `npm run typecheck` + `npm test`.
- `git push` hanya setelah konfirmasi Manuel.
- URL sesi: `/c/{sessionId}`.
- Sesi orang lain → **404**, bukan 403.

## Perintah

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run (tanpa server, tanpa DB)
npm run dev         # lokal saja, bukan untuk build
```
