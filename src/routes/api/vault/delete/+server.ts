import type { RequestHandler } from './$types';
import { getVaultMetadata, saveVaultMetadata } from '../_db';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  if (!locals.user?.id || !cookies.get('vault_session')) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const { id } = await request.json();
  const vaultConfig = await getVaultMetadata(locals.user.id);
  
  vaultConfig.files = vaultConfig.files.filter((f: any) => f.id !== id);
  await saveVaultMetadata(locals.user.id, vaultConfig);
  
  return new Response('ok');
};
