// src/routes/api/sharex/upload/+server.ts
import type { RequestHandler } from './$types';
import { decrypt } from '$lib/crypto';
import {
  getRecordByApiKey,
  uploadFileToTelegram,
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
    await getOrCreateSharexFolder();

    const total = file.data.length;
    const chunks = Math.ceil(total / CHUNK_SIZE);

    const uploaded = [];

    for (let i = 0; i < chunks; i++) {
      const slice = file.data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);

      const tmp = path.join(os.tmpdir(), `sx_${Date.now()}_${i}`);
      await fs.promises.writeFile(tmp, slice);

      const res = await uploadFileToTelegram(tmp, fileName);
      await fs.promises.unlink(tmp).catch(() => {});

      uploaded.push(res);
    }

    return json({
      url: `${BASE_URL}/sharex/public/${fileName}`
    });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Internal error' }, 500);
  }
};
