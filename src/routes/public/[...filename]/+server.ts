import type { RequestHandler } from './$types';
import { getPublicFileByPath, getPublicFolderByPath } from '$lib/telegramStorage';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELE_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const EXT_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  pdf: 'application/pdf',
  txt: 'text/plain'
};

function mimeFromName(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext ? EXT_MIME[ext] ?? null : null;
}

async function getTgUrl(fileId: string, retry = 2): Promise<string | null> {
  for (let i = 0; i <= retry; i++) {
    try {
      const r = await fetch(`${TELE_API}/getFile?file_id=${fileId}`);
      const j = await r.json();
      if (j?.ok) {
        return `https://api.telegram.org/file/bot${BOT_TOKEN}/${j.result.file_path}`;
      }
    } catch {}
  }
  return null;
}

export const GET: RequestHandler = async ({ params, request, url }) => {
  const { filename } = params;
  const forceDownload = url.searchParams.get('download') === 'true';

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
    file.type !== 'application/octet-stream'
      ? file.type
      : mimeFromName(file.fileName) || meta.type || 'application/octet-stream';

  const headers = new Headers({
    'Content-Type': fileType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Disposition': `${forceDownload ? 'attachment' : 'inline'}; filename="${file.fileName}"`
  });

  const rangeHeader = request.headers.get('range');

  // ---------------- SINGLE FILE ----------------
  if (!meta.chunked) {
    const tgUrl = await getTgUrl(meta.telegramFileId || file.telegramFileId);
    if (!tgUrl) return new Response('No file url', { status: 500 });

    const tgRes = await fetch(tgUrl, {
      headers: rangeHeader ? { Range: rangeHeader } : {}
    });

    return new Response(tgRes.body, {
      status: tgRes.status,
      headers
    });
  }

  // ---------------- CHUNKED FILE ----------------
  const sorted = [...meta.chunks].sort((a: any, b: any) => a.index - b.index);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for (const chunk of sorted) {
          const tgUrl = await getTgUrl(chunk.file_id);
          if (!tgUrl) {
            controller.error(new Error('Failed to resolve chunk URL'));
            return;
          }

          const res = await fetch(tgUrl);
          if (!res.ok || !res.body) {
            controller.error(new Error('Chunk fetch failed'));
            return;
          }

          const reader = res.body.getReader();
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        }

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    }
  });

  return new Response(stream, { status: 200, headers });
};
