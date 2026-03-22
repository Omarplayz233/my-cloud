// src/routes/api/auth/login/+server.ts
import type { RequestHandler } from './$types';
import { getRecordByApiKey } from '$lib/telegramStorage';
import { encrypt } from '$lib/crypto';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const { apiKey } = await request.json();

  if (!apiKey)
    return new Response(JSON.stringify({ error: 'Missing apiKey' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });

  const rec = await getRecordByApiKey(apiKey);
  if (!rec)
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 403, headers: { 'Content-Type': 'application/json' }
    });

  const encrypted = encrypt(apiKey);

  cookies.set('session', encrypted, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 30 // 30 days
  });

  return new Response(JSON.stringify({
    ok: true,
    username: rec.username,
    discordId: rec.discordId,
    createdAt: rec.createdAt
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
