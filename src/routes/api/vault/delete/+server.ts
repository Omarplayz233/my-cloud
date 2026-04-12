import type { RequestHandler } from './$types';
import store from '../_store';

export const POST: RequestHandler = async ({ request }) => {
  if (!store.unlocked) return new Response('unauthorized', { status: 401 });

  const { id } = await request.json();

  store.files = store.files.filter(f => f.id !== id);

  return new Response('ok');
};
