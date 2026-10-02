import { dbService, isMock } from '../server/db.js';

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Metode request tidak didukung.' });
  }

  try {
    if (isMock) return json(res, 503, { error: 'Konfigurasi Firebase server belum lengkap.' });
    const data = await dbService.getAllData();
    return json(res, 200, data);
  } catch (error) {
    console.error('Gagal mengambil data dari Firestore:', error);
    return json(res, 500, { error: 'Data Firestore gagal diambil.' });
  }
}
