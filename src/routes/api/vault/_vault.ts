import nodeCrypto from 'crypto';
import {
  uploadJsonToTelegram,
  uploadBytesToTelegram,
  downloadFileFromTelegram
} from '$lib/telegramStorage';
import { TG_SAFE_CHUNK_BYTES } from '$lib/telegramLimits';

const TELEGRAM_CHAT_ID = process.env.TELEGRAM_BACKUP_CHAT_ID!;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;

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
  registryMessageId: number | null;
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

export type CookieLike = {
  get(name: string): string | undefined | null;
};

const CHUNK_SIZE = TG_SAFE_CHUNK_BYTES;
const subtle = globalThis.crypto.subtle;

export function randomBytes(len: number) {
  return new Uint8Array(nodeCrypto.randomBytes(len));
}

export function randomUUID() {
  return nodeCrypto.randomUUID();
}

export async function sha256(data: ArrayBuffer | Uint8Array | string) {
  const bytes =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);

  const hash = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function deriveVaultKey(password: string, salt: Uint8Array, extractable = false) {
  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt']
  );
}

export async function exportVaultKey(key: CryptoKey) {
  const raw = await subtle.exportKey('raw', key);
  return Buffer.from(raw).toString('base64');
}

export async function importVaultKey(rawKeyB64: string) {
  const raw = Buffer.from(rawKeyB64, 'base64');
  return subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptJson<T>(value: T, key: CryptoKey): Promise<VaultEnvelope> {
  const iv = randomBytes(12);
  const payload = new TextEncoder().encode(JSON.stringify(value));

  const encrypted = await subtle.encrypt(
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

  const decrypted = await subtle.decrypt(
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
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChat?chat_id=${TELEGRAM_CHAT_ID}`);
  const json = await res.json();
  return json?.result?.pinned_message ?? null;
}

async function telegramDeleteMessage(message_id: number) {
  if (!message_id || message_id <= 0) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      message_id
    })
  }).catch(() => {});
}

async function deleteManyMessages(ids: Array<number | null | undefined>) {
  const unique = [...new Set(ids.filter((id): id is number => typeof id === 'number' && id > 0))];
  for (const id of unique) {
    await telegramDeleteMessage(id);
  }
}

export async function loadVaultIndex(): Promise<VaultIndexPlain | null> {
  const pinned = await telegramGetPinnedMessage();
  if (!pinned?.document?.file_id) return null;

  try {
    const downloaded = await downloadFileFromTelegram(pinned.document.file_id);
    const text = downloaded.data.toString('utf8');
    const parsed = JSON.parse(text) as Partial<VaultIndexPlain>;

    if (
      !parsed ||
      parsed.version !== 1 ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.salt !== 'string' ||
      typeof parsed.hash !== 'string'
    ) {
      return null;
    }

    return {
      version: 1,
      userId: parsed.userId,
      salt: parsed.salt,
      hash: parsed.hash,
      registryFileId: typeof parsed.registryFileId === 'string' ? parsed.registryFileId : null,
      registryMessageId: typeof parsed.registryMessageId === 'number' ? parsed.registryMessageId : null,
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now()
    };
  } catch {
    return null;
  }
}

export async function loadVaultRegistry(key: CryptoKey, registryFileId: string): Promise<VaultRegistryPlain> {
  const downloaded = await downloadFileFromTelegram(registryFileId);
  const env = JSON.parse(downloaded.data.toString('utf8')) as VaultEnvelope;
  return decryptJson<VaultRegistryPlain>(env, key);
}

export async function saveVaultState(
  key: CryptoKey,
  index: VaultIndexPlain,
  registry: VaultRegistryPlain,
  cleanup?: {
    previousRegistryMessageId?: number | null;
  }
) {
  const previousPinned = await telegramGetPinnedMessage().catch(() => null);
  const previousIndexMessageId = previousPinned?.message_id ?? null;

  let registryUpload: { message_id: number; file_id: string } | null = null;
  let indexUpload: { message_id: number; file_id: string } | null = null;

  try {
    const encryptedRegistry = await encryptJson(registry, key);
    registryUpload = await uploadJsonToTelegram(
      encryptedRegistry,
      `vault_registry_${index.userId}.enc.json`
    );

    if (!registryUpload?.file_id) {
      throw new Error('Registry upload failed');
    }

    index.registryFileId = registryUpload.file_id;
    index.registryMessageId = registryUpload.message_id;
    index.updatedAt = Date.now();

    indexUpload = await uploadJsonToTelegram(
      index,
      `vault_index_${index.userId}.json`
    );

    if (!indexUpload?.file_id) {
      throw new Error('Index upload failed');
    }

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/pinChatMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        message_id: indexUpload.message_id,
        disable_notification: true
      })
    });

    await deleteManyMessages([
      previousIndexMessageId,
      cleanup?.previousRegistryMessageId
    ].filter((id): id is number => typeof id === 'number' && id > 0 && id !== indexUpload?.message_id));

    return {
      indexFileId: indexUpload.file_id,
      indexMessageId: indexUpload.message_id,
      registryFileId: registryUpload.file_id,
      registryMessageId: registryUpload.message_id
    };
  } catch (err) {
    await deleteManyMessages([
      indexUpload?.message_id,
      registryUpload?.message_id
    ]);

    throw err;
  }
}

export async function uploadVaultFileChunks(
  encryptedFile: ArrayBuffer,
  baseName: string
): Promise<VaultFileChunk[]> {
  const chunks = splitEncrypted(encryptedFile);
  const results: VaultFileChunk[] = [];
  const uploadedMessageIds: number[] = [];

  try {
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

      uploadedMessageIds.push(uploaded.message_id);
    }

    return results;
  } catch (err) {
    await deleteManyMessages(uploadedMessageIds);
    throw err;
  }
}

export async function decryptVaultFile(
  key: CryptoKey,
  ivB64: string,
  encrypted: ArrayBuffer
) {
  return subtle.decrypt(
    { name: 'AES-GCM', iv: Buffer.from(ivB64, 'base64') },
    key,
    encrypted
  );
}

export async function getVaultContext(userId: string | undefined, cookies: CookieLike) {
  const sessionHash = (cookies.get('vault_session') ?? '').trim();
  const rawKey = (cookies.get('vault_key') ?? '').trim();

  if (!userId || !sessionHash || !rawKey) return null;

  const index = await loadVaultIndex();
  if (!index || index.userId !== userId || index.hash !== sessionHash) return null;

  const key = await importVaultKey(rawKey).catch(() => null);
  if (!key) return null;

  if (!index.registryFileId) return null;

  return { index, key };
}
