// src/routes/api/telegram/uploadChunk/+server.ts
import type { RequestHandler } from './$types';
import { getRecordByApiKey, uploadBytesToTelegram } from '$lib/telegramStorage';
import { TG_SAFE_CHUNK_BYTES } from '$lib/telegramLimits';

export const POST: RequestHandler = async ({ request, url }) => {
  try {
    const apiKey = (request.headers.get('x-api-key') ?? url.searchParams.get('api_key') ?? '').trim();
    const chunkIndex = request.headers.get('x-chunk-index') ?? '0';
    const originalName = decodeURIComponent(request.headers.get('x-file-name') ?? 'chunk');

    if (!apiKey)
      return new Response(JSON.stringify({ error: 'Missing X-Api-Key' }), { status: 403 });

    const rec = await getRecordByApiKey(apiKey);
    if (!rec)
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

    const contentType = request.headers.get('content-type') ?? '';
    let fileData: Uint8Array;
    let filename: string;

    if (contentType.includes('multipart/form-data')) {
      const arr = await request.arrayBuffer();
      const buf = new Uint8Array(arr);
      const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
      if (!boundary) return new Response(JSON.stringify({ error: 'No boundary' }), { status: 400 });
      const bnd = boundary[1] ?? boundary[2];
      const delim = Buffer.from(`\r\n--${bnd}`);
      const first = Buffer.from(`--${bnd}`);
      const body = Buffer.from(buf);
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
        filename = cdMatch[2];
        found = true;
        break;
      }
      if (!found) return new Response(JSON.stringify({ error: 'No file part' }), { status: 400 });
    } else {
      fileData = new Uint8Array(await request.arrayBuffer());
      filename = originalName;
    }

    if (fileData!.length > TG_SAFE_CHUNK_BYTES) {
      return new Response(JSON.stringify({
        error: `Chunk too large (${fileData!.length} bytes). Max is ${TG_SAFE_CHUNK_BYTES} bytes (18MiB).`
      }), { status: 413 });
    }

    const chunkName = `${originalName}.chunk${chunkIndex}`;
    const { message_id, file_id } = await uploadBytesToTelegram(fileData!, chunkName);

    return new Response(JSON.stringify({ message_id, file_id, index: parseInt(chunkIndex), size: fileData!.length }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('uploadChunk error:', err?.message || err);
    return new Response(JSON.stringify({ error: err?.message || 'Internal error' }), { status: 500 });
  }
};
