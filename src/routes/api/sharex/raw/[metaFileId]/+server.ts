// src/routes/api/sharex/raw/[metaFileId]/+server.ts
// Serves a public file by metaFileId directly — no path resolution needed.
import type { RequestHandler } from './$types';
import { readRegistry, downloadFileFromTelegram } from '$lib/telegramStorage';
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

function parseRange(header: string, total: number) {
  const m = header.match(/bytes=(\d*)-(\d*)/);
  if (!m) return null;
  const start = m[1] ? parseInt(m[1]) : total - parseInt(m[2]);
  const end   = m[2] ? Math.min(parseInt(m[2]), total - 1) : total - 1;
  return { start, end };
}

export const GET: RequestHandler = async ({ params, request, url }) => {
  const { metaFileId } = params;
  const forceDownload = url.searchParams.get('download') === 'true';

  const registry = await readRegistry() as Record<string, any>;
  const rec = registry[metaFileId];
  if (!rec || !rec.public)
    return new Response(JSON.stringify({ error: 'Not found or not public' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  const meta = await fetchMeta(metaFileId);
  if (!meta)
    return new Response(JSON.stringify({ error: 'Could not fetch metadata' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  let data: Buffer;
  if (meta.chunked && Array.isArray(meta.chunks)) {
    const sorted = [...meta.chunks].sort((a: any, b: any) => a.index - b.index);
    const buffers = await Promise.all(sorted.map((c: any) => downloadFileFromTelegram(c.file_id).then((r: any) => r.data)));
    data = Buffer.concat(buffers);
  } else {
    const result = await downloadFileFromTelegram(meta.telegramFileId);
    data = result.data;
  }

  const inline = (meta.type.startsWith('image/') || meta.type.startsWith('video/') || meta.type.startsWith('audio/') || meta.type === 'application/pdf') && !forceDownload;
  const disposition = `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`;
  const total = data.length;

  const rangeHeader = request.headers.get('range');
  if (rangeHeader) {
    const range = parseRange(rangeHeader, total);
    if (!range || range.start > range.end || range.start >= total)
      return new Response('Range Not Satisfiable', { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
    const chunk = data.slice(range.start, range.end + 1);
    return new Response(chunk, { status: 206, headers: { 'Content-Type': meta.type, 'Content-Disposition': disposition, 'Content-Range': `bytes ${range.start}-${range.end}/${total}`, 'Content-Length': String(chunk.length), 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=3600' } });
  }

  return new Response(data, { status: 200, headers: { 'Content-Type': meta.type, 'Content-Disposition': disposition, 'Content-Length': String(total), 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=3600' } });
};
