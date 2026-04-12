// src/routes/api/browser/stream/+server.ts
// Returns a short-lived stream token the client uses to connect directly
// to the MJPEG stream on the CF tunnel. The tunnel URL never appears in
// client JS — only the token does.
import type { RequestHandler } from './$types';
import { decrypt } from '$lib/crypto';
import { getRecordByApiKey } from '$lib/telegramStorage';

const SECRET      = () => process.env.BROWSER_SESSION_SECRET!;
const SESSION_URL = () => process.env.BROWSER_SESSION_URL!;

async function _auth(request: Request, cookies: any) {
  const headerKey = (request.headers.get('x-api-key') ?? '').trim();
  if (headerKey) return getRecordByApiKey(headerKey);
  const session = cookies.get('session');
  if (!session) return null;
  const key = decrypt(session);
  if (!key) return null;
  return getRecordByApiKey(key);
}

// POST /api/browser/stream — get a stream token + the stream URL
export const POST: RequestHandler = async ({ request, cookies }) => {
  const rec = await _auth(request, cookies);
  if (!rec) return new Response(JSON.stringify({ error: 'Forbidden' }), {
    status: 403, headers: { 'Content-Type': 'application/json' }
  });

  const url = SESSION_URL();
  if (!url) return new Response(JSON.stringify({ error: 'No session URL configured' }), {
    status: 503, headers: { 'Content-Type': 'application/json' }
  });

  try {
    // Ask Colab to issue a stream token
    const r = await fetch(`${url}/stream-token`, {
      method: 'POST',
      headers: { 'x-session-secret': SECRET() },
      signal: AbortSignal.timeout(5000),
    });
    const j = await r.json() as any;
    if (!j.token) throw new Error('No token returned');

    // Return the stream URL with token embedded — client uses this as <img src>
    // The base URL (SESSION_URL) is injected server-side, never sent to client
    return new Response(JSON.stringify({
      streamUrl: `${url}/stream?token=${j.token}`,
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? 'Failed to get stream token' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};
