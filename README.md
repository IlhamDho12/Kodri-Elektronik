# SmartToko - Sistem Informasi Toko Elektronik (Stok & Keuangan)

Aplikasi berbasis web responsif (mobile & desktop) yang dirancang khusus untuk mengelola operasional toko elektronik keluarga Anda. Aplikasi ini mendukung pencatatan transaksi kasir di dua lokasi berbeda (Pasar oleh Ayah dan Rumah oleh Ibu), pencatatan nota kulakan dari grosir besar, serta laporan laba rugi otomatis.

## Fitur Utama

1. **Dashboard Keuangan**: Pantau total penjualan (omset), estimasi laba bersih, pengeluaran operasional, piutang tempo, rincian margin, dan produk yang stoknya menipis.
   * Cetak laporan keuangan sebagai dokumen tabel A4 (pilih **Save as PDF** pada dialog cetak browser). Laporan menyertakan periode, kop/logo toko, ringkasan arus kas, rincian penjualan, pembelian, biaya operasional, posisi piutang/hutang saat dicetak, dan kolom tanda tangan admin/pemilik. Grafik tetap tersedia di dashboard dan tidak dimasukkan ke PDF agar tabel transaksi mudah dibaca.
2. **Kasir POS (Point of Sale)**:
   * Pilihan lokasi aktif: "Pasar (Ayah)" atau "Rumah (Ibu)".
   * Pemotongan stok otomatis di lokasi terpilih saat transaksi berhasil.
   * Harga jual diisi langsung untuk setiap barang di keranjang; subtotal dan total mengikuti harga yang disepakati. Harga di bawah modal diberi peringatan namun tetap dapat diproses.
   * Metode pembayaran Tunai, Transfer, dan **Tempo (Utang Bon)**.
   * Kirim struk belanja digital instan via WhatsApp (format teks pre-filled gratis).
3. **Katalog Stok & Barang**: Kelola deskripsi produk, harga modal hasil rata-rata pembelian, distribusi stok, dan batas minimal stok untuk peringatan otomatis. Harga jual tidak disimpan sebagai harga default produk.
   * Cetak **Laporan Posisi Stok** atau **Lembar Stok Opname** dalam format A4 landscape. Filter pencarian, kategori, stok menipis, dan barang belum dialokasikan berlaku pada hasil cetak. Lembar opname menyediakan ruang untuk hasil hitung fisik, selisih, catatan, dan tanda tangan pemeriksa.
4. **Stok & Pembelian Terpadu**: Catat supplier, nama/jenis produk, jumlah, total harga nota, dan status pembayaran dalam transaksi pembelian. Produk baru otomatis dibuat dari transaksi; seluruh barang yang diterima masuk sementara ke stok **Belum Dialokasikan**. Dari daftar stok, bagi barang ke Rumah dan Pasar; jumlah kedua lokasi wajib sama persis dengan seluruh stok fisik yang tersedia. Setelah disimpan, stok belum dialokasikan menjadi nol. Form katalog terpisah tidak bisa membuat SKU atau menambah kuantitas tanpa transaksi pembelian. Penerimaan mencatat riwayat pembelian dan menghitung rata-rata modal. Nota Tempo masuk ke arus kas saat dilunasi. Penjualan yang melebihi stok lokasi ditolak.
5. **Pencatatan Pengeluaran**: Catat biaya operasional seperti bensin motor kulakan, makan siang, iuran pasar, listrik, dll.
6. **Desain Mobile-First**: Tampilan dirancang khusus agar nyaman digunakan langsung melalui HP saat melayani pembeli di pasar.

## Teknologi

* **Frontend**: React.js, Vite, Vanilla CSS (Sleek Dark/Light theme).
* **Database (Dual Mode)**:
  * **Local Mode (Default)**: Menggunakan LocalStorage browser Anda. Siap pakai seketika tanpa konfigurasi apa pun untuk demonstrasi awal.
  * **Cloud Mode (Rekomendasi)**: Data disimpan di **Supabase (PostgreSQL)** dan tersinkronisasi antarperangkat. Pengunjung boleh membaca data; perubahan hanya dapat dilakukan melalui API server setelah kode akses diverifikasi.

### Otomasi Data Demo Harian

Saat berjalan di Local Mode dan sudah memiliki riwayat, aplikasi membuat data **simulasi DEMO** satu kali pada pembukaan pertama setiap tanggal di browser tersebut. Jumlah penjualan mengikuti pola hari yang sama dari riwayat; transaksi pasar hanya dibuat Senin, Selasa, Rabu, Sabtu, dan Minggu dengan nama kalangan yang sesuai. Empat hari pertama Syawal tidak membuat transaksi pasar. Pada Kamis/Jumat, bila tidak ada nota pembelian yang tercatat pada hari tersebut, generator dapat meniru satu nota pembelian dari hari yang sama pada riwayat (total harus Rp1 juta hingga kurang dari Rp15 juta), memakai supplier dan produk yang ada, lalu menambah kuantitas ke **Belum Dialokasikan** agar alur distribusi stok tetap digunakan. Generator juga dapat meniru satu pengeluaran harian bila belum ada pengeluaran pada tanggal itu. Semua data simulasi memakai stok/katalog lokal yang tersedia dan ditandai `DEMO` serta kolom **Sumber data** pada backup Excel. Jika sudah ada penjualan/pembelian/pengeluaran pada tanggal itu atau riwayat/stok yang cocok tidak tersedia, generator tidak menambah data pada bagian tersebut.

Otomasi ini hanya berjalan di browser saat aplikasi dibuka, tidak berjalan ketika browser ditutup, dan tidak pernah menulis ke Supabase. Data yang dibuat adalah simulasi untuk portfolio/latihan, bukan bukti penjualan atau catatan pembukuan nyata. Jika generator melewati hari karena stok atau riwayat tidak tersedia, perbaiki datanya lalu hapus marker terkait di Local Storage: `kodri_demo_automation_last_run`, `kodri_demo_automation_last_run_purchase`, atau `kodri_demo_automation_last_run_expense`; data yang sudah ada pada tanggal itu tetap mencegah duplikasi. Untuk mematikan otomasi permanen, nonaktifkan pemanggilan `runDailyDemoAutomation` di `src/App.jsx`.

### Deploy ke Vercel

Proyek memakai Vercel untuk frontend Vite dan API serverless:

```bash
npx vercel login
npx vercel
```

Atur environment variables berikut di **Vercel Project → Settings → Environment Variables** untuk Production, lalu redeploy:

* `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`: dipakai browser untuk membaca data.
* `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY`: dipakai hanya oleh API server untuk menulis. Jangan gunakan awalan `VITE_` dan jangan pernah memasukkan service-role key ke source code.
* `WRITE_ACCESS_CODE`: kode edit (misalnya `7768`).
* `WRITE_ACCESS_TOKEN_SECRET`: secret acak minimal 32 karakter untuk menandatangani sesi edit.

Tidak ada halaman login awal. Pengunjung dapat membaca data; saat mencoba mengubah data, aplikasi meminta kode. Server membatasi percobaan kode dan menerbitkan sesi edit selama 8 jam. Kode tidak dimasukkan ke bundle browser.

**Penting:** kebijakan Supabase memberi akses baca kepada role anonim, sehingga semua isi tabel aplikasi dapat dibaca lewat situs maupun API Supabase oleh siapa pun. Jangan simpan data pribadi atau informasi yang tidak ingin dipublikasikan; hapus/samarkan data tersebut sebelum membuka pembacaan publik.

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

Local Mode dapat digunakan langsung. Untuk menguji penulisan ke Supabase melalui API Vercel secara lokal, gunakan `vercel dev` setelah menyiapkan environment variables server-only.

---

## Menyiapkan Supabase yang sudah ada

Sebelum deploy, unduh backup Excel dari aplikasi dan jalankan [supabase_public_read_server_write.sql](./supabase_public_read_server_write.sql) satu kali melalui **Supabase → SQL Editor**. Migrasi menambahkan kolom yang diperlukan clone, mengizinkan pembacaan publik, menolak penulisan langsung oleh `anon` maupun `authenticated`, dan menyiapkan pembatasan percobaan kode. Penulisan aplikasi kemudian dilakukan oleh API Vercel menggunakan service-role key yang disimpan sebagai environment variable server-only.

Untuk membuat `WRITE_ACCESS_TOKEN_SECRET`, jalankan `node --input-type=module -e "import crypto from 'node:crypto'; console.log(crypto.randomBytes(32).toString('hex'))"` lalu simpan output hanya di environment Vercel.

Untuk database Supabase baru, jalankan [supabase_schema.sql](./supabase_schema.sql). Jangan jalankan schema awal pada database yang sudah berisi data; gunakan migrasi di atas agar tabel dan data lama tetap dipertahankan.

## Backup dan Pemulihan Excel

Gunakan panel utilitas di bagian bawah Dashboard untuk mengunduh backup `.xlsx` atau memulihkan data dari workbook backup aplikasi. Workbook berisi sheet produk, transaksi dan rinciannya, pembelian dan rinciannya, pengeluaran, serta lampiran. Saat pemulihan, aplikasi akan mengganti seluruh data pada mode penyimpanan aktif (Local Mode atau Supabase); periksa file dan pastikan data saat ini sudah di-backup sebelum menyetujui.

## Struktur Proyek

* `index.html`: Main HTML file dengan metadata SEO.
* `src/main.jsx`: Entry point React.
* `src/App.jsx`: Logika navigasi tab, antarmuka kasir, form nota, pengeluaran, dan dashboard keuangan.
* `src/index.css`: Sistem desain UI, tema gelap/terang, layout responsif.
* `src/services/db.js`: Service layer yang mengatur pembacaan & penulisan data ke database (Supabase/LocalStorage).
* `src/services/excelBackup.js`: Ekspor dan validasi workbook Excel untuk backup/pemulihan.
* `supabase_schema.sql`: Kumpulan query SQL untuk setup database Supabase.
* `.env.example`: Template browser dan server environment variables; semua nilai rahasia harus diisi melalui environment lokal/Vercel dan tidak di-commit.
