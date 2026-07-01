-- =========================================================================
-- SUPABASE POSTGRESQL DATABASE SCHEMA FOR TOKO ELEKTRONIK APP
-- COPY DAN PASTE SCRIPT INI DI SUPABASE SQL EDITOR UNTUK MEMBUAT TABEL
-- =========================================================================

-- 1. TABEL PRODUK
CREATE TABLE produk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama TEXT NOT NULL,
    kategori TEXT NOT NULL,
    harga_beli_default NUMERIC NOT NULL DEFAULT 0,
    harga_jual_default NUMERIC NOT NULL DEFAULT 0,
    stok_minimum INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. TABEL STOK LOKASI (Memisahkan Stok Pasar vs Rumah)
CREATE TABLE stok_lokasi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produk_id UUID REFERENCES produk(id) ON DELETE CASCADE,
    lokasi TEXT CHECK (lokasi IN ('Pasar', 'Rumah')) NOT NULL,
    jumlah INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (produk_id, lokasi)
);

-- 3. TABEL TRANSAKSI PENJUALAN
CREATE TABLE transaksi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tanggal TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    lokasi_penjualan TEXT CHECK (lokasi_penjualan IN ('Pasar', 'Rumah')) NOT NULL,
    total_harga NUMERIC NOT NULL DEFAULT 0,
    metode_pembayaran TEXT CHECK (metode_pembayaran IN ('Tunai', 'Transfer', 'Tempo')) NOT NULL,
    status_pembayaran TEXT CHECK (status_pembayaran IN ('Lunas', 'Belum Lunas')) NOT NULL,
    nama_pelanggan TEXT,
    bukti_pembayaran TEXT, -- Kolom bukti transfer bank (Base64)
    tanggal_pelunasan TIMESTAMP WITH TIME ZONE, -- Tanggal pelunasan bon pelanggan
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. TABEL DETAIL TRANSAKSI PENJUALAN (Menyimpan HPP Historis)
CREATE TABLE detail_transaksi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaksi_id UUID REFERENCES transaksi(id) ON DELETE CASCADE,
    produk_id UUID REFERENCES produk(id) ON DELETE SET NULL,
    jumlah INTEGER NOT NULL DEFAULT 1,
    harga_beli_saat_ini NUMERIC NOT NULL DEFAULT 0,
    harga_jual_saat_ini NUMERIC NOT NULL DEFAULT 0
);

-- 5. TABEL PEMBELIAN NOTA (Kulakan dari Toko Grosir Gede)
CREATE TABLE pembelian_nota (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tanggal TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    nama_supplier TEXT NOT NULL,
    total_nota NUMERIC NOT NULL DEFAULT 0,
    status TEXT CHECK (status IN ('Lunas', 'Tempo')) NOT NULL DEFAULT 'Lunas',
    foto_nota TEXT, -- Kolom foto nota pembelian (Base64)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. TABEL DETAIL PEMBELIAN (Kulakan per Barang & Alokasi Stok)
CREATE TABLE detail_pembelian (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pembelian_nota_id UUID REFERENCES pembelian_nota(id) ON DELETE CASCADE,
    produk_id UUID REFERENCES produk(id) ON DELETE SET NULL,
    jumlah INTEGER NOT NULL DEFAULT 1,
    harga_beli NUMERIC NOT NULL DEFAULT 0,
    lokasi_tujuan TEXT CHECK (lokasi_tujuan IN ('Pasar', 'Rumah')) NOT NULL
);

-- 7. TABEL PENGELUARAN OPERASIONAL
CREATE TABLE pengeluaran (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tanggal TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    kategori TEXT NOT NULL,
    jumlah NUMERIC NOT NULL DEFAULT 0,
    keterangan TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =========================================================================
-- TRIGGER UNTUK UPDATE OTOMATIS STOK KETIKA ADA KULAKAN ATAU TRANSAKSI DI SUPABASE
-- (OPSIONAL JIKA INGIN DIHANDEL DI LEVEL DATABASE)
-- =========================================================================

-- Trigger untuk inisialisasi stok lokasi 0 ketika produk baru dibuat
CREATE OR REPLACE FUNCTION handle_new_product_stock()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO stok_lokasi (produk_id, lokasi, jumlah) VALUES 
    (NEW.id, 'Rumah', 0),
    (NEW.id, 'Pasar', 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_new_product_stock
AFTER INSERT ON produk
FOR EACH ROW
EXECUTE FUNCTION handle_new_product_stock();

-- =========================================================================
-- ROW LEVEL SECURITY
-- Jalankan bagian ini agar anon key frontend tidak bisa membaca/menulis data
-- sebelum user berhasil login lewat Supabase Auth.
-- =========================================================================

CREATE TABLE allowed_users (
    email TEXT PRIMARY KEY
);

-- Ganti email di bawah ini dengan email admin yang dibuat di Supabase Auth.
-- INSERT INTO allowed_users (email) VALUES ('admin@example.com');

ALTER TABLE allowed_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE produk ENABLE ROW LEVEL SECURITY;
ALTER TABLE stok_lokasi ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaksi ENABLE ROW LEVEL SECURITY;
ALTER TABLE detail_transaksi ENABLE ROW LEVEL SECURITY;
ALTER TABLE pembelian_nota ENABLE ROW LEVEL SECURITY;
ALTER TABLE detail_pembelian ENABLE ROW LEVEL SECURITY;
ALTER TABLE pengeluaran ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allowed users can read their allowlist row"
ON allowed_users FOR SELECT TO authenticated
USING (email = (auth.jwt() ->> 'email'));

CREATE OR REPLACE FUNCTION is_allowed_app_user()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1
        FROM allowed_users
        WHERE email = (auth.jwt() ->> 'email')
    );
$$ LANGUAGE sql STABLE;

CREATE POLICY "Authenticated users can manage produk"
ON produk FOR ALL TO authenticated
USING (is_allowed_app_user())
WITH CHECK (is_allowed_app_user());

CREATE POLICY "Authenticated users can manage stok_lokasi"
ON stok_lokasi FOR ALL TO authenticated
USING (is_allowed_app_user())
WITH CHECK (is_allowed_app_user());

CREATE POLICY "Authenticated users can manage transaksi"
ON transaksi FOR ALL TO authenticated
USING (is_allowed_app_user())
WITH CHECK (is_allowed_app_user());

CREATE POLICY "Authenticated users can manage detail_transaksi"
ON detail_transaksi FOR ALL TO authenticated
USING (is_allowed_app_user())
WITH CHECK (is_allowed_app_user());

CREATE POLICY "Authenticated users can manage pembelian_nota"
ON pembelian_nota FOR ALL TO authenticated
USING (is_allowed_app_user())
WITH CHECK (is_allowed_app_user());

CREATE POLICY "Authenticated users can manage detail_pembelian"
ON detail_pembelian FOR ALL TO authenticated
USING (is_allowed_app_user())
WITH CHECK (is_allowed_app_user());

CREATE POLICY "Authenticated users can manage pengeluaran"
ON pengeluaran FOR ALL TO authenticated
USING (is_allowed_app_user())
WITH CHECK (is_allowed_app_user());
