// src/routes/api/telegram/folderOps/+server.ts
import type { RequestHandler } from './$types';
import {
  getRecordByApiKey,
  readRegistry,
  writeRegistry
} from '$lib/telegramStorage';
import crypto from 'crypto';

export type FolderRecord = {
  _type: 'folder';
  folderId: string;
  name: string;
  createdAt: string;
  parentId?: string | null;
  favorite?: boolean;
  public?: boolean;
};

function apiKey(req: Request) {
  return (req.headers.get('x-api-key') ?? '').trim();
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function findFolder(registry: Record<string, any>, name: string, parentId: any) {
  return Object.values(registry).find(
    (r: any) =>
      r &&
      r._type === 'folder' &&
      r.name === name &&
      (r.parentId ?? null) === (parentId ?? null)
  );
}

export const GET: RequestHandler = async ({ request, url, cookies }) => {
  const headerKey =
    request.headers.get('x-api-key') ??
    url.searchParams.get('api_key') ??
    '';

  let key = headerKey.trim();

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
  if (!rec) return json({ error: 'Forbidden' }, 403);

  const registry = await readRegistry();

  const folders = Object.values(registry).filter(
    (r: any) => r?._type === 'folder'
  );

  return json({ folders });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const rec = await getRecordByApiKey(apiKey(request));
    if (!rec) return json({ error: 'Forbidden' }, 403);

    const body = await request.json().catch(() => null);
    if (!body) return json({ error: 'Invalid JSON' }, 400);

    const registry = await readRegistry();

    // ---------------------------
    // CREATE (IDEMPOTENT FIX 🔥)
    // ---------------------------
    if (body.action === 'create') {
      const name = (body.name ?? 'New Folder').trim();
      const parentId = body.parentId ?? null;

      const existing = findFolder(registry, name, parentId);

      if (existing) {
        return json({ folder: existing, created: false });
      }

      const folderId = 'folder:' + crypto.randomUUID();

      const folder: FolderRecord = {
        _type: 'folder',
        folderId,
        name,
        createdAt: new Date().toISOString(),
        parentId
      };

      registry[folderId] = folder;
      await writeRegistry(registry);

      return json({ folder, created: true });
    }

    // ---------------------------
    // RENAME
    // ---------------------------
    if (body.action === 'rename') {
      const f = registry[body.folderId];
      if (!f?._type) return json({ error: 'Not found' }, 404);

      f.name = body.name?.trim() || f.name;

      if ('parentId' in body) {
        f.parentId = body.parentId ?? null;
      }

      await writeRegistry(registry);
      return json({ ok: true });
    }

    // ---------------------------
    // DELETE (SAFE CLEANUP FIX 🧹)
    // ---------------------------
    if (body.action === 'delete') {
      const f = registry[body.folderId];
      if (!f?._type) return json({ error: 'Not found' }, 404);

      const parent = f.parentId ?? null;

      for (const [key, item] of Object.entries(registry)) {
        const v: any = item;

        // reparent folders
        if (v?._type === 'folder' && v.parentId === body.folderId) {
          v.parentId = parent;
        }

        // reattach files safely
        if (!v?._type && v.folderId === body.folderId) {
          v.folderId = parent;
        }
      }

      delete registry[body.folderId];

      await writeRegistry(registry);
      return json({ ok: true });
    }

    // ---------------------------
    // MOVE FILE
    // ---------------------------
    if (body.action === 'moveFile') {
      const file = registry[body.metaFileId];
      if (!file) return json({ error: 'Not found' }, 404);

      if (body.folderId) file.folderId = body.folderId;
      else delete file.folderId;

      await writeRegistry(registry);
      return json({ ok: true });
    }

    // ---------------------------
    // FAVORITE
    // ---------------------------
    if (body.action === 'toggleFavorite') {
      const f = registry[body.folderId];
      if (!f?._type) return json({ error: 'Not found' }, 404);

      f.favorite = !f.favorite;

      await writeRegistry(registry);
      return json({ ok: true, favorite: f.favorite });
    }

    // ---------------------------
    // DUPLICATE FILE
    // ---------------------------
    if (body.action === 'duplicate') {
      const file = registry[body.metaFileId];
      if (!file || file._type === 'folder') {
        return json({ error: 'Not found' }, 404);
      }

      const registryKey = 'dup:' + crypto.randomUUID();

      registry[registryKey] = {
        ...file,
        fileName: body.newName || `${file.fileName} (copy)`,
        time: new Date().toISOString(),
        favorite: false
      };

      await writeRegistry(registry);
      return json({ file: registry[registryKey] });
    }

    // ---------------------------
    // TOGGLE PUBLIC (SAFE RECURSIVE FIX 🌐)
    // ---------------------------
    if (body.action === 'togglePublic') {
      const f = registry[body.folderId];
      if (!f?._type) return json({ error: 'Not found' }, 404);

      const newState = !f.public;
      f.public = newState;

      const visit = (fid: string, state: boolean) => {
        for (const item of Object.values(registry)) {
          const v: any = item;

          if (v?._type === 'folder' && v.parentId === fid) {
            v.public = state;
            visit(v.folderId, state);
          }

          if (!v?._type && v.folderId === fid) {
            v.public = state;
          }
        }
      };

      if (body.recursive) {
        visit(body.folderId, newState);
      }

      await writeRegistry(registry);
      return json({ ok: true, public: newState });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e: any) {
    console.error('folderOps crash:', e);
    return json({ error: e?.message || 'Internal error' }, 500);
  }
};
