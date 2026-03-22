import type { RequestHandler } from './$types';
import { readRegistry } from '$lib/telegramStorage';
import axios from 'axios';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELE_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function fetchMeta(metaFileId: string): Promise<any | null> {
  try {
    const r1 = await axios.get(`${TELE_API}/getFile`, { params: { file_id: metaFileId } });
    if (!r1.data?.ok) return null;
    const r2 = await axios.get(`https://api.telegram.org/file/bot${BOT_TOKEN}/${r1.data.result.file_path}`, { responseType: 'text' });
    return JSON.parse(r2.data);
  } catch { return null; }
}

async function getTelegramUrl(fileId: string): Promise<string | null> {
  try {
    const r = await axios.get(`${TELE_API}/getFile`, { params: { file_id: fileId } });
    if (!r.data?.ok) return null;
    return `https://api.telegram.org/file/bot${BOT_TOKEN}/${r.data.result.file_path}`;
  } catch { return null; }
}

export const GET: RequestHandler = async ({ params, request }) => {
  const registry = await readRegistry() as Record<string, any>;
  const file = Object.values(registry).find(
    (r: any) => !r._type && r.public && r.fileName === params.filename
  ) as any;
  if (!file)
    return new Response(JSON.stringify({ error: 'Not found or not public' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  const meta = await fetchMeta(file.metaFileId);
  if (!meta)
    return new Response(JSON.stringify({ error: 'Could not fetch metadata' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  const cleanHeaders = {
    'Content-Type': meta.type,
    'Cache-Control': 'public, max-age=3600',
    'Accept-Ranges': 'bytes',
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`,
  };

  if (!meta.chunked) {
    const tgUrl = await getTelegramUrl(meta.telegramFileId);
    if (!tgUrl) return new Response(JSON.stringify({ error: 'Could not get file URL' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    const rangeHeader = request.headers.get('range');
    const tgRes = await fetch(tgUrl, rangeHeader ? { headers: { Range: rangeHeader } } : {});
    const headers: Record<string, string> = { ...cleanHeaders };
    if (tgRes.headers.get('content-length')) headers['Content-Length'] = tgRes.headers.get('content-length')!;
    if (tgRes.headers.get('content-range')) headers['Content-Range'] = tgRes.headers.get('content-range')!;
    return new Response(tgRes.body, { status: tgRes.status, headers });
  }

  const sorted = [...meta.chunks].sort((a: any, b: any) => a.index - b.index);
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  (async () => {
    for (const chunk of sorted) {
      const tgUrl = await getTelegramUrl(chunk.file_id);
      if (!tgUrl) { writer.abort(); return; }
      const res = await fetch(tgUrl);
      const reader = res.body!.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
    }
    writer.close();
  })();
  return new Response(readable, { status: 200, headers: { ...cleanHeaders, 'Content-Length': String(meta.totalBytes) } });
};
