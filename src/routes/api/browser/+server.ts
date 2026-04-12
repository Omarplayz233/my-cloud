// src/routes/api/browser/+server.ts
import type { RequestHandler } from './$types';
import { decrypt } from '$lib/crypto';
import { getRecordByApiKey } from '$lib/telegramStorage';

const SECRET = () => process.env.BROWSER_SESSION_SECRET!;
const SESSION_URL = () => process.env.BROWSER_SESSION_URL!;

function normalizeUrl(raw: string) {
  if (!raw) return '';
  let url = raw.trim();

  // add protocol if missing
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  // remove trailing slash
  url = url.replace(/\/+$/, '');

  return url;
}

async function _auth(request: Request, cookies: any) {
  const headerKey = (request.headers.get('x-api-key') ?? '').trim();
  if (headerKey) return getRecordByApiKey(headerKey);

  const session = cookies.get('session');
  if (!session) return null;

  const key = decrypt(session);
  if (!key) return null;

  return getRecordByApiKey(key);
}

// GET /api/browser — check if Colab session alive
export const GET: RequestHandler = async ({ request, cookies }) => {

  const rec = await _auth(request, cookies);
  if (!rec) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const raw = SESSION_URL();
  if (!raw) {
    return new Response(JSON.stringify({
      alive: false,
      reason: 'BROWSER_SESSION_URL not set'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = normalizeUrl(raw);

  try {

    const r = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(4000),
      headers: {
        'x-session-secret': SECRET()
      }
    });

    const j = await r.json() as any;

    return new Response(JSON.stringify({
      alive: r.ok && j.ok,
      browser: j.browser ?? null
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch {

    return new Response(JSON.stringify({
      alive: false
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  }

};
