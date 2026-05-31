// src/routes/api/sharex/upload/+server.ts
import type { RequestHandler } from './$types';
import { decrypt } from '$lib/crypto';
import {
  getRecordByApiKey,
  registerFile,
  readRegistry,
  writeRegistry
} from '$lib/telegramStorage';

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TG_SAFE_CHUNK_BYTES } from '$lib/telegramLimits';

const BASE_URL =
  import.meta.env.PUBLIC_BASE_URL ?? 'http://localhost:5173';

const CHUNK_SIZE = TG_SAFE_CHUNK_BYTES;

function json(data: object, status = 200) {
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

  const delim = Buffer.from(`\r\n--${boundary}`);
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

  return {
    filename: match[1],
    data
  };
}

async function getOrCreateSharexFolder(): Promise<string> {
  const registry = (await readRegistry()) as Record<string, any>;

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

  await writeRegistry(registry);
  return folderId;
}

async function uploadChunkWithRetry(tmpPath: string, filename: string, retries = 3): Promise<{ message_id: number; file_id: string }> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendDocument`, {
        method: 'POST',
        body: (() => {
          const form = new FormData();
          form.append('chat_id', process.env.TELEGRAM_BACKUP_CHAT_ID!);
          const blob = new Blob([await fs.promises.readFile(tmpPath)]);
          form.append('document', blob, filename);
          return form;
        })()
      });
      const json = await res.json();
      if (json?.ok) {
        return { message_id: json.result.message_id, file_id: json.result.document.file_id };
      }
      throw new Error(json?.description || 'sendDocument failed');
    } catch (err: any) {
      if (attempt === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error('Upload failed after retries');
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const rawKey = (request.headers.get('x-api-key') ?? '').trim();
    if (!rawKey) return json({ error: 'Missing API key' }, 403);

    const apiKey = decrypt(rawKey) ?? rawKey;
    const rec = await getRecordByApiKey(apiKey);
    if (!rec) return json({ error: 'Forbidden' }, 403);

    const body = Buffer.from(await request.arrayBuffer());
    const ct = request.headers.get('content-type');

    const file = extractFile(body, ct);
    if (!file) return json({ error: 'No file' }, 400);

    const fileName = file.filename.split('/').pop()!;
    const folderId = await getOrCreateSharexFolder();
    const time = new Date().toISOString();
    const type = 'application/octet-stream';
    const totalBytes = file.data.length;

    const nChunks = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE));
    const telegramChunks: { index: number; file_id: string; message_id: number; size: number }[] = [];

    for (let i = 0; i < nChunks; i++) {
      const slice = file.data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const tmp = path.join(os.tmpdir(), `sx_${Date.now()}_${i}`);
      await fs.promises.writeFile(tmp, slice);

      try {
        const { message_id, file_id } = await uploadChunkWithRetry(tmp, `${fileName}.chunk${i}`);
        telegramChunks.push({ index: i, file_id, message_id, size: slice.length });
      } finally {
        await fs.promises.unlink(tmp).catch(() => {});
      }
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

    const tmpMeta = path.join(os.tmpdir(), `sx_meta_${Date.now()}.json`);
    await fs.promises.writeFile(tmpMeta, JSON.stringify(meta, null, 2), 'utf8');

    let metaFileId: string;
    let metaMessageId: number;

    try {
      const metaRes = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendDocument`, {
        method: 'POST',
        body: (() => {
          const form = new FormData();
          form.append('chat_id', process.env.TELEGRAM_BACKUP_CHAT_ID!);
          const blob = new Blob([await fs.promises.readFile(tmpMeta)]);
          form.append('document', blob, `${fileName}.json`);
          return form;
        })()
      });
      const metaJson = await metaRes.json();
      if (!metaJson?.ok) throw new Error('Meta upload failed');
      metaFileId = metaJson.result.document.file_id;
      metaMessageId = metaJson.result.message_id;
    } finally {
      await fs.promises.unlink(tmpMeta).catch(() => {});
    }

    await registerFile({
      fileName,
      type,
      totalBytes,
      time,
      telegramFileId: chunked ? '' : telegramChunks[0].file_id,
      telegramMessageId: telegramChunks[0].message_id,
      metaFileId: metaFileId!,
      metaMessageId: metaMessageId!,
      chunked: chunked || undefined,
      chunkMessageIds: chunked ? telegramChunks.map(c => c.message_id) : undefined,
      public: true,
      folderId
    });

    return json({
      url: `${BASE_URL}/sharex/public/${fileName}`
    });
  } catch (err: any) {
    console.error('sharex upload error:', err?.message || err);
    return json({ error: err?.message ?? 'Internal error' }, 500);
  }
};
