// src/routes/api/telegram/tokenTester/+server.ts
import type { RequestHandler } from './$types';
import { getRecordByApiKey } from '$lib/telegramStorage';

export const GET: RequestHandler = async ({ request, url }) => {
  const apiKey =
    (request.headers.get('x-api-key') ?? url.searchParams.get('api_key') ?? '').trim();

  if (!apiKey)
    return new Response(JSON.stringify({ valid: false, error: 'Missing api key' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });

  const rec = await getRecordByApiKey(apiKey);
  if (!rec)
    return new Response(JSON.stringify({ valid: false, error: 'Invalid token' }), {
      status: 403, headers: { 'Content-Type': 'application/json' }
    });

  return new Response(JSON.stringify({
    valid: true,
    discordId: rec.discordId,
    username: rec.username,
    createdAt: rec.createdAt
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
