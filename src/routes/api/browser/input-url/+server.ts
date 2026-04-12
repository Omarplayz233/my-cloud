// src/routes/api/browser/input-url/+server.ts
// Returns a direct Colab input URL + nonce. Client sends input straight
// to Colab tunnel — zero SvelteKit round-trip per keystroke/mousemove.
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

export const POST: RequestHandler = async ({ request, cookies }) => {
  const rec = await _auth(request, cookies);
  if (!rec) return new Response(JSON.stringify({ error: 'Forbidden' }), {
    status: 403, headers: { 'Content-Type': 'application/json' }
  });

  const colab = SESSION_URL();
  if (!colab) return new Response(JSON.stringify({ error: 'No session' }), {
    status: 503, headers: { 'Content-Type': 'application/json' }
  });

  try {
    const r = await fetch(`${colab}/input-nonce`, {
      method: 'POST',
      headers: { 'x-session-secret': SECRET() },
      signal: AbortSignal.timeout(5000),
    });
    const { nonce } = await r.json() as any;
    if (!nonce) throw new Error('no nonce');

    // Nonce TTL is 60s by default — extend it on Colab side for input sessions
    return new Response(JSON.stringify({
      inputUrl: `${colab}/input-direct`,
      nonce,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message }), {
      status: 502, headers: { 'Content-Type': 'application/json' }
    });
  }
};
