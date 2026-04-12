import type { RequestHandler } from './$types';
import { deriveKey, randomBytes, sha256 } from '../_crypto';
import { saveVaultMetadata, getVaultMetadata } from '../_db';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  const { password } = await request.json();
  if (!password || !password.trim()) {
    return new Response(JSON.stringify({ error: 'Password required' }), { status: 400 });
  }

  const userId = locals.user?.id || 'default_user';
  let vaultConfig = await getVaultMetadata(userId);
  
  if (!vaultConfig) {
    // Vault doesn't exist - CREATE IT with this password
    const salt = randomBytes(16);
    const key = await deriveKey(password.trim(), salt);
    
    // Hash the password directly to store as verification
    const passwordHash = await sha256(new TextEncoder().encode(password.trim()));
    
    vaultConfig = {
      userId,
      salt: Buffer.from(salt).toString('base64'),
      hash: passwordHash,
      files: [],
      createdAt: Date.now()
    };
    
    await saveVaultMetadata(userId, vaultConfig);
    
    cookies.set('vault_session', passwordHash, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 3600
    });
    
    return new Response(JSON.stringify({ ok: true, created: true }));
  }
  
  // Vault EXISTS - VERIFY the password
  const passwordHash = await sha256(new TextEncoder().encode(password.trim()));
  
  if (passwordHash !== vaultConfig.hash) {
    return new Response(JSON.stringify({ error: 'Wrong passphrase' }), { status: 401 });
  }
  
  cookies.set('vault_session', passwordHash, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 3600
  });
  
  return new Response(JSON.stringify({ ok: true, created: false }));
};
