import type { RequestHandler } from './$types';
import store from '../_store';

export const GET: RequestHandler = async () => {
  if (!store.unlocked) return new Response('unauthorized', { status: 401 });

  return new Response(
    JSON.stringify({
      files: store.files.map(f => ({
        id: f.id,
        name: f.name,
        size: f.size,
        createdAt: f.createdAt,
        chunks: f.chunks.length
      }))
    })
  );
};
