# SmartToko - Sistem Informasi Toko Elektronik (Stok & Keuangan)

Aplikasi berbasis web responsif (mobile & desktop) yang dirancang khusus untuk mengelola operasional toko elektronik keluarga Anda. Aplikasi ini mendukung pencatatan transaksi kasir di dua lokasi berbeda (Pasar oleh Ayah dan Rumah oleh Ibu), pencatatan nota kulakan dari grosir besar, serta laporan laba rugi otomatis.

## Fitur Utama

1. **Dashboard Keuangan**: Pantau total penjualan (omset), estimasi laba bersih, pengeluaran operasional, piutang tempo, rincian margin, dan produk yang stoknya menipis.
2. **Kasir POS (Point of Sale)**:
   * Pilihan lokasi aktif: "Pasar (Ayah)" atau "Rumah (Ibu)".
   * Pemotongan stok otomatis di lokasi terpilih saat transaksi berhasil.
   * Metode pembayaran Tunai, Transfer, dan **Tempo (Utang Bon)**.
   * Kirim struk belanja digital instan via WhatsApp (format teks pre-filled gratis).
3. **Katalog Stok & Barang**: Kelola deskripsi produk, harga modal (beli default), harga jual ecer/grosir, dan batas minimal stok untuk peringatan otomatis.
4. **Input Nota Kulakan**: Masukkan nota belanja dari toko grosir besar untuk menambah stok di Rumah/Pasar sekaligus memperbarui harga beli produk.
5. **Pencatatan Pengeluaran**: Catat biaya operasional seperti bensin motor kulakan, makan siang, iuran pasar, listrik, dll.
6. **Desain Mobile-First**: Tampilan dirancang khusus agar nyaman digunakan langsung melalui HP saat melayani pembeli di pasar.

## Teknologi

* **Frontend**: React.js, Vite, Vanilla CSS (Sleek Dark/Light theme).
* **Database (Dual Mode)**:
  * **Local Mode (Default)**: Menggunakan LocalStorage browser Anda. Siap pakai seketika tanpa konfigurasi apa pun untuk demonstrasi awal.
  * **Cloud Mode (Rekomendasi)**: Terintegrasi dengan database online **Supabase (PostgreSQL)** gratis untuk sinkronisasi HP Ayah & Ibu secara real-time.

---

## Cara Menjalankan di Lokal Komputer

1. Buka folder ini di terminal pilihan Anda.
2. Pastikan dependencies sudah terpasang. Jika belum, jalankan:
   ```bash
   npm install
   ```
3. Jalankan server pengembangan lokal:
   ```bash
   npm run dev
   ```
4. Buka tautan lokal yang muncul (biasanya `http://localhost:5173`) di browser komputer atau browser HP Anda.

---

## Cara Menghubungkan ke Cloud Supabase (Gratis)

1. Buat akun gratis di [Supabase](https://supabase.com).
2. Buat proyek baru (*New Project*) dengan database PostgreSQL.
3. Masuk ke menu **SQL Editor** di dashboard Supabase Anda.
4. Buka file [supabase_schema.sql](file:///C:/Users/redho/.gemini/antigravity/scratch/toko-elektronik-app/supabase_schema.sql) di folder proyek ini, salin semua kodenya, dan paste ke SQL Editor Supabase. Ubah contoh `INSERT INTO allowed_users` dengan email admin Anda, hapus tanda komentarnya, lalu jalankan (*Run*). Ini akan membuat tabel database dan policy keamanan yang diperlukan.
5. Masuk ke menu **Authentication > Users**, lalu buat user admin dengan email dan password yang akan dipakai untuk membuka aplikasi.
6. Buat file baru bernama `.env` di folder proyek ini (sejajar dengan `README.md`).
7. Salin isi dari [.env.example](file:///C:/Users/redho/.gemini/antigravity/scratch/toko-elektronik-app/.env.example) ke dalam `.env` tersebut.
8. Isi nilai `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, dan `VITE_SUPABASE_AUTH_EMAIL`. Password tidak ditulis di `.env`; password diverifikasi langsung oleh Supabase Auth saat login.
9. Muat ulang (*restart*) server `npm run dev` Anda. Aplikasi sekarang otomatis beralih menggunakan database cloud Supabase!

## Sandi Local Mode

Jika hanya memakai Local Mode tanpa Supabase, buat hash sandi terlebih dahulu:

```bash
npm run hash-password -- "sandi-anda"
```

Salin output `VITE_APP_PASSWORD_SALT` dan `VITE_APP_PASSWORD_HASH` ke file `.env`. Jangan menaruh password asli di source code atau commit GitHub.

Catatan keamanan: Local Mode tetap berjalan sepenuhnya di browser, sehingga tidak cocok untuk melindungi data penting di website publik. Untuk penggunaan nyata, pakai Cloud Mode dengan Supabase Auth dan Row Level Security dari `supabase_schema.sql`.

## Struktur Proyek

* `index.html`: Main HTML file dengan metadata SEO.
* `src/main.jsx`: Entry point React.
* `src/App.jsx`: Logika navigasi tab, antarmuka kasir, form nota, pengeluaran, dan dashboard keuangan.
* `src/index.css`: Sistem desain UI, tema gelap/terang, layout responsif.
* `src/services/db.js`: Service layer yang mengatur pembacaan & penulisan data ke database (Supabase/LocalStorage).
* `supabase_schema.sql`: Kumpulan query SQL untuk setup database Supabase.
* `.env.example`: Template API keys Supabase.
