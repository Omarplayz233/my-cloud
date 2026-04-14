import type { RequestHandler } from './$types';
import { deriveVaultKey, loadVaultIndex, loadVaultRegistry } from '../_vault';

export const GET: RequestHandler = async ({ locals, cookies, url }) => {
  const userId = locals.user?.id || 'default_user';
  const session = cookies.get('vault_session');
  const password = url.searchParams.get('password')?.trim() || '';

  if (!session || !password) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const key = await deriveVaultKey(password, new Uint8Array(16));
  const index = await loadVaultIndex(key);

  if (!index || index.userId !== userId || index.hash !== session) {
    return new Response(JSON.stringify({ error: 'Session invalid' }), { status: 401 });
  }

  const registry = await loadVaultRegistry(key, index.registryFileId!);

  return new Response(JSON.stringify({
    files: registry.files.map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      createdAt: f.createdAt,
      chunks: f.chunks?.length || 0
    }))
  }));
};
