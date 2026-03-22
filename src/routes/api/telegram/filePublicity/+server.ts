// src/routes/api/telegram/filePublicity/+server.ts
import type { RequestHandler } from './$types';
import { getRecordByApiKey, setFilePublicity } from '$lib/telegramStorage';

export const POST: RequestHandler = async ({ request, url }) => {
  const apiKey =
    (request.headers.get('x-api-key') ?? url.searchParams.get('api_key') ?? '').trim();
  const metaFileId =
    (request.headers.get('x-meta-file-id') ?? url.searchParams.get('meta_file_id') ?? '').trim();
  const isPublic =
    (request.headers.get('x-public') ?? url.searchParams.get('public') ?? 'false') === 'true';

  if (!apiKey)
    return new Response(JSON.stringify({ error: 'Missing api key' }), {
      status: 403, headers: { 'Content-Type': 'application/json' }
    });

  const rec = await getRecordByApiKey(apiKey);
  if (!rec)
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { 'Content-Type': 'application/json' }
    });

  if (!metaFileId)
    return new Response(JSON.stringify({ error: 'Missing meta_file_id' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });

  try {
    const found = await setFilePublicity(metaFileId, isPublic);
    if (!found)
      return new Response(JSON.stringify({ error: 'File not found in registry' }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });

    return new Response(JSON.stringify({ success: true, metaFileId, public: isPublic }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('filePublicity error:', err?.message || err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};
