import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const isCloudConfigured = supabaseUrl.trim() !== '' && supabaseKey.trim() !== '';

export const supabase = isCloudConfigured
  ? createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;
export const isMock = !isCloudConfigured;
export const isCloud = isCloudConfigured;

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

const insertRows = async (table, rows) => {
  for (let index = 0; index < rows.length; index += 100) {
    const { error } = await supabase.from(table).insert(rows.slice(index, index + 100));
    if (error) throw error;
  }
};

const deleteAllRows = async (table) => {
  const { error } = await supabase.from(table).delete().not('id', 'is', null);
  if (error) throw error;
};

const createUuid = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const normalizeProduct = (product) => {
  const normalized = {
    ...product,
    nama: String(product.nama || '').trim(),
    kategori: String(product.kategori || '').trim(),
    harga_beli_default: Number(product.harga_beli_default),
    stok_minimum: Number(product.stok_minimum),
    stok_rumah: Number(product.stok_rumah),
    stok_pasar: Number(product.stok_pasar)
  };
  if (!normalized.nama || !normalized.kategori) throw new Error('Nama dan kategori produk wajib diisi.');
  if (!Number.isFinite(normalized.harga_beli_default) || normalized.harga_beli_default < 0) {
    throw new Error('Harga modal harus berupa angka 0 atau lebih.');
  }
  if (![normalized.stok_minimum, normalized.stok_rumah, normalized.stok_pasar].every((value) => Number.isInteger(value) && value >= 0)) {
    throw new Error('Stok dan batas minimum harus berupa bilangan bulat 0 atau lebih.');
  }
  return normalized;
};

// ----------------------------------------------------
// IMPLEMENTASI DUAL SERVICE (MOCK & CLOUD)
// ----------------------------------------------------
export const dbService = {
  async replaceAllData(backup) {
    if (isMock) {
      setLocalData('toko_produk', backup.products);
      setLocalData('toko_transaksi', backup.transactions);
      setLocalData('toko_pembelian', backup.purchases);
      setLocalData('toko_pengeluaran', backup.expenses);
      return;
    }

    const idMap = new Map();
    const mapId = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const id = String(value);
      if (/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(id)) return id;
      if (!idMap.has(id)) idMap.set(id, createUuid());
      return idMap.get(id);
    };

    const products = backup.products.map((product) => ({
      ...product,
      id: mapId(product.id)
    }));
    const transactions = backup.transactions.map((transaction) => ({
      ...transaction,
      id: mapId(transaction.id),
      items: transaction.items.map((item) => ({
        ...item,
        produk_id: mapId(item.produk_id)
      }))
    }));
    const purchases = backup.purchases.map((purchase) => ({
      ...purchase,
      id: mapId(purchase.id),
      items: purchase.items.map((item) => ({
        ...item,
        produk_id: mapId(item.produk_id)
      }))
    }));

    await deleteAllRows('detail_transaksi');
    await deleteAllRows('detail_pembelian');
    await deleteAllRows('transaksi');
    await deleteAllRows('pembelian_nota');
    await deleteAllRows('stok_lokasi');
    await deleteAllRows('pengeluaran');
    await deleteAllRows('produk');

    await insertRows('produk', products.map((product) => ({
      id: product.id,
      nama: product.nama,
      kategori: product.kategori,
      harga_beli_default: product.harga_beli_default,
      stok_minimum: product.stok_minimum,
      stok_belum_dialokasikan: Number(product.stok_belum_dialokasikan) || 0,
      created_at: product.created_at || undefined
    })));

    const stocks = products.flatMap((product) => [
      { produk_id: product.id, lokasi: 'Rumah', jumlah: Number(product.stok_rumah) || 0 },
      { produk_id: product.id, lokasi: 'Pasar', jumlah: Number(product.stok_pasar) || 0 }
    ]);
    for (let index = 0; index < stocks.length; index += 100) {
      const { error } = await supabase
        .from('stok_lokasi')
        .upsert(stocks.slice(index, index + 100), { onConflict: 'produk_id,lokasi' });
      if (error) throw error;
    }

    await insertRows('transaksi', transactions.map((transaction) => ({
      id: transaction.id,
      tanggal: transaction.tanggal,
      lokasi_penjualan: transaction.lokasi_penjualan,
      total_harga: transaction.total_harga,
      metode_pembayaran: transaction.metode_pembayaran,
      status_pembayaran: transaction.status_pembayaran,
      nama_pelanggan: transaction.nama_pelanggan || null,
      bukti_pembayaran: transaction.bukti_pembayaran || null,
      tanggal_pelunasan: transaction.tanggal_pelunasan || null,
      created_at: transaction.created_at || undefined
    })));
    await insertRows('detail_transaksi', transactions.flatMap((transaction) => transaction.items.map((item) => ({
      transaksi_id: transaction.id,
      produk_id: item.produk_id,
      jumlah: item.jumlah,
      harga_beli_saat_ini: item.harga_beli_saat_ini,
      harga_jual_saat_ini: item.harga_jual_saat_ini
    }))));

    await insertRows('pembelian_nota', purchases.map((purchase) => ({
      id: purchase.id,
      tanggal: purchase.tanggal,
      nama_supplier: purchase.nama_supplier,
      total_nota: purchase.total_nota,
      status: purchase.status,
      foto_nota: purchase.foto_nota || purchase.foto_nota_base64 || null,
      tanggal_pelunasan: purchase.tanggal_pelunasan || null,
      created_at: purchase.created_at || undefined
    })));
    await insertRows('detail_pembelian', purchases.flatMap((purchase) => purchase.items.map((item) => ({
      pembelian_nota_id: purchase.id,
      produk_id: item.produk_id,
      jumlah: item.jumlah,
      harga_beli: item.harga_beli,
      lokasi_tujuan: item.lokasi_tujuan || null
    }))));
    await insertRows('pengeluaran', backup.expenses.map((expense) => ({
      id: mapId(expense.id),
      tanggal: expense.tanggal,
      kategori: expense.kategori,
      jumlah: expense.jumlah,
      keterangan: expense.keterangan,
      created_at: expense.created_at || undefined
    })));
  },

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
          stok_pasar,
          stok_belum_dialokasikan: Number(p.stok_belum_dialokasikan) || 0
        };
      });
    } else {
      // Mock LocalStorage
      return getLocalData('toko_produk', INITIAL_PRODUCTS).map((product) => ({
        ...product,
        stok_belum_dialokasikan: Number(product.stok_belum_dialokasikan) || 0
      }));
    }
  },

  async addProduct(product) {
    const normalizedProduct = normalizeProduct(product);
    if (normalizedProduct.stok_rumah !== 0 || normalizedProduct.stok_pasar !== 0) {
      throw new Error('Produk baru harus dimulai dengan stok 0 dan stok hanya dapat ditambah lewat transaksi pembelian.');
    }
    if (!isMock) {
      // Cloud Supabase
      const { data, error } = await supabase
        .from('produk')
        .insert([{
          nama: normalizedProduct.nama,
          kategori: normalizedProduct.kategori,
          harga_beli_default: normalizedProduct.harga_beli_default,
          stok_minimum: normalizedProduct.stok_minimum,
          stok_belum_dialokasikan: 0
        }])
        .select()
        .single();
      if (error) throw error;

      // Trigger database membuat stok lokasi awal. Upsert menjaga schema lama/baru tetap aman.
      const { error: stockError } = await supabase
        .from('stok_lokasi')
        .upsert([
          { produk_id: data.id, lokasi: 'Rumah', jumlah: normalizedProduct.stok_rumah },
          { produk_id: data.id, lokasi: 'Pasar', jumlah: normalizedProduct.stok_pasar }
        ], { onConflict: 'produk_id,lokasi' });
      if (stockError) throw stockError;

      return { ...data, stok_rumah: normalizedProduct.stok_rumah, stok_pasar: normalizedProduct.stok_pasar, stok_belum_dialokasikan: 0 };
    } else {
      // Mock LocalStorage
      const products = getLocalData('toko_produk', INITIAL_PRODUCTS);
      const newProduct = {
        id: 'p_' + Math.random().toString(36).substr(2, 9),
        ...normalizedProduct
      };
      products.push(newProduct);
      setLocalData('toko_produk', products);
      return newProduct;
    }
  },

  async updateProduct(id, product) {
    const normalizedProduct = normalizeProduct(product);
    const existingProducts = await this.getProducts();
    const existingProduct = existingProducts.find((entry) => String(entry.id) === String(id));
    if (!existingProduct) throw new Error('Produk tidak ditemukan.');
    if (normalizedProduct.harga_beli_default !== Number(existingProduct.harga_beli_default)) {
      throw new Error('Harga modal tidak dapat diubah manual. Harga modal dihitung otomatis dari transaksi pembelian.');
    }
    const pendingStock = 0;
    const proposedStockTotal = normalizedProduct.stok_rumah + normalizedProduct.stok_pasar;
    const currentStockTotal = (Number(existingProduct.stok_rumah) || 0) +
      (Number(existingProduct.stok_pasar) || 0) +
      (Number(existingProduct.stok_belum_dialokasikan) || 0);
    if (proposedStockTotal !== currentStockTotal) {
      throw new Error(`Total stok tidak boleh berubah. Distribusikan tepat ${currentStockTotal} pcs antara Rumah dan Pasar.`);
    }
    if (!isMock) {
      // Cloud Supabase
      const { error } = await supabase
        .from('produk')
        .update({
          nama: normalizedProduct.nama,
          kategori: normalizedProduct.kategori,
          harga_beli_default: normalizedProduct.harga_beli_default,
          stok_minimum: normalizedProduct.stok_minimum,
          stok_belum_dialokasikan: pendingStock
        })
        .eq('id', id);
      if (error) throw error;

      // Update stok lokasi
      const { error: errorRumah } = await supabase
        .from('stok_lokasi')
        .upsert({ produk_id: id, lokasi: 'Rumah', jumlah: normalizedProduct.stok_rumah }, { onConflict: 'produk_id,lokasi' });
      if (errorRumah) throw errorRumah;

      const { error: errorPasar } = await supabase
        .from('stok_lokasi')
        .upsert({ produk_id: id, lokasi: 'Pasar', jumlah: normalizedProduct.stok_pasar }, { onConflict: 'produk_id,lokasi' });
      if (errorPasar) throw errorPasar;

      return { id, ...normalizedProduct };
    } else {
      // Mock LocalStorage
      const products = getLocalData('toko_produk', INITIAL_PRODUCTS);
      const index = products.findIndex(p => p.id === id);
      if (index !== -1) {
        products[index] = { ...products[index], ...normalizedProduct, stok_belum_dialokasikan: pendingStock };
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
    if (!['Rumah', 'Pasar'].includes(transaction.lokasi_penjualan)) {
      throw new Error('Lokasi penjualan tidak valid.');
    }
    if (!['Tunai', 'Transfer', 'Tempo'].includes(transaction.metode_pembayaran)) {
      throw new Error('Metode pembayaran transaksi tidak valid.');
    }
    if (!['Lunas', 'Belum Lunas'].includes(transaction.status_pembayaran)) {
      throw new Error('Status pembayaran transaksi tidak valid.');
    }
    if (!Array.isArray(transaction.items) || transaction.items.length === 0) {
      throw new Error('Transaksi harus memiliki setidaknya satu barang.');
    }

    const totalHarga = Number(transaction.total_harga);
    if (!Number.isFinite(totalHarga) || totalHarga <= 0) {
      throw new Error('Total transaksi harus lebih dari Rp0.');
    }

    const products = await this.getProducts();
    const productById = new Map(products.map((product) => [String(product.id), product]));
    const quantityByProduct = new Map();
    let calculatedTotal = 0;
    transaction.items.forEach((item) => {
      const product = productById.get(String(item.produk_id));
      if (!product) throw new Error(`Produk "${item.nama_produk || item.produk_id}" tidak ditemukan di katalog.`);
      const quantity = Number(item.jumlah);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error(`Jumlah "${product.nama}" harus bilangan bulat lebih dari 0.`);
      }
      const salePrice = Number(item.harga_jual_saat_ini);
      if (!Number.isInteger(salePrice) || salePrice <= 0) {
        throw new Error(`Harga jual "${product.nama}" harus bilangan bulat lebih dari Rp0.`);
      }
      calculatedTotal += quantity * salePrice;
      quantityByProduct.set(String(product.id), (quantityByProduct.get(String(product.id)) || 0) + quantity);
    });
    if (Math.abs(totalHarga - calculatedTotal) > 0.01) {
      throw new Error('Total transaksi tidak sesuai dengan jumlah dan harga jual barang.');
    }

    quantityByProduct.forEach((quantity, productId) => {
      const product = productById.get(productId);
      const availableStock = Number(transaction.lokasi_penjualan === 'Pasar' ? product.stok_pasar : product.stok_rumah) || 0;
      if (quantity > availableStock) {
        throw new Error(`Stok "${product.nama}" di ${transaction.lokasi_penjualan} tidak cukup. Tersedia ${availableStock}, diminta ${quantity}.`);
      }
    });

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
      newTx.items.forEach(item => {
        const prod = products.find(p => p.id === item.produk_id);
        if (prod) {
          if (newTx.lokasi_penjualan === 'Pasar') {
            prod.stok_pasar -= item.jumlah;
          } else {
            prod.stok_rumah -= item.jumlah;
          }
        }
      });
      setLocalData('toko_produk', products);

      return newTx;
    }
  },

  async updateTransactionStatus(id, status) {
    if (!['Lunas', 'Belum Lunas'].includes(status)) {
      throw new Error('Status pembayaran transaksi tidak valid.');
    }
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
    if (!purchase.nama_supplier?.trim()) throw new Error('Nama supplier wajib diisi.');
    if (!['Lunas', 'Tempo'].includes(purchase.status)) throw new Error('Status pembayaran pembelian tidak valid.');
    if (!Array.isArray(purchase.items) || purchase.items.length === 0) {
      throw new Error('Pembelian harus memiliki setidaknya satu barang.');
    }

    const products = await this.getProducts();
    const productById = new Map(products.map((product) => [String(product.id), product]));
    const newProductByName = new Map();
    const validatedItems = [];
    for (const item of purchase.items) {
      const name = String(item.nama_produk || '').trim();
      const category = String(item.kategori || '').trim();
      if (!name || !category) throw new Error('Nama dan jenis produk wajib diisi saat menerima barang.');
      const quantity = Number(item.jumlah);
      const price = Number(item.harga_beli);
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`Jumlah "${name}" harus bilangan bulat lebih dari 0.`);
      if (!Number.isFinite(price) || price < 0) throw new Error(`Harga beli "${name}" harus 0 atau lebih.`);
      const lineTotal = item.total_harga === undefined ? price * quantity : Number(item.total_harga);
      if (!Number.isFinite(lineTotal) || lineTotal < 0 || Math.abs(lineTotal - price * quantity) > 0.000001) {
        throw new Error(`Total harga pembelian "${name}" tidak sesuai dengan jumlah dan harga satuan.`);
      }

      let product = item.produk_id ? productById.get(String(item.produk_id)) : null;
      product ||= products.find((entry) => entry.nama.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
      const normalizedName = name.toLocaleLowerCase();
      const pendingProduct = newProductByName.get(normalizedName);
      if (!product && pendingProduct) product = pendingProduct;
      if (product && product.nama.trim().toLocaleLowerCase() !== name.toLocaleLowerCase()) {
        throw new Error(`Nama barang tidak cocok dengan produk katalog "${product.nama}".`);
      }
      if (product && product.kategori.trim().toLocaleLowerCase() !== category.toLocaleLowerCase()) {
        throw new Error(`Jenis produk "${product.nama}" sudah terdaftar sebagai "${product.kategori}".`);
      }
      if (!product) {
        newProductByName.set(normalizedName, { nama: name, kategori: category });
      }
      validatedItems.push({ name, category, quantity, price, lineTotal, product });
    }

    const items = [];
    const createdProductsByName = new Map();
    for (const item of validatedItems) {
      let product = item.product;
      if (!products.includes(product)) {
        product = createdProductsByName.get(item.name.toLocaleLowerCase());
      }
      if (!product) {
        product = await this.addProduct({
          nama: item.name,
          kategori: item.category,
          harga_beli_default: item.price,
          stok_minimum: 5,
          stok_rumah: 0,
          stok_pasar: 0
        });
        products.push(product);
        productById.set(String(product.id), product);
        createdProductsByName.set(item.name.toLocaleLowerCase(), product);
      }
      items.push({
        produk_id: product.id,
        nama_produk: product.nama,
        kategori: product.kategori,
        jumlah: item.quantity,
        harga_beli: item.price,
        total_harga: item.lineTotal,
        lokasi_tujuan: null
      });
    }
    const totalNota = items.reduce((sum, item) => sum + item.total_harga, 0);
    const totalQuantityByProduct = new Map();
    items.forEach((item) => {
      const current = totalQuantityByProduct.get(item.produk_id) || { quantity: 0, totalCost: 0 };
      current.quantity += item.jumlah;
      current.totalCost += item.total_harga;
      totalQuantityByProduct.set(item.produk_id, current);
    });

    const weightedCostByProduct = new Map();
    totalQuantityByProduct.forEach((totals, productId) => {
      const product = productById.get(String(productId));
      const existingStock = (Number(product.stok_rumah) || 0) +
        (Number(product.stok_pasar) || 0) +
        (Number(product.stok_belum_dialokasikan) || 0);
      const incomingQuantity = totals.quantity;
      const averageCost = existingStock + incomingQuantity > 0
        ? ((existingStock * Number(product.harga_beli_default || 0)) + totals.totalCost) / (existingStock + incomingQuantity)
        : totals.totalCost / incomingQuantity;
      weightedCostByProduct.set(String(productId), averageCost);
    });

    if (!isMock) {
      // Cloud Supabase
      // 1. Simpan Nota Pembelian
      const { data: newPurchase, error: pError } = await supabase
        .from('pembelian_nota')
        .insert([{
          nama_supplier: purchase.nama_supplier.trim(),
          total_nota: totalNota,
          status: purchase.status,
          foto_nota: purchase.foto_nota || null,
          tanggal: new Date().toISOString()
        }])
        .select()
        .single();
      if (pError) throw pError;

      // 2. Simpan Detail & Tambah Stok & Update Harga Beli Default Produk
      for (const item of items) {
        const { error: detailError } = await supabase
          .from('detail_pembelian')
          .insert([{
            pembelian_nota_id: newPurchase.id,
            produk_id: item.produk_id,
            jumlah: item.jumlah,
            harga_beli: item.harga_beli,
            lokasi_tujuan: null
          }]);
        if (detailError) throw detailError;
      }

      for (const [productId, totals] of totalQuantityByProduct) {
        const product = productById.get(String(productId));
        const { error: updateProdErr } = await supabase
          .from('produk')
          .update({
            harga_beli_default: weightedCostByProduct.get(String(productId)),
            stok_belum_dialokasikan: (Number(product.stok_belum_dialokasikan) || 0) + totals.quantity
          })
          .eq('id', productId);
        if (updateProdErr) throw updateProdErr;
      }

      return newPurchase;
    } else {
      // Mock LocalStorage
      const purchases = getLocalData('toko_pembelian', INITIAL_PURCHASES);
      const newPurchase = {
        id: 'b_' + Math.random().toString(36).substr(2, 9),
        tanggal: new Date().toISOString(),
        nama_supplier: purchase.nama_supplier.trim(),
        status: purchase.status,
        foto_nota: purchase.foto_nota || null,
        total_nota: totalNota,
        items
      };
      purchases.unshift(newPurchase);
      setLocalData('toko_pembelian', purchases);

      const products = getLocalData('toko_produk', INITIAL_PRODUCTS);
      totalQuantityByProduct.forEach((totals, productId) => {
        const product = products.find((entry) => String(entry.id) === String(productId));
        if (product) {
          product.stok_belum_dialokasikan = (Number(product.stok_belum_dialokasikan) || 0) + totals.quantity;
          product.harga_beli_default = weightedCostByProduct.get(String(productId));
        }
      });
      setLocalData('toko_produk', products);

      // Fix #2: Tambahkan return agar caller mendapatkan data nota baru
      return newPurchase;
    }
  },

  async updatePurchaseStatus(id, status) {
    if (!['Lunas', 'Tempo'].includes(status)) {
      throw new Error('Status pembayaran pembelian tidak valid.');
    }
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
    const category = String(expense.kategori || '').trim();
    const amount = Number(expense.jumlah);
    if (!category) throw new Error('Kategori pengeluaran wajib diisi.');
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Jumlah pengeluaran harus lebih dari Rp0.');
    }
    if (!isMock) {
      // Cloud Supabase
      const { data, error } = await supabase
        .from('pengeluaran')
        .insert([{
          kategori: category,
          jumlah: amount,
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
        ...expense,
        kategori: category,
        jumlah: amount
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
