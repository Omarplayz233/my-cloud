// src/routes/api/telegram/uploadFile/+server.ts
import type { RequestHandler } from './$types';
import { getRecordByApiKey, uploadBytesToTelegram, uploadJsonToTelegram, registerFile } from '$lib/telegramStorage';
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
    if (!cdMatch) continue;
    const filename = cdMatch[2];
    if (!filename) continue;
    const ctMatch = headerStr.match(/Content-Type\s*:\s*([^\r\n]+)/i);
    return { fieldName: cdMatch[1], filename, contentType: ctMatch?.[1].trim() ?? 'application/octet-stream', data: fileData };
  }
  return null;
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const apiKey = (request.headers.get('x-api-key') ?? '').trim();
    const fileRequestHeader = decodeURIComponent((request.headers.get('x-file-request') ?? '').trim());
    const folderId = (request.headers.get('x-folder-id') ?? '').trim();

    if (!apiKey)
      return new Response(JSON.stringify({ error: 'Missing X-Api-Key' }), { status: 403 });
    if (!fileRequestHeader)
      return new Response(JSON.stringify({ error: 'Missing X-File-Request' }), { status: 400 });

    const rec = await getRecordByApiKey(apiKey);
    if (!rec)
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

    const arr = await request.arrayBuffer();
    const buf = new Uint8Array(arr);
    const contentTypeHeader = request.headers.get('content-type');
    const filePart = extractFileFromMultipart(buf, contentTypeHeader);
    if (!filePart)
      return new Response(JSON.stringify({ error: 'No file part found' }), { status: 400 });

    const safeName = filePart.filename.split('/').pop() || fileRequestHeader || 'upload.bin';
    const time = new Date().toISOString();
    const type = filePart.contentType || contentTypeHeader || 'application/octet-stream';
    const totalBytes = filePart.data.length;

    if (totalBytes === 0) {
      return new Response(JSON.stringify({ error: 'File is empty (0 bytes). Make sure the file has content before uploading.' }), { status: 400 });
    }

    // If this upload is larger than what Telegram Bot API can later download via `getFile`,
    // store it as multiple chunks.
    const nChunks = Math.max(1, Math.ceil(totalBytes / TG_SAFE_CHUNK_BYTES));
    const telegramChunks: { index: number; file_id: string; message_id: number; size: number }[] = [];

    for (let i = 0; i < nChunks; i++) {
      const start = i * TG_SAFE_CHUNK_BYTES;
      const slice = filePart.data.slice(start, Math.min(start + TG_SAFE_CHUNK_BYTES, totalBytes));
      const { message_id, file_id } = await uploadBytesToTelegram(slice, `${safeName}.chunk${i}`);
      telegramChunks.push({ index: i, file_id, message_id, size: slice.length });
    }

    const chunked = telegramChunks.length > 1;
    const meta = {
      fileName: safeName,
      type,
      time,
      totalBytes,
      chunked,
      ...(chunked
        ? { chunks: telegramChunks }
        : { telegramFileId: telegramChunks[0].file_id, telegramMessageId: telegramChunks[0].message_id })
    };

    const { message_id: metaMessageId, file_id: metaFileId } = await uploadJsonToTelegram(meta, `${safeName}.json`);

    await registerFile({
      fileName: safeName,
      type,
      totalBytes,
      time,
      telegramFileId: chunked ? '' : telegramChunks[0].file_id,
      telegramMessageId: telegramChunks[0].message_id,
      metaFileId,
      metaMessageId,
      chunked: chunked || undefined,
      chunkMessageIds: chunked ? telegramChunks.map(c => c.message_id) : undefined,
      folderId: folderId || undefined
    });

    return new Response(
      JSON.stringify({
        success: true,
        metaMessageId,
        metaFileId,
        fileName: safeName,
        chunked,
        ...(chunked ? { chunks: telegramChunks.length } : { fileMessageId: telegramChunks[0].message_id, fileFileId: telegramChunks[0].file_id })
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('uploadFile error:', err?.message || err);
    return new Response(JSON.stringify({ error: err?.message || 'Internal error' }), { status: 500 });
  }
};
