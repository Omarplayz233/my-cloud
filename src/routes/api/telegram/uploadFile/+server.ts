// src/routes/api/telegram/uploadFile/+server.ts
import type { RequestHandler } from './$types';
import { getRecordByApiKey, uploadBytesToTelegram, uploadJsonToTelegram, registerFile } from '$lib/telegramStorage';
import { TG_SAFE_CHUNK_BYTES } from '$lib/telegramLimits';

export const POST: RequestHandler = async ({ request, url }) => {
  try {
    const apiKey = (request.headers.get('x-api-key') ?? url.searchParams.get('api_key') ?? '').trim();
    const fileRequestHeader = decodeURIComponent((request.headers.get('x-file-request') ?? '').trim());
    const folderId = (request.headers.get('x-folder-id') ?? '').trim();

    if (!apiKey)
      return new Response(JSON.stringify({ error: 'Missing X-Api-Key' }), { status: 403 });
    if (!fileRequestHeader)
      return new Response(JSON.stringify({ error: 'Missing X-File-Request' }), { status: 400 });

    const rec = await getRecordByApiKey(apiKey);
    if (!rec)
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

    const contentType = request.headers.get('content-type') ?? '';
    let fileData: Uint8Array;
    let safeName: string;
    let mimeType: string;

    if (contentType.includes('multipart/form-data')) {
      const arr = await request.arrayBuffer();
      const buf = new Uint8Array(arr);
      const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
      if (!boundary) return new Response(JSON.stringify({ error: 'No boundary' }), { status: 400 });
      const bnd = boundary[1] ?? boundary[2];
      const body = Buffer.from(buf);
      const delim = Buffer.from(`\r\n--${bnd}`);
      const first = Buffer.from(`--${bnd}`);
      const positions: number[] = [];
      let pos = body.indexOf(first);
      if (pos === -1) return new Response(JSON.stringify({ error: 'No boundary found' }), { status: 400 });
      positions.push(pos);
      pos = body.indexOf(delim, pos + first.length);
      while (pos !== -1) { positions.push(pos + 2); pos = body.indexOf(delim, pos + delim.length); }
      let found = false;
      for (let i = 0; i < positions.length - 1; i++) {
        const partStart = positions[i] + `--${bnd}`.length + 2;
        const partEnd = positions[i + 1] - 2;
        const part = body.slice(partStart, partEnd);
        const headerEndIdx = part.indexOf('\r\n\r\n');
        if (headerEndIdx === -1) continue;
        const headerStr = part.slice(0, headerEndIdx).toString('utf8');
        const cdMatch = headerStr.match(/name="([^"]*)"(?:.*filename="([^"]*)")?/i);
        if (!cdMatch || !cdMatch[2]) continue;
        fileData = part.slice(headerEndIdx + 4);
        const ctMatch = headerStr.match(/Content-Type\s*:\s*([^\r\n]+)/i);
        mimeType = ctMatch?.[1]?.trim() ?? 'application/octet-stream';
        safeName = cdMatch[2].split('/').pop() || fileRequestHeader || 'upload.bin';
        found = true;
        break;
      }
      if (!found) return new Response(JSON.stringify({ error: 'No file part' }), { status: 400 });
    } else {
      fileData = new Uint8Array(await request.arrayBuffer());
      mimeType = contentType || 'application/octet-stream';
      safeName = fileRequestHeader || 'upload.bin';
    }

    const time = new Date().toISOString();
    const totalBytes = fileData!.length;

    if (totalBytes === 0) {
      return new Response(JSON.stringify({ error: 'File is empty (0 bytes).' }), { status: 400 });
    }

    const nChunks = Math.max(1, Math.ceil(totalBytes / TG_SAFE_CHUNK_BYTES));
    const telegramChunks: { index: number; file_id: string; message_id: number; size: number }[] = [];

    for (let i = 0; i < nChunks; i++) {
      const start = i * TG_SAFE_CHUNK_BYTES;
      const slice = fileData!.slice(start, Math.min(start + TG_SAFE_CHUNK_BYTES, totalBytes));
      const { message_id, file_id } = await uploadBytesToTelegram(slice, `${safeName}.chunk${i}`);
      telegramChunks.push({ index: i, file_id, message_id, size: slice.length });
    }

    const chunked = telegramChunks.length > 1;
    const meta = {
      fileName: safeName,
      type: mimeType,
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
      type: mimeType,
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
