const TOKEN_KEY = 'kod_write_access_token';
const EXPIRY_KEY = 'kod_write_access_expires_at';

export const clearWriteAccess = () => {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(EXPIRY_KEY);
};

export const getWriteAccessToken = () => {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const expiresAt = Number(sessionStorage.getItem(EXPIRY_KEY));
  if (!token || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    clearWriteAccess();
    return null;
  }
  return token;
};

export const hasWriteAccess = () => Boolean(getWriteAccessToken());

export const saveWriteAccess = ({ token, expiresAt }) => {
  if (!token || !Number.isFinite(Number(expiresAt))) {
    throw new Error('Server tidak mengirim sesi akses edit yang valid.');
  }
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(EXPIRY_KEY, String(expiresAt));
};

export const unlockWriteAccess = async (code) => {
  const response = await fetch('/api/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'unlock', code })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Kode akses tidak dapat diverifikasi.');
  saveWriteAccess(result);
};
