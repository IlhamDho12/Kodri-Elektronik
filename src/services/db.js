import { clearWriteAccess, getWriteAccessToken } from './writeAccess';

export const isMock = import.meta.env.DEV;
export const isCloud = !isMock;

const STORAGE_KEYS = {
  products: 'toko_produk',
  transactions: 'toko_transaksi',
  purchases: 'toko_pembelian',
  expenses: 'toko_pengeluaran'
};

let remoteDataPromise = null;
let remoteDataReadAt = 0;

const makeId = (prefix) => `${prefix}_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;

const getLocalData = (kind) => {
  const key = STORAGE_KEYS[kind];
  const raw = localStorage.getItem(key);
  if (raw === null) {
    localStorage.setItem(key, '[]');
    return [];
  }
  return JSON.parse(raw);
};

const setLocalData = (kind, data) => {
  localStorage.setItem(STORAGE_KEYS[kind], JSON.stringify(data));
};

const fetchRemoteData = async () => {
  if (remoteDataPromise && Date.now() - remoteDataReadAt < 1000) return remoteDataPromise;
  remoteDataReadAt = Date.now();
  remoteDataPromise = fetch('/api/data').then(async (response) => {
    const raw = await response.text();
    let result;
    try {
      result = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(`Server data memberikan respons yang tidak valid (HTTP ${response.status}).`);
    }
    if (!response.ok) throw new Error(result.error || `Database tidak dapat diakses (HTTP ${response.status}).`);
    return result;
  });
  try {
    return await remoteDataPromise;
  } catch (error) {
    remoteDataPromise = null;
    throw error;
  }
};

const secureWrite = async (action, payload) => {
  const token = getWriteAccessToken();
  if (!token) throw new Error('Akses edit kedaluwarsa. Masukkan kembali kode akses.');

  const response = await fetch('/api/write', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ action, payload })
  });
  const raw = await response.text();
  let result;
  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Server perubahan data memberikan respons yang tidak valid (HTTP ${response.status}).`);
  }
  if (response.status === 401) {
    clearWriteAccess();
    window.dispatchEvent(new Event('kodri:write-access-expired'));
  }
  if (!response.ok) throw new Error(result.error || `Perubahan data gagal disimpan (HTTP ${response.status}).`);
  remoteDataPromise = null;
  return result.data;
};

const validateProduct = (product) => {
  const normalized = {
    ...product,
    nama: String(product?.nama || '').trim(),
    kategori: String(product?.kategori || '').trim(),
    harga_beli_default: Number(product?.harga_beli_default),
    stok_minimum: Number(product?.stok_minimum),
    stok_rumah: Number(product?.stok_rumah),
    stok_pasar: Number(product?.stok_pasar),
    stok_belum_dialokasikan: Number(product?.stok_belum_dialokasikan) || 0
  };
  if (!normalized.nama || !normalized.kategori) throw new Error('Nama dan kategori produk wajib diisi.');
  if (!Number.isFinite(normalized.harga_beli_default) || normalized.harga_beli_default < 0) {
    throw new Error('Harga modal harus berupa angka 0 atau lebih.');
  }
  if (![normalized.stok_minimum, normalized.stok_rumah, normalized.stok_pasar, normalized.stok_belum_dialokasikan]
    .every((value) => Number.isInteger(value) && value >= 0)) {
    throw new Error('Stok dan batas minimum harus berupa bilangan bulat 0 atau lebih.');
  }
  return normalized;
};

const getRemoteCollection = async (kind) => (await fetchRemoteData())[kind];

const writeActions = {
  replaceAllData: ([backup]) => ['replaceAllData', { backup }],
  addProduct: ([product]) => ['addProduct', { product }],
  updateProduct: ([id, product]) => ['updateProduct', { id, product }],
  deleteProduct: ([id]) => ['deleteProduct', { id }],
  createTransaction: ([transaction]) => ['createTransaction', { transaction }],
  updateTransactionStatus: ([id, status]) => ['updateTransactionStatus', { id, status }],
  createPurchase: ([purchase]) => ['createPurchase', { purchase }],
  updatePurchaseStatus: ([id, status]) => ['updatePurchaseStatus', { id, status }],
  addExpense: ([expense]) => ['addExpense', { expense }],
  deleteExpense: ([id]) => ['deleteExpense', { id }]
};

const requireLocal = () => {
  if (isCloud) throw new Error('Cloud Mode harus menulis melalui API server.');
};

export const dbService = {
  async getProducts() {
    if (isCloud) return getRemoteCollection('products');
    return getLocalData('products').map((product) => ({
      ...product,
      stok_belum_dialokasikan: Number(product.stok_belum_dialokasikan) || 0
    }));
  },

  async getTransactions() {
    if (isCloud) return getRemoteCollection('transactions');
    return getLocalData('transactions');
  },

  async getPurchases() {
    if (isCloud) return getRemoteCollection('purchases');
    return getLocalData('purchases');
  },

  async getExpenses() {
    if (isCloud) return getRemoteCollection('expenses');
    return getLocalData('expenses');
  },

  async replaceAllData(backup) {
    if (isCloud) return secureWrite(...writeActions.replaceAllData([backup]));
    for (const kind of Object.keys(STORAGE_KEYS)) {
      if (!Array.isArray(backup[kind])) throw new Error(`Data ${kind} pada backup tidak valid.`);
    }
    setLocalData('products', backup.products);
    setLocalData('transactions', backup.transactions);
    setLocalData('purchases', backup.purchases);
    setLocalData('expenses', backup.expenses);
  },

  async addProduct(product) {
    if (isCloud) return secureWrite(...writeActions.addProduct([product]));
    requireLocal();
    const normalized = validateProduct(product);
    if (normalized.stok_rumah || normalized.stok_pasar || normalized.stok_belum_dialokasikan) {
      throw new Error('Produk baru harus dimulai dengan stok 0 dan stok hanya dapat ditambah lewat transaksi pembelian.');
    }
    const newProduct = { id: makeId('p'), ...normalized };
    setLocalData('products', [...getLocalData('products'), newProduct]);
    return newProduct;
  },

  async updateProduct(id, product) {
    if (isCloud) return secureWrite(...writeActions.updateProduct([id, product]));
    requireLocal();
    const normalized = validateProduct(product);
    const products = getLocalData('products');
    const index = products.findIndex((entry) => String(entry.id) === String(id));
    if (index < 0) throw new Error('Produk tidak ditemukan.');
    const existing = products[index];
    if (normalized.harga_beli_default !== Number(existing.harga_beli_default)) {
      throw new Error('Harga modal tidak dapat diubah manual. Harga modal dihitung otomatis dari transaksi pembelian.');
    }
    const currentTotal = (Number(existing.stok_rumah) || 0) +
      (Number(existing.stok_pasar) || 0) +
      (Number(existing.stok_belum_dialokasikan) || 0);
    if (normalized.stok_rumah + normalized.stok_pasar !== currentTotal) {
      throw new Error(`Total stok tidak boleh berubah. Distribusikan tepat ${currentTotal} pcs antara Rumah dan Pasar.`);
    }
    products[index] = { ...existing, ...normalized, stok_belum_dialokasikan: 0 };
    setLocalData('products', products);
    return products[index];
  },

  async deleteProduct(id) {
    if (isCloud) return secureWrite(...writeActions.deleteProduct([id]));
    requireLocal();
    setLocalData('products', getLocalData('products').filter((product) => String(product.id) !== String(id)));
    return true;
  },

  async createTransaction(transaction) {
    if (isCloud) return secureWrite(...writeActions.createTransaction([transaction]));
    requireLocal();
    if (!['Rumah', 'Pasar'].includes(transaction?.lokasi_penjualan)) throw new Error('Lokasi penjualan tidak valid.');
    if (!['Tunai', 'Transfer', 'Tempo'].includes(transaction.metode_pembayaran)) throw new Error('Metode pembayaran transaksi tidak valid.');
    if (!['Lunas', 'Belum Lunas'].includes(transaction.status_pembayaran)) throw new Error('Status pembayaran transaksi tidak valid.');
    if (!Array.isArray(transaction.items) || transaction.items.length === 0) throw new Error('Transaksi harus memiliki setidaknya satu barang.');

    const products = getLocalData('products');
    const requested = new Map();
    let total = 0;
    for (const item of transaction.items) {
      const product = products.find((entry) => String(entry.id) === String(item.produk_id));
      if (!product) throw new Error(`Produk "${item.nama_produk || item.produk_id}" tidak ditemukan di katalog.`);
      const quantity = Number(item.jumlah);
      const price = Number(item.harga_jual_saat_ini);
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`Jumlah "${product.nama}" harus bilangan bulat lebih dari 0.`);
      if (!Number.isInteger(price) || price <= 0) throw new Error(`Harga jual "${product.nama}" harus bilangan bulat lebih dari Rp0.`);
      total += quantity * price;
      requested.set(product.id, (requested.get(product.id) || 0) + quantity);
    }
    if (Math.abs(total - Number(transaction.total_harga)) > 0.01) throw new Error('Total transaksi tidak sesuai dengan jumlah dan harga jual barang.');

    requested.forEach((quantity, productId) => {
      const product = products.find((entry) => String(entry.id) === String(productId));
      const field = transaction.lokasi_penjualan === 'Pasar' ? 'stok_pasar' : 'stok_rumah';
      const available = Number(product[field]) || 0;
      if (quantity > available) throw new Error(`Stok "${product.nama}" di ${transaction.lokasi_penjualan} tidak cukup. Tersedia ${available}, diminta ${quantity}.`);
      product[field] = available - quantity;
    });
    const newTransaction = { id: makeId('t'), tanggal: new Date().toISOString(), ...transaction, total_harga: total };
    setLocalData('products', products);
    setLocalData('transactions', [newTransaction, ...getLocalData('transactions')]);
    return newTransaction;
  },

  async updateTransactionStatus(id, status) {
    if (isCloud) return secureWrite(...writeActions.updateTransactionStatus([id, status]));
    requireLocal();
    if (!['Lunas', 'Belum Lunas'].includes(status)) throw new Error('Status pembayaran transaksi tidak valid.');
    const transactions = getLocalData('transactions');
    const transaction = transactions.find((entry) => String(entry.id) === String(id));
    if (!transaction) throw new Error('Transaksi tidak ditemukan.');
    transaction.status_pembayaran = status;
    transaction.tanggal_pelunasan = status === 'Lunas' ? new Date().toISOString() : null;
    setLocalData('transactions', transactions);
    return true;
  },

  async createPurchase(purchase) {
    if (isCloud) return secureWrite(...writeActions.createPurchase([purchase]));
    requireLocal();
    if (!purchase?.nama_supplier?.trim()) throw new Error('Nama supplier wajib diisi.');
    if (!['Lunas', 'Tempo'].includes(purchase.status)) throw new Error('Status pembayaran pembelian tidak valid.');
    if (!Array.isArray(purchase.items) || purchase.items.length === 0) throw new Error('Pembelian harus memiliki setidaknya satu barang.');

    const products = getLocalData('products');
    const productsByName = new Map(products.map((product) => [product.nama.trim().toLocaleLowerCase(), product]));
    const quantityById = new Map();
    const items = [];
    for (const item of purchase.items) {
      const name = String(item.nama_produk || '').trim();
      const category = String(item.kategori || '').trim();
      const quantity = Number(item.jumlah);
      const price = Number(item.harga_beli);
      if (!name || !category) throw new Error('Nama dan jenis produk wajib diisi saat menerima barang.');
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`Jumlah "${name}" harus bilangan bulat lebih dari 0.`);
      if (!Number.isFinite(price) || price < 0) throw new Error(`Harga beli "${name}" harus 0 atau lebih.`);
      const lineTotal = item.total_harga === undefined ? price * quantity : Number(item.total_harga);
      if (Math.abs(lineTotal - price * quantity) > 0.000001) throw new Error(`Total harga pembelian "${name}" tidak sesuai.`);

      let product = item.produk_id ? products.find((entry) => String(entry.id) === String(item.produk_id)) : null;
      product ||= productsByName.get(name.toLocaleLowerCase());
      if (product && product.nama.trim().toLocaleLowerCase() !== name.toLocaleLowerCase()) throw new Error(`Nama barang tidak cocok dengan produk katalog "${product.nama}".`);
      if (product && product.kategori.trim().toLocaleLowerCase() !== category.toLocaleLowerCase()) throw new Error(`Jenis produk "${product.nama}" sudah terdaftar sebagai "${product.kategori}".`);
      if (!product) {
        product = {
          id: makeId('p'),
          nama: name,
          kategori: category,
          harga_beli_default: price,
          stok_minimum: 5,
          stok_rumah: 0,
          stok_pasar: 0,
          stok_belum_dialokasikan: 0
        };
        products.push(product);
        productsByName.set(name.toLocaleLowerCase(), product);
      }
      const totals = quantityById.get(product.id) || { quantity: 0, cost: 0 };
      totals.quantity += quantity;
      totals.cost += lineTotal;
      quantityById.set(product.id, totals);
      items.push({
        produk_id: product.id,
        nama_produk: product.nama,
        kategori: product.kategori,
        jumlah: quantity,
        harga_beli: price,
        total_harga: lineTotal,
        lokasi_tujuan: null
      });
    }

    quantityById.forEach(({ quantity, cost }, productId) => {
      const product = products.find((entry) => String(entry.id) === String(productId));
      const existingStock = (Number(product.stok_rumah) || 0) +
        (Number(product.stok_pasar) || 0) +
        (Number(product.stok_belum_dialokasikan) || 0);
      product.harga_beli_default = existingStock + quantity > 0
        ? ((existingStock * Number(product.harga_beli_default || 0)) + cost) / (existingStock + quantity)
        : cost / quantity;
      product.stok_belum_dialokasikan = (Number(product.stok_belum_dialokasikan) || 0) + quantity;
    });
    const newPurchase = {
      id: makeId('b'),
      tanggal: new Date().toISOString(),
      nama_supplier: purchase.nama_supplier.trim(),
      status: purchase.status,
      foto_nota: purchase.foto_nota || null,
      total_nota: items.reduce((sum, item) => sum + item.total_harga, 0),
      items
    };
    setLocalData('products', products);
    setLocalData('purchases', [newPurchase, ...getLocalData('purchases')]);
    return newPurchase;
  },

  async updatePurchaseStatus(id, status) {
    if (isCloud) return secureWrite(...writeActions.updatePurchaseStatus([id, status]));
    requireLocal();
    if (!['Lunas', 'Tempo'].includes(status)) throw new Error('Status pembayaran pembelian tidak valid.');
    const purchases = getLocalData('purchases');
    const purchase = purchases.find((entry) => String(entry.id) === String(id));
    if (!purchase) throw new Error('Nota pembelian tidak ditemukan.');
    purchase.status = status;
    purchase.tanggal_pelunasan = status === 'Lunas' ? new Date().toISOString() : null;
    setLocalData('purchases', purchases);
    return true;
  },

  async addExpense(expense) {
    if (isCloud) return secureWrite(...writeActions.addExpense([expense]));
    requireLocal();
    const category = String(expense?.kategori || '').trim();
    const amount = Number(expense?.jumlah);
    if (!category) throw new Error('Kategori pengeluaran wajib diisi.');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Jumlah pengeluaran harus lebih dari Rp0.');
    const newExpense = {
      id: makeId('e'),
      tanggal: new Date().toISOString(),
      ...expense,
      kategori: category,
      jumlah: amount
    };
    setLocalData('expenses', [newExpense, ...getLocalData('expenses')]);
    return newExpense;
  },

  async deleteExpense(id) {
    if (isCloud) return secureWrite(...writeActions.deleteExpense([id]));
    requireLocal();
    setLocalData('expenses', getLocalData('expenses').filter((expense) => String(expense.id) !== String(id)));
    return true;
  }
};
