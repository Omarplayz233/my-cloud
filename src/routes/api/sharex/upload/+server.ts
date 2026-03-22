// src/routes/api/sharex/upload/+server.ts
import type { RequestHandler } from './$types';
import { decrypt } from '$lib/crypto';
import { getRecordByApiKey, uploadFileToTelegram, registerFile, readRegistry, writeRegistry } from '$lib/telegramStorage';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TG_SAFE_CHUNK_BYTES } from '$lib/telegramLimits';

const BASE_URL = process.env.PUBLIC_BASE_URL ?? 'https://cloud.omarplayz.eu.org';
const CHUNK_SIZE = TG_SAFE_CHUNK_BYTES;

function json(data: object, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
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
  const positions: number[] = [];
  let pos = body.indexOf(first);
  if (pos === -1) return null;
  positions.push(pos);
  pos = body.indexOf(delim, pos + first.length);
  while (pos !== -1) { positions.push(pos + 2); pos = body.indexOf(delim, pos + delim.length); }
  for (let i = 0; i < positions.length - 1; i++) {
    const partStart = positions[i] + `--${boundary}`.length + 2;
    const partEnd   = positions[i + 1] - 2;
    const part      = body.slice(partStart, partEnd);
    const hEnd      = part.indexOf('\r\n\r\n');
    if (hEnd === -1) continue;
    const hStr = part.slice(0, hEnd).toString('utf8');
    const data = part.slice(hEnd + 4);
    const cd = hStr.match(/Content-Disposition\s*:[^\r\n]*;\s*name="([^"]*)"(?:[^\r\n]*;\s*filename="([^"]*)")?/i);
    if (!cd || !cd[2]) continue;
    const ctm = hStr.match(/Content-Type\s*:\s*([^\r\n]+)/i);
    return { filename: cd[2], contentType: ctm?.[1].trim() ?? 'application/octet-stream', data };
  }
  return null;
}

async function getOrCreateSharexFolder(): Promise<string> {
  const registry = await readRegistry() as Record<string, any>;
  const existing = Object.values(registry).find(
    (r: any) => r._type === 'folder' && r.name === 'sharex' && !r.parentId
  ) as any;
  if (existing) {
    if (!existing.public) { existing.public = true; await writeRegistry(registry); }
    return existing.folderId;
  }
  const folderId = 'folder:' + crypto.randomUUID();
  registry[folderId] = { _type: 'folder', folderId, name: 'sharex', createdAt: new Date().toISOString(), public: true };
  await writeRegistry(registry);
  return folderId;
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const rawKey = (request.headers.get('x-api-key') ?? '').trim();
    if (!rawKey) return json({ error: 'Missing X-Api-Key' }, 403);
    const apiKey = decrypt(rawKey) ?? rawKey;
    const rec = await getRecordByApiKey(apiKey);
    if (!rec) return json({ error: 'Forbidden' }, 403);

    const ct   = request.headers.get('content-type');
    const body = Buffer.from(await request.arrayBuffer());
    const file = extractFile(body, ct);
    if (!file) return json({ error: 'No file in request' }, 400);

    // Strip any directory prefix ShareX might include in the filename
    const { filename: rawFileName, contentType, data } = file;
    const fileName = rawFileName.split('/').pop()!.split('\\').pop()!;
    const folderId   = await getOrCreateSharexFolder();
    const totalBytes = data.length;
    const time       = new Date().toISOString();

    const telegramChunks: { index: number; file_id: string; message_id: number; size: number }[] = [];
    const numChunks = Math.ceil(totalBytes / CHUNK_SIZE);
    for (let i = 0; i < numChunks; i++) {
      const slice = data.slice(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, totalBytes));
      const tmp = path.join(os.tmpdir(), `sx_${Date.now()}_${i}_${fileName}`);
      await fs.promises.writeFile(tmp, slice);
      const { file_id, message_id } = await uploadFileToTelegram(tmp, fileName);
      await fs.promises.unlink(tmp).catch(() => {});
      telegramChunks.push({ index: i, file_id, message_id, size: slice.length });
    }

    const chunked = telegramChunks.length > 1;
    const meta = {
      fileName, type: contentType, time, totalBytes, chunked,
      ...(chunked ? { chunks: telegramChunks } : { telegramFileId: telegramChunks[0].file_id, telegramMessageId: telegramChunks[0].message_id })
    };
    const metaTmp = path.join(os.tmpdir(), `sx_meta_${Date.now()}.json`);
    await fs.promises.writeFile(metaTmp, JSON.stringify(meta, null, 2));
    const { file_id: metaFileId, message_id: metaMessageId } = await uploadFileToTelegram(metaTmp, `${fileName}.json`);
    await fs.promises.unlink(metaTmp).catch(() => {});

    await registerFile({
      fileName, type: contentType, totalBytes, time,
      telegramFileId: chunked ? '' : telegramChunks[0].file_id,
      telegramMessageId: telegramChunks[0].message_id,
      metaFileId, metaMessageId,
      chunked: chunked || undefined,
      chunkMessageIds: chunked ? telegramChunks.map(c => c.message_id) : undefined,
      public: true, folderId,
    });

    return json({ url: `${BASE_URL}/sharex/public/${fileName}` });
  } catch (err: any) {
    console.error('sharex upload error:', err?.message || err);
    return json({ error: err?.message ?? 'Internal error' }, 500);
  }
};
