const AUTOMATION_MARKER_KEY = 'kodri_demo_automation_last_run';
const PURCHASE_MARKER_KEY = `${AUTOMATION_MARKER_KEY}_purchase`;
const EXPENSE_MARKER_KEY = `${AUTOMATION_MARKER_KEY}_expense`;
const isAutomatedRecord = (record) =>
  record.sumber_data === 'Simulasi otomatis (DEMO)' ||
  /^(t|b|e)_(demo_)?auto_/.test(String(record.id || ''));

const removeAutomationLabel = (record) => {
  if (!isAutomatedRecord(record)) return record;
  const cleanedDescription = typeof record.keterangan === 'string'
    ? record.keterangan.replace(/\s*\(Simulasi portofolio\)$/i, '')
    : record.keterangan;
  if (!('sumber_data' in record) && cleanedDescription === record.keterangan) return record;

  const cleaned = { ...record };
  delete cleaned.sumber_data;
  cleaned.keterangan = cleanedDescription;
  return cleaned;
};

const cleanAutomationLabels = (records) => {
  let changed = false;
  const cleaned = records.map((record) => {
    const next = removeAutomationLabel(record);
    if (next !== record) changed = true;
    return next;
  });
  return { records: cleaned, changed };
};
const MARKET_ROUTE_BY_DAY = {
  0: 'Talang Padang',
  1: 'Karang Dapo',
  2: 'Tebat Liot',
  3: 'Padang Tepong',
  6: 'Martapuro'
};

const localDateKey = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0')
].join('-');

const isEidClosure = (date) => {
  const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
    day: 'numeric',
    month: 'long'
  }).formatToParts(date);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  const month = parts.find((part) => part.type === 'month')?.value;
  return month?.toLowerCase() === 'shawwal' && day >= 1 && day <= 4;
};

const hashValue = (value) => {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const readLocalArray = (key) => {
  const raw = localStorage.getItem(key);
  if (raw === null) return [];
  const value = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error(`Data lokal "${key}" bukan daftar yang valid.`);
  return value;
};

const median = (values) => {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]);
};

const getTransactionsPerDay = (transactions, location, weekday, beforeDate, dateKey) => {
  const counts = new Map();
  transactions.forEach((transaction) => {
    if (transaction.lokasi_penjualan !== location || isAutomatedRecord(transaction)) return;
    const transactionDate = new Date(transaction.tanggal);
    if (Number.isNaN(transactionDate.getTime()) || transactionDate >= beforeDate || transactionDate.getDay() !== weekday) return;
    const key = localDateKey(transactionDate);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const recentCounts = [...counts.entries()]
    .sort(([first], [second]) => second.localeCompare(first))
    .slice(0, 8)
    .map(([, count]) => count);
  const typicalCount = median(recentCounts);
  if (location !== 'Pasar') return Math.max(1, Math.min(3, typicalCount));

  const marketBaseline = Math.max(7, typicalCount);
  const variation = (hashValue(`${dateKey}:market-volume`) % 3) - 1;
  return Math.max(6, Math.min(18, marketBaseline + variation));
};

const isOnDate = (value, date) => {
  const parsedDate = new Date(value);
  return !Number.isNaN(parsedDate.getTime()) && localDateKey(parsedDate) === localDateKey(date);
};

const getRecentTemplates = (records, date, weekday, dateField = 'tanggal') => {
  const validRecords = records
    .filter((record) => {
      const recordDate = new Date(record[dateField]);
      return !isAutomatedRecord(record) &&
        !Number.isNaN(recordDate.getTime()) &&
        recordDate < new Date(date.getFullYear(), date.getMonth(), date.getDate());
    })
    .sort((first, second) => new Date(second[dateField]) - new Date(first[dateField]));
  const sameWeekday = validRecords.filter((record) => new Date(record[dateField]).getDay() === weekday);
  return (sameWeekday.length > 0 ? sameWeekday : validRecords).slice(0, 20);
};

const generatePurchase = ({ purchases, productsById, date, dateKey, weekday }) => {
  if (![4, 5].includes(weekday)) return null;
  if (purchases.some((purchase) => isOnDate(purchase.tanggal, date))) return null;

  const templates = getRecentTemplates(purchases, date, weekday);
  const template = templates[hashValue(`${dateKey}:purchase:template`) % templates.length];
  if (!template?.items?.length) return null;

  const candidates = template.items
    .map((item) => ({ item, product: productsById.get(String(item.produk_id)) }))
    .filter(({ item, product }) => product &&
      Number(item.harga_beli) > 0 &&
      String(item.nama_produk || '').trim().toLocaleLowerCase() === String(product.nama).trim().toLocaleLowerCase())
    .slice(0, 8);
  if (candidates.length === 0) return null;

  const seed = hashValue(`${dateKey}:purchase:items`);
  const selected = candidates.slice(0, Math.min(candidates.length, 3 + (seed % 3)));
  const items = selected.map(({ item, product }, index) => {
    const variation = 0.9 + ((seed >>> (index + 8)) % 21) / 100;
    const quantity = Math.max(1, Math.round(Number(item.jumlah) * variation));
    const price = Math.max(1, Math.round(Number(item.harga_beli) / 100) * 100);
    return {
      produk_id: product.id,
      nama_produk: product.nama,
      kategori: product.kategori,
      jumlah: quantity,
      harga_beli: price,
      total_harga: quantity * price,
      lokasi_tujuan: null
    };
  });
  const total = items.reduce((sum, item) => sum + item.total_harga, 0);
  if (total < 1000000 || total >= 15000000) return null;

  const hour = 9 + (seed % 7);
  const minute = (seed >>> 16) % 60;
  const purchaseDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute);
  const purchaseId = `b_auto_${dateKey.replace(/-/g, '')}`;
  if (purchases.some((purchase) => purchase.id === purchaseId)) return null;

  const totalsByProduct = new Map();
  items.forEach((item) => {
    const current = totalsByProduct.get(String(item.produk_id)) || { quantity: 0, total: 0 };
    current.quantity += item.jumlah;
    current.total += item.total_harga;
    totalsByProduct.set(String(item.produk_id), current);
  });
  totalsByProduct.forEach((incoming, productId) => {
    const product = productsById.get(productId);
    const currentStock = Number(product.stok_rumah || 0) +
      Number(product.stok_pasar || 0) +
      Number(product.stok_belum_dialokasikan || 0);
    const previousValue = currentStock * Number(product.harga_beli_default || 0);
    const newQuantity = currentStock + incoming.quantity;
    product.harga_beli_default = newQuantity > 0
      ? (previousValue + incoming.total) / newQuantity
      : incoming.total / incoming.quantity;
    product.stok_belum_dialokasikan = (Number(product.stok_belum_dialokasikan) || 0) + incoming.quantity;
  });

  return {
    id: purchaseId,
    tanggal: purchaseDate.toISOString(),
    nama_supplier: template.nama_supplier,
    total_nota: total,
    status: template.status === 'Tempo' ? 'Tempo' : 'Lunas',
    tanggal_pelunasan: template.status === 'Lunas' ? purchaseDate.toISOString() : null,
    foto_nota: null,
    items
  };
};

const generateExpense = ({ expenses, date, dateKey, weekday }) => {
  if (expenses.some((expense) => isOnDate(expense.tanggal, date))) return null;
  const templates = getRecentTemplates(expenses, date, weekday);
  const template = templates[hashValue(`${dateKey}:expense:template`) % templates.length];
  const baseAmount = Number(template?.jumlah);
  if (!template || !Number.isFinite(baseAmount) || baseAmount <= 0) return null;

  const seed = hashValue(`${dateKey}:expense:amount`);
  const variation = 0.92 + (seed % 17) / 100;
  const amount = Math.max(1000, Math.round((baseAmount * variation) / 1000) * 1000);
  const hour = 16 + (seed % 5);
  const minute = (seed >>> 16) % 60;
  const expenseDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute);
  return {
    id: `e_auto_${dateKey.replace(/-/g, '')}`,
    tanggal: expenseDate.toISOString(),
    kategori: template.kategori,
    jumlah: amount,
    keterangan: template.keterangan || template.kategori
  };
};

const buildTransaction = ({
  template,
  productsById,
  date,
  dateKey,
  location,
  routeName,
  sequence,
  transactionCount,
  transactions
}) => {
  const seed = hashValue(`${dateKey}:${location}:${sequence}`);
  const id = `t_auto_${dateKey.replace(/-/g, '')}_${location.toLowerCase()}_${sequence + 1}`;
  if (transactions.some((transaction) => transaction.id === id)) return null;
  const itemCandidates = [...(template.items || [])]
    .sort((first, second) => String(first.produk_id).localeCompare(String(second.produk_id)));
  if (itemCandidates.length === 0) return null;

  const startIndex = seed % itemCandidates.length;
  const orderedCandidates = itemCandidates.slice(startIndex).concat(itemCandidates.slice(0, startIndex));
  const desiredItemCount = Math.min(orderedCandidates.length, 1 + ((seed >>> 8) % 3));
  const items = [];
  const stockDeductions = [];
  const usedProductIds = new Set();
  for (const candidate of orderedCandidates) {
    if (items.length >= desiredItemCount) break;
    const product = productsById.get(String(candidate.produk_id));
    if (!product || usedProductIds.has(String(product.id))) continue;
    const stockKey = location === 'Pasar' ? 'stok_pasar' : 'stok_rumah';
    const stock = Number(product[stockKey]) || 0;
    if (stock <= 0) continue;

    const quantity = stock > 1 && ((seed + items.length) % 4 === 0) ? 2 : 1;
    const actualQuantity = Math.min(quantity, stock);
    const basePrice = Number(candidate.harga_jual_saat_ini);
    if (!Number.isInteger(basePrice) || basePrice <= 0) continue;
    const priceVariation = 0.95 + ((seed >>> (items.length + 12)) % 11) / 100;
    const salePrice = Math.max(500, Math.round((basePrice * priceVariation) / 500) * 500);

    items.push({
      produk_id: product.id,
      nama_produk: product.nama,
      jumlah: actualQuantity,
      harga_beli_saat_ini: Number(product.harga_beli_default) || Number(candidate.harga_beli_saat_ini) || 0,
      harga_jual_saat_ini: salePrice
    });
    stockDeductions.push({ product, stockKey, quantity: actualQuantity });
    usedProductIds.add(String(product.id));
  }
  if (items.length === 0) return null;

  stockDeductions.forEach(({ product, stockKey, quantity }) => {
    product[stockKey] -= quantity;
  });
  let transactionDate;
  if (location === 'Pasar') {
    const marketOpens = 4 * 60 + 30;
    const marketCloses = 14 * 60 + 45;
    const openingJitter = seed % 21;
    const closingJitter = (seed >>> 16) % 21;
    const firstMinute = marketOpens + openingJitter;
    const lastMinute = marketCloses - closingJitter;
    const interval = (lastMinute - firstMinute) / Math.max(transactionCount - 1, 1);
    const nominalMinute = firstMinute + interval * sequence;
    const jitterRange = Math.min(18, interval * 0.2);
    const jitter = transactionCount > 2 && sequence > 0 && sequence < transactionCount - 1
      ? ((hashValue(`${dateKey}:market-time:${sequence}`) % 1001) / 500 - 1) * jitterRange
      : 0;
    const totalMinutes = Math.round(nominalMinute + jitter);
    transactionDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(),
      Math.floor(totalMinutes / 60), totalMinutes % 60);
  } else {
    const hour = 8 + (seed % 13);
    const minute = (seed >>> 16) % 60;
    transactionDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute);
  }
  const sourceName = String(template.nama_pelanggan || '').trim();
  const customerName = location === 'Pasar'
    ? (/^umum\b/i.test(sourceName) ? `Umum - Kalangan ${routeName}` : sourceName || 'Umum')
    : (/^umum\b/i.test(sourceName) ? 'Umum' : sourceName || 'Umum');

  const paymentMethod = template.metode_pembayaran === 'Transfer' ? 'Transfer' : 'Tunai';
  return {
    id,
    tanggal: transactionDate.toISOString(),
    lokasi_penjualan: location,
    total_harga: items.reduce((total, item) => total + item.jumlah * item.harga_jual_saat_ini, 0),
    metode_pembayaran: paymentMethod,
    status_pembayaran: 'Lunas',
    nama_pelanggan: customerName,
    tanggal_pelunasan: null,
    bukti_pembayaran: null,
    items
  };
};

export const runDailyDemoAutomation = (now = new Date()) => {
  const dateKey = localDateKey(now);
  const originalTransactions = readLocalArray('toko_transaksi');
  const transactionCleanup = cleanAutomationLabels(originalTransactions);
  const transactions = transactionCleanup.records;
  const products = readLocalArray('toko_produk');
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekday = now.getDay();
  const marketRoute = MARKET_ROUTE_BY_DAY[weekday];
  const generateMarketSales = Boolean(marketRoute) && !isEidClosure(now);
  const locations = generateMarketSales ? ['Pasar', 'Rumah'] : ['Rumah'];
  const productsById = new Map(products.map((product) => [String(product.id), { ...product }]));
  const createdTransactions = [];
  const skippedLocations = [];

  const salesAlreadyProcessed = localStorage.getItem(AUTOMATION_MARKER_KEY) === dateKey;
  const hasTransactionToday = transactions.some((transaction) => isOnDate(transaction.tanggal, now));
  if (!salesAlreadyProcessed && transactions.length > 0 && products.length > 0 && !hasTransactionToday) {
    locations.forEach((location) => {
      const history = transactions
        .filter((transaction) => {
          if (transaction.lokasi_penjualan !== location || !Array.isArray(transaction.items)) return false;
          const transactionDate = new Date(transaction.tanggal);
          return !Number.isNaN(transactionDate.getTime()) && transactionDate < dayStart;
        })
        .sort((first, second) => new Date(second.tanggal) - new Date(first.tanggal));
      const sameWeekdayHistory = history.filter((transaction) => new Date(transaction.tanggal).getDay() === weekday);
      const templates = sameWeekdayHistory.length > 0 ? sameWeekdayHistory : history;
      if (templates.length === 0) {
        skippedLocations.push(location);
        return;
      }

      const transactionCount = getTransactionsPerDay(transactions, location, weekday, dayStart, dateKey);
      const countSeed = hashValue(`${dateKey}:${location}:count`);
      for (let sequence = 0; sequence < transactionCount; sequence += 1) {
        const template = templates[(countSeed + sequence) % templates.length];
        const generated = buildTransaction({
          template,
          productsById,
          date: now,
          dateKey,
          location,
          routeName: marketRoute,
          sequence,
          transactionCount,
          transactions: [...transactions, ...createdTransactions]
        });
        if (generated) createdTransactions.push(generated);
        else skippedLocations.push(location);
      }
    });
  }

  const originalPurchases = readLocalArray('toko_pembelian');
  const purchaseCleanup = cleanAutomationLabels(originalPurchases);
  const purchases = purchaseCleanup.records;
  const originalExpenses = readLocalArray('toko_pengeluaran');
  const expenseCleanup = cleanAutomationLabels(originalExpenses);
  const expenses = expenseCleanup.records;
  const purchaseAlreadyProcessed = localStorage.getItem(PURCHASE_MARKER_KEY) === dateKey;
  const hasPurchaseToday = purchases.some((purchase) => isOnDate(purchase.tanggal, now));
  const newPurchase = purchaseAlreadyProcessed || hasPurchaseToday
    ? null
    : generatePurchase({ purchases, productsById, date: now, dateKey, weekday });
  const expenseAlreadyProcessed = localStorage.getItem(EXPENSE_MARKER_KEY) === dateKey;
  const hasExpenseToday = expenses.some((expense) => isOnDate(expense.tanggal, now));
  const newExpense = expenseAlreadyProcessed || hasExpenseToday
    ? null
    : generateExpense({ expenses, date: now, dateKey, weekday });
  const updatedTransactions = [...createdTransactions, ...transactions];
  const updatedPurchases = newPurchase ? [newPurchase, ...purchases] : purchases;
  const updatedExpenses = newExpense ? [newExpense, ...expenses] : expenses;
  const updatedProducts = products.map((product) => productsById.get(String(product.id)) || product);
  localStorage.setItem('toko_produk', JSON.stringify(updatedProducts));
  if (transactionCleanup.changed || createdTransactions.length > 0) localStorage.setItem('toko_transaksi', JSON.stringify(updatedTransactions));
  if (purchaseCleanup.changed || newPurchase) localStorage.setItem('toko_pembelian', JSON.stringify(updatedPurchases));
  if (expenseCleanup.changed || newExpense) localStorage.setItem('toko_pengeluaran', JSON.stringify(updatedExpenses));
  if (salesAlreadyProcessed || hasTransactionToday || createdTransactions.length > 0) {
    localStorage.setItem(AUTOMATION_MARKER_KEY, dateKey);
  }
  if (purchaseAlreadyProcessed || hasPurchaseToday || newPurchase || ![4, 5].includes(weekday)) {
    localStorage.setItem(PURCHASE_MARKER_KEY, dateKey);
  }
  if (expenseAlreadyProcessed || hasExpenseToday || newExpense) {
    localStorage.setItem(EXPENSE_MARKER_KEY, dateKey);
  }

  return {
    dateKey,
    createdCount: createdTransactions.length,
    purchaseCreated: Boolean(newPurchase),
    expenseCreated: Boolean(newExpense),
    skipped: createdTransactions.length === 0 && !newPurchase && !newExpense ? 'no-stock-or-matching-history' : null,
    skippedLocations: [...new Set(skippedLocations)],
    skippedPurchase: !newPurchase && [4, 5].includes(weekday) && !hasPurchaseToday,
    skippedExpense: !newExpense && !hasExpenseToday
  };
};
