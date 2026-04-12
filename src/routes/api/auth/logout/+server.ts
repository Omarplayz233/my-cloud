// src/routes/api/auth/logout/+server.ts
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
  cookies.delete('session', { path: '/' });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
};
