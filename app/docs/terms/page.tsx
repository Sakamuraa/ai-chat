// language: TypeScript (Next.js), file: app/docs/terms/page.tsx, target: ketentuan layanan OnheilAI
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ketentuan layanan OnheilAI",
  description: "Aturan pemakaian OnheilAI: akun, kuota, paket, dan batas tanggung jawab.",
};

const SECTIONS = [
  {
    judul: "Penerimaan ketentuan",
    poin: [
      "Dengan memakai OnheilAI kamu setuju pada ketentuan ini.",
      "Kalau tidak setuju, jangan pakai layanan ini dan hapus akunmu.",
    ],
  },
  {
    judul: "Akun",
    poin: [
      "Kamu boleh mendaftar lewat Google, Discord, atau email dengan kode verifikasi.",
      "Kata sandi dan kode verifikasi adalah tanggung jawabmu; jangan dibagikan ke siapa pun.",
      "Satu orang boleh memegang lebih dari satu akun, selama tidak dipakai untuk melewati batas pemakaian.",
    ],
  },
  {
    judul: "Paket dan kuota",
    poin: [
      "Akun Standard membuka model dasar dengan kuota token harian.",
      "Paket Pro dan Max membuka model tambahan dan kuota yang lebih besar.",
      "Kuota dihitung dari pemakaian token nyata per chat, termasuk konteks, hasil pencarian, dan jawaban model.",
      "Upgrade plan diproses lewat Discord The Onheil Foundation.",
    ],
  },
  {
    judul: "Cara pemakaian yang wajar",
    poin: [
      "Jangan menjalankan skrip otomatis yang mengirim permintaan beruntun melewati batas laju.",
      "Jangan menyalahgunakan akun uji atau akun orang lain.",
      "Jangan memakai layanan untuk hal yang melanggar hukum atau merugikan pihak lain.",
      "Pembatas laju diberlakukan per akun dan per alamat IP untuk menjaga layanan tetap stabil.",
    ],
  },
  {
    judul: "Sifat jawaban model",
    poin: [
      "Model AI bisa salah. Periksa ulang informasi penting, terutama data terkini dari hasil pencarian web.",
      "Hasil pencarian web berasal dari sumber pihak ketiga; OnheilAI tidak menjamin keakuratannya.",
      "Jangan pakai jawaban model sebagai nasihat medis, hukum, atau keuangan tanpa pemeriksaan ahli.",
    ],
  },
  {
    judul: "Kepemilikan isi",
    poin: [
      "Pesan dan berkas yang kamu kirim tetap milikmu.",
      "Kamu memberi izin OnheilAI memproesnya untuk menjawab, termasuk mengirimnya ke penyedia model AI.",
      "Hasil jawaban model boleh kamu pakai bebas, sepanjang tidak melanggar hak pihak lain.",
    ],
  },
  {
    judul: "Perubahan dan penghentian",
    poin: [
      "Fitur bisa ditambah, diubah, atau dihapus sewaktu-waktu untuk menjaga layanan.",
      "Akun yang melanggar ketentuan ini bisa dibatasi atau dihentikan aksesnya.",
      "Kamu bisa menghapus akun kapan saja; data akan dihapus mengikuti kebijakan privasi.",
    ],
  },
  {
    judul: "Pembatasan tanggung jawab",
    poin: [
      "Layanan diberikan sebagaimana adanya tanpa jaminan kelangsungan tanpa gangguan.",
      "The Onheil Foundation tidak bertanggung jawab atas kerugian yang timbul dari pemakaian jawaban model.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="fade-up max-w-[65ch]">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--faint)]">
        Bantuan
      </p>
      <h1 className="mt-3 text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl">
        Ketentuan layanan
      </h1>
      <p className="mt-5 text-[15px] leading-relaxed text-[var(--muted)]">
        Ketentuan ini mengatur pemakaian OnheilAI, termasuk akun, paket, kuota, dan batas
        tanggung jawab. Berlaku untuk ai.onheil.fun dan seluruh layanan OnheilAI oleh
        The Onheil Foundation.
      </p>

      <div className="mt-10 space-y-9">
        {SECTIONS.map((s) => (
          <section key={s.judul}>
            <h2 className="text-lg font-semibold tracking-tight">{s.judul}</h2>
            <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-[var(--muted)]">
              {s.poin.map((p) => (
                <li key={p} className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]"
                  />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-12 border-t border-[var(--border)] pt-6 text-[13px] leading-relaxed text-[var(--faint)]">
        Pertanyaan dan klarifikasi soal ketentuan ini bisa disampaikan lewat Discord
        The Onheil Foundation.
      </p>
    </div>
  );
}
