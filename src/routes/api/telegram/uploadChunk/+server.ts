// src/routes/api/telegram/uploadChunk/+server.ts
import type { RequestHandler } from './$types';
import { getRecordByApiKey, uploadBytesToTelegram } from '$lib/telegramStorage';
import { TG_SAFE_CHUNK_BYTES } from '$lib/telegramLimits';

function parseBoundary(contentType: string | null): string | null {
  if (!contentType) return null;
  const m = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return m ? (m[1] ?? m[2]).trim() : null;
}

function extractFileFromMultipart(body: Uint8Array, contentTypeHeader: string | null) {
  const boundary = parseBoundary(contentTypeHeader);
  if (!boundary) throw new Error('No multipart boundary found in Content-Type');
  const buf = Buffer.from(body);
  const delimBuf = Buffer.from(`\r\n--${boundary}`);
  const firstDelim = Buffer.from(`--${boundary}`);
  const positions: number[] = [];
  let pos = buf.indexOf(firstDelim);
  if (pos === -1) throw new Error('No boundary found in body');
  positions.push(pos);
  pos = buf.indexOf(delimBuf, pos + firstDelim.length);
  while (pos !== -1) {
    positions.push(pos + 2);
    pos = buf.indexOf(delimBuf, pos + delimBuf.length);
  }
  for (let i = 0; i < positions.length - 1; i++) {
    const partStart = positions[i] + `--${boundary}`.length + 2;
    const partEnd = positions[i + 1] - 2;
    const part = buf.slice(partStart, partEnd);
    const headerEndIdx = part.indexOf('\r\n\r\n');
    if (headerEndIdx === -1) continue;
    const headerStr = part.slice(0, headerEndIdx).toString('utf8');
    const fileData = part.slice(headerEndIdx + 4);
    const cdMatch = headerStr.match(/Content-Disposition\s*:[^\r\n]*;\s*name="([^"]*)"(?:[^\r\n]*;\s*filename="([^"]*)")?/i);
    if (!cdMatch || !cdMatch[2]) continue;
    const ctMatch = headerStr.match(/Content-Type\s*:\s*([^\r\n]+)/i);
    return { filename: cdMatch[2], contentType: ctMatch?.[1].trim() ?? 'application/octet-stream', data: fileData };
  }
  return null;
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const apiKey = (request.headers.get('x-api-key') ?? '').trim();
    const chunkIndex = request.headers.get('x-chunk-index') ?? '0';
    const originalName = decodeURIComponent(request.headers.get('x-file-name') ?? 'chunk');

    if (!apiKey)
      return new Response(JSON.stringify({ error: 'Missing X-Api-Key' }), { status: 403 });

    const rec = await getRecordByApiKey(apiKey);
    if (!rec)
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

    const arr = await request.arrayBuffer();
    const buf = new Uint8Array(arr);
    const contentTypeHeader = request.headers.get('content-type');
    const filePart = extractFileFromMultipart(buf, contentTypeHeader);
    if (!filePart)
      return new Response(JSON.stringify({ error: 'No file part found' }), { status: 400 });

    if (filePart.data.length > TG_SAFE_CHUNK_BYTES) {
      return new Response(JSON.stringify({
        error: `Chunk too large (${filePart.data.length} bytes). Max is ${TG_SAFE_CHUNK_BYTES} bytes (18MiB) to avoid Telegram "file is too big".`
      }), { status: 413, headers: { 'Content-Type': 'application/json' } });
    }

    const chunkName = `${originalName}.chunk${chunkIndex}`;
    const { message_id, file_id } = await uploadBytesToTelegram(filePart.data, chunkName);

    return new Response(JSON.stringify({ message_id, file_id, index: parseInt(chunkIndex), size: filePart.data.length }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('uploadChunk error:', err?.message || err);
    return new Response(JSON.stringify({ error: err?.message || 'Internal error' }), { status: 500 });
  }
};
