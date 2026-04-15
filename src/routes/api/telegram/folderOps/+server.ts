// src/routes/api/telegram/folderOps/+server.ts
import type { RequestHandler } from './$types';
import { getRecordByApiKey, readRegistry, writeRegistry } from '$lib/telegramStorage';
import crypto from 'crypto';

export type FolderRecord = {
  _type: 'folder';
  folderId: string;
  name: string;
  createdAt: string;
  parentId?: string;
  favorite?: boolean;
  public?: boolean;
};

function apiKey(req: Request) {
  return (req.headers.get('x-api-key') ?? '').trim();
}

export const GET: RequestHandler = async ({ request, url, cookies }) => {
  const headerKey = (request.headers.get('x-api-key') ?? url.searchParams.get('api_key') ?? '').trim();
  let key = headerKey;

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
  if (!rec) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

  const registry = await readRegistry();

  const folders = Object.values(registry).filter((r: any) => r?._type === 'folder');

  return new Response(JSON.stringify({ folders }), {
    headers: { 'Content-Type': 'application/json' }
  });
};

export const POST: RequestHandler = async ({ request }) => {
  const rec = await getRecordByApiKey(apiKey(request));
  if (!rec) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

  const body = await request.json();
  const registry = await readRegistry() as Record<string, any>;

  // CREATE
  if (body.action === 'create') {
    const folderId = 'folder:' + crypto.randomUUID();

    const folder: FolderRecord = {
      _type: 'folder',
      folderId,
      name: body.name?.trim() || 'New Folder',
      createdAt: new Date().toISOString(),
      ...(body.parentId ? { parentId: body.parentId } : {})
    };

    registry[folderId] = folder;
    await writeRegistry(registry);

    return Response.json({ folder });
  }

  // RENAME / MOVE
  if (body.action === 'rename') {
    const f = registry[body.folderId];
    if (!f?._type) return Response.json({ error: 'Not found' }, { status: 404 });

    f.name = body.name?.trim() || f.name;

    if ('parentId' in body) {
      if (body.parentId) f.parentId = body.parentId;
      else delete f.parentId;
    }

    await writeRegistry(registry);
    return Response.json({ ok: true });
  }

  // DELETE (FIXED CORE LOGIC)
  if (body.action === 'delete') {
    const f = registry[body.folderId];
    if (!f?._type) return Response.json({ error: 'Not found' }, { status: 404 });

    const newParent = f.parentId ?? undefined;

    for (const key of Object.keys(registry)) {
      const item = registry[key];

      // move folders up one level
      if (item?._type === 'folder' && item.parentId === body.folderId) {
        item.parentId = newParent;
      }

      // move files up one level safely
      if (!item?._type && item.folderId === body.folderId) {
        if (newParent) item.folderId = newParent;
        else delete item.folderId;
      }
    }

    delete registry[body.folderId];
    await writeRegistry(registry);

    return Response.json({ ok: true });
  }

  // MOVE FILE
  if (body.action === 'moveFile') {
    const file = registry[body.metaFileId];
    if (!file) return Response.json({ error: 'Not found' }, { status: 404 });

    if (body.folderId) file.folderId = body.folderId;
    else delete file.folderId;

    await writeRegistry(registry);
    return Response.json({ ok: true });
  }

  // FAVORITE
  if (body.action === 'toggleFavorite') {
    const f = registry[body.folderId];
    if (!f?._type) return Response.json({ error: 'Not found' }, { status: 404 });

    f.favorite = !f.favorite;
    await writeRegistry(registry);

    return Response.json({ ok: true, favorite: f.favorite });
  }

  // DUPLICATE
  if (body.action === 'duplicate') {
    const file = registry[body.metaFileId];
    if (!file || file._type === 'folder') {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const registryKey = 'dup:' + crypto.randomUUID();

    registry[registryKey] = {
      ...file,
      fileName: body.newName || `${file.fileName} (copy)`,
      time: new Date().toISOString(),
      favorite: false,
    };

    await writeRegistry(registry);
    return Response.json({ ok: true, file: registry[registryKey] });
  }

  // PUBLIC TOGGLE
  if (body.action === 'togglePublic') {
    const f = registry[body.folderId];
    if (!f?._type) return Response.json({ error: 'Not found' }, { status: 404 });

    const isPublic = !f.public;
    f.public = isPublic;

    if (body.recursive) {
      const walk = (fid: string) => {
        for (const item of Object.values(registry) as any[]) {
          if (item._type === 'folder' && item.parentId === fid) {
            item.public = isPublic;
            walk(item.folderId);
          } else if (!item._type && item.folderId === fid) {
            item.public = isPublic;
          }
        }
      };
      walk(body.folderId);
    }

    await writeRegistry(registry);
    return Response.json({ ok: true, public: f.public });
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 });
};
