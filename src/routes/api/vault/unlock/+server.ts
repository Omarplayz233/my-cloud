import type { RequestHandler } from './$types';
import { deriveKey, sha256, randomBytes } from '../_crypto';

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  
  const { password } = await request.json();
  
  const salt = randomBytes(16).buffer;
  const saltB64 = Buffer.from(salt).toString('base64');
  
  const key = await deriveKey(password, new Uint8Array(salt));
  const keyHash = await sha256(await crypto.subtle.exportKey('jwk', key));
  
  // Store session with expiry
  cookies.set('vault_session', keyHash, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 3600 // 1 hour
  });
  
  return new Response(JSON.stringify({ ok: true, salt: saltB64 }));
};
