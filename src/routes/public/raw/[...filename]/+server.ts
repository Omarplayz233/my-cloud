import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ params, url }) => {
  const { filename } = params;
  const forceDownload = url.searchParams.get('download') === 'true';

  try {
    // Check if this path matches a public folder first — redirect to browser
    const folder = await getPublicFolderByPath(filename);
    if (folder) {
      return new Response(null, {
        status: 302,
        headers: { Location: `/public/folder/${filename}` }
      });
    }

    const file = await getPublicFileByPath(filename);
    if (!file)
      return new Response(JSON.stringify({ error: 'Not found or not public' }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });

    const meta = await fetchMetaJson(file.metaFileId);
    if (!meta)
      return new Response(JSON.stringify({ error: 'Could not fetch metadata' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });

    let data: Buffer;

    if (meta.chunked && Array.isArray(meta.chunks)) {
      const sorted = [...meta.chunks].sort((a: any, b: any) => a.index - b.index);
      const buffers = await Promise.all(
        sorted.map((chunk: any) => downloadFileFromTelegram(chunk.file_id).then((r: any) => r.data))
      );
      data = Buffer.concat(buffers);
    } else {
      const result = await downloadFileFromTelegram(meta.telegramFileId);
      data = result.data;
    }

    const inline = isPreviewable(meta.type) && !forceDownload;
    const disposition = `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`;
    const total = data.length;

    // Handle range requests for seeking
    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      const range = parseRange(rangeHeader, total);
      if (!range || range.start > range.end || range.start >= total) {
        return new Response('Range Not Satisfiable', {
          status: 416,
          headers: { 'Content-Range': `bytes */${total}` }
        });
      }
      const chunk = data.slice(range.start, range.end + 1);
      return new Response(chunk, {
        status: 206,
        headers: {
          'Content-Type': meta.type,
          'Content-Disposition': disposition,
          'Content-Range': `bytes ${range.start}-${range.end}/${total}`,
          'Content-Length': String(chunk.length),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }

    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': meta.type,
        'Content-Disposition': disposition,
        'Content-Length': String(total),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (err: any) {
    console.error('public file error:', err?.response?.data || err?.message || err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};
