-- Run once on the existing Supabase project before deploying the new app.
-- Public visitors can read store data; all writes must use the Vercel API.

ALTER TABLE produk
  ADD COLUMN IF NOT EXISTS stok_belum_dialokasikan INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'produk_stok_belum_dialokasikan_nonnegative'
  ) THEN
    ALTER TABLE produk
      ADD CONSTRAINT produk_stok_belum_dialokasikan_nonnegative
      CHECK (stok_belum_dialokasikan >= 0);
  END IF;
END;
$$;

ALTER TABLE pembelian_nota
  ADD COLUMN IF NOT EXISTS tanggal_pelunasan TIMESTAMP WITH TIME ZONE;

ALTER TABLE detail_pembelian
  ALTER COLUMN lokasi_tujuan DROP NOT NULL;

ALTER TABLE produk ENABLE ROW LEVEL SECURITY;
ALTER TABLE stok_lokasi ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaksi ENABLE ROW LEVEL SECURITY;
ALTER TABLE detail_transaksi ENABLE ROW LEVEL SECURITY;
ALTER TABLE pembelian_nota ENABLE ROW LEVEL SECURITY;
ALTER TABLE detail_pembelian ENABLE ROW LEVEL SECURITY;
ALTER TABLE pengeluaran ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  existing_policy RECORD;
BEGIN
  FOR existing_policy IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'produk', 'stok_lokasi', 'transaksi', 'detail_transaksi',
        'pembelian_nota', 'detail_pembelian', 'pengeluaran'
      ])
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      existing_policy.policyname,
      existing_policy.tablename
    );
  END LOOP;
END;
$$;

REVOKE ALL ON TABLE
  produk, stok_lokasi, transaksi, detail_transaksi,
  pembelian_nota, detail_pembelian, pengeluaran
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE
  produk, stok_lokasi, transaksi, detail_transaksi,
  pembelian_nota, detail_pembelian, pengeluaran
  TO anon, authenticated;
GRANT ALL ON TABLE
  produk, stok_lokasi, transaksi, detail_transaksi,
  pembelian_nota, detail_pembelian, pengeluaran
  TO service_role;

CREATE POLICY "Public can read produk"
  ON produk FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read stok_lokasi"
  ON stok_lokasi FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read transaksi"
  ON transaksi FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read detail_transaksi"
  ON detail_transaksi FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read pembelian_nota"
  ON pembelian_nota FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read detail_pembelian"
  ON detail_pembelian FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read pengeluaran"
  ON pengeluaran FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS write_access_attempts (
  ip_hash TEXT PRIMARY KEY,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  blocked_until TIMESTAMP WITH TIME ZONE
);
ALTER TABLE write_access_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE write_access_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE write_access_attempts TO service_role;

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
