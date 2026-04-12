import type { RequestHandler } from './$types';
import { deriveKey, randomBytes, sha256 } from '../_crypto';
import { saveVaultMetadata, getVaultMetadata } from '../_db';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  console.log('locals:', locals);
  console.log('locals.user:', locals.user);
  
  if (!locals.user?.id) {
    console.log('No user in locals');
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }
  
  const { password } = await request.json();
  if (!password || !password.trim()) {
    return new Response('Password required', { status: 400 });
  }

  const userId = locals.user.id;
  console.log('Unlocking vault for user:', userId);
  
  let vaultConfig = await getVaultMetadata(userId);
  console.log('Existing vault config:', vaultConfig);
  
  if (!vaultConfig) {
    const salt = randomBytes(16);
    const key = await deriveKey(password.trim(), salt);
    const exported = await crypto.subtle.exportKey('raw', key);
    const keyHash = await sha256(exported);
    
    vaultConfig = {
      userId,
      salt: Buffer.from(salt).toString('base64'),
      hash: keyHash,
      files: [],
      createdAt: Date.now()
    };
    
    console.log('Creating new vault config:', vaultConfig);
    await saveVaultMetadata(userId, vaultConfig);
    
    cookies.set('vault_session', keyHash, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 3600
    });
    
    return new Response(JSON.stringify({ ok: true, new: true }));
  }
  
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
