// src/routes/api/telegram/downloadFolder/+server.ts
import type { RequestHandler } from './$types';
import { getRecordByApiKey, readRegistry, downloadFileFromTelegram } from '$lib/telegramStorage';
import { zipSync } from 'fflate';
import axios from 'axios';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELE_API  = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function fetchMeta(metaFileId: string): Promise<any | null> {
  try {
    const r1 = await axios.get(`${TELE_API}/getFile`, { params: { file_id: metaFileId } });
    if (!r1.data?.ok) return null;
    const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${r1.data.result.file_path}`;
    const r2  = await axios.get(url, { responseType: 'text' });
    return JSON.parse(r2.data);
  } catch { return null; }
}

async function downloadFile(metaFileId: string): Promise<{ name: string; data: Uint8Array } | null> {
  const meta = await fetchMeta(metaFileId);
  if (!meta) return null;
  let buf: Buffer;
  if (meta.chunked && Array.isArray(meta.chunks)) {
    const sorted = [...meta.chunks].sort((a: any, b: any) => a.index - b.index);
    const parts  = await Promise.all(sorted.map((c: any) =>
      downloadFileFromTelegram(c.file_id).then((r: any) => r.data as Buffer)
    ));
    buf = Buffer.concat(parts);
  } else {
    buf = (await downloadFileFromTelegram(meta.telegramFileId)).data;
  }
  return { name: meta.fileName as string, data: new Uint8Array(buf) };
}

// Collect all file IDs recursively under a folder
function collectFiles(
  folderId: string,
  allFolders: any[],
  allFiles: any[],
  prefix = ''
): { path: string; metaFileId: string }[] {
  const folder = allFolders.find(f => f.folderId === folderId);
  const name   = folder?.name ?? folderId;
  const base   = prefix ? `${prefix}/${name}` : name;

  const result: { path: string; metaFileId: string }[] = [];

  // Direct files
  for (const f of allFiles) {
    if (f.folderId === folderId) {
      result.push({ path: `${base}/${f.fileName}`, metaFileId: f.metaFileId });
    }
  }
  // Sub-folders (recursive)
  for (const sub of allFolders) {
    if (sub.parentId === folderId) {
      result.push(...collectFiles(sub.folderId, allFolders, allFiles, base));
    }
  }
  return result;
}

export const GET: RequestHandler = async ({ request, url }) => {
  const apiKey   = (request.headers.get('x-api-key') ?? url.searchParams.get('api_key') ?? '').trim();
  const folderId = url.searchParams.get('folder_id') ?? '';

  if (!apiKey)   return new Response(JSON.stringify({ error: 'Missing api key' }), { status: 403 });
  const rec = await getRecordByApiKey(apiKey);
  if (!rec)      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  if (!folderId) return new Response(JSON.stringify({ error: 'Missing folder_id' }), { status: 400 });

  try {
    const registry  = await readRegistry() as Record<string, any>;
    const all       = Object.values(registry);
    const allFolders = all.filter((r: any) => r._type === 'folder');
    const allFiles   = all.filter((r: any) => !r._type);

    const folder = allFolders.find((f: any) => f.folderId === folderId);
    if (!folder) return new Response(JSON.stringify({ error: 'Folder not found' }), { status: 404 });

    const entries = collectFiles(folderId, allFolders, allFiles);
    if (entries.length === 0) {
      // Empty folder — return empty zip
      const zip = zipSync({});
      return new Response(zip, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(folder.name)}.zip`,
        }
      });
    }

    // Download all files in parallel (cap at 6 concurrent)
    const results: Record<string, Uint8Array> = {};
    const chunks = [];
    for (let i = 0; i < entries.length; i += 6) chunks.push(entries.slice(i, i + 6));
    for (const chunk of chunks) {
      const downloaded = await Promise.all(chunk.map(e => downloadFile(e.metaFileId)));
      for (let i = 0; i < chunk.length; i++) {
        const d = downloaded[i];
        if (d) results[chunk[i].path] = d.data;
      }
    }

    const zip = zipSync(results, { level: 0 }); // level 0 = store, fast
    return new Response(zip, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(folder.name)}.zip`,
        'Content-Length': String(zip.byteLength),
      }
    });
  } catch (err: any) {
    console.error('downloadFolder error:', err?.message || err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), { status: 500 });
  }
};
