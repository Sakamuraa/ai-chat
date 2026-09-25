// language: TypeScript (Next.js), file: app/docs/privacy/page.tsx, target: kebijakan privasi OnheilAI
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kebijakan privasi OnheilAI",
  description: "Data apa yang dikumpulkan OnheilAI, untuk apa, dan bagaimana menghapusnya.",
};

const SECTIONS = [
  {
    judul: "Data yang kami simpan",
    poin: [
      "Akun: nama pengguna, email, dan penyedia login yang dipakai (Google, Discord, atau email).",
      "Percakapan: judul sesi, isi pesan, nama berkas lampiran, serta isi lampiran teks dan gambar yang kamu kirim.",
      "Pemakaian: jumlah token per chat untuk kuota harian, serta waktu setiap sesi.",
      "Teknis: alamat IP untuk pembatas laju dan pencegahan penyalahgunaan, jenis peramban, dan waktu permintaan.",
    ],
  },
  {
    judul: "Untuk apa digunakan",
    poin: [
      "Menjalankan percakapan: pesan dan lampiran dikirim ke model AI agar bisa menjawab.",
      "Menampilkan riwayat: sesi disimpan supaya bisa dibuka lagi dari perangkat mana pun.",
      "Menjaga batas pemakaian: token dihitung agar kuota harian adil untuk semua pengguna.",
      "Keamanan: IP dicatat untuk membatasi permintaan berlebihan dan mencegah pembobolan akun.",
    ],
  },
  {
    judul: "Dengan siapa dibagikan",
    poin: [
      "Penyedia model AI: isi pesan dikirim ke gateway OnheilAI lalu ke model yang kamu pilih.",
      "Penyimpan data: basis data PostgreSQL terkelola tempat sesi disimpan.",
      "Tidak ada yang dijual, disewakan, atau dibagikan untuk periklanan. OnheilAI tidak menjual data.",
    ],
  },
  {
    judul: "Berapa lama disimpan",
    poin: [
      "Sesi dan pesan disimpan sampai kamu menghapusnya sendiri dari aplikasi.",
      "Catatan pemakaian token disimpan selama masih diperlukan untuk menghitung kuota harian.",
      "Catatan keamanan seperti IP disimpan dalam jangka pendek untuk pembatas laju.",
    ],
  },
  {
    judul: "Hak kamu",
    poin: [
      "Menghapus sesi kapan saja lewat menu hapus di daftar sesi.",
      "Mengubah atau menghapus email lewat menu Pengaturan di profil.",
      "Mematikan ingatan topik lewat pengaturan memori, supaya judul sesi lama tidak dipakai sebagai konteks.",
      "Meminta penghapusan akun dan seluruh datanya lewat Discord The Onheil Foundation.",
    ],
  },
  {
    judul: "Keamanan",
    poin: [
      "Kata sandi disimpan dalam bentuk ter-hash, tidak pernah dalam bentuk asli.",
      "Sesi memakai cookie yang ditandatangani dan bisa dicabut dengan keluar dari akun.",
      "Kode verifikasi email berlaku 10 menit dan maksimal lima kali kirim per akun.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="fade-up max-w-[65ch]">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--faint)]">
        Bantuan
      </p>
      <h1 className="mt-3 text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl">
        Kebijakan privasi
      </h1>
      <p className="mt-5 text-[15px] leading-relaxed text-[var(--muted)]">
        Halaman ini menjelaskan data apa yang dikumpulkan OnheilAI, untuk apa digunakan,
        berapa lama disimpan, dan hak kamu atas data tersebut. Berlaku untuk ai.onheil.fun
        dan seluruh layanan OnheilAI oleh The Onheil Foundation.
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
        Pertanyaan soal data pribadi bisa disampaikan lewat Discord The Onheil Foundation.
        Kebijakan ini bisa diperbarui; tanggal pembaruan terakhir akan ditampilkan di sini
        setiap kali isinya berubah.
      </p>
    </div>
  );
}
