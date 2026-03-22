// src/routes/api/sharex/creds/+server.ts
// GET /api/sharex/creds?api_key=ENCRYPTED_KEY
// Validates the key, returns a .sxcu config file ready to import into ShareX.

import type { RequestHandler } from './$types';
import { decrypt } from '$lib/crypto';
import { getRecordByApiKey } from '$lib/telegramStorage';

const BASE_URL = process.env.PUBLIC_BASE_URL ?? 'https://cloud.omarplayz.eu.org';

export const GET: RequestHandler = async ({ url }) => {
  const rawKey = (url.searchParams.get('api_key') ?? '').trim();
  if (!rawKey)
    return new Response(JSON.stringify({ error: 'Missing api_key' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

  const apiKey = decrypt(rawKey) ?? rawKey;
  const rec = await getRecordByApiKey(apiKey);
  if (!rec)
    return new Response(JSON.stringify({ error: 'Invalid api_key' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

  const sxcu = {
    Version: '17.0.0',
    Name: "Omar's Cloud",
    DestinationType: 'ImageUploader, TextUploader, FileUploader',
    RequestMethod: 'POST',
    RequestURL: `${BASE_URL}/api/sharex/upload`,
    Headers: {
      'X-Api-Key': rawKey, // pass the encrypted key as-is
    },
    Body: 'MultipartFormData',
    FileFormName: 'file',
    URL: '{json:url}',
    ErrorMessage: '{json:error}',
  };

  return new Response(JSON.stringify(sxcu, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="omars-cloud.sxcu"',
    },
  });
};
