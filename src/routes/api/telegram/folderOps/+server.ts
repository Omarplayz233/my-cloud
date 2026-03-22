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
    } catch { /* ignore */ }
  }
  const rec = await getRecordByApiKey(key);
  if (!rec) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

  const registry = await readRegistry();
  const folders = Object.values(registry).filter((r: any) => r._type === 'folder');
  return new Response(JSON.stringify({ folders }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: RequestHandler = async ({ request }) => {
  const rec = await getRecordByApiKey(apiKey(request));
  if (!rec) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

  const body = await request.json();
  const registry = await readRegistry() as Record<string, any>;

  if (body.action === 'create') {
    const folderId = 'folder:' + crypto.randomUUID();
    const folder: FolderRecord = {
      _type: 'folder', folderId,
      name: body.name?.trim() || 'New Folder',
      createdAt: new Date().toISOString(),
      ...(body.parentId ? { parentId: body.parentId } : {})
    };
    registry[folderId] = folder;
    await writeRegistry(registry);
    return new Response(JSON.stringify({ folder }), { headers: { 'Content-Type': 'application/json' } });
  }

  if (body.action === 'rename') {
    const f = registry[body.folderId];
    if (!f?._type) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    f.name = body.name?.trim() || f.name;
    if ('parentId' in body) {
      if (body.parentId) f.parentId = body.parentId;
      else delete f.parentId;
    }
    await writeRegistry(registry);
    return new Response(JSON.stringify({ ok: true }));
  }

  if (body.action === 'delete') {
    const f = registry[body.folderId];
    if (!f?._type) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    // Move children to parent instead of orphaning
    for (const v of Object.values(registry) as any[]) {
      if (v._type === 'folder' && v.parentId === body.folderId) v.parentId = f.parentId;
      if (!v._type && v.folderId === body.folderId) v.folderId = f.parentId;
    }
    delete registry[body.folderId];
    await writeRegistry(registry);
    return new Response(JSON.stringify({ ok: true }));
  }

  if (body.action === 'moveFile') {
    const file = registry[body.metaFileId];
    if (!file) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    if (body.folderId) file.folderId = body.folderId;
    else delete file.folderId;
    await writeRegistry(registry);
    return new Response(JSON.stringify({ ok: true }));
  }

  if (body.action === 'toggleFavorite') {
    const f = registry[body.folderId];
    if (!f?._type) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    f.favorite = !f.favorite;
    await writeRegistry(registry);
    return new Response(JSON.stringify({ ok: true, favorite: f.favorite }));
  }

  if (body.action === 'duplicate') {
    const file = registry[body.metaFileId];
    if (!file || file._type === 'folder') return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    // Keep the original metaFileId (real Telegram file ID) so getRequestFile can still serve it.
    // Use a unique registry key so it appears as a separate entry in the list.
    const registryKey = 'dup:' + crypto.randomUUID();
    const newFile = {
      ...file,
      // metaFileId stays as the original — points to the same Telegram meta JSON
      fileName: body.newName || `${file.fileName} (copy)`,
      time: new Date().toISOString(),
      favorite: false,
    };
    registry[registryKey] = newFile;
    await writeRegistry(registry);
    return new Response(JSON.stringify({ file: newFile }), { headers: { 'Content-Type': 'application/json' } });
  }

  if (body.action === 'togglePublic') {
    const f = registry[body.folderId];
    if (!f?._type) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    const isPublic = !f.public;
    f.public = isPublic;

    if (body.recursive) {
      const setRecursive = (fid: string, p: boolean) => {
        for (const k in registry) {
          const item = registry[k];
          if (item._type === 'folder' && item.parentId === fid) {
            item.public = p;
            setRecursive(item.folderId, p);
          } else if (!item._type && item.folderId === fid) {
            item.public = p;
          }
        }
      };
      setRecursive(body.folderId, isPublic);
    }

    await writeRegistry(registry);
    return new Response(JSON.stringify({ ok: true, public: f.public }));
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 });
};
