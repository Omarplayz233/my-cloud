import type { RequestHandler } from './$types';
import {
  deriveVaultKey,
  decryptJson,
  randomBytes,
  sha256,
  loadVaultIndex,
  loadVaultRegistry,
  saveVaultState,
  uploadVaultFileChunks,
  VaultRegistryPlain
} from '../_vault';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  const userId = locals.user?.id || 'default_user';
  const sessionCookie = cookies.get('vault_session');

  if (!sessionCookie) {
    return new Response('Unauthorized', { status: 401 });
  }

  const form = await request.formData();
  const file = form.get('file');

  if (!(file instanceof File)) {
    return new Response('No file', { status: 400 });
  }

  const passHash = sessionCookie;
  const password = String(form.get('password') || '').trim();

  if (!password) {
    return new Response('Password missing for vault key derivation', { status: 400 });
  }

  const existingSaltGuess = randomBytes(16);
  const key = await deriveVaultKey(password, existingSaltGuess);

  const index = await loadVaultIndex(key);
  if (!index || index.userId !== userId || index.hash !== passHash) {
    return new Response('Session invalid', { status: 401 });
  }

  const registry = await loadVaultRegistry(key, index.registryFileId!);

  const raw = await file.arrayBuffer();
  const iv = randomBytes(12);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    raw
  );

  const chunks = await uploadVaultFileChunks(encrypted, crypto.randomUUID());

  const fileEntry = {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    createdAt: Date.now(),
    iv: Buffer.from(iv).toString('base64'),
    chunks
  };

  registry.files.push(fileEntry);
  registry.updatedAt = Date.now();

  await saveVaultState(key, index, registry);

  return new Response(JSON.stringify({ ok: true, id: fileEntry.id }));
};
