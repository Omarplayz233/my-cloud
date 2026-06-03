// src/routes/api/debug/exec/+server.ts
import type { RequestHandler } from './$types';
import { getRecordByApiKey } from '$lib/telegramStorage';
import vm from 'vm';

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

    let result: any;
    try {
      const sandbox = { process, require, console, Buffer, setTimeout, clearTimeout, setInterval, clearInterval };
      const ctx = vm.createContext(sandbox);
      result = vm.runInNewContext(code, ctx, { timeout: 5000 });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err?.message || 'Eval error' }), { status: 400 });
    }

    if (result instanceof Promise) {
      result = await result;
    }

    const output = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    return new Response(JSON.stringify({ result: output }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('debug/exec error:', err?.message || err);
    return new Response(JSON.stringify({ error: err?.message || 'Internal error' }), { status: 500 });
  }
};
