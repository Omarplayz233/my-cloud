// src/routes/api/browser/ws-url/+server.ts
// Returns a signed wss:// URL the client connects to directly.
// The tunnel base URL lives only in server env — client only sees the token.
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
  if (!rec) return new Response(JSON.stringify({ error: 'Forbidden' }), {
    status: 403, headers: { 'Content-Type': 'application/json' }
  });

  const sessionUrl = process.env.BROWSER_SESSION_URL;
  if (!sessionUrl) return new Response(JSON.stringify({ error: 'No session configured' }), {
    status: 503, headers: { 'Content-Type': 'application/json' }
  });

  // Issue a 1h non-consuming token for the WS connection
  const token = issueToken(60 * 60 * 1000);

  // Convert https:// → wss://
  const wsUrl = sessionUrl.replace(/^https?:\/\//, 'wss://') + `/ws?token=${encodeURIComponent(token)}`;

  return new Response(JSON.stringify({ wsUrl }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
