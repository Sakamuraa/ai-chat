// language: TypeScript (Next.js), file: app/docs/page.tsx, target: dokumentasi model OnheilAI
import type { Metadata } from "next";
import { MODEL_LABELS, MODEL_BADGE, PLANS, PLAN_MODELS, type Plan } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Dokumentasi model OnheilAI",
  description: "Penjelasan tiap model OnheilAI: kemampuan, paket, dan batas pemakaian.",
};

type ModelInfo = {
  id: string;
  ringkas: string;
  cocok: string;
};

const MODELS: ModelInfo[] = [
  {
    id: "onheil-1.1-luna",
    ringkas:
      "Model harian OnheilAI. Cepat, ringan, dan jadi default untuk percakapan biasa, brainstorming, dan tugas singkat.",
    cocok: "Tanya jawab cepat, menulis, meringkas, dan obrolan sehari-hari.",
  },
  {
    id: "onheil-1.5-selenia",
    ringkas:
      "Model seimbang untuk kerja yang butuh urutan panjang: menjawab lebih teliti dan lebih stabil untuk tugas berjenjang.",
    cocok: "Penulisan panjang, analisis bertahap, dan percakapan yang sambung menyambung.",
  },
  {
    id: "onheil-1.5-solaria",
    ringkas:
      "Model penalaran OnheilAI. Lebih banyak berpikir sebelum menjawab, cocok untuk soal yang butuh langkah.",
    cocok: "Soal logika, perencanaan, dan pertanyaan yang butuh penjelasan berlapis.",
  },
  {
    id: "onheil-2-asteria",
    ringkas:
      "Model generasi kedua dengan penalaran terdalam di OnheilAI. Dipakai untuk tugas berat: arsitektur, keputusan rumit, dan kerja lintas-bagian.",
    cocok: "Desain sistem, kode besar, riset, dan tugas yang tak boleh meleset.",
  },
  {
    id: "onheil-2.5-celestia",
    ringkas:
      "Model terbaru dan terkuat di lini Onheil. Konteks panjang, instruksi panjang, dan hasil paling konsisten.",
    cocok: "Tugas kompleks dengan banyak aturan, dokumen panjang, dan pekerjaan penting.",
  },
];

const KEMAMPUAN = [
  {
    judul: "Pencarian web",
    isi: "Model memanggil web_search untuk data terkini. Tiap chat dibatasi maksimal 4 pencarian supaya jawaban cepat dan tidak kebanyakan mikir. Tautan sumber disisipkan langsung ke dalam kalimat jawaban.",
  },
  {
    judul: "Membaca halaman",
    isi: "web_extract membuka isi URL (artikel, dokumentasi, halaman panduan) lalu memakainya untuk menjawab.",
  },
  {
    judul: "Berkas dan gambar",
    isi: "Dokumen teks (.js, .txt, .md, .csv, dan sebagainya) ikut terbaca oleh model, dipotong pada 12.000 karakter per berkas. Gambar dikirim ke model apa adanya; gambar berukuran sangat kecil otomatis dinaikkan resolusinya agar tetap terbaca.",
  },
  {
    judul: "Bikin berkas",
    isi: "create_file membuat berkas .docx, .pdf, .xlsx, .csv, .txt, atau .md dari jawaban model untuk langsung diunduh.",
  },
];

const BATAS = [
  "Kuota token 10 juta per 24 jam untuk akun Standard, kecuali punya langganan aktif.",
  "Maksimal 15 chat per 10 menit per akun dan 30 per 10 menit per alamat IP.",
  "Judul sesi dibuat otomatis dari isi percakapan, bukan disalin dari prompt pertama.",
  "Sesi, pesan, dan lampiran tersimpan di akunmu dan bisa dihapus kapan saja dari aplikasi.",
];

export default function DocsPage() {
  return (
    <div className="fade-up">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--faint)]">
        Bantuan
      </p>
      <h1 className="mt-3 max-w-[20ch] text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl">
        Dokumentasi model OnheilAI
      </h1>
      <p className="mt-5 max-w-[65ch] text-[15px] leading-relaxed text-[var(--muted)]">
        Setiap model di OnheilAI punya karakter, kecepatan, dan paket berbeda. Halaman ini
        menjelaskan apa yang bisa dilakukan tiap model, kemampuan bersama di seluruh model,
        dan batas pemakaian yang berlaku.
      </p>

      {/* daftar model */}
      <h2 className="mt-12 text-xl font-semibold tracking-tight">Daftar model</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {MODELS.map((m) => {
          const badge = MODEL_BADGE[m.id] || "Standard";
          const plan = PLANS.find((p) => p.label === badge)?.id ?? "free";
          return (
            <article
              key={m.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 transition hover:border-[var(--border-strong)]"
            >
              <div className="flex items-center gap-3">
                <h3 className="text-[15px] font-semibold tracking-tight">
                  {MODEL_LABELS[m.id] || m.id}
                </h3>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    plan === "max"
                      ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  {badge}
                </span>
              </div>
              <code className="mt-2 block font-mono text-[11px] text-[var(--faint)]">{m.id}</code>
              <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{m.ringkas}</p>
              <p className="mt-3 text-[13px] leading-relaxed text-[var(--faint)]">
                Cocok untuk: {m.cocok}
              </p>
            </article>
          );
        })}
      </div>

      {/* akses paket */}
      <h2 className="mt-12 text-xl font-semibold tracking-tight">Siapa boleh pakai apa</h2>
      <div className="mt-5 overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-[var(--panel)] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Paket</th>
              <th className="px-4 py-3 font-medium">Model yang terbuka</th>
            </tr>
          </thead>
          <tbody>
            {PLANS.map((p) => (
              <tr key={p.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-3 font-medium">{p.label}</td>
                <td className="px-4 py-3 text-[var(--muted)]">
                  {PLAN_MODELS[p.id as Plan].map((id) => MODEL_LABELS[id] || id).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 max-w-[65ch] text-[13px] leading-relaxed text-[var(--faint)]">
        Model di luar paketmu tetap terlihat di pilihan model, lengkap dengan labelnya, dan
        bisa dibuka lewat upgrade. Tombol Upgrade plan ada di menu akun dan mengarah ke
        Discord The Onheil Foundation.
      </p>

      {/* kemampuan */}
      <h2 className="mt-12 text-xl font-semibold tracking-tight">Kemampuan bersama</h2>
      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        {KEMAMPUAN.map((k) => (
          <section key={k.judul}>
            <h3 className="text-[15px] font-semibold">{k.judul}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{k.isi}</p>
          </section>
        ))}
      </div>

      {/* batas */}
      <h2 className="mt-12 text-xl font-semibold tracking-tight">Batas pemakaian</h2>
      <ul className="mt-5 max-w-[65ch] space-y-3 text-sm leading-relaxed text-[var(--muted)]">
        {BATAS.map((b) => (
          <li key={b} className="flex gap-3">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {/* bantuan lain */}
      <h2 className="mt-12 text-xl font-semibold tracking-tight">Masalah umum</h2>
      <dl className="mt-5 max-w-[65ch] space-y-5 text-sm leading-relaxed">
        <div>
          <dt className="font-medium">Jawaban model terasa tidak pakai hasil pencarian</dt>
          <dd className="mt-1.5 text-[var(--muted)]">
            Hasil web_search selalu dimasukkan ke konteks model, termasuk versi ringkas
            sebelum jawaban akhir dibuat. Kalau jawaban tetap mengandalkan ingatan model,
            coba kirim ulang pertanyaannya; kalau berulang, ganti model.
          </dd>
        </div>
        <div>
          <dt className="font-medium">Gambar tidak terbaca model</dt>
          <dd className="mt-1.5 text-[var(--muted)]">
            Kirim gambar berukuran wajar, bukan potongan kecil beberapa piksel. Gambar
            kecil otomatis dinaikkan resolusinya, tapi hasil terbaik tetap dari foto atau
            tangkapan layar berukuran penuh.
          </dd>
        </div>
        <div>
          <dt className="font-medium">Kuota habis</dt>
          <dd className="mt-1.5 text-[var(--muted)]">
            Batas harian dihitung dari pemakaian token nyata setiap chat. Menu akun menunjukkan
            paketmu; Upgrade plan tersedia lewat Discord The Onheil Foundation.
          </dd>
        </div>
      </dl>
    </div>
  );
}
