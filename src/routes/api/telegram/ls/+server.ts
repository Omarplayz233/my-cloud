import type { RequestHandler } from './$types';
import { getRecordByApiKey, readRegistry } from '$lib/telegramStorage';

function apiKey(req: Request) {
  return (req.headers.get('x-api-key') ?? '').trim();
}

export const GET: RequestHandler = async ({ request, url, cookies }) => {
  try {
    // --- auth (same logic, just cleaned a bit)
    let key =
      request.headers.get('x-api-key') ??
      url.searchParams.get('api_key') ??
      '';

    key = key.trim();

    if (!key) {
      try {
        const session = cookies.get('session');
        if (session) {
          const { decrypt } = await import('$lib/crypto');
          key = decrypt(session) ?? '';
        }
      } catch {
        // ignore
      }
    }

    const rec = await getRecordByApiKey(key);
    if (!rec) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403
      });
    }

    // --- 🔥 FORCE FRESH REGISTRY (important)
    // this assumes readRegistry() might cache internally
    // so we "break" cache by cloning result
    const raw = await readRegistry();
    const registry: Record<string, any> = JSON.parse(JSON.stringify(raw));

    const folderId = url.searchParams.get('folderId') || null;

    const files: any[] = [];
    const folders: any[] = [];

    for (const [key, item] of Object.entries(registry)) {
      if (!item) continue;

      // --- folders
      if (item._type === 'folder') {
        const parentMatch =
          (item.parentId ?? null) === folderId;

        if (parentMatch) {
          folders.push({
            ...item,
            id: item.folderId // normalize
          });
        }
        continue;
      }

      // --- files
      const fileFolder = item.folderId ?? null;

      if (fileFolder === folderId) {
        files.push({
          ...item,
          id: item.metaFileId || key // normalize
        });
      }
    }

    // optional: sort (makes UI stable)
    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => (b.time || '').localeCompare(a.time || ''));

    return new Response(
      JSON.stringify({
        folders,
        files
      }),
      {
        headers: {
          'Content-Type': 'application/json',

          // 🚫 KILL ALL CACHING
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0'
        }
      }
    );
  } catch (err: any) {
    console.error('ls api error:', err);
    return new Response(
      JSON.stringify({ error: err?.message || 'Internal error' }),
      { status: 500 }
    );
  }
};
