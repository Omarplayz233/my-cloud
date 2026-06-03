// src/routes/api/debug/exec/+server.ts
import type { RequestHandler } from './$types';
import { getRecordByApiKey } from '$lib/telegramStorage';

export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    let key = (request.headers.get('x-api-key') ?? '').trim();

    if (!key) {
      try {
        const session = cookies.get('session');
        if (session) {
          const { decrypt } = await import('$lib/crypto');
          key = decrypt(session) ?? '';
        }
      } catch {}
    }

    const rec = await getRecordByApiKey(key);
    if (!rec) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }

    const { code } = await request.json();
    if (typeof code !== 'string' || !code.trim()) {
      return new Response(JSON.stringify({ error: 'No code provided' }), { status: 400 });
    }

    const expr = code.trim();

    // Direct env access: process.env.FOO or process.env["FOO"]
    const envMatch = expr.match(/^process\.env\[?["']([A-Z_][A-Z0-9_]*)["']\]?$/i);
    if (envMatch) {
      const val = process.env[envMatch[1]];
      const output = val !== undefined ? val : `(undefined — key "${envMatch[1]}" not set)`;
      return new Response(JSON.stringify({ result: output }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // process.env (whole object, filtered to non-empty)
    if (expr === 'process.env') {
      const env: Record<string, string> = {};
      for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined) env[k] = v;
      }
      return new Response(JSON.stringify({ result: JSON.stringify(env, null, 2) }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // process.env.VAR fallback
    const dotMatch = expr.match(/^process\.env\.([A-Z_][A-Z0-9_]*)$/i);
    if (dotMatch) {
      const val = process.env[dotMatch[1]];
      const output = val !== undefined ? val : `(undefined — key "${dotMatch[1]}" not set)`;
      return new Response(JSON.stringify({ result: output }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      error: `Only process.env expressions are supported in Workers mode. Try: process.env.TELEGRAM_BOT_TOKEN`
    }), { status: 400 });
  } catch (err: any) {
    console.error('debug/exec error:', err?.message || err);
    return new Response(JSON.stringify({ error: err?.message || 'Internal error' }), { status: 500 });
  }
};
