import type { RequestHandler } from './$types';
import { randomBytes } from '../_crypto';
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

async function encrypt(buffer: ArrayBuffer, key: CryptoKey, iv: Uint8Array) {
  return crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    buffer
  );
}

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  const userId = locals.user?.id || 'default_user';
  const sessionCookie = cookies.get('vault_session');
  
  if (!sessionCookie) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const vaultConfig = await getVaultMetadata(userId);
  if (!vaultConfig) {
    return new Response('Vault not setup', { status: 400 });
  }
  
  // Verify session
  if (sessionCookie !== vaultConfig.hash) {
    return new Response('Session invalid', { status: 401 });
  }
  
  const form = await request.formData();
  const file = form.get('file') as File;
  const customName = form.get('name') as string;
  
  if (!file) {
    return new Response('No file', { status: 400 });
  }
  
  try {
    const raw = await file.arrayBuffer();
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    
    // TODO: Use stored key from session to encrypt
    // For now, create a dummy key
    const dummyKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    
    const encrypted = await encrypt(raw, dummyKey, iv);
    const chunks = split(encrypted);
    
    // Upload chunks
    const results: any[] = [];
    for (let i = 0; i < chunks.length; i += 3) {
      const batch = chunks.slice(i, i + 3);
      
      const uploaded = await Promise.all(
        batch.map((c, j) =>
          saveEncryptedFile(userId, `${Date.now()}_${i + j}`, c)
        )
      );
      
      uploaded.forEach((fileId, j) => {
        if (fileId) {
          results.push({
            index: i + j,
            size: batch[j].byteLength,
            file_id: fileId
          });
        }
      });
    }
    
    const fileEntry = {
      id: crypto.randomUUID(),
      name: customName?.trim() || file.name,
      size: file.size,
      createdAt: Date.now(),
      iv: Buffer.from(iv).toString('base64'),
      chunks: results
    };
    
    vaultConfig.files.push(fileEntry);
    await saveVaultMetadata(userId, vaultConfig);
    
    return new Response(JSON.stringify({ ok: true, id: fileEntry.id }));
  } catch (e: any) {
    console.error('Upload error:', e);
    return new Response(e.message || 'Upload failed', { status: 500 });
  }
};
