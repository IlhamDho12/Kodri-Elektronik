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
    stok_minimum INTEGER NOT NULL DEFAULT 5,
    stok_belum_dialokasikan INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE produk
ADD COLUMN IF NOT EXISTS stok_belum_dialokasikan INTEGER NOT NULL DEFAULT 0;

ALTER TABLE produk
DROP CONSTRAINT IF EXISTS produk_stok_belum_dialokasikan_nonnegative;

ALTER TABLE produk
ADD CONSTRAINT produk_stok_belum_dialokasikan_nonnegative
CHECK (stok_belum_dialokasikan >= 0);

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
    tanggal_pelunasan TIMESTAMP WITH TIME ZONE, -- Tanggal pelanggan melunasi bon
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

-- 5. TABEL PEMBELIAN NOTA
CREATE TABLE pembelian_nota (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tanggal TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    nama_supplier TEXT NOT NULL,
    total_nota NUMERIC NOT NULL DEFAULT 0,
    status TEXT CHECK (status IN ('Lunas', 'Tempo')) NOT NULL DEFAULT 'Lunas',
    foto_nota TEXT, -- Kolom foto nota pembelian (Base64)
    tanggal_pelunasan TIMESTAMP WITH TIME ZONE, -- Tanggal nota pembelian berstatus Tempo dilunasi
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE pembelian_nota
ADD COLUMN IF NOT EXISTS tanggal_pelunasan TIMESTAMP WITH TIME ZONE;

-- 6. TABEL DETAIL PEMBELIAN (barang yang diterima; alokasi stok dicatat terpisah)
CREATE TABLE detail_pembelian (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pembelian_nota_id UUID REFERENCES pembelian_nota(id) ON DELETE CASCADE,
    produk_id UUID REFERENCES produk(id) ON DELETE SET NULL,
    jumlah INTEGER NOT NULL DEFAULT 1,
    harga_beli NUMERIC NOT NULL DEFAULT 0,
    lokasi_tujuan TEXT CHECK (lokasi_tujuan IN ('Pasar', 'Rumah'))
);

ALTER TABLE detail_pembelian
ALTER COLUMN lokasi_tujuan DROP NOT NULL;

-- 7. TABEL PENGELUARAN OPERASIONAL
CREATE TABLE pengeluaran (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tanggal TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    kategori TEXT NOT NULL,
    jumlah NUMERIC NOT NULL DEFAULT 0,
    keterangan TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE pengeluaran
DROP CONSTRAINT IF EXISTS pengeluaran_jumlah_positive;

ALTER TABLE pengeluaran
ADD CONSTRAINT pengeluaran_jumlah_positive
CHECK (jumlah > 0);

ALTER TABLE pengeluaran
DROP CONSTRAINT IF EXISTS pengeluaran_kategori_nonempty;

ALTER TABLE pengeluaran
ADD CONSTRAINT pengeluaran_kategori_nonempty
CHECK (length(trim(kategori)) > 0);

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
-- Pengunjung publik boleh membaca. Semua penulisan harus melewati API server.
-- =========================================================================

ALTER TABLE produk ENABLE ROW LEVEL SECURITY;
ALTER TABLE stok_lokasi ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaksi ENABLE ROW LEVEL SECURITY;
ALTER TABLE detail_transaksi ENABLE ROW LEVEL SECURITY;
ALTER TABLE pembelian_nota ENABLE ROW LEVEL SECURITY;
ALTER TABLE detail_pembelian ENABLE ROW LEVEL SECURITY;
ALTER TABLE pengeluaran ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage produk" ON produk;
DROP POLICY IF EXISTS "Authenticated users can manage stok_lokasi" ON stok_lokasi;
DROP POLICY IF EXISTS "Authenticated users can manage transaksi" ON transaksi;
DROP POLICY IF EXISTS "Authenticated users can manage detail_transaksi" ON detail_transaksi;
DROP POLICY IF EXISTS "Authenticated users can manage pembelian_nota" ON pembelian_nota;
DROP POLICY IF EXISTS "Authenticated users can manage detail_pembelian" ON detail_pembelian;
DROP POLICY IF EXISTS "Authenticated users can manage pengeluaran" ON pengeluaran;
DROP POLICY IF EXISTS "Public users can manage produk" ON produk;
DROP POLICY IF EXISTS "Public users can manage stok_lokasi" ON stok_lokasi;
DROP POLICY IF EXISTS "Public users can manage transaksi" ON transaksi;
DROP POLICY IF EXISTS "Public users can manage detail_transaksi" ON detail_transaksi;
DROP POLICY IF EXISTS "Public users can manage pembelian_nota" ON pembelian_nota;
DROP POLICY IF EXISTS "Public users can manage detail_pembelian" ON detail_pembelian;
DROP POLICY IF EXISTS "Public users can manage pengeluaran" ON pengeluaran;

REVOKE ALL ON produk, stok_lokasi, transaksi, detail_transaksi,
  pembelian_nota, detail_pembelian, pengeluaran FROM PUBLIC, anon, authenticated;
GRANT SELECT ON produk, stok_lokasi, transaksi, detail_transaksi,
  pembelian_nota, detail_pembelian, pengeluaran TO anon, authenticated;
GRANT ALL ON produk, stok_lokasi, transaksi, detail_transaksi,
  pembelian_nota, detail_pembelian, pengeluaran TO service_role;

CREATE POLICY "Public can read produk" ON produk FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read stok_lokasi" ON stok_lokasi FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read transaksi" ON transaksi FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read detail_transaksi" ON detail_transaksi FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read pembelian_nota" ON pembelian_nota FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read detail_pembelian" ON detail_pembelian FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read pengeluaran" ON pengeluaran FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE write_access_attempts (
  ip_hash TEXT PRIMARY KEY,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  blocked_until TIMESTAMP WITH TIME ZONE
);
ALTER TABLE write_access_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON write_access_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON write_access_attempts TO service_role;

CREATE OR REPLACE FUNCTION register_write_access_attempt(p_ip_hash TEXT, p_success BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  attempt write_access_attempts%ROWTYPE;
BEGIN
  IF p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN FALSE;
  END IF;

  INSERT INTO write_access_attempts (ip_hash)
  VALUES (p_ip_hash)
  ON CONFLICT (ip_hash) DO NOTHING;

  SELECT * INTO attempt
  FROM write_access_attempts
  WHERE ip_hash = p_ip_hash
  FOR UPDATE;

  IF attempt.blocked_until IS NOT NULL AND attempt.blocked_until > now() THEN
    RETURN FALSE;
  END IF;

  IF attempt.window_started_at < now() - INTERVAL '15 minutes' THEN
    attempt.failed_attempts := 0;
  END IF;

  IF p_success THEN
    UPDATE write_access_attempts
    SET failed_attempts = 0, window_started_at = now(), blocked_until = NULL
    WHERE ip_hash = p_ip_hash;
    RETURN TRUE;
  END IF;

  attempt.failed_attempts := attempt.failed_attempts + 1;
  UPDATE write_access_attempts
  SET failed_attempts = attempt.failed_attempts,
      window_started_at = CASE
        WHEN attempt.failed_attempts = 1 THEN now()
        ELSE attempt.window_started_at
      END,
      blocked_until = CASE
        WHEN attempt.failed_attempts >= 5 THEN now() + INTERVAL '15 minutes'
        ELSE NULL
      END
  WHERE ip_hash = p_ip_hash;

  RETURN attempt.failed_attempts < 5;
END;
$$;
REVOKE ALL ON FUNCTION register_write_access_attempt(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION register_write_access_attempt(TEXT, BOOLEAN) TO service_role;
