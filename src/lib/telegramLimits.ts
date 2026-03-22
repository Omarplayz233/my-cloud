// Telegram Bot API has a practical download limitation: `getFile` can fail with
// "Bad Request: file is too big" for large documents. Since we *must* call `getFile`
// to resolve a CDN `file_path`, we keep uploaded chunks below a safe threshold.

// Hard limit varies by Bot API / hosting; keep a buffer to avoid edge cases.
export const TG_SAFE_CHUNK_BYTES = 18 * 1024 * 1024; // 18 MiB

