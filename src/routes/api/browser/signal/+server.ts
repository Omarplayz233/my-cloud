// src/routes/api/browser/signal/+server.ts
import type { RequestHandler } from './$types';
import { decrypt } from '$lib/crypto';
import { getRecordByApiKey } from '$lib/telegramStorage';
import { validateToken } from '$lib/browserToken';

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
  if (!rec) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

  const body = await request.json() as any;
  const { token, offer, input } = body;

  if (!token || !validateToken(token, false))  // non-consuming — same token reused until 20s refresh
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const url = SESSION_URL();
  if (!url)
    return new Response(JSON.stringify({ error: 'No browser session configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });

  try {
    const endpoint = offer ? '/offer' : '/input';
    const payload  = offer ? { offer } : { input };
    const r = await fetch(`${url}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-secret': SECRET() },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    // Always return valid JSON
    let data: any;
    try { data = await r.json(); }
    catch { data = { error: `Colab returned non-JSON (status ${r.status})` }; }
    return new Response(JSON.stringify(data), {
      status: r.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? 'Signal failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
