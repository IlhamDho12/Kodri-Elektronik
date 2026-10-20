import { dbService, isMock } from '../server/db.js';

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

const cleanLegacyAutomationLabels = (records) => records.map((record) => {
  const automated = record.sumber_data === 'Simulasi otomatis (DEMO)' ||
    /^(t|b|e)_demo_auto_/.test(String(record.id || ''));
  if (!automated) return record;

  const cleaned = { ...record };
  delete cleaned.sumber_data;
  if (typeof cleaned.keterangan === 'string') {
    cleaned.keterangan = cleaned.keterangan.replace(/\s*\(Simulasi portofolio\)$/i, '');
  }
  return cleaned;
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Metode request tidak didukung.' });
  }

  try {
    if (isMock) return json(res, 503, { error: 'Konfigurasi Firebase server belum lengkap.' });
    const data = await dbService.getAllData();
    data.transactions = cleanLegacyAutomationLabels(data.transactions);
    data.purchases = cleanLegacyAutomationLabels(data.purchases);
    data.expenses = cleanLegacyAutomationLabels(data.expenses);
    return json(res, 200, data);
  } catch (error) {
    console.error('Gagal mengambil data dari Firestore:', error);
    return json(res, 500, { error: 'Data Firestore gagal diambil.' });
  }
}
