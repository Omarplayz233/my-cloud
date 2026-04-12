// src/routes/api/discord/callback/+server.ts
import type { RequestHandler } from './$types';
import axios from 'axios';
import { generateApiKeyForDiscordId } from '$lib/telegramStorage';

const ALLOWED_IDS = new Set(['756529025719074846']);

const BASE_URL =
  import.meta.env.PUBLIC_BASE_URL ?? 'http://localhost:5173';

const CLIENT_ID = import.meta.env.DISCORD_CLIENT_ID ?? '';
const CLIENT_SECRET = import.meta.env.DISCORD_CLIENT_SECRET ?? '';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const code = url.searchParams.get('code');
    if (!code) return new Response('Missing code', { status: 400 });

    const redirectUri = `${BASE_URL}/api/discord/callback`;

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    });

    const tokenRes = await axios.post(
      'https://discord.com/api/v10/oauth2/token',
      params.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    const token = tokenRes.data;

    const userRes = await axios.get(
      'https://discord.com/api/v10/users/@me',
      {
        headers: {
          Authorization: `${token.token_type ?? 'Bearer'} ${token.access_token}`
        }
      }
    );

    const user = userRes.data;

    if (!ALLOWED_IDS.has(user.id)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403
      });
    }

    const rec = await generateApiKeyForDiscordId(user.id, user.username);

    return new Response(
      JSON.stringify({ user, apiKey: rec.apiKey }),
      { status: 200 }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: 'Discord OAuth failed',
        detail: err?.response?.data ?? err?.message
      }),
      { status: 500 }
    );
  }
};
