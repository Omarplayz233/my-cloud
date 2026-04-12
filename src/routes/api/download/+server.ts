// src/routes/api/download/+server.ts
import type { RequestHandler } from './$types';
import { getRecordByApiKey, uploadBytesToTelegram, readRegistry, writeRegistry } from '$lib/telegramStorage';
import { decrypt } from '$lib/crypto';
import crypto from 'crypto';
import { TG_SAFE_CHUNK_BYTES } from '$lib/telegramLimits';

const COBALT_API  = 'https://api.cobalt.tools/';
const CHUNK_SIZE  = TG_SAFE_CHUNK_BYTES;

// ── Auth helper ────────────────────────────────────────────────────────────
async function auth(request: Request, cookies: any) {
  const headerKey = (request.headers.get('x-api-key') ?? '').trim();
  if (headerKey) return getRecordByApiKey(headerKey);
  const session = cookies.get('session');
  if (!session) return null;
  const key = decrypt(session);
  if (!key) return null;
  return getRecordByApiKey(key);
}

// ── SSE helper ─────────────────────────────────────────────────────────────
function sseEvent(type: string, payload: object) {
  return `data: ${JSON.stringify({ type, ...payload })}\n\n`;
}

// ── POST /api/download ─────────────────────────────────────────────────────
export const POST: RequestHandler = async ({ request, cookies }) => {
  const rec = await auth(request, cookies);
  if (!rec) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

  const { url, folderId = null, quality = '1080', audioOnly = false } = await request.json();
  if (!url) return new Response(JSON.stringify({ error: 'Missing url' }), { status: 400 });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (type: string, payload: object) =>
        controller.enqueue(enc.encode(sseEvent(type, payload)));

      try {
        // ── 1. Resolve via cobalt ────────────────────────────────────────
        send('status', { message: 'Resolving URL…' });

        const cobaltRes = await fetch(COBALT_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            url,
            videoQuality: quality,
            ...(audioOnly ? { downloadMode: 'audio' } : {}),
          }),
        });

        const cobalt = await cobaltRes.json() as any;

        if (cobalt.status === 'error') {
          send('error', { message: cobalt.error?.code ?? 'Cobalt error' });
          controller.close(); return;
        }

        // cobalt returns status: "redirect" | "tunnel" | "picker"
        let directUrl: string | null = null;
        let filename: string = 'download';

        if (cobalt.status === 'redirect' || cobalt.status === 'tunnel') {
          directUrl = cobalt.url;
          filename  = cobalt.filename ?? 'download';
        } else if (cobalt.status === 'picker') {
          // Multiple streams (e.g. video + audio separate) — take first
          directUrl = cobalt.picker?.[0]?.url ?? null;
          filename  = cobalt.filename ?? 'download';
        }

        if (!directUrl) {
          send('error', { message: 'Could not resolve download URL' });
          controller.close(); return;
        }

        send('status', { message: `Downloading ${filename}…` });

        // ── 2. Fetch the file ────────────────────────────────────────────
        const dlRes = await fetch(directUrl);
        if (!dlRes.ok) {
          send('error', { message: `Fetch failed: ${dlRes.status}` });
          controller.close(); return;
        }

        const contentLength = parseInt(dlRes.headers.get('content-length') ?? '0');
        const contentType   = dlRes.headers.get('content-type') ?? 'application/octet-stream';
        const totalBytes    = contentLength || 0;

        // Read full body (Cloudflare Workers supports streaming but we need chunks by size)
        const arrayBuf = await dlRes.arrayBuffer();
        const fullBuf  = new Uint8Array(arrayBuf);
        const actualBytes = fullBuf.length;

        send('status', { message: 'Uploading to cloud…', totalBytes: actualBytes });

        // ── 3. Upload in chunks ──────────────────────────────────────────
        const totalChunks = Math.max(1, Math.ceil(actualBytes / CHUNK_SIZE));
        const chunks: any[] = [];

        for (let i = 0; i < totalChunks; i++) {
          const start  = i * CHUNK_SIZE;
          const slice  = fullBuf.slice(start, Math.min(start + CHUNK_SIZE, actualBytes));
          const chunkName = `${filename}.chunk${i}`;

          send('progress', { chunk: i + 1, totalChunks, message: `Uploading chunk ${i + 1}/${totalChunks}…` });

          const { message_id, file_id } = await uploadBytesToTelegram(Buffer.from(slice), chunkName);
          chunks.push({ index: i, file_id, message_id, size: slice.length });
        }

        // ── 4. Write registry entry ──────────────────────────────────────
        send('status', { message: 'Finalizing…' });

        // Build meta JSON and upload it
        const metaId   = 'dl:' + crypto.randomUUID();
        const meta     = {
          fileName:   filename,
          type:       contentType,
          totalBytes: actualBytes,
          time:       new Date().toISOString(),
          chunked:    totalChunks > 1,
          ...(totalChunks > 1 ? { chunks } : { telegramFileId: chunks[0].file_id }),
        };

        const metaBuf = Buffer.from(JSON.stringify(meta));
        const { file_id: metaFileId } = await uploadBytesToTelegram(metaBuf, `${metaId}.meta.json`);

        const registry = await readRegistry() as Record<string, any>;
        const fileRecord = {
          metaFileId,
          fileName:   filename,
          type:       contentType,
          totalBytes: actualBytes,
          time:       meta.time,
          ...(folderId ? { folderId } : {}),
        };
        registry[metaFileId] = fileRecord;
        await writeRegistry(registry);

        send('done', { file: fileRecord, message: `${filename} saved to cloud!` });

      } catch (err: any) {
        send('error', { message: err?.message ?? 'Unknown error' });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};
