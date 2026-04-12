import type { RequestHandler } from './$types';
import store from '../_store';

function b64(b: string) {
  return Uint8Array.from(atob(b), c => c.charCodeAt(0));
}

export const GET: RequestHandler = async ({ url }) => {
  const id = url.searchParams.get('id');
  const file = store.files.find(f => f.id === id);

  if (!file || !store.key) {
    return new Response('not found', { status: 404 });
  }

  const iv = b64(file.iv);
  const salt = b64(file.salt);

  const encryptedChunks: ArrayBuffer[] = [];

  for (const c of file.chunks.sort((a, b) => a.index - b.index)) {
    const tg = await fetch(
      `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${c.file_id}`
    );

    encryptedChunks.push(await tg.arrayBuffer());
  }

  const fullEncrypted = new Uint8Array(
    encryptedChunks.reduce((a, b) => a + b.byteLength, 0)
  );

  let offset = 0;
  for (const c of encryptedChunks) {
    fullEncrypted.set(new Uint8Array(c), offset);
    offset += c.byteLength;
  }

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    store.key,
    fullEncrypted
  );

  return new Response(decrypted, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `inline; filename="${file.name}"`
    }
  });
};
