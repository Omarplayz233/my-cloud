import type { RequestHandler } from './$types';
import { deriveKey, randomBytes, sha256, encryptData } from '../_crypto';
import { saveVaultMetadata, getVaultMetadata } from '../_db';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  if (!locals.user?.id) return new Response('Unauthorized', { status: 401 });
  
  const { password } = await request.json();
  const userId = locals.user.id;
  
  // Get or create vault config
  let vaultConfig = await getVaultMetadata(userId);
  
  if (!vaultConfig) {
    // First time setup
    const salt = randomBytes(16);
    const key = await deriveKey(password, salt);
    const exported = await crypto.subtle.exportKey('jwk', key);
    const keyHash = await sha256(new TextEncoder().encode(JSON.stringify(exported)));
    
    vaultConfig = {
      userId,
      salt: Buffer.from(salt).toString('base64'),
      hash: keyHash,
      files: [],
      createdAt: Date.now()
    };
    
    await saveVaultMetadata(userId, vaultConfig);
    
    cookies.set('vault_session', keyHash, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 3600
    });
    
    return new Response(JSON.stringify({ ok: true, new: true }));
  }
  
  // Verify password
  const salt = Buffer.from(vaultConfig.salt, 'base64');
  const key = await deriveKey(password, new Uint8Array(salt));
  const exported = await crypto.subtle.exportKey('jwk', key);
  const keyHash = await sha256(new TextEncoder().encode(JSON.stringify(exported)));
  
  if (keyHash !== vaultConfig.hash) {
    return new Response('Wrong passphrase', { status: 401 });
  }
  
  cookies.set('vault_session', keyHash, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 3600
  });
  
  return new Response(JSON.stringify({ ok: true }));
};
