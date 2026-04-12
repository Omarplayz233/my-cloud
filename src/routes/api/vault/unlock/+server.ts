import type { RequestHandler } from './$types';
import { deriveKey, randomBytes, sha256 } from '../_crypto';
import { saveVaultMetadata, getVaultMetadata } from '../_db';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  if (!locals.user?.id) return new Response('Unauthorized', { status: 401 });
  
  const { password } = await request.json();
  if (!password || !password.trim()) {
    return new Response('Password required', { status: 400 });
  }

  const userId = locals.user.id;
  
  // Get or create vault config
  let vaultConfig = await getVaultMetadata(userId);
  
  if (!vaultConfig) {
    // First time setup
    const salt = randomBytes(16);
    const key = await deriveKey(password.trim(), salt);
    
    // Store the salt and hash for verification
    const exported = await crypto.subtle.exportKey('raw', key);
    const keyHash = await sha256(exported);
    
    vaultConfig = {
      userId,
      salt: Buffer.from(salt).toString('base64'),
      hash: keyHash,
      files: [],
      createdAt: Date.now()
    };
    
    await saveVaultMetadata(userId, vaultConfig);
    
    // Set session cookie
    cookies.set('vault_session', keyHash, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 3600
    });
    
    return new Response(JSON.stringify({ ok: true, new: true }));
  }
  
  // Verify existing password
  const salt = new Uint8Array(Buffer.from(vaultConfig.salt, 'base64'));
  const key = await deriveKey(password.trim(), salt);
  const exported = await crypto.subtle.exportKey('raw', key);
  const keyHash = await sha256(exported);
  
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
