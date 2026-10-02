import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isMock, dbService, db, registerWriteAttempt } from '../server/db.js';

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const PIN_ACTIONS = new Set([
  'replaceAllData',
  'addProduct',
  'updateProduct',
  'deleteProduct',
  'createTransaction',
  'updateTransactionStatus',
  'createPurchase',
  'updatePurchaseStatus',
  'addExpense',
  'deleteExpense'
]);

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const getSigningSecret = () => {
  const secret = process.env.WRITE_ACCESS_TOKEN_SECRET || '';
  if (secret.length < 32) throw new Error('WRITE_ACCESS_TOKEN_SECRET harus berisi minimal 32 karakter.');
  return secret;
};

const createToken = (secret) => {
  const payload = Buffer.from(JSON.stringify({
    scope: 'write',
    exp: Date.now() + TOKEN_TTL_MS,
    nonce: randomBytes(16).toString('hex')
  })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
};

const isValidToken = (token, secret) => {
  if (typeof token !== 'string') return false;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return false;
  const expected = createHmac('sha256', secret).update(payload).digest();
  let received;
  try {
    received = Buffer.from(signature, 'base64url');
  } catch {
    return false;
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return decoded.scope === 'write' && Number(decoded.exp) > Date.now();
  } catch {
    return false;
  }
};

const isCorrectCode = (provided, expected) => {
  if (typeof provided !== 'string' || !expected) return false;
  const actualBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
};

const getClientIpHash = (req, secret) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : req.socket?.remoteAddress || 'unknown';
  return createHmac('sha256', secret).update(ip).digest('hex');
};

const dispatchWrite = async (action, payload) => {
  switch (action) {
    case 'replaceAllData':
      if (!payload?.backup || !['products', 'transactions', 'purchases', 'expenses'].every((key) => Array.isArray(payload.backup[key]))) {
        throw new Error('Isi backup tidak lengkap atau tidak valid.');
      }
      return dbService.replaceAllData(payload.backup);
    case 'addProduct':
      return dbService.addProduct(payload?.product);
    case 'updateProduct':
      return dbService.updateProduct(payload?.id, payload?.product);
    case 'deleteProduct':
      return dbService.deleteProduct(payload?.id);
    case 'createTransaction':
      return dbService.createTransaction(payload?.transaction);
    case 'updateTransactionStatus':
      return dbService.updateTransactionStatus(payload?.id, payload?.status);
    case 'createPurchase':
      return dbService.createPurchase(payload?.purchase);
    case 'updatePurchaseStatus':
      return dbService.updatePurchaseStatus(payload?.id, payload?.status);
    case 'addExpense':
      return dbService.addExpense(payload?.expense);
    case 'deleteExpense':
      return dbService.deleteExpense(payload?.id);
    default:
      throw new Error('Operasi perubahan data tidak dikenali.');
  }
};

const readRequestBody = async (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Metode request tidak didukung.' });
  }

  const host = req.headers.host;
  const origin = req.headers.origin;
  if (origin && host && new URL(origin).host !== host) {
    return json(res, 403, { error: 'Request lintas situs tidak diizinkan.' });
  }

  try {
    if (isMock || !db) {
      return json(res, 503, { error: 'Konfigurasi Firebase server belum lengkap.' });
    }
    const expectedCode = process.env.WRITE_ACCESS_CODE || '';
    const signingSecret = getSigningSecret();
    if (!expectedCode) return json(res, 503, { error: 'Kode akses server belum dikonfigurasi.' });

    const body = await readRequestBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json(res, 400, { error: 'Body request harus berupa objek JSON.' });
    }

    if (body.action === 'unlock') {
      const allowed = await registerWriteAttempt(
        getClientIpHash(req, signingSecret),
        isCorrectCode(body.code, expectedCode)
      );
      if (allowed !== true) return json(res, 429, { error: 'Terlalu banyak percobaan. Coba kembali setelah 15 menit.' });
      if (!isCorrectCode(body.code, expectedCode)) return json(res, 401, { error: 'Kode akses salah. Silakan coba lagi.' });

      const expiresAt = Date.now() + TOKEN_TTL_MS;
      return json(res, 200, { token: createToken(signingSecret), expiresAt });
    }

    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!isValidToken(token, signingSecret)) {
      return json(res, 401, { error: 'Akses edit kedaluwarsa. Masukkan kembali kode akses.' });
    }
    if (!PIN_ACTIONS.has(body.action)) return json(res, 400, { error: 'Operasi perubahan data tidak dikenali.' });

    const data = await dispatchWrite(body.action, body.payload);
    return json(res, 200, { data });
  } catch (error) {
    console.error('Gagal menjalankan API perubahan data:', error);
    return json(res, 500, { error: error instanceof Error ? error.message : 'Terjadi kesalahan pada server.' });
  }
}
