// src/routes/api/sharex/creds/+server.ts
import type { RequestHandler } from './$types';
import { decrypt } from '$lib/crypto';
import { getRecordByApiKey } from '$lib/telegramStorage';

const BASE_URL =
  import.meta.env.PUBLIC_BASE_URL ?? 'http://localhost:5173';

export const GET: RequestHandler = async ({ url }) => {
  const rawKey = (url.searchParams.get('api_key') ?? '').trim();
  if (!rawKey) {
    return new Response(JSON.stringify({ error: 'Missing api_key' }), {
      status: 403
    });
  }

  const apiKey = decrypt(rawKey) ?? rawKey;
  const rec = await getRecordByApiKey(apiKey);

  if (!rec) {
    return new Response(JSON.stringify({ error: 'Invalid api_key' }), {
      status: 403
    });
  }

  const sxcu = {
    Version: '17.0.0',
    Name: "Omar's Cloud",
    DestinationType: 'ImageUploader, TextUploader, FileUploader',
    RequestMethod: 'POST',
    RequestURL: `${BASE_URL}/api/sharex/upload`,
    Headers: {
      'X-Api-Key': rawKey
    },
    Body: 'MultipartFormData',
    FileFormName: 'file',
    URL: '{json:url}',
    ErrorMessage: '{json:error}'
  };

  return new Response(JSON.stringify(sxcu, null, 2), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="omars-cloud.sxcu"'
    }
  });
};
