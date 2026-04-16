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

function normalizeFolderId(id: string | null | undefined) {
  if (!id) return null;
  if (id === 'root') return null;
  if (id.startsWith('tmp:')) return null;
  return id;
}

function sameFolder(a: any, b: any): boolean {
  return (a?.name ?? '') === (b?.name ?? '') && (a?.parentId ?? null) === (b?.parentId ?? null);
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
  const registry = (await readRegistry()) as Record<string, any>;

  if (body.action === 'create') {
    const name = (body.name?.trim() || 'New Folder');
    const parentId = normalizeFolderId(body.parentId);

    if (parentId && !registry[parentId]) {
      return Response.json({ error: 'Parent not found' }, { status: 409 });
    }

    for (const [key, item] of Object.entries(registry)) {
      if (item?._type === 'folder' && sameFolder(item, { name, parentId })) {
        return Response.json({ folder: { ...item, id: key }, reused: true });
      }
    }

    const folderId = 'folder:' + crypto.randomUUID();
    const folder: FolderRecord = {
      _type: 'folder',
      folderId,
      name,
      createdAt: new Date().toISOString(),
      ...(parentId ? { parentId } : {})
    };

    registry[folderId] = folder;
    await writeRegistry(registry);

    return Response.json({ folder });
  }

  if (body.action === 'rename') {
    const folderId = normalizeFolderId(body.folderId);
    if (!folderId) return Response.json({ error: 'Invalid folderId' }, { status: 400 });

    const f = registry[folderId];
    if (!f?._type) return Response.json({ error: 'Not found' }, { status: 404 });

    f.name = body.name?.trim() || f.name;

    if ('parentId' in body) {
      const parentId = normalizeFolderId(body.parentId);
      if (parentId && !registry[parentId]) {
        return Response.json({ error: 'Parent not found' }, { status: 409 });
      }
      if (parentId) f.parentId = parentId;
      else delete f.parentId;
    }

    await writeRegistry(registry);
    return Response.json({ ok: true, folder: f });
  }

  if (body.action === 'delete') {
    const folderId = normalizeFolderId(body.folderId);
    if (!folderId) return Response.json({ error: 'Invalid folderId' }, { status: 400 });

    const f = registry[folderId];
    if (!f?._type) return Response.json({ error: 'Not found' }, { status: 404 });

    const newParent = f.parentId ?? undefined;

    for (const key of Object.keys(registry)) {
      const item = registry[key];

      if (item?._type === 'folder' && item.parentId === folderId) {
        item.parentId = newParent;
      }

      if (!item?._type && item.folderId === folderId) {
        if (newParent) item.folderId = newParent;
        else delete item.folderId;
      }
    }

    delete registry[folderId];
    await writeRegistry(registry);

    return Response.json({ ok: true });
  }

  if (body.action === 'moveFile') {
    const file = registry[body.metaFileId];
    if (!file) return Response.json({ error: 'Not found' }, { status: 404 });

    const targetFolderId = normalizeFolderId(body.folderId);
    if (targetFolderId && !registry[targetFolderId]) {
      return Response.json({ error: 'Folder not found' }, { status: 409 });
    }

    if (targetFolderId) file.folderId = targetFolderId;
    else delete file.folderId;

    await writeRegistry(registry);
    return Response.json({ ok: true });
  }

  if (body.action === 'toggleFavorite') {
    const folderId = normalizeFolderId(body.folderId);
    if (!folderId) return Response.json({ error: 'Invalid folderId' }, { status: 400 });

    const f = registry[folderId];
    if (!f?._type) return Response.json({ error: 'Not found' }, { status: 404 });

    f.favorite = !f.favorite;
    await writeRegistry(registry);

    return Response.json({ ok: true, favorite: f.favorite });
  }

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

  if (body.action === 'togglePublic') {
    const folderId = normalizeFolderId(body.folderId);
    if (!folderId) return Response.json({ error: 'Invalid folderId' }, { status: 400 });

    const f = registry[folderId];
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
      walk(folderId);
    }

    await writeRegistry(registry);
    return Response.json({ ok: true, public: f.public });
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 });
};
