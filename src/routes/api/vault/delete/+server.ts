import type { RequestHandler } from './$types';
import { getVaultMetadata, saveVaultMetadata } from '../_db';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
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
    const { id } = await request.json();
    
    vaultConfig.files = vaultConfig.files.filter((f: any) => f.id !== id);
    await saveVaultMetadata(userId, vaultConfig);
    
    return new Response(JSON.stringify({ ok: true }));
  } catch (e: any) {
    return new Response(e.message || 'Delete failed', { status: 500 });
  }
};
