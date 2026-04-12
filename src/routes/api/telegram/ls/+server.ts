// src/routes/api/telegram/ls/+server.ts
import type { RequestHandler } from './$types';
import { getRecordByApiKey, readRegistry } from '$lib/telegramStorage';

export const GET: RequestHandler = async ({ request, url }) => {
  const apiKey = (request.headers.get('x-api-key') ?? url.searchParams.get('api_key') ?? '').trim();
  const query  = (request.headers.get('x-query')   ?? url.searchParams.get('q')       ?? '*').trim();

  if (!apiKey) return new Response(JSON.stringify({ error: 'Missing api key' }), { status: 403 });
  const rec = await getRecordByApiKey(apiKey);
  if (!rec)   return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

  try {
    const registry = await readRegistry() as Record<string, any>;
    const all = Object.values(registry);
    let folders = all.filter((r: any) => r._type === 'folder');
    let files   = all.filter((r: any) => !r._type);

    if (query && query !== '*') {
      const q = query.toLowerCase();
      files   = files.filter((f: any)   => f.fileName?.toLowerCase().includes(q));
      folders = folders.filter((f: any) => f.name?.toLowerCase().includes(q));
    }

    return new Response(JSON.stringify({ files, folders }), {
      status: 200, headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), { status: 500 });
  }
};
