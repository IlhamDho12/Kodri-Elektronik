import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';

const projectId = process.env.FIREBASE_PROJECT_ID || '';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || '';
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const isConfigured = Boolean(projectId && clientEmail && privateKey);

let firestore = null;
if (isConfigured) {
  const app = getApps()[0] || initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId
  });
  firestore = getFirestore(app);
}

export const isMock = !isConfigured;
export const db = firestore;

const COLLECTIONS = {
  products: 'produk',
  transactions: 'transaksi',
  purchases: 'pembelian',
  expenses: 'pengeluaran',
  attempts: '_writeAccessAttempts'
};

const now = () => new Date().toISOString();
const byNewest = (left, right) => String(right.tanggal || '').localeCompare(String(left.tanggal || ''));
const asRecord = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
const getAll = async (collection) => {
  if (!db) return [];
  const snapshot = await db.collection(collection).get();
  return snapshot.docs.map(asRecord);
};

const getProduct = async (id) => {
  const snapshot = await db.collection(COLLECTIONS.products).doc(String(id)).get();
  return snapshot.exists ? asRecord(snapshot) : null;
};

const normalizeProduct = (product) => {
  if (!product || typeof product !== 'object') throw new Error('Data produk tidak valid.');
  const normalized = {
    nama: String(product.nama || '').trim(),
    kategori: String(product.kategori || '').trim(),
    harga_beli_default: Number(product.harga_beli_default),
    stok_minimum: Number(product.stok_minimum),
    stok_rumah: Number(product.stok_rumah),
    stok_pasar: Number(product.stok_pasar),
    stok_belum_dialokasikan: Number(product.stok_belum_dialokasikan || 0)
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

const validateId = (id, label) => {
  const value = String(id || '').trim();
  if (!value || value.includes('/')) throw new Error(`${label} tidak valid.`);
  return value;
};

const makeId = (prefix) => `${prefix}_${randomUUID()}`;
const productsFromDb = async () => getAll(COLLECTIONS.products);

export const dbService = {
  async getProducts() {
    return (await productsFromDb()).map((product) => ({
      ...product,
      stok_belum_dialokasikan: Number(product.stok_belum_dialokasikan) || 0
    })).sort((a, b) => a.nama.localeCompare(b.nama));
  },

  async getTransactions() {
    return (await getAll(COLLECTIONS.transactions)).sort(byNewest);
  },

  async getPurchases() {
    return (await getAll(COLLECTIONS.purchases)).sort(byNewest);
  },

  async getExpenses() {
    return (await getAll(COLLECTIONS.expenses)).sort(byNewest);
  },

  async getAllData() {
    const [products, transactions, purchases, expenses] = await Promise.all([
      this.getProducts(),
      this.getTransactions(),
      this.getPurchases(),
      this.getExpenses()
    ]);
    return { products, transactions, purchases, expenses };
  },

  async addProduct(product) {
    const normalized = normalizeProduct(product);
    if (normalized.stok_rumah !== 0 || normalized.stok_pasar !== 0 ||
        normalized.stok_belum_dialokasikan !== 0) {
      throw new Error('Produk baru harus dimulai dengan stok 0 dan stok hanya dapat ditambah lewat transaksi pembelian.');
    }
    const id = makeId('p');
    await db.collection(COLLECTIONS.products).doc(id).create({
      ...normalized,
      created_at: now()
    });
    return { id, ...normalized };
  },

  async updateProduct(id, product) {
    const productId = validateId(id, 'ID produk');
    const normalized = normalizeProduct(product);
    const existing = await getProduct(productId);
    if (!existing) throw new Error('Produk tidak ditemukan.');
    if (normalized.harga_beli_default !== Number(existing.harga_beli_default)) {
      throw new Error('Harga modal tidak dapat diubah manual. Harga modal dihitung otomatis dari transaksi pembelian.');
    }
    const existingTotal = (Number(existing.stok_rumah) || 0) +
      (Number(existing.stok_pasar) || 0) +
      (Number(existing.stok_belum_dialokasikan) || 0);
    if (normalized.stok_rumah + normalized.stok_pasar !== existingTotal) {
      throw new Error(`Total stok tidak boleh berubah. Distribusikan tepat ${existingTotal} pcs antara Rumah dan Pasar.`);
    }
    const updated = {
      ...normalized,
      stok_belum_dialokasikan: 0,
      id: productId,
      created_at: existing.created_at
    };
    await db.collection(COLLECTIONS.products).doc(productId).set(updated);
    return updated;
  },

  async deleteProduct(id) {
    await db.collection(COLLECTIONS.products).doc(validateId(id, 'ID produk')).delete();
    return true;
  },

  async createTransaction(transaction) {
    if (!transaction || !['Rumah', 'Pasar'].includes(transaction.lokasi_penjualan)) {
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
    if (!Number.isFinite(totalHarga) || totalHarga <= 0) throw new Error('Total transaksi harus lebih dari Rp0.');

    const requested = new Map();
    let calculatedTotal = 0;
    for (const item of transaction.items) {
      const productId = validateId(item.produk_id, 'ID produk');
      const quantity = Number(item.jumlah);
      const salePrice = Number(item.harga_jual_saat_ini);
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Jumlah barang harus bilangan bulat lebih dari 0.');
      if (!Number.isInteger(salePrice) || salePrice <= 0) throw new Error('Harga jual harus bilangan bulat lebih dari Rp0.');
      calculatedTotal += quantity * salePrice;
      const accumulated = requested.get(productId) || { quantity: 0, items: [] };
      accumulated.quantity += quantity;
      accumulated.items.push(item);
      requested.set(productId, accumulated);
    }
    if (Math.abs(totalHarga - calculatedTotal) > 0.01) {
      throw new Error('Total transaksi tidak sesuai dengan jumlah dan harga jual barang.');
    }

    const id = makeId('t');
    const transactionRef = db.collection(COLLECTIONS.transactions).doc(id);
    await db.runTransaction(async (tx) => {
      const productRefs = [...requested.keys()].map((productId) =>
        db.collection(COLLECTIONS.products).doc(productId));
      const productSnapshots = await Promise.all(productRefs.map((ref) => tx.get(ref)));
      const productsById = new Map();
      productSnapshots.forEach((snapshot) => {
        if (snapshot.exists) productsById.set(snapshot.id, snapshot.data());
      });

      const items = [];
      for (const [productId, request] of requested) {
        const product = productsById.get(productId);
        if (!product) throw new Error(`Produk "${productId}" tidak ditemukan di katalog.`);
        const stockField = transaction.lokasi_penjualan === 'Pasar' ? 'stok_pasar' : 'stok_rumah';
        const available = Number(product[stockField]) || 0;
        if (request.quantity > available) {
          throw new Error(`Stok "${product.nama}" di ${transaction.lokasi_penjualan} tidak cukup. Tersedia ${available}, diminta ${request.quantity}.`);
        }
        tx.update(db.collection(COLLECTIONS.products).doc(productId), {
          [stockField]: available - request.quantity
        });
        for (const item of request.items) {
          items.push({
            produk_id: productId,
            nama_produk: product.nama,
            jumlah: Number(item.jumlah),
            harga_beli_saat_ini: Number(item.harga_beli_saat_ini) || Number(product.harga_beli_default) || 0,
            harga_jual_saat_ini: Number(item.harga_jual_saat_ini)
          });
        }
      }
      tx.create(transactionRef, {
        tanggal: now(),
        lokasi_penjualan: transaction.lokasi_penjualan,
        total_harga: totalHarga,
        metode_pembayaran: transaction.metode_pembayaran,
        status_pembayaran: transaction.status_pembayaran,
        nama_pelanggan: transaction.nama_pelanggan || null,
        bukti_pembayaran: transaction.bukti_pembayaran || null,
        tanggal_pelunasan: transaction.tanggal_pelunasan || null,
        items
      });
    });
    return { id, ...transaction, total_harga: totalHarga, tanggal: now() };
  },

  async updateTransactionStatus(id, status) {
    if (!['Lunas', 'Belum Lunas'].includes(status)) throw new Error('Status pembayaran transaksi tidak valid.');
    const transactionId = validateId(id, 'ID transaksi');
    await db.collection(COLLECTIONS.transactions).doc(transactionId).update({
      status_pembayaran: status,
      tanggal_pelunasan: status === 'Lunas' ? now() : null
    });
    return true;
  },

  async createPurchase(purchase) {
    if (!purchase?.nama_supplier?.trim()) throw new Error('Nama supplier wajib diisi.');
    if (!['Lunas', 'Tempo'].includes(purchase.status)) throw new Error('Status pembayaran pembelian tidak valid.');
    if (!Array.isArray(purchase.items) || purchase.items.length === 0) {
      throw new Error('Pembelian harus memiliki setidaknya satu barang.');
    }

    const id = makeId('b');
    const purchaseRef = db.collection(COLLECTIONS.purchases).doc(id);
    const productCollection = db.collection(COLLECTIONS.products);
    let createdPurchase = null;

    await db.runTransaction(async (tx) => {
      const productSnapshots = await tx.get(productCollection);
      const existingProducts = productSnapshots.docs.map(asRecord);
      const byId = new Map(existingProducts.map((product) => [String(product.id), product]));
      const byName = new Map(existingProducts.map((product) => [product.nama.trim().toLocaleLowerCase(), product]));
      const plans = new Map();
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
        if (!Number.isFinite(lineTotal) || lineTotal < 0 || Math.abs(lineTotal - price * quantity) > 0.000001) {
          throw new Error(`Total harga pembelian "${name}" tidak sesuai dengan jumlah dan harga satuan.`);
        }

        let product = item.produk_id ? byId.get(String(item.produk_id)) : null;
        product ||= byName.get(name.toLocaleLowerCase());
        if (product && product.nama.trim().toLocaleLowerCase() !== name.toLocaleLowerCase()) {
          throw new Error(`Nama barang tidak cocok dengan produk katalog "${product.nama}".`);
        }
        if (product && product.kategori.trim().toLocaleLowerCase() !== category.toLocaleLowerCase()) {
          throw new Error(`Jenis produk "${product.nama}" sudah terdaftar sebagai "${product.kategori}".`);
        }
        if (!product) {
          const newId = makeId('p');
          product = {
            id: newId,
            nama: name,
            kategori: category,
            harga_beli_default: price,
            stok_minimum: 5,
            stok_rumah: 0,
            stok_pasar: 0,
            stok_belum_dialokasikan: 0,
            created_at: now()
          };
          byId.set(newId, product);
          byName.set(name.toLocaleLowerCase(), product);
        }

        const productId = String(product.id);
        const plan = plans.get(productId) || { product, quantity: 0, totalCost: 0 };
        plan.quantity += quantity;
        plan.totalCost += lineTotal;
        plans.set(productId, plan);
        items.push({
          produk_id: productId,
          nama_produk: product.nama,
          kategori: product.kategori,
          jumlah: quantity,
          harga_beli: price,
          total_harga: lineTotal,
          lokasi_tujuan: null
        });
      }

      const totalNota = items.reduce((sum, item) => sum + item.total_harga, 0);
      const timestamp = now();
      for (const [productId, plan] of plans) {
        const productRef = productCollection.doc(productId);
        const existing = productSnapshots.docs.find((snapshot) => snapshot.id === productId);
        if (!existing) {
          plan.product.stok_belum_dialokasikan = plan.quantity;
          plan.product.harga_beli_default = plan.totalCost / plan.quantity;
          tx.create(productRef, plan.product);
        } else {
          const currentStock = (Number(plan.product.stok_rumah) || 0) +
            (Number(plan.product.stok_pasar) || 0) +
            (Number(plan.product.stok_belum_dialokasikan) || 0);
          const averageCost = currentStock + plan.quantity > 0
            ? ((currentStock * Number(plan.product.harga_beli_default || 0)) + plan.totalCost) /
              (currentStock + plan.quantity)
            : plan.totalCost / plan.quantity;
          tx.update(productRef, {
            stok_belum_dialokasikan: (Number(plan.product.stok_belum_dialokasikan) || 0) + plan.quantity,
            harga_beli_default: averageCost
          });
        }
      }

      createdPurchase = {
        id,
        tanggal: timestamp,
        nama_supplier: purchase.nama_supplier.trim(),
        status: purchase.status,
        foto_nota: purchase.foto_nota || null,
        total_nota: totalNota,
        tanggal_pelunasan: purchase.tanggal_pelunasan || null,
        items
      };
      tx.create(purchaseRef, createdPurchase);
    });

    return createdPurchase;
  },

  async updatePurchaseStatus(id, status) {
    if (!['Lunas', 'Tempo'].includes(status)) throw new Error('Status pembayaran pembelian tidak valid.');
    const purchaseId = validateId(id, 'ID pembelian');
    await db.collection(COLLECTIONS.purchases).doc(purchaseId).update({
      status,
      tanggal_pelunasan: status === 'Lunas' ? now() : null
    });
    return true;
  },

  async addExpense(expense) {
    const category = String(expense?.kategori || '').trim();
    const amount = Number(expense?.jumlah);
    if (!category) throw new Error('Kategori pengeluaran wajib diisi.');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Jumlah pengeluaran harus lebih dari Rp0.');
    const id = makeId('e');
    const data = {
      id,
      kategori: category,
      jumlah: amount,
      keterangan: String(expense.keterangan || ''),
      tanggal: now()
    };
    await db.collection(COLLECTIONS.expenses).doc(id).create(data);
    return data;
  },

  async deleteExpense(id) {
    await db.collection(COLLECTIONS.expenses).doc(validateId(id, 'ID pengeluaran')).delete();
    return true;
  },

  async replaceAllData(backup) {
    if (!backup || !['products', 'transactions', 'purchases', 'expenses']
      .every((key) => Array.isArray(backup[key]))) {
      throw new Error('Isi backup tidak lengkap atau tidak valid.');
    }
    const targets = [
      [COLLECTIONS.products, backup.products],
      [COLLECTIONS.transactions, backup.transactions],
      [COLLECTIONS.purchases, backup.purchases],
      [COLLECTIONS.expenses, backup.expenses]
    ];
    for (const [name, rows] of targets) {
      const collection = db.collection(name);
      const existing = await collection.get();
      for (let start = 0; start < existing.docs.length; start += 450) {
        const batch = db.batch();
        existing.docs.slice(start, start + 450).forEach((snapshot) => batch.delete(snapshot.ref));
        await batch.commit();
      }
      for (let start = 0; start < rows.length; start += 450) {
        const batch = db.batch();
        rows.slice(start, start + 450).forEach((row) => {
          const id = validateId(row.id || makeId(name), `ID ${name}`);
          batch.set(collection.doc(id), { ...row, id });
        });
        await batch.commit();
      }
    }
  }
};

export const registerWriteAttempt = async (ipHash, success) => {
  if (!db) throw new Error('Firebase Admin belum dikonfigurasi.');
  const ref = db.collection(COLLECTIONS.attempts).doc(ipHash);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const timestamp = Date.now();
    const previous = snapshot.exists ? snapshot.data() : {};
    const blockedUntil = Number(previous.blockedUntil) || 0;
    if (blockedUntil > timestamp) return false;

    const windowStartedAt = Number(previous.windowStartedAt) || timestamp;
    const attempts = windowStartedAt < timestamp - 15 * 60 * 1000
      ? 0
      : Number(previous.failedAttempts) || 0;

    if (success) {
      tx.set(ref, { failedAttempts: 0, windowStartedAt: timestamp, blockedUntil: 0 });
      return true;
    }

    const nextAttempts = attempts + 1;
    tx.set(ref, {
      failedAttempts: nextAttempts,
      windowStartedAt: attempts === 0 ? timestamp : windowStartedAt,
      blockedUntil: nextAttempts >= 5 ? timestamp + 15 * 60 * 1000 : 0
    });
    return nextAttempts < 5;
  });
};
