import { createHash, randomBytes } from 'node:crypto';

const password = process.argv.slice(2).join(' ');

if (!password) {
  console.error('Usage: npm run hash-password -- "sandi-anda"');
  process.exit(1);
}

const salt = process.env.PASSCODE_SALT || randomBytes(16).toString('hex');
const hash = createHash('sha256').update(`${salt}:${password}`).digest('hex');

console.log(`VITE_APP_PASSWORD_SALT=${salt}`);
console.log(`VITE_APP_PASSWORD_HASH=${hash}`);
