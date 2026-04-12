import type { RequestHandler } from './$types';
import { getVaultMetadata } from '../_db';

export const GET: RequestHandler = async ({ locals, cookies }) => {
  if (!locals.user?.id || !cookies.get('vault_session')) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const vaultConfig = await getVaultMetadata(locals.user.id);
  if (!vaultConfig) return new Response(JSON.stringify({ files: [] }));
  
  return new Response(JSON.stringify({
    files: vaultConfig.files.map((f: any) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      createdAt: f.createdAt,
      chunks: f.chunks?.length || 0
    }))
  }));
};
