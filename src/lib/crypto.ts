// src/lib/crypto.ts
import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const SECRET = process.env.SESSION_SECRET!;

if (!SECRET || SECRET.length < 32) {
  console.warn('SESSION_SECRET must be at least 32 characters');
}

function getKey(): Buffer {
  // Derive a 32-byte key from the secret using SHA-256
  return crypto.createHash('sha256').update(SECRET).digest();
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext: string): string | null {
  try {
    const [ivHex, tagHex, dataHex] = ciphertext.split(':');
    if (!ivHex || !tagHex || !dataHex) return null;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(tag);
    return decipher.update(data).toString('utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}
