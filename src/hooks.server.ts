// src/hooks.server.ts
// WebDAV server mounted at / — intercepts WebDAV methods before SvelteKit router.
// Compatible with Windows Explorer, macOS Finder, FileZilla, Cyberduck, WinSCP.
// Auth: HTTP Basic (username = your username, password = your API key)

import { env } from '$env/dynamic/private';
import {
  getRecordByApiKey,
  readRegistry,
  writeRegistry,
  uploadBytesToTelegram,
  deleteFile,
  downloadFileFromTelegram
} from '$lib/telegramStorage';
import { decrypt } from '$lib/crypto';
import type { Handle } from '@sveltejs/kit';
import crypto from 'crypto';
import { TG_SAFE_CHUNK_BYTES } from '$lib/telegramLimits';

const BOT_TOKEN = () => env.TELEGRAM_BOT_TOKEN!;
const TELE_API = () => `https://api.telegram.org/bot${BOT_TOKEN()}`;

const DAV_METHODS = new Set(['PROPFIND', 'PROPPATCH', 'MKCOL', 'COPY', 'MOVE', 'LOCK', 'UNLOCK', 'OPTIONS']);

// ── Auth ──────────────────────────────────────────────────────────────────────
async function davAuth(request: Request): Promise<{ rec: any; apiKey: string } | null> {
  const auth = request.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Basic ')) return null;
  const decoded = atob(auth.slice(6));
  const colon = decoded.indexOf(':');
  if (colon === -1) return null;
  const apiKey = decoded.slice(colon + 1).trim(); // password = api key
  const rec = await getRecordByApiKey(apiKey);
  if (!rec) return null;
  return { rec, apiKey };
}

function unauth() {
  return new Response('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="omar\'s cloud :3"' },
  });
}

// ── Path helpers ──────────────────────────────────────────────────────────────
function parsePath(url: URL): { folderPath: string; fileName: string | null } {
  const parts = decodeURIComponent(url.pathname)
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')  // strip trailing slash
    .split('/')
    .filter(Boolean);
  if (!parts.length) return { folderPath: '', fileName: null };
  const last = parts[parts.length - 1];
  // File only if last segment has an extension — never treat folder names as files
  const isFile = /\.[^./]+$/.test(last);
  if (isFile) {
    return { folderPath: parts.slice(0, -1).join('/'), fileName: last };
  }
  return { folderPath: parts.join('/'), fileName: null };
}

// ── Registry helpers ──────────────────────────────────────────────────────────
function folderFullPath(registryKey: string, registry: Record<string, any>): string {
  const f = registry[registryKey];
  if (!f || f._type !== 'folder') return '';
  let path = f.name;
  // Walk up via parentId — parentId is the registry key of the parent folder
  let pid = f.parentId;
  while (pid) {
    const p = registry[pid];
    if (!p) break;
    path = p.name + '/' + path;
    pid = p.parentId;
  }
  return path;
}

function findFolder(path: string, registry: Record<string, any>): any | null {
  if (!path) return { folderId: null, name: 'root', _type: 'folder' }; // root
  for (const [key, v] of Object.entries(registry)) {
    if (v._type === 'folder') {
      // Use registry key as the canonical folderId for path reconstruction
      const fp = folderFullPath(key, registry);
      if (fp === path) return { ...v, _regKey: key };
    }
  }
  return null;
}

function filesInFolder(folderId: string | null, registry: Record<string, any>) {
  return Object.values(registry).filter((v: any) => {
    if (v._type) return false;
    if (folderId === null) return !v.folderId;
    // Match against both v.folderId property and potential registry key
    return v.folderId === folderId;
  });
}

function subfoldersOf(folderId: string | null, registry: Record<string, any>) {
  return Object.entries(registry)
    .filter(([key, v]: any) =>
      v._type === 'folder' && (folderId === null ? !v.parentId : v.parentId === folderId)
    )
    .map(([key, v]: any) => ({ ...v, _regKey: key }));
}

function uniqueName(baseName: string, existingNames: Set<string>): string {
  if (!existingNames.has(baseName)) return baseName;
  let counter = 1;
  while (existingNames.has(`${baseName} (${counter})`)) counter++;
  return `${baseName} (${counter})`;
}

function uniqueFileName(baseName: string, existingNames: Set<string>): string {
  if (!existingNames.has(baseName)) return baseName;
  const dotIdx = baseName.lastIndexOf('.');
  const ext = dotIdx > 0 ? baseName.slice(dotIdx) : '';
  const nameWithoutExt = dotIdx > 0 ? baseName.slice(0, dotIdx) : baseName;
  let counter = 1;
  let candidate = `${nameWithoutExt} (${counter})${ext}`;
  while (existingNames.has(candidate)) {
    counter++;
    candidate = `${nameWithoutExt} (${counter})${ext}`;
  }
  return candidate;
}

// ── XML helpers ───────────────────────────────────────────────────────────────
function xmlEscape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function davDate(iso: string) {
  return new Date(iso).toUTCString();
}

function encodeDavPathSegments(path: string) {
  // WebDAV <D:href> should be an absolute path with URL-escaped segments.
  // Keep "/" separators but escape each segment (spaces, unicode, etc).
  const segs = path.split('/').filter((s) => s.length > 0);
  return (
    '/' +
    segs
      .map((s) => {
        // If `path` already contains escapes (e.g. from url.pathname), normalize instead of double-encoding.
        const decoded = decodeURIComponent(s);
        return encodeURIComponent(decoded);
      })
      .join('/')
  );
}

function ensureTrailingSlash(p: string) {
  return p.endsWith('/') ? p : p + '/';
}

function propResponse(href: string, isDir: boolean, name: string, size: number, modified: string) {
  return `<D:response>
  <D:href>${xmlEscape(href)}</D:href>
  <D:propstat>
    <D:prop>
      <D:displayname>${xmlEscape(name)}</D:displayname>
      <D:getlastmodified>${davDate(modified)}</D:getlastmodified>
      ${isDir
      ? `<D:resourcetype><D:collection/></D:resourcetype>`
      : `<D:resourcetype/><D:getcontentlength>${size}</D:getcontentlength><D:getcontenttype>application/octet-stream</D:getcontenttype>`
    }
    </D:prop>
    <D:status>HTTP/1.1 200 OK</D:status>
  </D:propstat>
</D:response>`;
}

function multistatus(responses: string[]) {
  return `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
${responses.join('\n')}
</D:multistatus>`;
}

function parseRange(rangeHeader: string | null, totalSize: number) {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) return null;
  const parts = rangeHeader.replace('bytes=', '').split('-');
  let start = parseInt(parts[0], 10);
  let end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

  if (isNaN(start)) {
    start = totalSize - end;
    end = totalSize - 1;
  }
  if (start < 0) start = 0;
  if (end >= totalSize) end = totalSize - 1;

  if (start > end || start >= totalSize || isNaN(start) || isNaN(end)) return null;
  return { start, end };
}

async function getTgUrl(fileId: string): Promise<string | null> {
  const api = TELE_API();
  const token = BOT_TOKEN();
  try {
    const r = await fetch(`${api}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const j = await r.json() as any;
    if (!j?.ok) return null;
    return `https://api.telegram.org/file/bot${token}/${j.result.file_path}`;
  } catch {
    return null;
  }
}

async function pumpToWriter(
  body: ReadableStream<Uint8Array> | null,
  writer: WritableStreamDefaultWriter<Uint8Array>
) {
  if (!body) throw new Error('Upstream body is null');
  const reader = body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) await writer.write(value);
    }
  } finally {
    reader.releaseLock();
  }
}

/* ----------------------------- Replaced network helpers ------------------------------
   The original hooks used `fetch` to call Telegram getFile and CDN. That path was the
   reason WebDAV hit "Bad Request: file is too big". Here we reuse the library helper
   `downloadFileFromTelegram(fileId)` (which uses axios and your project's robust logic)
   to fetch meta and chunk data reliably.
*/

async function fetchMeta(metaFileId: string): Promise<any> {
  // downloadFileFromTelegram returns { data: Buffer, filename, mimeType }
  const bufRes = await downloadFileFromTelegram(metaFileId);
  const buf = bufRes.data;
  try {
    const txt = Buffer.isBuffer(buf) ? buf.toString('utf8') : Buffer.from(buf).toString('utf8');
    return JSON.parse(txt);
  } catch (err) {
    throw new Error(`Failed to parse meta JSON for ${metaFileId}: ${(err as any).message || err}`);
  }
}

async function downloadChunk(fileId: string): Promise<Buffer> {
  const res = await downloadFileFromTelegram(fileId);
  return res.data;
}

/* ------------------------------------------------------------------------------- */

async function downloadFileRange(file: any, start: number, end: number): Promise<Buffer> {
  const meta = await fetchMeta(file.metaFileId);
  if (meta.chunked && Array.isArray(meta.chunks)) {
    const sorted = [...meta.chunks].sort((a: any, b: any) => a.index - b.index);
    const parts: Buffer[] = [];
    let offset = 0;
    for (const chunk of sorted) {
      const chunkSize = chunk.size ?? 0;
      const chunkStart = offset;
      const chunkEnd = offset + chunkSize - 1;

      if (!(end < chunkStart || start > chunkEnd)) {
        const buf = await downloadChunk(chunk.file_id);
        const from = Math.max(0, start - chunkStart);
        const to = Math.min(buf.length, end - chunkStart + 1); // exclusive slice end
        parts.push(buf.slice(from, to));
      }
      offset += chunkSize;
    }
    return Buffer.concat(parts);
  }
  const metaBuf = await downloadChunk(meta.telegramFileId);
  return metaBuf.slice(start, end + 1);
}

// ── Telegram download (merging if chunked) ─────────────────────────────────────────
async function downloadFile(file: any): Promise<Buffer> {
  const meta = await fetchMeta(file.metaFileId);
  if (meta.chunked && Array.isArray(meta.chunks)) {
    const sorted = [...meta.chunks].sort((a: any, b: any) => a.index - b.index);
    const bufs = [];
    for (const c of sorted) {
      const part = await downloadChunk(c.file_id);
      bufs.push(part);
    }
    return Buffer.concat(bufs);
  }
  return downloadChunk(meta.telegramFileId);
}

async function streamFileRange(file: any, start: number, end: number): Promise<ReadableStream<Uint8Array>> {
  const meta = await fetchMeta(file.metaFileId);

  // Non-chunked: proxy telegram stream with range
  if (!meta.chunked || !Array.isArray(meta.chunks)) {
    const tgUrl = await getTgUrl(meta.telegramFileId);
    if (!tgUrl) throw new Error('Could not get Telegram URL');
    const tgRes = await fetch(tgUrl, { headers: { Range: `bytes=${start}-${end}` } });
    if (!tgRes.ok) throw new Error(`Telegram fetch failed: ${tgRes.status}`);
    if (!tgRes.body) throw new Error('Telegram body is null');
    return tgRes.body;
  }

  // Chunked: stream only overlapping pieces across chunks
  const sorted = [...meta.chunks].sort((a: any, b: any) => a.index - b.index);
  let pos = 0;
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  (async () => {
    try {
      for (const chunk of sorted) {
        const size = Number(chunk.size ?? 0);
        const chunkStart = pos;
        const chunkEnd = pos + size - 1;
        pos += size;

        if (chunkEnd < start || chunkStart > end) continue;

        const tgUrl = await getTgUrl(chunk.file_id);
        if (!tgUrl) throw new Error('Could not get Telegram URL');

        const overlapStart = Math.max(start, chunkStart) - chunkStart;
        const overlapEnd = Math.min(end, chunkEnd) - chunkStart;

        const tgRes = await fetch(tgUrl, { headers: { Range: `bytes=${overlapStart}-${overlapEnd}` } });
        if (!tgRes.ok) throw new Error(`Telegram fetch failed: ${tgRes.status}`);
        await pumpToWriter(tgRes.body, writer);
      }
    } catch {
      // If upstream fails mid-stream, close; client will see truncated transfer.
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  return readable;
}

async function streamFileAll(file: any): Promise<ReadableStream<Uint8Array>> {
  const meta = await fetchMeta(file.metaFileId);

  // Non-chunked: proxy telegram stream directly
  if (!meta.chunked || !Array.isArray(meta.chunks)) {
    const tgUrl = await getTgUrl(meta.telegramFileId);
    if (!tgUrl) throw new Error('Could not get Telegram URL');
    const tgRes = await fetch(tgUrl);
    if (!tgRes.ok) throw new Error(`Telegram fetch failed: ${tgRes.status}`);
    if (!tgRes.body) throw new Error('Telegram body is null');
    return tgRes.body;
  }

  // Chunked: stream chunks sequentially
  const sorted = [...meta.chunks].sort((a: any, b: any) => a.index - b.index);
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  (async () => {
    try {
      for (const c of sorted) {
        const tgUrl = await getTgUrl(c.file_id);
        if (!tgUrl) throw new Error('Could not get Telegram URL');
        const tgRes = await fetch(tgUrl);
        if (!tgRes.ok) throw new Error(`Telegram fetch failed: ${tgRes.status}`);
        await pumpToWriter(tgRes.body, writer);
      }
    } catch {
      // same rationale as above
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  return readable;
}

// ── WebDAV handlers ───────────────────────────────────────────────────────────
async function handleOptions() {
  return new Response(null, {
    status: 200,
    headers: {
      'DAV': '1, 2',
      'Allow': 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, MKCOL, MOVE, COPY',
      'MS-Author-Via': 'DAV',
    },
  });
}

async function handlePropfind(request: Request, url: URL, registry: Record<string, any>) {
  const depth = request.headers.get('Depth') ?? '1';
  // IMPORTANT: use encoded path for strict clients (CrossFTP, etc.)
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const { folderPath, fileName } = parsePath(url);

  const responses: string[] = [];

  // Root or folder listing
  if (!fileName) {
    const folder = findFolder(folderPath, registry);
    // Use the registry key as folderId for child lookups
    const folderId = folder?._regKey ?? folder?.folderId ?? null;

    // Self entry
    responses.push(propResponse(
      ensureTrailingSlash(encodeDavPathSegments(pathname)),
      true,
      folderPath ? folderPath.split('/').pop()! : 'Cloud',
      0,
      folder?.createdAt ?? new Date().toISOString(),
    ));

    if (depth !== '0') {
      // Subfolders
      for (const sf of subfoldersOf(folderId, registry)) {
        const sfPath = ensureTrailingSlash(`${pathname}/${sf.name}`.replace(/\/+/g, '/'));
        responses.push(
          propResponse(
            ensureTrailingSlash(encodeDavPathSegments(sfPath)),
            true,
            sf.name,
            0,
            sf.createdAt ?? new Date().toISOString()
          )
        );
      }
      // Files
      for (const f of filesInFolder(folderId, registry)) {
        const fPath = `${pathname}/${(f as any).fileName}`.replace(/\/+/g, '/');
        responses.push(
          propResponse(
            encodeDavPathSegments(fPath),
            false,
            (f as any).fileName,
            (f as any).totalBytes ?? 0,
            (f as any).time ?? new Date().toISOString()
          )
        );
      }
    }
  } else {
    // Single file
    const folder = findFolder(folderPath, registry);
    const folderId = folder?._regKey ?? null;
    const file = filesInFolder(folderId, registry).find((f: any) => f.fileName === fileName);
    if (!file) return new Response('Not Found', { status: 404 });
    responses.push(
      propResponse(
        encodeDavPathSegments(pathname),
        false,
        (file as any).fileName,
        (file as any).totalBytes ?? 0,
        (file as any).time ?? new Date().toISOString()
      )
    );
  }

  return new Response(multistatus(responses), {
    status: 207,
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'DAV': '1, 2' },
  });
}

async function handleGet(request: Request, url: URL, registry: Record<string, any>) {
  const { folderPath, fileName } = parsePath(url);
  if (!fileName) return new Response('Is a directory', { status: 400 });

  const folder = findFolder(folderPath, registry);
  const folderId = folder?._regKey ?? null;
  const file = filesInFolder(folderId, registry).find((f: any) => f.fileName === fileName) as any;
  if (!file) return new Response('Not Found', { status: 404 });

  // Some older entries may not have totalBytes/type in the registry; derive from meta so
  // strict media clients can seek (needs Content-Length + Range).
  let totalBytes = Number(file.totalBytes ?? 0);
  let contentType = file.type ?? 'application/octet-stream';
  if ((!totalBytes || totalBytes <= 0) && file.metaFileId) {
    try {
      const meta = await fetchMeta(file.metaFileId);
      if (meta && typeof meta.totalBytes === 'number') totalBytes = meta.totalBytes;
      if (meta && typeof meta.type === 'string') contentType = meta.type;
    } catch {
      // Best-effort; continue without length if meta can't be fetched.
    }
  }
  const rangeHeader = request.headers.get('Range');

  if (rangeHeader && totalBytes > 0) {
    const range = parseRange(rangeHeader, totalBytes);
    if (!range) {
      return new Response('Requested Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${totalBytes}` }
      });
    }

    const { start, end } = range;
    const body = await streamFileRange(file, start, end);
    return new Response(body, {
      status: 206,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${totalBytes}`,
        'Accept-Ranges': 'bytes',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      },
    });
  }

  const body = await streamFileAll(file);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      ...(totalBytes > 0 ? { 'Content-Length': String(totalBytes) } : {}),
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    },
  });
}

async function handleHead(url: URL, registry: Record<string, any>) {
  const { folderPath, fileName } = parsePath(url);
  if (!fileName) return new Response('Is a directory', { status: 400 });

  const folder = findFolder(folderPath, registry);
  const folderId = folder?._regKey ?? null;
  const file = filesInFolder(folderId, registry).find((f: any) => f.fileName === fileName) as any;
  if (!file) return new Response('Not Found', { status: 404 });

  let totalBytes = Number(file.totalBytes ?? 0);
  let contentType = file.type ?? 'application/octet-stream';
  if ((!totalBytes || totalBytes <= 0) && file.metaFileId) {
    try {
      const meta = await fetchMeta(file.metaFileId);
      if (meta && typeof meta.totalBytes === 'number') totalBytes = meta.totalBytes;
      if (meta && typeof meta.type === 'string') contentType = meta.type;
    } catch {
      // Best-effort
    }
  }
  return new Response(null, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(totalBytes),
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    },
  });
}

async function handlePut(request: Request, url: URL, registry: Record<string, any>, apiKey: string) {
  const { folderPath, fileName: originalFileName } = parsePath(url);
  if (!originalFileName) return new Response('Cannot PUT a directory', { status: 405 });

  const folder = findFolder(folderPath, registry);
  if (!folder && folderPath) return new Response('Parent folder not found', { status: 409 });

  const folderId = folder?._regKey ?? null;

  const existingFileNames = new Set<string>();
  for (const [k, v] of Object.entries(registry)) {
    if (!(v as any)._type && ((v as any).folderId ?? null) === folderId) {
      existingFileNames.add((v as any).fileName);
    }
  }

  const fileName = uniqueFileName(originalFileName, existingFileNames);

  const ct = request.headers.get('Content-Type') ?? 'application/octet-stream';
  const CHUNK = TG_SAFE_CHUNK_BYTES;
  const chunks: any[] = [];
  let total = 0;
  let i = 0;

  // Stream upload: do not buffer the entire file in memory.
  if (!request.body) return new Response('Missing request body', { status: 400 });
  const reader = request.body.getReader();
  let pending = new Uint8Array(0);

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value || value.length === 0) continue;

    // Append to pending buffer
    const merged = new Uint8Array(pending.length + value.length);
    merged.set(pending, 0);
    merged.set(value, pending.length);
    pending = merged;

    // Flush full chunks
    while (pending.length >= CHUNK) {
      const slice = pending.slice(0, CHUNK);
      pending = pending.slice(CHUNK);
      const { file_id, message_id } = await uploadBytesToTelegram(slice, `${fileName}.chunk${i}`);
      chunks.push({ index: i, file_id, message_id, size: slice.length });
      total += slice.length;
      i++;
    }
  }

  // Flush final partial chunk (including empty file => upload 0 bytes)
  if (pending.length > 0 || chunks.length === 0) {
    const slice = pending;
    const { file_id, message_id } = await uploadBytesToTelegram(slice, `${fileName}.chunk${i}`);
    chunks.push({ index: i, file_id, message_id, size: slice.length });
    total += slice.length;
  }

  const meta = {
    fileName, type: ct, totalBytes: total,
    time: new Date().toISOString(),
    chunked: chunks.length > 1,
    ...(chunks.length > 1 ? { chunks } : { telegramFileId: chunks[0].file_id }),
  };
  const metaBuf = Buffer.from(JSON.stringify(meta));
  const { file_id: metaFileId } = await uploadBytesToTelegram(metaBuf, `${fileName}.meta.json`);

  const rec: any = {
    metaFileId, fileName, type: ct,
    totalBytes: total, time: meta.time,
    ...(folderId ? { folderId } : {}),
  };
  registry[metaFileId] = rec;
  await writeRegistry(registry);

  return new Response(null, { status: 201 });
}

async function handleDelete(url: URL, registry: Record<string, any>) {
  const { folderPath, fileName } = parsePath(url);

  if (fileName) {
    // Delete file
    const folder = findFolder(folderPath, registry);
    const folderId = folder?._regKey ?? null;
    let deleted = false;
    for (const [k, v] of Object.entries(registry)) {
      if (!(v as any)._type && (v as any).fileName === fileName &&
        ((v as any).folderId ?? null) === folderId) {
        await deleteFile(k).catch(() => { delete registry[k]; });
        deleted = true;
        break;
      }
    }
    if (!deleted) return new Response('Not Found', { status: 404 });
  } else if (folderPath) {
    // Delete folder recursively
    const folder = findFolder(folderPath, registry);
    if (!folder) return new Response('Not Found', { status: 404 });
    const targetId = folder._regKey ?? folder.folderId;

    // Gather all descendant folder IDs
    const folderIds = new Set<string | null>([targetId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const v of Object.values(registry) as any[]) {
        if (v._type === 'folder' && folderIds.has(v.parentId) && !folderIds.has(v.folderId)) {
          folderIds.add(v.folderId); changed = true;
        }
      }
    }
    // Delete all files in those folders
    for (const [k, v] of Object.entries(registry) as any[]) {
      if (!v._type && folderIds.has(v.folderId ?? null)) {
        await deleteFile(k).catch(() => { delete registry[k]; });
      }
    }
    // Delete folder records
    for (const [k, v] of Object.entries(registry) as any[]) {
      if (v._type === 'folder' && folderIds.has(v.folderId)) delete registry[k];
    }
  } else {
    return new Response('Cannot delete root', { status: 405 });
  }

  await writeRegistry(registry);
  return new Response(null, { status: 204 });
}

async function handleMkcol(url: URL, registry: Record<string, any>) {
  const { folderPath } = parsePath(url);
  if (!folderPath) return new Response('Cannot create root', { status: 405 });
  const parts = folderPath.split('/');
  const name = parts.pop()!;
  const parentPath = parts.join('/');
  const parent = findFolder(parentPath, registry);
  if (!parent && parentPath) return new Response('Parent not found', { status: 409 });

  const parentId = parent?._regKey ?? null;

  const existingNames = new Set<string>();
  for (const [key, item] of Object.entries(registry)) {
    if ((item as any)._type === 'folder' && ((item as any).parentId ?? null) === parentId) {
      existingNames.add((item as any).name);
    }
  }

  const finalName = uniqueName(name, existingNames);

  const folderId = 'folder:' + crypto.randomUUID();
  registry[folderId] = {
    _type: 'folder', folderId, name: finalName,
    createdAt: new Date().toISOString(),
    ...(parent?._regKey ? { parentId: parent._regKey } : {}),
  };
  await writeRegistry(registry);
  return new Response(null, { status: 201 });
}

function destFromHeader(request: Request): { folderPath: string; fileName: string | null } {
  const raw = decodeURIComponent(
    (request.headers.get('Destination') ?? '')
      .replace(/^https?:\/\/[^/]+/, '')
  );
  return parsePath(new URL('https://x' + raw));
}

async function handleMove(request: Request, url: URL, registry: Record<string, any>) {
  const src = parsePath(url);
  const dest = destFromHeader(request);

  if (src.fileName) {
    const srcFolder = findFolder(src.folderPath, registry);
    const srcFolderId = srcFolder?._regKey ?? null;
    // Find registry key of file directly — don't use object reference
    const fileKey = Object.keys(registry).find(k => {
      const v = registry[k];
      return !v._type && v.fileName === src.fileName && (v.folderId ?? null) === srcFolderId;
    });
    if (!fileKey) return new Response('Not Found', { status: 404 });

    const destFolder = findFolder(dest.folderPath, registry);
    if (dest.folderPath && !destFolder) return new Response('Destination folder not found', { status: 409 });

    registry[fileKey].fileName = dest.fileName ?? src.fileName;
    if (destFolder?._regKey) registry[fileKey].folderId = destFolder._regKey;
    else delete registry[fileKey].folderId;
  } else if (src.folderPath) {
    const folder = findFolder(src.folderPath, registry);
    if (!folder?._regKey) return new Response('Not Found', { status: 404 });

    const newName = dest.fileName ?? dest.folderPath.split('/').pop() ?? folder.name;
    const destParentPath = dest.folderPath || '';
    const destParent = destParentPath ? findFolder(destParentPath, registry) : null;

    registry[folder._regKey].name = newName;
    if (destParent?._regKey) registry[folder._regKey].parentId = destParent._regKey;
    else if (!destParentPath) delete registry[folder._regKey].parentId;
  } else {
    return new Response('Cannot move root', { status: 405 });
  }

  await writeRegistry(registry);
  return new Response(null, { status: 201 });
}

async function handleCopy(request: Request, url: URL, registry: Record<string, any>) {
  const src = parsePath(url);
  const dest = destFromHeader(request);

  if (!src.fileName) return new Response('Folder copy not supported', { status: 405 });

  const srcFolder = findFolder(src.folderPath, registry);
  const file = filesInFolder(srcFolder?._regKey ?? null, registry)
    .find((f: any) => f.fileName === src.fileName) as any;
  if (!file) return new Response('Not Found', { status: 404 });

  const destFolder = findFolder(dest.folderPath, registry);
  if (dest.folderPath && !destFolder) return new Response('Destination not found', { status: 409 });

  // Copy = new registry entry pointing to same metaFileId (same Telegram files)
  const newKey: string = 'copy:' + crypto.randomUUID();
  registry[newKey] = {
    ...file,
    fileName: dest.fileName ?? file.fileName,
    time: new Date().toISOString(),
    ...(destFolder?._regKey ? { folderId: destFolder._regKey } : {}),
  };
  if (!destFolder?.folderId) delete registry[newKey].folderId;

  await writeRegistry(registry);
  return new Response(null, { status: 201 });
}

async function handleLock(url: URL) {
  const lockToken = `opaquelocktoken:${crypto.randomUUID()}`;
  const href = xmlEscape(encodeDavPathSegments(url.pathname));
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:prop xmlns:D="DAV:">
  <D:lockdiscovery>
    <D:activelock>
      <D:locktype><D:write/></D:locktype>
      <D:lockscope><D:exclusive/></D:lockscope>
      <D:depth>0</D:depth>
      <D:timeout>Second-3600</D:timeout>
      <D:locktoken><D:href>${lockToken}</D:href></D:locktoken>
      <D:lockroot><D:href>${href}</D:href></D:lockroot>
    </D:activelock>
  </D:lockdiscovery>
</D:prop>`;
  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Lock-Token': `<${lockToken}>`,
    },
  });
}

// ── SvelteKit hook ────────────────────────────────────────────────────────────
export const handle: Handle = async ({ event, resolve }) => {
  const { request } = event;
  const method = request.method.toUpperCase();
  const url = new URL(request.url);

  // Skip WebDAV handling for API routes and assets
  const path = url.pathname;
  if (path.startsWith('/api/') || path.startsWith('/_app/') || path.startsWith('/favicon')) {
    return resolve(event);
  }

  // Handle WebDAV methods
  const isWebDAV = DAV_METHODS.has(method) || method === 'PUT' || method === 'DELETE';
  // Intercept GET/HEAD only if it looks like a WebDAV file request (has auth header)
  const isWebDAVGet = (method === 'GET' || method === 'HEAD') &&
    request.headers.has('Authorization') &&
    request.headers.get('Authorization')!.startsWith('Basic ');

  if (!isWebDAV && !isWebDAVGet) {
    return resolve(event);
  }

  // Auth
  const auth = await davAuth(request);
  if (!auth) return unauth();

  const registry = await readRegistry() as Record<string, any>;

  if (method === 'OPTIONS') return handleOptions();
  if (method === 'PROPFIND') return handlePropfind(request, url, registry);
  if (method === 'GET') return handleGet(request, url, registry);
  if (method === 'HEAD') return handleHead(url, registry);
  if (method === 'PUT') return handlePut(request, url, registry, auth.apiKey);
  if (method === 'DELETE') return handleDelete(url, registry);
  if (method === 'MKCOL') return handleMkcol(url, registry);
  if (method === 'MOVE') return handleMove(request, url, registry);
  if (method === 'COPY') return handleCopy(request, url, registry);
  if (method === 'LOCK') return handleLock(url);
  if (method === 'UNLOCK') return new Response(null, { status: 204 });
  if (method === 'PROPPATCH') return new Response(multistatus([]), { status: 207, headers: { 'Content-Type': 'application/xml' } });

  return new Response('Not Implemented', { status: 501 });
};