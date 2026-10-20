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
  * **Cloud Mode (Rekomendasi)**: Data disimpan di **Firebase Cloud Firestore** dan tersinkronisasi antarperangkat. Pengunjung boleh membaca data melalui API situs; perubahan hanya dapat dilakukan melalui API server setelah kode akses diverifikasi.

### Otomasi Data Demo Harian

Saat berjalan di Local Mode dan sudah memiliki riwayat, aplikasi membuat transaksi otomatis satu kali pada pembukaan pertama setiap tanggal di browser tersebut. Jumlah transaksi Rumah mengikuti riwayat dan tetap sedikit (1–3 per hari). Transaksi Pasar mengikuti riwayat hari yang sama dengan variasi ringan; generator menargetkan 6–8 transaksi dan menyebarkannya dari sekitar 04.30 sampai sebelum 15.00 pada Senin, Selasa, Rabu, Sabtu, dan Minggu dengan nama kalangan yang sesuai. Jumlah akhirnya dapat lebih sedikit bila stok yang cocok tidak cukup. Empat hari pertama Syawal tidak membuat transaksi pasar. Pada Kamis/Jumat, bila belum ada nota pembelian untuk tanggal itu, generator dapat meniru satu nota dari riwayat (total Rp1 juta hingga kurang dari Rp15 juta), memakai supplier dan produk yang ada, lalu menambah stok **Belum Dialokasikan**. Generator juga dapat meniru satu pengeluaran harian bila belum ada pengeluaran pada tanggal itu. Data otomatis menggunakan stok/katalog lokal yang tersedia dan tidak menampilkan label DEMO pada aplikasi maupun backup Excel. Bila transaksi sudah tercatat pada tanggal itu atau riwayat/stok yang cocok tidak tersedia, generator tidak menambah bagian terkait.

Otomasi ini hanya berjalan di browser saat aplikasi dibuka, tidak berjalan ketika browser ditutup, dan tidak pernah menulis data DEMO ke Firestore. Data yang dibuat adalah simulasi untuk portfolio/latihan, bukan bukti penjualan atau catatan pembukuan nyata. Jika generator melewati hari karena stok atau riwayat tidak tersedia, perbaiki datanya lalu hapus marker terkait di Local Storage: `kodri_demo_automation_last_run`, `kodri_demo_automation_last_run_purchase`, atau `kodri_demo_automation_last_run_expense`; data yang sudah ada pada tanggal itu tetap mencegah duplikasi. Untuk mematikan otomasi permanen, nonaktifkan pemanggilan `runDailyDemoAutomation` di `src/App.jsx`.

### Deploy ke Vercel

Proyek memakai Vercel untuk frontend Vite dan API serverless:

```bash
npx vercel login
npx vercel
```

Atur environment variables berikut di **Vercel Project → Settings → Environment Variables** untuk Production, lalu redeploy:

* `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, dan `FIREBASE_PRIVATE_KEY`: kredensial service account Firebase, dipakai hanya oleh API server. Jangan gunakan awalan `VITE_` dan jangan pernah memasukkan private key ke source code.
* `WRITE_ACCESS_CODE`: kode edit (misalnya `7768`).
* `WRITE_ACCESS_TOKEN_SECRET`: secret acak minimal 32 karakter untuk menandatangani sesi edit.

Tidak ada halaman login awal. Pengunjung dapat membaca data melalui endpoint publik situs; saat mencoba mengubah data, aplikasi meminta kode. Server membatasi percobaan kode dan menerbitkan sesi edit selama 8 jam. Kode dan kredensial Firebase tidak dimasukkan ke bundle browser. Jangan simpan data pribadi yang tidak ingin terlihat publik.

Buat secret sesi di PowerShell dengan `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, lalu tempel hasilnya langsung ke Vercel tanpa membagikannya.

**Penting:** endpoint baca Firestore pada situs bersifat publik, jadi semua isi koleksi aplikasi dapat dibaca siapa pun. Jangan simpan data pribadi atau informasi yang tidak ingin dipublikasikan.

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

Local Mode dapat digunakan langsung dengan `npm run dev`. Untuk menguji Firestore melalui API Vercel secara lokal, gunakan `vercel dev` setelah menyiapkan environment variables server-only.

## Menyiapkan Firebase Firestore

1. Buat atau pilih project di [Firebase Console](https://console.firebase.google.com/).
2. Buka **Build → Firestore Database → Create database**. Pilih **Production mode** dan lokasi database dengan hati-hati; lokasinya tidak dapat diubah setelah dibuat.
3. Buka **Project settings → Service accounts → Generate new private key**. Unduh JSON ke komputer pribadi dan jangan commit atau kirim file ini.
4. Tambahkan Environment Variables berikut di Vercel Production dengan nilai dari service-account JSON:
   * `FIREBASE_PROJECT_ID` ← `project_id`
   * `FIREBASE_CLIENT_EMAIL` ← `client_email`
   * `FIREBASE_PRIVATE_KEY` ← `private_key` (isi lengkap termasuk header/footer PEM; Vercel dapat menyimpan baris baru atau teks `\n`)
   * `WRITE_ACCESS_CODE` ← kode edit yang dipilih
   * `WRITE_ACCESS_TOKEN_SECRET` ← secret acak minimal 32 karakter.
5. Terapkan aturan [firestore.rules](./firestore.rules) di **Firestore → Rules**. Browser tidak membaca Firestore secara langsung; data publik dilayani oleh API Vercel, sedangkan API admin menulis ke Firestore.
6. Deploy branch `main` ke Vercel setelah environment variables tersimpan.

Database Firestore baru mulai kosong. Data Supabase lama tidak disalin. Koleksi (`produk`, `transaksi`, `pembelian`, `pengeluaran`) dan dokumen dibuat otomatis ketika data pertama disimpan.

## Backup dan Pemulihan Excel

Gunakan panel utilitas di bagian bawah Dashboard untuk mengunduh backup `.xlsx` atau memulihkan data dari workbook backup aplikasi. Workbook berisi sheet produk, transaksi dan rinciannya, pembelian dan rinciannya, pengeluaran, serta lampiran. Saat pemulihan, aplikasi akan mengganti seluruh data pada mode penyimpanan aktif (Local Mode atau Firestore); periksa file dan pastikan data saat ini sudah di-backup sebelum menyetujui.

## Struktur Proyek

* `index.html`: Main HTML file dengan metadata SEO.
* `src/main.jsx`: Entry point React.
* `src/App.jsx`: Logika navigasi tab, antarmuka kasir, form nota, pengeluaran, dan dashboard keuangan.
* `src/index.css`: Sistem desain UI, tema gelap/terang, layout responsif.
* `src/services/db.js`: Service layer pembacaan API dan penulisan terlindungi (Firestore/LocalStorage).
* `src/services/excelBackup.js`: Ekspor dan validasi workbook Excel untuk backup/pemulihan.
* `server/db.js`: Adapter Firebase Admin untuk Firestore.
* `firestore.rules`: Menolak akses langsung browser ke Firestore; API Vercel memakai Firebase Admin.
* `.env.example`: Template browser dan server environment variables; semua nilai rahasia harus diisi melalui environment lokal/Vercel dan tidak di-commit.
