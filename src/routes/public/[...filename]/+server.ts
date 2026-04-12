import type { RequestHandler } from './$types';
import { getPublicFileByPath, getPublicFolderByPath } from '$lib/telegramStorage';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELE_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const EXT_MIME: Record<string, string> = {
  gif: 'image/gif', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  avi: 'video/x-msvideo', m4v: 'video/mp4',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac',
  aac: 'audio/aac', m4a: 'audio/mp4', opus: 'audio/opus',
  pdf: 'application/pdf',
  txt: 'text/plain', html: 'text/html', css: 'text/css', js: 'text/javascript',
};

function mimeFromName(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext ? (EXT_MIME[ext] ?? null) : null;
}

function isPreviewable(type: string): boolean {
  return type.startsWith('image/') ||
    type.startsWith('video/') ||
    type.startsWith('audio/') ||
    type === 'application/pdf' ||
    type.startsWith('text/');
}

async function pumpToWriter(
  body: ReadableStream<Uint8Array> | null,
  writer: WritableStreamDefaultWriter<Uint8Array>
) {
  if (!body) return;
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

export const GET: RequestHandler = async ({ params, request, url }) => {
  const { filename } = params;
  const forceDownload = url.searchParams.get('download') === 'true';

  try {
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

    const fileType =
      file.type !== "application/octet-stream"
        ? file.type
        : mimeFromName(file.fileName) || meta.type || "application/octet-stream";

    const total = file.totalBytes || meta.totalBytes || 0;

    const disposition =
      `${isPreviewable(fileType) && !forceDownload ? 'inline' : 'attachment'}; filename="${file.fileName}"`;

    const rangeHeader = request.headers.get('range');

    const headers = new Headers();
    headers.set('Content-Type', fileType);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Disposition', disposition);
    headers.set('Cache-Control', 'public, max-age=3600');

    // ─────────────────────────────
    // SINGLE FILE (FIXED SEEKING)
    // ─────────────────────────────
    if (!meta.chunked) {
      const tgUrl = await getTgUrl(meta.telegramFileId || file.telegramFileId);
      if (!tgUrl) return new Response('No file url', { status: 500 });

      const tgRes = await fetch(tgUrl, {
        headers: rangeHeader ? { Range: rangeHeader } : {}
      });

      if (rangeHeader && tgRes.status === 206) {
        headers.set('Content-Range', tgRes.headers.get('Content-Range') || '');
        return new Response(tgRes.body, { status: 206, headers });
      }

      if (total) headers.set('Content-Length', String(total));

      return new Response(tgRes.body, { status: 200, headers });
    }

    // ─────────────────────────────
    // CHUNKED FILE (FIXED STREAMING)
    // ─────────────────────────────
    const sorted = [...meta.chunks].sort((a: any, b: any) => a.index - b.index);

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    (async () => {
      for (const chunk of sorted) {
        const tgUrl = await getTgUrl(chunk.file_id);
        if (!tgUrl) break;

        const res = await fetch(tgUrl);
        await pumpToWriter(res.body, writer);
      }
      await writer.close();
    })();

    if (total) headers.set('Content-Length', String(total));

    return new Response(readable, { status: 200, headers });

  } catch (err: any) {
    console.error(err);
    return new Response('Internal error', { status: 500 });
  }
};
