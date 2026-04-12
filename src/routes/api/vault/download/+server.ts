import type { RequestHandler } from './$types';
import { getVaultMetadata } from '../_db';
import { getEncryptedFile } from '../_db';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
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
  
  try {
    const fileId = url.searchParams.get('id');
    const file = vaultConfig.files.find((f: any) => f.id === fileId);
    
    if (!file) {
      return new Response('File not found', { status: 404 });
    }
    
    // Fetch and combine chunks
    const chunks: ArrayBuffer[] = [];
    for (const chunk of file.chunks) {
      const encrypted = await getEncryptedFile(chunk.file_id);
      if (encrypted) {
        chunks.push(encrypted);
      }
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
    
    return new Response(fullEncrypted, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${file.name}"`
      }
    });
  } catch (e: any) {
    console.error('Download error:', e);
    return new Response(e.message || 'Download failed', { status: 500 });
  }
};
