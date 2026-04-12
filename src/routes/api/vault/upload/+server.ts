import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  if (!locals.user || !cookies.get('vault_session')) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const form = await request.formData();
  const file = form.get('file') as File;
  
  if (!file) return new Response('No file', { status: 400 });
  
  // TODO: Save encrypted file to database per user
  const id = crypto.randomUUID();
  
  return new Response(JSON.stringify({ ok: true, id }));
};
