import type { RequestHandler } from './$types';
import { getRecordByApiKey, readRegistry } from '$lib/telegramStorage';

function apiKey(req: Request) {
  return (req.headers.get('x-api-key') ?? '').trim();
}

function normalizeFolderId(id: string | null | undefined) {
  if (!id) return null;
  if (id === 'root' || id === 'null' || id === 'undefined') return null;
  if (id.startsWith('tmp:')) return null;
  return id;
}

export const GET: RequestHandler = async ({ request, url, cookies }) => {
  try {
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
      } catch {}
    }

    const rec = await getRecordByApiKey(key);
    if (!rec) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403
      });
    }

    const raw = await readRegistry();
    const registry: Record<string, any> = JSON.parse(JSON.stringify(raw));
    const folderId = normalizeFolderId(url.searchParams.get('folderId'));

    const files: any[] = [];
    const folders: any[] = [];

    for (const [key, item] of Object.entries(registry)) {
      if (!item) continue;

      if (item._type === 'folder') {
        const itemParent = normalizeFolderId(item.parentId);
        const isRootLevel = folderId === null && itemParent === null;
        const isChildMatch = folderId !== null && itemParent === folderId;

        // When no folderId is supplied, return the whole tree so the client can
        // diff and render the current folder correctly without stale partial data.
        if (folderId === null || isRootLevel || isChildMatch) {
          folders.push({
            ...item,
            id: item.folderId
          });
        }
        continue;
      }

      const fileFolder = normalizeFolderId(item.folderId);
      const isRootFiles = folderId === null && fileFolder === null;
      const isChildFiles = folderId !== null && fileFolder === folderId;

      if (folderId === null || isRootFiles || isChildFiles) {
        files.push({
          ...item,
          id: item.metaFileId || key
        });
      }
    }

    folders.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    files.sort((a, b) => (b.time || '').localeCompare(a.time || ''));

    return new Response(
      JSON.stringify({ folders, files }),
      {
        headers: {
          'Content-Type': 'application/json',
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
