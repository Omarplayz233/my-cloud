import type { RequestHandler } from './$types';
import { getVaultMetadata, getEncryptedFile } from '../_db';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
  if (!locals.user?.id || !cookies.get('vault_session')) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const fileId = url.searchParams.get('id');
  const vaultConfig = await getVaultMetadata(locals.user.id);
  
  const file = vaultConfig?.files.find((f: any) => f.id === fileId);
  if (!file) return new Response('Not found', { status: 404 });
  
  // Fetch and decrypt chunks
  const chunks: ArrayBuffer[] = [];
  for (const chunk of file.chunks) {
    const encrypted = await getEncryptedFile(chunk.file_id);
    chunks.push(encrypted);
  }
  
  const fullEncrypted = new Uint8Array(
    chunks.reduce((a, b) => a + b.byteLength, 0)
  );
  let offset = 0;
  for (const c of chunks) {
    fullEncrypted.set(new Uint8Array(c), offset);
    offset += c.byteLength;
  }
  
  // TODO: Decrypt using stored key
  // const decrypted = await crypto.subtle.decrypt(...);
  
  return new Response(fullEncrypted, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${file.name}"`
    }
  });
};
