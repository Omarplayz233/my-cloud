// src/lib/browserToken.ts
import crypto from 'crypto';

const SECRET = () => process.env.BROWSER_SESSION_SECRET!;

const usedTokens = new Map<string, number>();

export function issueToken(ttlMs = 30_000): string {
  const exp     = Date.now() + ttlMs;
  const rand    = crypto.randomBytes(16).toString('hex');
  const payload = `${exp}:${rand}`;
  const sig     = crypto.createHmac('sha256', SECRET()).update(payload).digest('hex');
  return `${payload}:${sig}`;
}

export function validateToken(token: string, consume = true): boolean {
  const parts = token.split(':');
  if (parts.length !== 3) return false;
  const [expStr, rand, sig] = parts;
  const exp = parseInt(expStr);
  if (isNaN(exp) || Date.now() > exp) return false;
  const payload  = `${expStr}:${rand}`;
  const expected = crypto.createHmac('sha256', SECRET()).update(payload).digest('hex');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return false;
  } catch { return false; }
  if (consume) {
    if (usedTokens.has(token)) return false;
    usedTokens.set(token, exp);
  }
  const now = Date.now();
  for (const [t, e] of usedTokens) if (now > e) usedTokens.delete(t);
  return true;
}
