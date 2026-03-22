// src/routes/api/discord/callback/+server.ts
import type { RequestHandler } from './$types';
import axios from 'axios';
import { generateApiKeyForDiscordId } from '$lib/telegramStorage';

const ALLOWED_IDS = new Set(['756529025719074846']);

export const GET: RequestHandler = async ({ url }) => {
  try {
    const code = url.searchParams.get('code');
    if (!code) return new Response('Missing code', { status: 400 });

    const redirectUri = process.env.DISCORD_REDIRECT_URI || 'https://cloud.omarplayz.eu.org/api/discord/callback';

    console.log('Discord callback — code:', code);
    console.log('Discord callback — redirectUri:', redirectUri);
    console.log('Discord callback — client_id:', process.env.DISCORD_CLIENT_ID);

    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID ?? '',
      client_secret: process.env.DISCORD_CLIENT_SECRET ?? '',
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    });

    let tokenData: any;
    try {
      const tokenRes = await axios.post('https://discord.com/api/v10/oauth2/token', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      tokenData = tokenRes.data;
    } catch (tokenErr: any) {
      console.error('Token exchange failed:', tokenErr?.response?.data);
      return new Response(JSON.stringify({
        error: 'Token exchange failed',
        detail: tokenErr?.response?.data ?? tokenErr?.message
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (!tokenData?.access_token)
      return new Response(JSON.stringify({ error: 'No access_token returned from Discord' }), { status: 500 });

    const userRes = await axios.get('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `${tokenData.token_type ?? 'Bearer'} ${tokenData.access_token}` }
    });
    const user = userRes.data;

    console.log('Discord user:', user.id, user.username);

    if (!ALLOWED_IDS.has(user.id))
      return new Response(JSON.stringify({ error: 'You are not authorized to use this service' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });

    const rec = await generateApiKeyForDiscordId(user.id, user.username);

    return new Response(JSON.stringify({ user, apiKey: rec.apiKey }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Discord callback error:', err?.response?.data || err?.message || err);
    const detail = err?.response?.data ? JSON.stringify(err.response.data) : err?.message || 'Unknown';
    return new Response(JSON.stringify({ error: 'Discord OAuth failed', detail }), { status: 500 });
  }
};
