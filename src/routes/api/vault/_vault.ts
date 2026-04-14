import crypto from 'crypto';
import {
  uploadJsonToTelegram,
  uploadBytesToTelegram,
  downloadFileFromTelegram
} from '$lib/telegramStorage';

const TELEGRAM_CHAT_ID = process.env.TELEGRAM_BACKUP_CHAT_ID!;

export type VaultFileChunk = {
  index: number;
  file_id: string;
  message_id: number;
  size: number;
};

export type VaultFileEntry = {
  id: string;
  name: string;
  size: number;
  createdAt: number;
  iv: string;
  chunks: VaultFileChunk[];
};

export type VaultIndexPlain = {
  version: 1;
  userId: string;
  salt: string;
  hash: string;
  registryFileId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type VaultRegistryPlain = {
  version: 1;
  files: VaultFileEntry[];
  updatedAt: number;
};

export type VaultEnvelope = {
  v: 1;
  alg: 'AES-GCM';
  iv: string;
  data: string;
};

const CHUNK_SIZE = 19.5 * 1024 * 1024;

export function randomBytes(len: number) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return arr;
}

export async function sha256(data: ArrayBuffer | Uint8Array | string) {
  const bytes =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);

  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function deriveVaultKey(password: string, salt: Uint8Array) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 600000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptJson<T>(value: T, key: CryptoKey): Promise<VaultEnvelope> {
  const iv = randomBytes(12);
  const payload = new TextEncoder().encode(JSON.stringify(value));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    payload
  );

  return {
    v: 1,
    alg: 'AES-GCM',
    iv: Buffer.from(iv).toString('base64'),
    data: Buffer.from(encrypted).toString('base64')
  };
}

export async function decryptJson<T>(envelope: VaultEnvelope, key: CryptoKey): Promise<T> {
  if (!envelope || envelope.v !== 1 || envelope.alg !== 'AES-GCM') {
    throw new Error('Invalid vault envelope');
  }

  const iv = Buffer.from(envelope.iv, 'base64');
  const data = Buffer.from(envelope.data, 'base64');

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return JSON.parse(new TextDecoder().decode(decrypted)) as T;
}

function splitEncrypted(buffer: ArrayBuffer) {
  const out: ArrayBuffer[] = [];
  let offset = 0;

  while (offset < buffer.byteLength) {
    out.push(buffer.slice(offset, offset + CHUNK_SIZE));
    offset += CHUNK_SIZE;
  }

  return out;
}

async function telegramGetPinnedMessage() {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChat?chat_id=${TELEGRAM_CHAT_ID}`);
  const json = await res.json();
  return json?.result?.pinned_message ?? null;
}

export async function loadVaultIndex(key: CryptoKey): Promise<VaultIndexPlain | null> {
  const pinned = await telegramGetPinnedMessage();
  if (!pinned?.document?.file_id) return null;

  const downloaded = await downloadFileFromTelegram(pinned.document.file_id);
  const env = JSON.parse(downloaded.data.toString('utf8')) as VaultEnvelope;
  return decryptJson<VaultIndexPlain>(env, key);
}

export async function loadVaultRegistry(key: CryptoKey, registryFileId: string): Promise<VaultRegistryPlain> {
  const downloaded = await downloadFileFromTelegram(registryFileId);
  const env = JSON.parse(downloaded.data.toString('utf8')) as VaultEnvelope;
  return decryptJson<VaultRegistryPlain>(env, key);
}

export async function saveVaultState(
  key: CryptoKey,
  index: VaultIndexPlain,
  registry: VaultRegistryPlain
) {
  const encryptedRegistry = await encryptJson(registry, key);
  const registryUpload = await uploadJsonToTelegram(
    encryptedRegistry,
    `vault_registry_${index.userId}.enc.json`
  );

  if (!registryUpload?.file_id) {
    throw new Error('Registry upload failed');
  }

  index.registryFileId = registryUpload.file_id;
  index.updatedAt = Date.now();

  const encryptedIndex = await encryptJson(index, key);
  const indexUpload = await uploadJsonToTelegram(
    encryptedIndex,
    `vault_index_${index.userId}.enc.json`
  );

  if (!indexUpload?.file_id) {
    throw new Error('Index upload failed');
  }

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/pinChatMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      message_id: indexUpload.message_id,
      disable_notification: true
    })
  });

  return {
    indexFileId: indexUpload.file_id,
    registryFileId: registryUpload.file_id
  };
}

export async function uploadVaultFileChunks(
  encryptedFile: ArrayBuffer,
  baseName: string
): Promise<VaultFileChunk[]> {
  const chunks = splitEncrypted(encryptedFile);
  const results: VaultFileChunk[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const part = chunks[i];
    const uploaded = await uploadBytesToTelegram(
      Buffer.from(part),
      `${baseName}.chunk${i}.bin`
    );

    if (!uploaded?.file_id) {
      throw new Error(`Chunk upload failed at ${i}`);
    }

    results.push({
      index: i,
      file_id: uploaded.file_id,
      message_id: uploaded.message_id,
      size: part.byteLength
    });
  }

  return results;
}

export async function decryptVaultFile(
  key: CryptoKey,
  ivB64: string,
  encrypted: ArrayBuffer
) {
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: Buffer.from(ivB64, 'base64') },
    key,
    encrypted
  );
}
