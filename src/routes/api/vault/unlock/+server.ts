import type { RequestHandler } from './$types';
import {
  deriveVaultKey,
  randomBytes,
  sha256,
  saveVaultState,
  loadVaultIndex,
  encryptJson,
  VaultIndexPlain,
  VaultRegistryPlain
} from '../_vault';

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
  const { password } = await request.json();
  const userId = locals.user?.id || 'default_user';

  if (!password || !String(password).trim()) {
    return new Response(JSON.stringify({ error: 'Password required' }), { status: 400 });
  }

  const pass = String(password).trim();
  const salt = randomBytes(16);
  const key = await deriveVaultKey(pass, salt);

  const passwordHash = await sha256(pass);

  const existing = await loadVaultIndex(key).catch(() => null);

  if (!existing) {
    const registry: VaultRegistryPlain = {
      version: 1,
      files: [],
      updatedAt: Date.now()
    };

    const index: VaultIndexPlain = {
      version: 1,
      userId,
      salt: Buffer.from(salt).toString('base64'),
      hash: passwordHash,
      registryFileId: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await saveVaultState(key, index, registry);

    cookies.set('vault_session', passwordHash, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 3600
    });

    return new Response(JSON.stringify({ ok: true, created: true }));
  }

  if (existing.hash !== passwordHash) {
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
