// src/routes/+page.server.ts
import type { PageServerLoad } from './$types';
import { decrypt } from '$lib/crypto';
import { getRecordByApiKey } from '$lib/telegramStorage';

export const load: PageServerLoad = async ({ cookies }) => {
  const session = cookies.get('session');
  if (!session) return { user: null, apiKey: null };

  const apiKey = decrypt(session);
  if (!apiKey) return { user: null, apiKey: null };

  const rec = await getRecordByApiKey(apiKey);
  if (!rec) return { user: null, apiKey: null };

  return {
    user: {
      username: rec.username,
      discordId: rec.discordId,
      createdAt: rec.createdAt
    },
    apiKey,
    encryptedApiKey: session,
  };
};
