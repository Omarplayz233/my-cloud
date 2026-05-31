// src/routes/api/sharex/upload/+server.ts
import type { RequestHandler } from './$types';
import { decrypt } from '$lib/crypto';
import {
  getRecordByApiKey,
  readRegistry,
  writeRegistry,
  uploadBytesToTelegram,
  uploadJsonToTelegram
} from '$lib/telegramStorage';

import crypto from 'crypto';
import { TG_SAFE_CHUNK_BYTES } from '$lib/telegramLimits';

const BASE_URL =
  import.meta.env.PUBLIC_BASE_URL ?? 'http://localhost:5173';

const CHUNK_SIZE = TG_SAFE_CHUNK_BYTES;

function jsonResp(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function parseBoundary(ct: string | null): string | null {
  if (!ct) return null;
  const m = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return m ? (m[1] ?? m[2]).trim() : null;
}

function extractFile(body: Buffer, ct: string | null) {
  const boundary = parseBoundary(ct);
  if (!boundary) return null;

  const first = Buffer.from(`--${boundary}`);

  const pos = body.indexOf(first);
  if (pos === -1) return null;

  const part = body.slice(pos);
  const hEnd = part.indexOf('\r\n\r\n');
  if (hEnd === -1) return null;

  const headers = part.slice(0, hEnd).toString('utf8');
  const data = part.slice(hEnd + 4);

  const match = headers.match(/filename="([^"]+)"/i);
  if (!match) return null;

  return { filename: match[1], data };
}

async function getOrCreateSharexFolder(registry: Record<string, any>): Promise<string> {
  const existing = Object.values(registry).find(
    (r: any) => r._type === 'folder' && r.name === 'sharex'
  ) as any;

  if (existing) return existing.folderId;

  const folderId = 'folder:' + crypto.randomUUID();
  registry[folderId] = {
    _type: 'folder',
    folderId,
    name: 'sharex',
    public: true,
    createdAt: new Date().toISOString()
  };
  return folderId;
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const rawKey = (request.headers.get('x-api-key') ?? '').trim();
    if (!rawKey) return jsonResp({ error: 'Missing API key' }, 403);

    const apiKey = decrypt(rawKey) ?? rawKey;
    const rec = await getRecordByApiKey(apiKey);
    if (!rec) return jsonResp({ error: 'Forbidden' }, 403);

    const body = Buffer.from(await request.arrayBuffer());
    const ct = request.headers.get('content-type');

    const file = extractFile(body, ct);
    if (!file) return jsonResp({ error: 'No file' }, 400);

    const fileName = file.filename.split('/').pop()!;
    const time = new Date().toISOString();
    const type = 'application/octet-stream';
    const totalBytes = file.data.length;

    const nChunks = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE));
    const telegramChunks: { index: number; file_id: string; message_id: number; size: number }[] = [];

    for (let i = 0; i < nChunks; i++) {
      const slice = file.data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const { message_id, file_id } = await uploadBytesToTelegram(slice, `${fileName}.chunk${i}`);
      telegramChunks.push({ index: i, file_id, message_id, size: slice.length });
    }

    const chunked = telegramChunks.length > 1;
    const meta = {
      fileName,
      type,
      time,
      totalBytes,
      chunked,
      ...(chunked
        ? { chunks: telegramChunks }
        : { telegramFileId: telegramChunks[0].file_id, telegramMessageId: telegramChunks[0].message_id })
    };

    const { message_id: metaMessageId, file_id: metaFileId } = await uploadJsonToTelegram(meta, `${fileName}.json`);

    const registry = (await readRegistry()) as Record<string, any>;
    const folderId = await getOrCreateSharexFolder(registry);

    registry[metaFileId] = {
      fileName,
      type,
      totalBytes,
      time,
      telegramFileId: chunked ? '' : telegramChunks[0].file_id,
      telegramMessageId: telegramChunks[0].message_id,
      metaFileId,
      metaMessageId,
      chunked: chunked || undefined,
      chunkMessageIds: chunked ? telegramChunks.map(c => c.message_id) : undefined,
      public: true,
      folderId
    };

    await writeRegistry(registry);

    return jsonResp({
      url: `${BASE_URL}/sharex/public/${fileName}`
    });
  } catch (err: any) {
    console.error('sharex upload error:', err?.message || err);
    return jsonResp({ error: err?.message ?? 'Internal error' }, 500);
  }
};

