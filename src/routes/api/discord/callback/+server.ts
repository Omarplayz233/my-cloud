// src/routes/api/discord/callback/+server.ts
import type { RequestHandler } from './$types';
import axios from 'axios';
import { generateApiKeyForDiscordId } from '$lib/telegramStorage';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const OWNER_ID = env.OWNER_ID ?? '';
    const BASE_URL = env.PUBLIC_BASE_URL ?? 'http://localhost:5173';
    const CLIENT_ID = env.DISCORD_CLIENT_ID ?? '';
    const CLIENT_SECRET = env.DISCORD_CLIENT_SECRET ?? '';

    if (!CLIENT_ID || !CLIENT_SECRET) {
      return new Response(JSON.stringify({
        error: 'Missing Discord env vars',
        debug: {
          has_CLIENT_ID: !!env.DISCORD_CLIENT_ID,
          has_CLIENT_SECRET: !!env.DISCORD_CLIENT_SECRET,
          allKeys: Object.keys(env)
        }
      }), { status: 500 });
    }

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

    if (user.id !== OWNER_ID) {
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
