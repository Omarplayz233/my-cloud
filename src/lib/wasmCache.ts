// src/lib/wasmCache.ts
// OPFS-based WASM cache with semver-aware version checks

export type WasmEntry = {
  name: string
  key: string
  version: string
  urls: { js?: string; wasm: string }
  sizeMB: number
}

export type CacheState =
  | { status: "uncached" }
  | { status: "cached"; version: string }
  | { status: "update-available"; cachedVersion: string; newVersion: string }
  | { status: "downloading"; progress: number }
  | { status: "error"; message: string }

// WASM registry
export const WASM_REGISTRY: Record<string, WasmEntry> = {
  ffmpeg: {
    name: "FFmpeg",
    key: "ffmpeg-core-st",
    version: "0.12.10",
    urls: {
      js: "https://cdn.jsdelivr.net/npm/@ffmpeg/core-st@0.12.10/dist/esm/ffmpeg-core.js",
      wasm: "https://cdn.jsdelivr.net/npm/@ffmpeg/core-st@0.12.10/dist/esm/ffmpeg-core.wasm"
    },
    sizeMB: 7
  },

  imagemagick: {
    name: "ImageMagick",
    key: "imagemagick-wasm",
    version: "0.0.38",
    urls: {
      js: "https://cdn.jsdelivr.net/npm/@imagemagick/magick-wasm@0.0.38/dist/index.js",
      wasm: "https://cdn.jsdelivr.net/npm/@imagemagick/magick-wasm@0.0.38/dist/magick.wasm"
    },
    sizeMB: 15
  },

  pdfjs: {
    name: "PDF.js",
    key: "pdfjs-dist",
    version: "4.10.38",
    urls: {
      js: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs",
      wasm: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs"
    },
    sizeMB: 2
  },

  occt: {
    name: "OCCT",
    key: "occt-import-js",
    version: "0.0.22",
    urls: {
      wasm: "https://cdn.jsdelivr.net/npm/occt-import-js@0.0.22/dist/occt-import-js.wasm"
    },
    sizeMB: 11
  },

  sevenz: {
    name: "7-Zip",
    key: "7z-wasm",
    version: "1.0.0",
    urls: {
      wasm: "https://cdn.jsdelivr.net/npm/7z-wasm@1.0.0/7zz.wasm"
    },
    sizeMB: 4
  }
}

// ─────────────────────────
// semver comparison
// ─────────────────────────

function parseVersion(v: string): number[] {
  return v.replace(/[^\d.]/g, "").split(".").map(Number)
}

function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)

  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0

    if (na > nb) return 1
    if (na < nb) return -1
  }

  return 0
}

// ─────────────────────────
// OPFS helpers
// ─────────────────────────

async function getOpfsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle("wasm-cache", { create: true })
}

async function readOpfsFile(
  dir: FileSystemDirectoryHandle,
  name: string
): Promise<ArrayBuffer | null> {
  try {
    const fh = await dir.getFileHandle(name)
    const file = await fh.getFile()
    return file.arrayBuffer()
  } catch {
    return null
  }
}

async function writeOpfsFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  data: ArrayBuffer
) {
  const fh = await dir.getFileHandle(name, { create: true })
  const w = await fh.createWritable()
  await w.write(data)
  await w.close()
}

async function deleteOpfsFile(dir: FileSystemDirectoryHandle, name: string) {
  try {
    await dir.removeEntry(name)
  } catch {}
}

// ─────────────────────────
// manifest
// ─────────────────────────

type Manifest = Record<string, string>

async function readManifest(dir: FileSystemDirectoryHandle): Promise<Manifest> {
  const buf = await readOpfsFile(dir, "manifest.json")

  if (!buf) return {}

  try {
    return JSON.parse(new TextDecoder().decode(buf))
  } catch {
    return {}
  }
}

async function writeManifest(dir: FileSystemDirectoryHandle, manifest: Manifest) {
  const buf = new TextEncoder().encode(JSON.stringify(manifest))
  await writeOpfsFile(dir, "manifest.json", buf.buffer)
}

// ─────────────────────────
// cache check
// ─────────────────────────

export async function checkCache(entry: WasmEntry): Promise<CacheState> {
  try {
    const dir = await getOpfsDir()
    const manifest = await readManifest(dir)

    const cached = manifest[entry.key]

    if (!cached) return { status: "uncached" }

    const cmp = compareVersions(cached, entry.version)

    if (cmp === 0) {
      for (const type of Object.keys(entry.urls)) {
        const buf = await readOpfsFile(dir, `${entry.key}-${type}`)
        if (!buf) return { status: "uncached" }
      }

      return { status: "cached", version: cached }
    }

    return {
      status: "update-available",
      cachedVersion: cached,
      newVersion: entry.version
    }
  } catch (e: any) {
    return { status: "error", message: e.message }
  }
}

// ─────────────────────────
// download + cache
// ─────────────────────────

export async function downloadAndCache(
  entry: WasmEntry,
  onProgress?: (pct: number) => void
) {
  const dir = await getOpfsDir()
  const manifest = await readManifest(dir)

  const urls = Object.entries(entry.urls) as [string, string][]
  const total = urls.length

  for (let i = 0; i < total; i++) {
    const [type, url] = urls[i]

    const res = await fetch(url)

    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: ${res.status}`)
    }

    const reader = res.body!.getReader()
    const chunks: Uint8Array[] = []

    const totalBytes = Number(res.headers.get("content-length") || 0)
    let loaded = 0

    while (true) {
      const { done, value } = await reader.read()

      if (done) break

      chunks.push(value)
      loaded += value.length

      if (totalBytes && onProgress) {
        const filePct = loaded / totalBytes
        const overall = (i + filePct) / total
        onProgress(Math.round(overall * 100))
      }
    }

    const size = chunks.reduce((n, c) => n + c.length, 0)
    const combined = new Uint8Array(size)

    let offset = 0
    for (const c of chunks) {
      combined.set(c, offset)
      offset += c.length
    }

    await writeOpfsFile(dir, `${entry.key}-${type}`, combined.buffer)
  }

  manifest[entry.key] = entry.version
  await writeManifest(dir, manifest)

  onProgress?.(100)
}

// ─────────────────────────
// load cached wasm/js
// ─────────────────────────

export async function loadFromCache(
  entry: WasmEntry
): Promise<Record<string, string>> {
  const dir = await getOpfsDir()

  const result: Record<string, string> = {}

  for (const [type] of Object.entries(entry.urls)) {
    const buf = await readOpfsFile(dir, `${entry.key}-${type}`)

    if (!buf) {
      throw new Error(`Cache miss for ${entry.key}-${type}`)
    }

    const mime = type === "wasm" ? "application/wasm" : "text/javascript"

    result[type] = URL.createObjectURL(new Blob([buf], { type: mime }))
  }

  return result
}

// ─────────────────────────

export async function evictCache(entry: WasmEntry) {
  const dir = await getOpfsDir()
  const manifest = await readManifest(dir)

  for (const type of Object.keys(entry.urls)) {
    await deleteOpfsFile(dir, `${entry.key}-${type}`)
  }

  delete manifest[entry.key]

  await writeManifest(dir, manifest)
}

export async function getCacheSize(): Promise<number> {
  try {
    const dir = await getOpfsDir()
    let total = 0

    for await (const [, handle] of dir as any) {
      if (handle.kind === "file") {
        const f = await handle.getFile()
        total += f.size
      }
    }

    return total
  } catch {
    return 0
  }
}

export async function clearCache() {
  const root = await navigator.storage.getDirectory()
  await root.removeEntry("wasm-cache", { recursive: true })
}
