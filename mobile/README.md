# Senandika Sunyi Mobile

Aplikasi Expo ini menampilkan direktori wisata terkurasi dari API Senandika Sunyi. Antarmuka berbahasa Inggris mengikuti sasaran pengguna pada makalah DDD. Konten pada API demo menggunakan data simulasi.

## Menjalankan aplikasi

Masuk ke folder `mobile`. Instal dependensi dengan `npm ci`, lalu jalankan `npm start`. Buka proyek melalui Expo Go yang kompatibel dengan SDK 54, simulator, atau opsi web yang tersedia di Expo. Untuk menjalankan pratinjau web secara langsung, gunakan `npm run web`.

Aplikasi memakai API HTTPS Senandika Sunyi secara default. Untuk mengganti URL API, buat `.env` dari `.env.example` dan isi `EXPO_PUBLIC_API_URL` dengan URL dasar API. Variabel Expo public hanya dipakai untuk URL.

## Akun demo

Gunakan akun pengunjung `pwam-demo`. Kata sandi disampaikan terpisah oleh anggota kelompok. Daftar dan detail destinasi dapat dilihat tanpa masuk. Favorit, suka, rating, dan laporan perubahan memakai akun pengunjung.

## Alur aplikasi

- **Explore** mencari dan menyaring destinasi terbit berdasarkan kategori. Detail menampilkan ulasan, biaya, akses, etika, tanggal pemeriksaan, penanda pada peta eksternal, dan ringkasan rating terverifikasi.
- **Saved** menampilkan favorit milik akun. Di detail destinasi, pengguna dapat menambah atau menghapus favorit dan tanda suka.
- **Account** menampilkan status pengajuan rating dan tindakan keluar.
- **Rate your visit** meminta rating 1–5 dan bukti kunjungan JPEG atau PNG. **Report a change** meminta deskripsi dan tanggal pengamatan, dengan lampiran opsional.

Kegiatan mitra dapat ditambahkan setelah pemetaan destinasi dan kontrak API mitra disepakati.
