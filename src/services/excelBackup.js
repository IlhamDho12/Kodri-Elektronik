const ATTACHMENT_CHUNK_SIZE = 30000;
const EXCEL_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const SHEET_FIELDS = {
  Produk: [
    ['id', 'ID produk'],
    ['nama', 'Nama barang'],
    ['kategori', 'Kategori'],
    ['harga_beli_default', 'Harga beli default'],
    ['stok_minimum', 'Stok minimum'],
    ['stok_rumah', 'Stok Rumah'],
    ['stok_pasar', 'Stok Pasar'],
    ['stok_belum_dialokasikan', 'Stok belum dialokasikan'],
    ['created_at', 'Dibuat pada']
  ],
  Transaksi: [
    ['id', 'ID transaksi'],
    ['tanggal', 'Tanggal'],
    ['lokasi_penjualan', 'Lokasi penjualan'],
    ['total_harga', 'Total harga'],
    ['metode_pembayaran', 'Metode pembayaran'],
    ['status_pembayaran', 'Status pembayaran'],
    ['nama_pelanggan', 'Nama pelanggan'],
    ['tanggal_pelunasan', 'Tanggal pelunasan'],
    ['created_at', 'Dibuat pada']
  ],
  'Detail Transaksi': [
    ['transaksi_id', 'ID transaksi'],
    ['produk_id', 'ID produk'],
    ['nama_produk', 'Nama produk'],
    ['jumlah', 'Jumlah'],
    ['harga_beli_saat_ini', 'Harga beli saat transaksi'],
    ['harga_jual_saat_ini', 'Harga jual saat transaksi']
  ],
  Pembelian: [
    ['id', 'ID pembelian'],
    ['tanggal', 'Tanggal'],
    ['nama_supplier', 'Nama supplier'],
    ['total_nota', 'Total nota'],
    ['status', 'Status'],
    ['tanggal_pelunasan', 'Tanggal pelunasan'],
    ['created_at', 'Dibuat pada']
  ],
  'Detail Pembelian': [
    ['pembelian_nota_id', 'ID pembelian'],
    ['produk_id', 'ID produk'],
    ['nama_produk', 'Nama produk'],
    ['jumlah', 'Jumlah'],
    ['harga_beli', 'Harga beli'],
    ['lokasi_tujuan', 'Lokasi tujuan']
  ],
  Pengeluaran: [
    ['id', 'ID pengeluaran'],
    ['tanggal', 'Tanggal'],
    ['kategori', 'Kategori'],
    ['jumlah', 'Jumlah'],
    ['keterangan', 'Keterangan'],
    ['created_at', 'Dibuat pada']
  ],
  Lampiran: [
    ['entity', 'Jenis data'],
    ['entity_id', 'ID data'],
    ['field', 'Kolom lampiran'],
    ['part', 'Bagian'],
    ['content', 'Isi lampiran']
  ]
};
const OPTIONAL_SHEET_FIELDS = {
  Produk: new Set(['Stok belum dialokasikan']),
  Pembelian: new Set(['Tanggal pelunasan'])
};

const dateFields = new Set(['tanggal', 'tanggal_pelunasan', 'created_at']);

const toExcelValue = (value) => {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  return value;
};

const splitAttachments = (records, entity, fields) => {
  const rows = [];
  records.forEach((record) => {
    fields.forEach((field) => {
      const value = record[field];
      if (typeof value !== 'string' || value.length === 0) return;

      for (let offset = 0, part = 0; offset < value.length; offset += ATTACHMENT_CHUNK_SIZE, part += 1) {
        rows.push({
          entity,
          entity_id: record.id,
          field,
          part,
          content: value.slice(offset, offset + ATTACHMENT_CHUNK_SIZE)
        });
      }
    });
  });
  return rows;
};

const appendSheet = (workbook, name, records) => {
  const fields = SHEET_FIELDS[name];
  const worksheet = workbook.addWorksheet(name);
  worksheet.columns = fields.map(([key, label]) => ({
    header: label,
    key,
    width: Math.min(Math.max(label.length + 3, 16), 32)
  }));
  worksheet.addRows(records.map((record) => fields.map(([key]) => toExcelValue(record[key]))));
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  if (records.length > 0) {
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: records.length + 1, column: fields.length }
    };
  }
};

export const downloadExcelBackup = async ({ products, transactions, purchases, expenses }) => {
  const ExcelJSModule = await import('exceljs');
  const ExcelJS = ExcelJSModule.default || ExcelJSModule;
  const transactionRows = transactions.map((transaction) => {
    const row = { ...transaction };
    delete row.items;
    delete row.detail_transaksi;
    delete row.bukti_pembayaran;
    return row;
  });
  const transactionDetails = transactions.flatMap((transaction) => (transaction.items || []).map((item) => ({
    transaksi_id: transaction.id,
    produk_id: item.produk_id,
    nama_produk: item.nama_produk,
    jumlah: item.jumlah,
    harga_beli_saat_ini: item.harga_beli_saat_ini,
    harga_jual_saat_ini: item.harga_jual_saat_ini
  })));
  const purchaseRows = purchases.map((purchase) => {
    const row = { ...purchase };
    delete row.items;
    delete row.detail_pembelian;
    delete row.foto_nota;
    delete row.foto_nota_base64;
    return row;
  });
  const purchaseDetails = purchases.flatMap((purchase) => (purchase.items || []).map((item) => ({
    pembelian_nota_id: purchase.id,
    produk_id: item.produk_id,
    nama_produk: item.nama_produk,
    jumlah: item.jumlah,
    harga_beli: item.harga_beli,
    lokasi_tujuan: item.lokasi_tujuan
  })));
  const attachments = [
    ...splitAttachments(transactions, 'Transaksi', ['bukti_pembayaran']),
    ...splitAttachments(purchases, 'Pembelian', ['foto_nota', 'foto_nota_base64'])
  ];

  const workbook = new ExcelJS.Workbook();
  const info = workbook.addWorksheet('Info');
  info.addRows([
    ['Informasi backup', 'Nilai'],
    ['Versi format', 1],
    ['Waktu backup', new Date().toISOString()],
    ['Petunjuk', 'Jangan ubah nama sheet atau kolom. Pulihkan melalui menu backup aplikasi.']
  ]);
  info.columns = [{ width: 24 }, { width: 78 }];
  appendSheet(workbook, 'Produk', products);
  appendSheet(workbook, 'Transaksi', transactionRows);
  appendSheet(workbook, 'Detail Transaksi', transactionDetails);
  appendSheet(workbook, 'Pembelian', purchaseRows);
  appendSheet(workbook, 'Detail Pembelian', purchaseDetails);
  appendSheet(workbook, 'Pengeluaran', expenses);
  appendSheet(workbook, 'Lampiran', attachments);

  const filename = `backup_kodri_elektronik_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const contents = await workbook.xlsx.writeBuffer();
  const downloadUrl = URL.createObjectURL(new Blob([contents], { type: EXCEL_MIME_TYPE }));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.href = downloadUrl;
  downloadAnchor.download = filename;
  downloadAnchor.click();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
};

const readSheet = (workbook, name) => {
  const worksheet = workbook.getWorksheet(name);
  if (!worksheet) throw new Error(`Sheet "${name}" tidak ditemukan.`);

  const headerRow = worksheet.getRow(1);
  const headers = headerRow.values.slice(1).map((header) => String(header ?? '').trim());
  const fields = SHEET_FIELDS[name];
  const optionalHeaders = OPTIONAL_SHEET_FIELDS[name] || new Set();
  const missingHeaders = fields
    .filter(([, label]) => !optionalHeaders.has(label) && !headers.includes(label))
    .map(([, label]) => label);
  if (missingHeaders.length > 0) {
    throw new Error(`Kolom wajib pada sheet "${name}" tidak lengkap: ${missingHeaders.join(', ')}.`);
  }

  const headerIndexes = fields.map(([, label]) => headers.indexOf(label));
  const records = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values.slice(1);
    if (!values.some((value) => value !== null && value !== undefined && value !== '')) return;
    records.push(Object.fromEntries(fields.map(([key], index) => {
      const value = values[headerIndexes[index]];
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        throw new Error(`Nilai rumus atau objek tidak didukung pada sheet "${name}", baris ${rowNumber}.`);
      }
      return [key, dateFields.has(key) ? toExcelValue(value) : value];
    })));
  });
  return records;
};

const normalizeNumber = (value, label, { required = true } = {}) => {
  if ((value === null || value === undefined || value === '') && !required) return null;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} harus berupa angka.`);
  return number;
};

const normalizeDate = (value, label, { required = true } = {}) => {
  if ((value === null || value === undefined || value === '') && !required) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} bukan tanggal yang valid.`);
  return date.toISOString();
};

const requireUniqueIds = (records, sheetName) => {
  const ids = new Set();
  records.forEach((record, index) => {
    if (record.id === null || record.id === undefined || String(record.id).trim() === '') {
      throw new Error(`Baris ${index + 2} pada sheet "${sheetName}" tidak memiliki ID.`);
    }
    const id = String(record.id);
    if (ids.has(id)) throw new Error(`ID "${id}" duplikat pada sheet "${sheetName}".`);
    ids.add(id);
    record.id = id;
  });
  return ids;
};

const validateRecords = ({ products, transactions, purchases, expenses }) => {
  products.forEach((product, index) => {
    const row = index + 2;
    if (!product.nama || !product.kategori) throw new Error(`Nama dan kategori produk wajib diisi (sheet Produk, baris ${row}).`);
    ['harga_beli_default', 'stok_minimum', 'stok_rumah', 'stok_pasar'].forEach((field) => {
      product[field] = normalizeNumber(product[field], `${field} produk baris ${row}`);
    });
    product.stok_belum_dialokasikan = product.stok_belum_dialokasikan === null ||
      product.stok_belum_dialokasikan === undefined ||
      product.stok_belum_dialokasikan === ''
      ? 0
      : normalizeNumber(product.stok_belum_dialokasikan, `stok_belum_dialokasikan produk baris ${row}`);
    product.created_at = normalizeDate(product.created_at, `Tanggal produk baris ${row}`, { required: false });
  });

  transactions.forEach((transaction, index) => {
    const row = index + 2;
    if (!['Pasar', 'Rumah'].includes(transaction.lokasi_penjualan)) {
      throw new Error(`Lokasi transaksi tidak valid (sheet Transaksi, baris ${row}).`);
    }
    if (!['Tunai', 'Transfer', 'Tempo'].includes(transaction.metode_pembayaran)) {
      throw new Error(`Metode pembayaran tidak valid (sheet Transaksi, baris ${row}).`);
    }
    if (!['Lunas', 'Belum Lunas'].includes(transaction.status_pembayaran)) {
      throw new Error(`Status pembayaran tidak valid (sheet Transaksi, baris ${row}).`);
    }
    transaction.tanggal = normalizeDate(transaction.tanggal, `Tanggal transaksi baris ${row}`);
    transaction.tanggal_pelunasan = normalizeDate(transaction.tanggal_pelunasan, `Tanggal pelunasan transaksi baris ${row}`, { required: false });
    transaction.created_at = normalizeDate(transaction.created_at, `Waktu pembuatan transaksi baris ${row}`, { required: false });
    transaction.total_harga = normalizeNumber(transaction.total_harga, `Total transaksi baris ${row}`);
  });

  transactions.forEach((transaction) => transaction.items.forEach((item, index) => {
    item.jumlah = normalizeNumber(item.jumlah, `Jumlah detail transaksi ${transaction.id}, item ${index + 1}`);
    item.harga_beli_saat_ini = normalizeNumber(item.harga_beli_saat_ini, `Harga beli detail transaksi ${transaction.id}, item ${index + 1}`);
    item.harga_jual_saat_ini = normalizeNumber(item.harga_jual_saat_ini, `Harga jual detail transaksi ${transaction.id}, item ${index + 1}`);
  }));

  purchases.forEach((purchase, index) => {
    const row = index + 2;
    if (!purchase.nama_supplier || !['Lunas', 'Tempo'].includes(purchase.status)) {
      throw new Error(`Supplier dan status pembelian wajib valid (sheet Pembelian, baris ${row}).`);
    }
    purchase.tanggal = normalizeDate(purchase.tanggal, `Tanggal pembelian baris ${row}`);
    purchase.tanggal_pelunasan = normalizeDate(purchase.tanggal_pelunasan, `Tanggal pelunasan pembelian baris ${row}`, { required: false });
    purchase.created_at = normalizeDate(purchase.created_at, `Waktu pembuatan pembelian baris ${row}`, { required: false });
    purchase.total_nota = normalizeNumber(purchase.total_nota, `Total pembelian baris ${row}`);
  });

  purchases.forEach((purchase) => purchase.items.forEach((item, index) => {
    if (item.lokasi_tujuan !== null && item.lokasi_tujuan !== undefined && item.lokasi_tujuan !== '' && !['Pasar', 'Rumah'].includes(item.lokasi_tujuan)) {
      throw new Error(`Lokasi tujuan detail pembelian ${purchase.id}, item ${index + 1} tidak valid.`);
    }
    if (!item.lokasi_tujuan) item.lokasi_tujuan = null;
    item.jumlah = normalizeNumber(item.jumlah, `Jumlah detail pembelian ${purchase.id}, item ${index + 1}`);
    item.harga_beli = normalizeNumber(item.harga_beli, `Harga beli detail pembelian ${purchase.id}, item ${index + 1}`);
  }));

  expenses.forEach((expense, index) => {
    const row = index + 2;
    if (!expense.kategori) throw new Error(`Kategori pengeluaran wajib diisi (sheet Pengeluaran, baris ${row}).`);
    expense.tanggal = normalizeDate(expense.tanggal, `Tanggal pengeluaran baris ${row}`);
    expense.created_at = normalizeDate(expense.created_at, `Waktu pembuatan pengeluaran baris ${row}`, { required: false });
    expense.jumlah = normalizeNumber(expense.jumlah, `Jumlah pengeluaran baris ${row}`);
  });
};

const restoreAttachments = (attachments, transactions, purchases) => {
  const owners = {
    Transaksi: new Map(transactions.map((record) => [record.id, record])),
    Pembelian: new Map(purchases.map((record) => [record.id, record]))
  };
  const chunks = new Map();

  attachments.forEach((attachment, index) => {
    const owner = owners[attachment.entity]?.get(String(attachment.entity_id));
    const allowedField = attachment.entity === 'Transaksi'
      ? attachment.field === 'bukti_pembayaran'
      : ['foto_nota', 'foto_nota_base64'].includes(attachment.field);
    const part = Number(attachment.part);
    if (!owner || !allowedField || !Number.isInteger(part) || part < 0 || typeof attachment.content !== 'string') {
      throw new Error(`Lampiran pada baris ${index + 2} tidak valid.`);
    }

    const key = `${attachment.entity}:${attachment.entity_id}:${attachment.field}`;
    const fieldChunks = chunks.get(key) || new Map();
    if (fieldChunks.has(part)) throw new Error(`Bagian lampiran duplikat pada baris ${index + 2}.`);
    fieldChunks.set(part, attachment.content);
    chunks.set(key, fieldChunks);
  });

  chunks.forEach((parts, key) => {
    const [entity, id, field] = key.split(':');
    const owner = owners[entity].get(id);
    const orderedParts = [...parts.keys()].sort((a, b) => a - b);
    if (orderedParts.some((part, index) => part !== index)) {
      throw new Error(`Bagian lampiran untuk ID "${id}" tidak lengkap.`);
    }
    owner[field] = orderedParts.map((part) => parts.get(part)).join('');
  });
};

export const parseExcelBackup = (arrayBuffer) => {
  return loadAndParseExcelBackup(arrayBuffer);
};

const loadAndParseExcelBackup = async (arrayBuffer) => {
  const ExcelJSModule = await import('exceljs');
  const ExcelJS = ExcelJSModule.default || ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const info = workbook.getWorksheet('Info');
  if (!info) throw new Error('Sheet "Info" tidak ditemukan. Gunakan file backup Excel dari aplikasi.');
  let formatVersion = null;
  info.eachRow((row) => {
    if (row.getCell(1).value === 'Versi format') formatVersion = row.getCell(2).value;
  });
  if (Number(formatVersion) !== 1) throw new Error('Versi format file backup Excel tidak didukung.');

  const products = readSheet(workbook, 'Produk');
  const transactions = readSheet(workbook, 'Transaksi');
  const transactionDetails = readSheet(workbook, 'Detail Transaksi');
  const purchases = readSheet(workbook, 'Pembelian');
  const purchaseDetails = readSheet(workbook, 'Detail Pembelian');
  const expenses = readSheet(workbook, 'Pengeluaran');
  const attachments = readSheet(workbook, 'Lampiran');

  const productIds = requireUniqueIds(products, 'Produk');
  requireUniqueIds(transactions, 'Transaksi');
  requireUniqueIds(purchases, 'Pembelian');
  requireUniqueIds(expenses, 'Pengeluaran');

  transactions.forEach((transaction) => { transaction.items = []; });
  transactionDetails.forEach((item, index) => {
    const transaction = transactions.find((record) => record.id === String(item.transaksi_id));
    if (!transaction) throw new Error(`Detail transaksi pada baris ${index + 2} merujuk transaksi yang tidak ada.`);
    if (item.produk_id !== null && item.produk_id !== undefined) {
      item.produk_id = String(item.produk_id);
      if (!productIds.has(item.produk_id)) item.produk_id = null;
    }
    transaction.items.push(item);
  });

  purchases.forEach((purchase) => { purchase.items = []; });
  purchaseDetails.forEach((item, index) => {
    const purchase = purchases.find((record) => record.id === String(item.pembelian_nota_id));
    if (!purchase) throw new Error(`Detail pembelian pada baris ${index + 2} merujuk pembelian yang tidak ada.`);
    if (item.produk_id !== null && item.produk_id !== undefined) {
      item.produk_id = String(item.produk_id);
      if (!productIds.has(item.produk_id)) item.produk_id = null;
    }
    purchase.items.push(item);
  });

  restoreAttachments(attachments, transactions, purchases);
  validateRecords({ products, transactions, purchases, expenses });

  return { products, transactions, purchases, expenses };
};
