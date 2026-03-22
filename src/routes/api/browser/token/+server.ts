// src/routes/api/browser/token/+server.ts
import type { RequestHandler } from './$types';
import { decrypt } from '$lib/crypto';
import { getRecordByApiKey } from '$lib/telegramStorage';
import { issueToken } from '$lib/browserToken';

async function _auth(request: Request, cookies: any) {
  const headerKey = (request.headers.get('x-api-key') ?? '').trim();
  if (headerKey) return getRecordByApiKey(headerKey);
  const session = cookies.get('session');
  if (!session) return null;
  const key = decrypt(session);
  if (!key) return null;
  return getRecordByApiKey(key);
}

export const POST: RequestHandler = async ({ request, cookies }) => {
  const rec = await _auth(request, cookies);
  if (!rec) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  const body = await request.json().catch(() => ({})) as any;
  const ttl  = body?.stream ? 24 * 60 * 60 * 1000 : 30_000; // 24h for stream, 30s for input
  return new Response(JSON.stringify({ token: issueToken(ttl) }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
