import type { RequestHandler } from './$types';
import { randomBytes, deriveKey, encryptData } from '../_crypto';
import { getVaultMetadata, saveVaultMetadata, saveEncryptedFile } from '../_db';

const CHUNK_SIZE = 19.5 * 1024 * 1024;

function split(buffer: ArrayBuffer) {
  const out: ArrayBuffer[] = [];
  let o = 0;
  while (o < buffer.byteLength) {
    out.push(buffer.slice(o, o + CHUNK_SIZE));
    o += CHUNK_SIZE;
  }
  return out;
}

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  if (!locals.user?.id || !cookies.get('vault_session')) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const form = await request.formData();
  const file = form.get('file') as File;
  if (!file) return new Response('No file', { status: 400 });
  
  const vaultConfig = await getVaultMetadata(locals.user.id);
  if (!vaultConfig) return new Response('Vault not setup', { status: 400 });
  
  // Derive encryption key from stored salt
  const salt = Buffer.from(vaultConfig.salt, 'base64');
  // TODO: Get password from session somehow - for now use session hash
  const sessionHash = cookies.get('vault_session')!;
  
  const raw = await file.arrayBuffer();
  const iv = randomBytes(12);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    new CryptoKey(), // You need to reconstruct the key here
    raw
  );
  
  // Upload chunks to Telegram
  const chunks = split(encrypted);
  const chunkIds: any[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const fileId = await saveEncryptedFile(locals.user.id, `${i}`, chunks[i]);
    chunkIds.push({ index: i, size: chunks[i].byteLength, file_id: fileId });
  }
  
  // Add to vault config
  const fileEntry = {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    createdAt: Date.now(),
    iv: Buffer.from(iv).toString('base64'),
    chunks: chunkIds
  };
  
  vaultConfig.files.push(fileEntry);
  await saveVaultMetadata(locals.user.id, vaultConfig);
  
  return new Response(JSON.stringify({ ok: true, id: fileEntry.id }));
};
