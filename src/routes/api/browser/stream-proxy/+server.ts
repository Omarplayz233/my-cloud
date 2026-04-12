// src/routes/api/browser/stream-proxy/+server.ts
import type { RequestHandler } from './$types';
import { validateToken } from '$lib/browserToken';

const SECRET      = () => process.env.BROWSER_SESSION_SECRET!;
const SESSION_URL = () => process.env.BROWSER_SESSION_URL!;

export const GET: RequestHandler = async ({ url }) => {
  const token = url.searchParams.get('token') ?? '';
  if (!validateToken(token, false))
    return new Response('Invalid or expired token', { status: 401 });

  const colab = SESSION_URL();
  if (!colab) return new Response('No session URL', { status: 503 });

  try {
    // Get a fresh nonce from Colab
    const nr = await fetch(`${colab}/nonce`, {
      method: 'POST',
      headers: { 'x-session-secret': SECRET() },
      signal: AbortSignal.timeout(5000),
    });
    if (!nr.ok) return new Response('Colab nonce request failed', { status: 502 });
    const { nonce } = await nr.json() as any;
    if (!nonce) return new Response('No nonce returned', { status: 502 });

    // Pipe the SSE stream
    const upstream = await fetch(`${colab}/stream?nonce=${nonce}`, {
      headers: { 'x-session-secret': SECRET() },
    });

    if (!upstream.ok || !upstream.body)
      return new Response('Stream unavailable', { status: 502 });

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache, no-store',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (e: any) {
    return new Response(`Stream error: ${e?.message}`, { status: 502 });
  }
};
