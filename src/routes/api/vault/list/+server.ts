import type { RequestHandler } from './$types';
import { getVaultMetadata } from '../_db';

export const GET: RequestHandler = async ({ locals, cookies }) => {
  const userId = locals.user?.id || 'default_user';
  const sessionCookie = cookies.get('vault_session');
  
  if (!sessionCookie) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }
  
  const vaultConfig = await getVaultMetadata(userId);
  
  if (!vaultConfig) {
    return new Response(JSON.stringify({ files: [] }));
  }
  
  // Verify session matches
  if (sessionCookie !== vaultConfig.hash) {
    return new Response(JSON.stringify({ error: 'Session invalid' }), { status: 401 });
  }
  
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
