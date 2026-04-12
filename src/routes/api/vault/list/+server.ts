import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, cookies }) => {
  if (!locals.user || !cookies.get('vault_session')) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  // TODO: Load from database per user, not global store
  const files = []; // Get user's files from DB
  
  return new Response(JSON.stringify({ files }));
};
