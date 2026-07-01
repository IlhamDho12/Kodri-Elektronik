import { createClient } from '@supabase/supabase-js';

// Baca environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const isCloudConfigured = supabaseUrl.trim() !== '' && supabaseKey.trim() !== '';

export const supabase = isCloudConfigured ? createClient(supabaseUrl, supabaseKey) : null;
export const isMock = !isCloudConfigured;

// ----------------------------------------------------
// DUMMY / INITIAL DATA UNTUK LOCAL STORAGE
// ----------------------------------------------------
const INITIAL_PRODUCTS = [];
const INITIAL_PURCHASES = [];
const INITIAL_TRANSACTIONS = [];
const INITIAL_EXPENSES = [];

// Helper untuk LocalStorage
const getLocalData = (key, initial) => {
  const data = localStorage.getItem(key);
  if (!data) {
    localStorage.setItem(key, JSON.stringify(initial));
    return initial;
  }
  return JSON.parse(data);
};

const setLocalData = (key, data) => {
  localStorage.setItem(key, JSON.stringify(data));
};

// ----------------------------------------------------
// IMPLEMENTASI DUAL SERVICE (MOCK & CLOUD)
// ----------------------------------------------------
export const dbService = {
  // PRODUCTS
  async getProducts() {
    if (!isMock) {
      // Cloud Supabase
      const { data, error } = await supabase
        .from('produk')
        .select('*')
        .order('nama', { ascending: true });
      if (error) throw error;

      // Ambil stok per lokasi untuk digabung
      const { data: stockData, error: stockError } = await supabase
        .from('stok_lokasi')
        .select('*');
      if (stockError) throw stockError;

      // Gabungkan data produk dengan stoknya
      return data.map(p => {
        const stocks = stockData.filter(s => s.produk_id === p.id);
        const stok_rumah = stocks.find(s => s.lokasi === 'Rumah')?.jumlah || 0;
        const stok_pasar = stocks.find(s => s.lokasi === 'Pasar')?.jumlah || 0;
        return {
          ...p,
          stok_rumah,
          stok_pasar
        };
      });
    } else {
      // Mock LocalStorage
      return getLocalData('toko_produk', INITIAL_PRODUCTS);
    }
  },

  async addProduct(product) {
    if (!isMock) {
      // Cloud Supabase
      const { data, error } = await supabase
        .from('produk')
        .insert([{
          nama: product.nama,
          kategori: product.kategori,
          harga_beli_default: product.harga_beli_default,
          harga_jual_default: product.harga_jual_default,
          stok_minimum: product.stok_minimum
        }])
        .select()
        .single();
      if (error) throw error;

      // Buat entri stok lokasi awal (0 jika tidak diisi)
      const { error: stockError } = await supabase
        .from('stok_lokasi')
        .insert([
          { produk_id: data.id, lokasi: 'Rumah', jumlah: product.stok_rumah || 0 },
          { produk_id: data.id, lokasi: 'Pasar', jumlah: product.stok_pasar || 0 }
        ]);
      if (stockError) throw stockError;

      return { ...data, stok_rumah: product.stok_rumah || 0, stok_pasar: product.stok_pasar || 0 };
    } else {
      // Mock LocalStorage
      const products = getLocalData('toko_produk', INITIAL_PRODUCTS);
      const newProduct = {
        id: 'p_' + Math.random().toString(36).substr(2, 9),
        ...product
      };
      products.push(newProduct);
      setLocalData('toko_produk', products);
      return newProduct;
    }
  },

  async updateProduct(id, product) {
    if (!isMock) {
      // Cloud Supabase
      const { error } = await supabase
        .from('produk')
        .update({
          nama: product.nama,
          kategori: product.kategori,
          harga_beli_default: product.harga_beli_default,
          harga_jual_default: product.harga_jual_default,
          stok_minimum: product.stok_minimum
        })
        .eq('id', id);
      if (error) throw error;

      // Update stok lokasi
      const { error: errorRumah } = await supabase
        .from('stok_lokasi')
        .update({ jumlah: product.stok_rumah })
        .eq('produk_id', id)
        .eq('lokasi', 'Rumah');
      if (errorRumah) throw errorRumah;

      const { error: errorPasar } = await supabase
        .from('stok_lokasi')
        .update({ jumlah: product.stok_pasar })
        .eq('produk_id', id)
        .eq('lokasi', 'Pasar');
      if (errorPasar) throw errorPasar;

      return { id, ...product };
    } else {
      // Mock LocalStorage
      const products = getLocalData('toko_produk', INITIAL_PRODUCTS);
      const index = products.findIndex(p => p.id === id);
      if (index !== -1) {
        products[index] = { ...products[index], ...product };
        setLocalData('toko_produk', products);
        return products[index];
      }
      throw new Error('Produk tidak ditemukan');
    }
  },

  async deleteProduct(id) {
    if (!isMock) {
      const { error } = await supabase
        .from('produk')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return true;
    } else {
      const products = getLocalData('toko_produk', INITIAL_PRODUCTS);
      const filtered = products.filter(p => p.id !== id);
      setLocalData('toko_produk', filtered);
      return true;
    }
  },

  // TRANSACTIONS
  async getTransactions() {
    if (!isMock) {
      // Cloud Supabase
      const { data, error } = await supabase
        .from('transaksi')
        .select(`
          *,
          detail_transaksi (
            *,
            produk (nama)
          )
        `)
        .order('tanggal', { ascending: false });
      if (error) throw error;

      return data.map(t => ({
        ...t,
        items: t.detail_transaksi.map(d => ({
          produk_id: d.produk_id,
          nama_produk: d.produk?.nama || 'Produk Dihapus',
          jumlah: d.jumlah,
          harga_beli_saat_ini: d.harga_beli_saat_ini,
          harga_jual_saat_ini: d.harga_jual_saat_ini
        }))
      }));
    } else {
      // Mock LocalStorage
      return getLocalData('toko_transaksi', INITIAL_TRANSACTIONS);
    }
  },

  async createTransaction(transaction) {
    if (!isMock) {
      // Cloud Supabase
      // 1. Simpan Transaksi utama
      const { data: newTx, error: txError } = await supabase
        .from('transaksi')
        .insert([{
          lokasi_penjualan: transaction.lokasi_penjualan,
          total_harga: transaction.total_harga,
          metode_pembayaran: transaction.metode_pembayaran,
          status_pembayaran: transaction.status_pembayaran,
          nama_pelanggan: transaction.nama_pelanggan || null,
          bukti_pembayaran: transaction.bukti_pembayaran || null,
          tanggal: new Date().toISOString()
        }])
        .select()
        .single();
      if (txError) throw txError;

      // 2. Simpan Detail Transaksi & Kurangi Stok Lokasi
      for (const item of transaction.items) {
        // Simpan detail
        const { error: detailError } = await supabase
          .from('detail_transaksi')
          .insert([{
            transaksi_id: newTx.id,
            produk_id: item.produk_id,
            jumlah: item.jumlah,
            harga_beli_saat_ini: item.harga_beli_saat_ini,
            harga_jual_saat_ini: item.harga_jual_saat_ini
          }]);
        if (detailError) throw detailError;

        // Ambil stok lokasi saat ini untuk dikurangi
        const { data: stockItem, error: fetchStockErr } = await supabase
          .from('stok_lokasi')
          .select('jumlah')
          .eq('produk_id', item.produk_id)
          .eq('lokasi', transaction.lokasi_penjualan)
          .single();
        if (fetchStockErr) throw fetchStockErr;

        const newStockAmount = Math.max(0, stockItem.jumlah - item.jumlah);

        // Update stok
        const { error: updateStockErr } = await supabase
          .from('stok_lokasi')
          .update({ jumlah: newStockAmount })
          .eq('produk_id', item.produk_id)
          .eq('lokasi', transaction.lokasi_penjualan);
        if (updateStockErr) throw updateStockErr;
      }

      return newTx;
    } else {
      // Mock LocalStorage
      const transactions = getLocalData('toko_transaksi', INITIAL_TRANSACTIONS);
      const newTx = {
        id: 't_' + Math.random().toString(36).substr(2, 9),
        tanggal: new Date().toISOString(),
        ...transaction
      };
      transactions.unshift(newTx);
      setLocalData('toko_transaksi', transactions);

      // Kurangi stok produk
      const products = getLocalData('toko_produk', INITIAL_PRODUCTS);
      newTx.items.forEach(item => {
        const prod = products.find(p => p.id === item.produk_id);
        if (prod) {
          if (newTx.lokasi_penjualan === 'Pasar') {
            prod.stok_pasar = Math.max(0, prod.stok_pasar - item.jumlah);
          } else {
            prod.stok_rumah = Math.max(0, prod.stok_rumah - item.jumlah);
          }
        }
      });
      setLocalData('toko_produk', products);

      return newTx;
    }
  },

  async updateTransactionStatus(id, status) {
    if (!isMock) {
      const { error } = await supabase
        .from('transaksi')
        .update({ 
          status_pembayaran: status,
          tanggal_pelunasan: status === 'Lunas' ? new Date().toISOString() : null
        })
        .eq('id', id);
      if (error) throw error;
      return true;
    } else {
      const transactions = getLocalData('toko_transaksi', INITIAL_TRANSACTIONS);
      const tx = transactions.find(t => t.id === id);
      if (tx) {
        tx.status_pembayaran = status;
        tx.tanggal_pelunasan = status === 'Lunas' ? new Date().toISOString() : null;
        setLocalData('toko_transaksi', transactions);
        return true;
      }
      return false;
    }
  },

  // PURCHASES (NOTA KULAKAN)
  async getPurchases() {
    if (!isMock) {
      // Cloud Supabase
      const { data, error } = await supabase
        .from('pembelian_nota')
        .select(`
          *,
          detail_pembelian (
            *,
            produk (nama)
          )
        `)
        .order('tanggal', { ascending: false });
      if (error) throw error;

      return data.map(p => ({
        ...p,
        items: p.detail_pembelian.map(d => ({
          produk_id: d.produk_id,
          nama_produk: d.produk?.nama || 'Produk Dihapus',
          jumlah: d.jumlah,
          harga_beli: d.harga_beli,
          lokasi_tujuan: d.lokasi_tujuan
        }))
      }));
    } else {
      // Mock LocalStorage
      return getLocalData('toko_pembelian', INITIAL_PURCHASES);
    }
  },

  async createPurchase(purchase) {
    if (!isMock) {
      // Cloud Supabase
      // 1. Simpan Nota Pembelian
      const { data: newPurchase, error: pError } = await supabase
        .from('pembelian_nota')
        .insert([{
          nama_supplier: purchase.nama_supplier,
          total_nota: purchase.total_nota,
          status: purchase.status,
          tanggal: new Date().toISOString()
        }])
        .select()
        .single();
      if (pError) throw pError;

      // 2. Simpan Detail & Tambah Stok & Update Harga Beli Default Produk
      for (const item of purchase.items) {
        const { error: detailError } = await supabase
          .from('detail_pembelian')
          .insert([{
            pembelian_nota_id: newPurchase.id,
            produk_id: item.produk_id,
            jumlah: item.jumlah,
            harga_beli: item.harga_beli,
            lokasi_tujuan: item.lokasi_tujuan
          }]);
        if (detailError) throw detailError;

        // Ambil stok saat ini
        const { data: stockItem, error: fetchStockErr } = await supabase
          .from('stok_lokasi')
          .select('jumlah')
          .eq('produk_id', item.produk_id)
          .eq('lokasi', item.lokasi_tujuan)
          .single();
        if (fetchStockErr) throw fetchStockErr;

        const newStockAmount = stockItem.jumlah + item.jumlah;

        // Update stok di lokasi tujuan
        const { error: updateStockErr } = await supabase
          .from('stok_lokasi')
          .update({ jumlah: newStockAmount })
          .eq('produk_id', item.produk_id)
          .eq('lokasi', item.lokasi_tujuan);
        if (updateStockErr) throw updateStockErr;

        // Update harga beli default produk
        const { error: updateProdErr } = await supabase
          .from('produk')
          .update({ harga_beli_default: item.harga_beli })
          .eq('id', item.produk_id);
        if (updateProdErr) throw updateProdErr;
      }

      return newPurchase;
    } else {
      // Mock LocalStorage
      const purchases = getLocalData('toko_pembelian', INITIAL_PURCHASES);
      const newPurchase = {
        id: 'b_' + Math.random().toString(36).substr(2, 9),
        tanggal: new Date().toISOString(),
        ...purchase
      };
      purchases.unshift(newPurchase);
      setLocalData('toko_pembelian', purchases);

      // Tambah stok & update harga beli default produk
      const products = getLocalData('toko_produk', INITIAL_PRODUCTS);
      newPurchase.items.forEach(item => {
        const prod = products.find(p => p.id === item.produk_id);
        if (prod) {
          prod.harga_beli_default = item.harga_beli; // Update harga beli terbaru
          if (item.lokasi_tujuan === 'Pasar') {
            prod.stok_pasar += item.jumlah;
          } else {
            prod.stok_rumah += item.jumlah;
          }
        }
      });
      setLocalData('toko_produk', products);

      // Fix #2: Tambahkan return agar caller mendapatkan data nota baru
      return newPurchase;
    }
  },

  async updatePurchaseStatus(id, status) {
    if (!isMock) {
      const { error } = await supabase
        .from('pembelian_nota')
        .update({ 
          status: status,
          // Fix #3: Gunakan tanggal_pelunasan, BUKAN overwrite tanggal asli
          tanggal_pelunasan: status === 'Lunas' ? new Date().toISOString() : null
        })
        .eq('id', id);
      if (error) throw error;
      return true;
    } else {
      const purchases = getLocalData('toko_pembelian', INITIAL_PURCHASES);
      const pur = purchases.find(p => p.id === id);
      if (pur) {
        pur.status = status;
        // Fix #3: Simpan ke tanggal_pelunasan, BUKAN menimpa tanggal asli
        if (status === 'Lunas') {
          pur.tanggal_pelunasan = new Date().toISOString();
        } else {
          pur.tanggal_pelunasan = null;
        }
        setLocalData('toko_pembelian', purchases);
        return true;
      }
      return false;
    }
  },

  // EXPENSES
  async getExpenses() {
    if (!isMock) {
      // Cloud Supabase
      const { data, error } = await supabase
        .from('pengeluaran')
        .select('*')
        .order('tanggal', { ascending: false });
      if (error) throw error;
      return data;
    } else {
      // Mock LocalStorage
      return getLocalData('toko_pengeluaran', INITIAL_EXPENSES);
    }
  },

  async addExpense(expense) {
    if (!isMock) {
      // Cloud Supabase
      const { data, error } = await supabase
        .from('pengeluaran')
        .insert([{
          kategori: expense.kategori,
          jumlah: expense.jumlah,
          keterangan: expense.keterangan,
          tanggal: new Date().toISOString()
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      // Mock LocalStorage
      const expenses = getLocalData('toko_pengeluaran', INITIAL_EXPENSES);
      const newExpense = {
        id: 'e_' + Math.random().toString(36).substr(2, 9),
        tanggal: new Date().toISOString(),
        ...expense
      };
      expenses.unshift(newExpense);
      setLocalData('toko_pengeluaran', expenses);
      return newExpense;
    }
  },

  // Fix #3/#15: Hapus pengeluaran (baru)
  async deleteExpense(id) {
    if (!isMock) {
      const { error } = await supabase
        .from('pengeluaran')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return true;
    } else {
      const expenses = getLocalData('toko_pengeluaran', INITIAL_EXPENSES);
      const filtered = expenses.filter(e => e.id !== id);
      setLocalData('toko_pengeluaran', filtered);
      return true;
    }
  }
};
