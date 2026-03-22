// src/routes/api/telegram/finalizeUpload/+server.ts
import type { RequestHandler } from './$types';
import { getRecordByApiKey, uploadJsonToTelegram, registerFile } from '$lib/telegramStorage';
import { TG_SAFE_CHUNK_BYTES } from '$lib/telegramLimits';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const apiKey = (request.headers.get('x-api-key') ?? '').trim();
    if (!apiKey)
      return new Response(JSON.stringify({ error: 'Missing X-Api-Key' }), { status: 403 });

    const rec = await getRecordByApiKey(apiKey);
    if (!rec)
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

    const body = await request.json() as {
      fileName: string;
      type: string;
      totalBytes: number;
      chunks: { index: number; file_id: string; message_id: number; size: number }[];
      folderId?: string;
    };

    const { fileName, type, totalBytes, chunks, folderId } = body;
    const time = new Date().toISOString();
    const chunked = chunks.length > 1;

    if (!chunks.length) {
      return new Response(JSON.stringify({ error: 'No chunks provided' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!chunked && (chunks[0]?.size ?? 0) > TG_SAFE_CHUNK_BYTES) {
      return new Response(JSON.stringify({
        error: `Upload produced a single chunk larger than ${TG_SAFE_CHUNK_BYTES} bytes (18MiB). This will not be downloadable via Telegram Bot API. Please re-upload using smaller chunks.`
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const meta = {
      fileName,
      type,
      time,
      totalBytes,
      chunked,
      ...(chunked ? {
        chunks: chunks.sort((a, b) => a.index - b.index)
      } : {
        telegramFileId: chunks[0].file_id,
        telegramMessageId: chunks[0].message_id
      })
    };

    const { message_id: metaMessageId, file_id: metaFileId } = await uploadJsonToTelegram(meta, `${fileName}.json`);

    const sorted = [...chunks].sort((a, b) => a.index - b.index);
    await registerFile({
      fileName,
      type,
      totalBytes,
      time,
      telegramFileId: chunked ? '' : sorted[0].file_id,
      telegramMessageId: sorted[0].message_id,
      metaFileId,
      metaMessageId,
      chunked: chunked || undefined,
      chunkMessageIds: chunked ? sorted.map(c => c.message_id) : undefined,
      folderId: folderId || undefined
    });

    return new Response(JSON.stringify({ success: true, metaFileId, metaMessageId, fileName }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('finalizeUpload error:', err?.message || err);
    return new Response(JSON.stringify({ error: err?.message || 'Internal error' }), { status: 500 });
  }
};
