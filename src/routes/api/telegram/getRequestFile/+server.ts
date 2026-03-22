// src/routes/api/telegram/getRequestFile/+server.ts
import type { RequestHandler } from './$types';
import { getRecordByApiKey } from '$lib/telegramStorage';
import { env } from '$env/dynamic/private';

const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN!;
const TELE_API  = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ── Cache ──────────────────────────────────────────────────────────────────
// Telegram CDN URLs expire after ~1h; cache them for 50min to be safe.
// Meta JSON almost never changes so cache for 10min.
const CDN_URL_TTL  = 50 * 60 * 1000;
const META_TTL     = 10 * 60 * 1000;

const cdnUrlCache  = new Map<string, { url: string; exp: number }>();
const metaCache    = new Map<string, { meta: any; exp: number }>();

async function getTelegramUrl(file_id: string): Promise<string> {
  const cached = cdnUrlCache.get(file_id);
  if (cached && Date.now() < cached.exp) return cached.url;

  const r = await fetch(`${TELE_API}/getFile?file_id=${encodeURIComponent(file_id)}`);
  const j = await r.json() as any;
  if (!j.ok) throw new Error(`getFile failed: ${JSON.stringify(j)}`);
  const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${j.result.file_path}`;
  cdnUrlCache.set(file_id, { url, exp: Date.now() + CDN_URL_TTL });
  return url;
}

async function fetchMeta(metaFileId: string): Promise<any | null> {
  const cached = metaCache.get(metaFileId);
  if (cached && Date.now() < cached.exp) return cached.meta;

  try {
    const url  = await getTelegramUrl(metaFileId);
    const r    = await fetch(url);
    const meta = JSON.parse(await r.text());
    metaCache.set(metaFileId, { meta, exp: Date.now() + META_TTL });
    return meta;
  } catch { return null; }
}

// ──────────────────────────────────────────────────────────────────────────

function isPreviewable(type: string) {
  return type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/') || type === 'application/pdf';
}

function parseRange(header: string, total: number) {
  const m = header.match(/bytes=(\d*)-(\d*)/);
  if (!m) return null;
  const start = m[1] ? parseInt(m[1]) : total - parseInt(m[2]);
  const end   = m[2] ? Math.min(parseInt(m[2]), total - 1) : total - 1;
  return { start, end };
}

async function pumpToWriter(
  body: ReadableStream<Uint8Array> | null,
  writer: WritableStreamDefaultWriter<Uint8Array>
) {
  if (!body) throw new Error('Upstream body is null');
  const reader = body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) await writer.write(value);
    }
  } finally {
    reader.releaseLock();
  }
}

export const GET: RequestHandler = async ({ request, url }) => {
  const apiKey     = (request.headers.get('x-api-key')      ?? url.searchParams.get('api_key')      ?? '').trim();
  const metaFileId = (request.headers.get('x-meta-file-id') ?? url.searchParams.get('meta_file_id') ?? '').trim();
  const returnJson = (request.headers.get('x-json')         ?? url.searchParams.get('json')         ?? 'false') === 'true';
  const forceDown  = (request.headers.get('x-download')     ?? url.searchParams.get('download')     ?? 'false') === 'true';

  if (!apiKey)
    return new Response(JSON.stringify({ error: 'Missing api key' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

  const rec = await getRecordByApiKey(apiKey);
  if (!rec)
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

  if (!metaFileId)
    return new Response(JSON.stringify({ error: 'Missing meta_file_id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    const meta = await fetchMeta(metaFileId);
    if (!meta)
      return new Response(JSON.stringify({ error: 'Could not fetch metadata' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    if (returnJson) {
      return new Response(JSON.stringify({
        fileName:    meta.fileName,
        mimeType:    meta.type,
        totalBytes:  meta.totalBytes,
        time:        meta.time,
        chunked:     meta.chunked ?? false,
        previewable: isPreviewable(meta.type),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const canPreview  = isPreviewable(meta.type) && !forceDown;
    const disposition = `${canPreview ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`;
    const totalBytes: number = meta.totalBytes ?? 0;
    const rangeHeader = request.headers.get('range');

    // ── CHUNKED FILE ────────────────────────────────────────────────────────
    if (meta.chunked && Array.isArray(meta.chunks)) {
      const sorted = [...meta.chunks].sort((a: any, b: any) => a.index - b.index);

      // Resolve all CDN URLs in parallel (cached after first hit)
      const cdnUrls = await Promise.all(sorted.map((c: any) => getTelegramUrl(c.file_id)));

      if (rangeHeader && totalBytes > 0) {
        const range = parseRange(rangeHeader, totalBytes);
        if (!range || range.start > range.end || range.start >= totalBytes)
          return new Response('Range Not Satisfiable', { status: 416, headers: { 'Content-Range': `bytes */${totalBytes}` } });

        let pos = 0;
        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
        const writer = writable.getWriter();

        (async () => {
          try {
            for (let i = 0; i < sorted.length; i++) {
              const chunkSize  = Number(sorted[i].size ?? 0);
              const chunkStart = pos;
              const chunkEnd   = pos + chunkSize - 1;
              pos += chunkSize;

              if (chunkEnd < range.start || chunkStart > range.end) continue;

              const overlapStart = Math.max(range.start, chunkStart) - chunkStart;
              const overlapEnd   = Math.min(range.end, chunkEnd) - chunkStart;

              const upstream = await fetch(cdnUrls[i], {
                headers: { Range: `bytes=${overlapStart}-${overlapEnd}` }
              });
              if (!upstream.ok) throw new Error(`Upstream failed: ${upstream.status}`);
              await pumpToWriter(upstream.body, writer);
            }
          } catch {
            // If upstream fails mid-stream, close. Client will see truncated transfer.
          } finally {
            await writer.close().catch(() => {});
          }
        })();

        return new Response(readable, {
          status: 206,
          headers: {
            'Content-Type':        meta.type,
            'Content-Disposition': disposition,
            'Content-Range':       `bytes ${range.start}-${range.end}/${totalBytes}`,
            'Content-Length':      String(range.end - range.start + 1),
            'Accept-Ranges':       'bytes',
            'Cache-Control':       'private, max-age=3600',
          },
        });
      }

      // Full chunked file — stream chunks sequentially (no buffering)
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      const writer = writable.getWriter();

      (async () => {
        try {
          for (const u of cdnUrls) {
            const upstream = await fetch(u);
            if (!upstream.ok) throw new Error(`Upstream failed: ${upstream.status}`);
            await pumpToWriter(upstream.body, writer);
          }
        } catch {
          // same rationale as above
        } finally {
          await writer.close().catch(() => {});
        }
      })();

      return new Response(readable, {
        status: 200,
        headers: {
          'Content-Type':        meta.type,
          'Content-Disposition': disposition,
          ...(totalBytes > 0 ? { 'Content-Length': String(totalBytes) } : {}),
          'Accept-Ranges':       'bytes',
          'Cache-Control':       'private, max-age=3600',
        },
      });
    }

    // ── SINGLE FILE ─────────────────────────────────────────────────────────
    const cdnUrl = await getTelegramUrl(meta.telegramFileId);

    if (rangeHeader && totalBytes > 0) {
      const range = parseRange(rangeHeader, totalBytes);
      if (!range || range.start > range.end || range.start >= totalBytes)
        return new Response('Range Not Satisfiable', { status: 416, headers: { 'Content-Range': `bytes */${totalBytes}` } });
      const upstream = await fetch(cdnUrl, { headers: { Range: `bytes=${range.start}-${range.end}` } });
      if (!upstream.ok) {
        return new Response(`Upstream failed: ${upstream.status}`, { status: 502 });
      }
      return new Response(upstream.body, {
        status: 206,
        headers: {
          'Content-Type':        meta.type,
          'Content-Disposition': disposition,
          'Content-Range':       `bytes ${range.start}-${range.end}/${totalBytes}`,
          'Content-Length':      String(range.end - range.start + 1),
          'Accept-Ranges':       'bytes',
          'Cache-Control':       'private, max-age=3600',
        },
      });
    }

    const upstream = await fetch(cdnUrl);
    if (!upstream.ok) {
      return new Response(`Upstream failed: ${upstream.status}`, { status: 502 });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type':        meta.type,
        'Content-Disposition': disposition,
        ...(totalBytes > 0 ? { 'Content-Length': String(totalBytes) } : {}),
        'Accept-Ranges':       'bytes',
        'Cache-Control':       'private, max-age=3600',
      },
    });

  } catch (err: any) {
    console.error('getRequestFile error:', err?.message || err);
    const msg = String(err?.message ?? '');
    if (msg.includes('Bad Request: file is too big')) {
      return new Response(JSON.stringify({
        error: 'Telegram Bot API cannot download this file (file is too big). Re-upload it using chunk size <= 18MiB so it becomes a chunked file.'
      }), { status: 413, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};
