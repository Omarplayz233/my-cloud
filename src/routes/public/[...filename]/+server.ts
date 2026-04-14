import type { RequestHandler } from './$types';
import { getPublicFileByPath, getPublicFolderByPath } from '$lib/telegramStorage';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELE_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mov': return 'video/quicktime';
    case 'mkv': return 'video/x-matroska';
    case 'mp3': return 'audio/mpeg';
    case 'wav': return 'audio/wav';
    case 'pdf': return 'application/pdf';
    default: return 'application/octet-stream';
  }
}

async function getTgUrl(fileId: string): Promise<string | null> {
  try {
    const r = await fetch(`${TELE_API}/getFile?file_id=${fileId}`);
    const j = await r.json();
    if (!j?.ok) return null;
    return `https://api.telegram.org/file/bot${BOT_TOKEN}/${j.result.file_path}`;
  } catch {
    return null;
  }
}

function parseRange(range: string | null, size: number) {
  if (!range?.startsWith('bytes=')) return null;

  const [startStr, endStr] = range.replace('bytes=', '').split('-');
  let start = startStr ? Number(startStr) : 0;
  let end = endStr ? Number(endStr) : size - 1;

  if (isNaN(start)) start = 0;
  if (isNaN(end)) end = size - 1;

  if (start > end || start >= size) return null;

  return { start, end };
}

export const GET: RequestHandler = async ({ params, request }) => {
  const { filename } = params;

  const folder = await getPublicFolderByPath(filename);
  if (folder) {
    return new Response(null, {
      status: 302,
      headers: { Location: `/public/folder/${filename}` }
    });
  }

  const file = await getPublicFileByPath(filename);
  if (!file) return new Response('Not found', { status: 404 });

  const metaRes = await fetch(`${TELE_API}/getFile?file_id=${file.metaFileId}`);
  const metaJson = await metaRes.json();
  if (!metaJson?.ok) return new Response('Meta fail', { status: 500 });

  const metaUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${metaJson.result.file_path}`;
  const meta = await (await fetch(metaUrl)).json();

  const type = file.type || mimeFromName(file.fileName);
  const size = meta.totalBytes || file.totalBytes || 0;

  const rangeHeader = request.headers.get('range');
  const range = parseRange(rangeHeader, size);

  const headers = new Headers({
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  });

  // ---------------- NON-CHUNKED ----------------
  if (!meta.chunked) {
    const tgUrl = await getTgUrl(meta.telegramFileId || file.telegramFileId);
    if (!tgUrl) return new Response('No file url', { status: 500 });

    const res = await fetch(tgUrl, {
      headers: range
        ? { Range: `bytes=${range.start}-${range.end}` }
        : {}
    });

    if (range && res.status === 206) {
      headers.set('Content-Range', res.headers.get('Content-Range') || '');
      headers.set('Content-Length', String(range.end - range.start + 1));
      return new Response(res.body, { status: 206, headers });
    }

    if (size) headers.set('Content-Length', String(size));
    return new Response(res.body, { status: 200, headers });
  }

  // ---------------- CHUNKED SEEKING ----------------
  const chunks = [...meta.chunks].sort((a: any, b: any) => a.index - b.index);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let offset = 0;

        for (const chunk of chunks) {
          const chunkSize = chunk.size || 0;
          const start = offset;
          const end = offset + chunkSize - 1;

          offset += chunkSize;

          // skip chunks outside range
          if (range && end < range.start) continue;
          if (range && start > range.end) break;

          const url = await getTgUrl(chunk.file_id);
          if (!url) throw new Error('chunk url fail');

          const res = await fetch(url, {
            headers: range
              ? {
                  Range: `bytes=${
                    Math.max(0, (range.start ?? 0) - start)
                  }-${Math.min(
                    chunkSize - 1,
                    (range.end ?? chunkSize - 1) - start
                  )}`
                }
              : {}
          });

          if (!res.body) throw new Error('chunk body missing');

          const reader = res.body.getReader();

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        }

        controller.close();
      } catch (e) {
        controller.error(e);
      }
    }
  });

  if (range) {
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    headers.set('Content-Length', String(range.end - range.start + 1));
    return new Response(stream, { status: 206, headers });
  }

  if (size) headers.set('Content-Length', String(size));
  return new Response(stream, { status: 200, headers });
};
