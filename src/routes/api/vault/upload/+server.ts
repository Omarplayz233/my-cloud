import type { RequestHandler } from './$types';
import store from '../_store';
import { randomBytes, sha256 } from '../_crypto';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHUNK_SIZE = 19.5 * 1024 * 1024;

function split(buffer: ArrayBuffer) {
  const out: ArrayBuffer[] = [];
  let o = 0;
  while (o < buffer.byteLength) {
    out.push(buffer.slice(o, o + CHUNK_SIZE));
    o += CHUNK_SIZE;
  }
  return out;
}

async function encrypt(buffer: ArrayBuffer, key: CryptoKey, iv: Uint8Array) {
  return crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    buffer
  );
}

async function uploadChunk(buf: ArrayBuffer, name: string) {
  const form = new FormData();
  form.append('document', new File([buf], name));

  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
    { method: 'POST', body: form }
  );

  const json = await res.json();
  if (!json.ok) throw new Error('tg fail');

  return json.result.document.file_id;
}

export const POST: RequestHandler = async ({ request }) => {
  if (!store.unlocked || !store.key) {
    return new Response('unauthorized', { status: 401 });
  }

  const form = await request.formData();
  const file = form.get('file') as File;

  const raw = await file.arrayBuffer();

  const salt = randomBytes(16);
  const iv = randomBytes(12);

  const encrypted = await encrypt(raw, store.key, iv);

  const hash = await sha256(encrypted);

  const chunks = split(encrypted);

  // parallel upload (safe limit 3 at a time)
  const results: any[] = [];

  for (let i = 0; i < chunks.length; i += 3) {
    const batch = chunks.slice(i, i + 3);

    const uploaded = await Promise.all(
      batch.map((c, j) =>
        uploadChunk(c, `${file.name}.enc.part${i + j}`)
      )
    );

    uploaded.forEach((id, j) => {
      results.push({
        index: i + j,
        size: batch[j].byteLength,
        file_id: id
      });
    });
  }

  const id = crypto.randomUUID();

  store.files.push({
    id,
    name: file.name,
    size: file.size,
    createdAt: Date.now(),

    salt: Buffer.from(salt).toString('base64'),
    iv: Buffer.from(iv).toString('base64'),
    hash,

    chunks: results
  });

  return new Response(JSON.stringify({ ok: true, id }));
};
