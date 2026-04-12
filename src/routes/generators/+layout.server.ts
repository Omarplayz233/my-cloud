// src/routes/generators/+layout.server.ts
import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { decrypt } from '$lib/crypto';
import { getRecordByApiKey } from '$lib/telegramStorage';

export const load: LayoutServerLoad = async ({ cookies }) => {
  const session = cookies.get('session');
  if (!session) throw redirect(302, '/');

  const apiKey = decrypt(session);
  if (!apiKey) throw redirect(302, '/');

  const rec = await getRecordByApiKey(apiKey);
  if (!rec) throw redirect(302, '/');

  return {
    user: { username: rec.username }
  };
};
