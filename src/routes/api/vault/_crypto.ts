export async function deriveKey(password: string, salt: Uint8Array) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function randomBytes(len: number) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return arr;
}

export async function sha256(buffer: ArrayBuffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function encryptData(data: ArrayBuffer, key: CryptoKey) {
  const iv = randomBytes(12);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  return {
    iv: Buffer.from(iv).toString('base64'),
    data: Buffer.from(encrypted).toString('base64')
  };
}

export async function decryptData(encrypted: { iv: string; data: string }, key: CryptoKey) {
  const iv = Buffer.from(encrypted.iv, 'base64');
  const data = Buffer.from(encrypted.data, 'base64');
  
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
}
