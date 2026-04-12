import type { RequestHandler } from './$types';
import store from '../_store';
import { deriveKey, randomBytes } from '../_crypto';

export const POST: RequestHandler = async ({ request }) => {
  const { password } = await request.json();

  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);

  store.unlocked = true;
  store.key = key;

  return new Response(
    JSON.stringify({
      ok: true,
      salt: Buffer.from(salt).toString('base64')
    })
  );
};
