// src/lib/telegramStorage.ts
import axios from 'axios';
// removed: import FormData from 'form-data';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import os from 'os';

export type ApiKeyRecord = {
  apiKey: string;
  discordId: string;
  username?: string;
  createdAt: string;
};

export type FileRecord = {
  fileName: string;
  type: string;
  totalBytes: number;
  time: string;
  telegramFileId: string;
  telegramMessageId: number;
  metaFileId: string;
  metaMessageId: number;
  public?: boolean;
  chunked?: boolean;
  chunkMessageIds?: number[];
  tags?: string[];
  favorite?: boolean;
  sortOrder?: number;
  folderId?: string;
  _type?: 'folder';
  name?: string;
  parentId?: string;
};

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_BACKUP_CHAT_ID;
const TELE_API = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : null;

if (!BOT_TOKEN || !CHAT_ID) {
  console.warn('telegramStorage: TELEGRAM_BOT_TOKEN or TELEGRAM_BACKUP_CHAT_ID missing');
}

/* -------------------- Low-level helpers -------------------- */

async function getChatInfo(): Promise<any> {
  if (!TELE_API) throw new Error('Telegram not configured');
  const res = await axios.get(`${TELE_API}/getChat`, { params: { chat_id: CHAT_ID } });
  if (!res.data?.ok) throw new Error('getChat failed');
  return res.data.result;
}

async function getPinnedMessage(): Promise<any | null> {
  const chat = await getChatInfo();
  return chat.pinned_message ?? null;
}

async function downloadFileId(fileId: string, responseType: 'text'): Promise<string>;
async function downloadFileId(fileId: string, responseType: 'arraybuffer'): Promise<Buffer>;
async function downloadFileId(fileId: string, responseType: 'text' | 'arraybuffer'): Promise<any> {
  if (!TELE_API) throw new Error('Telegram not configured');
  const r1 = await axios.get(`${TELE_API}/getFile`, { params: { file_id: fileId } });
  if (!r1.data?.ok) throw new Error('getFile failed');
  const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${r1.data.result.file_path}`;
  const r2 = await axios.get(fileUrl, { responseType });
  return responseType === 'arraybuffer' ? Buffer.from(r2.data) : r2.data;
}

/* -------------------- Deterministic Local Cache -------------------- */

const CACHE_FILE = path.join(os.tmpdir(), '_telegram_robust_cache.json');

type IndexFile = {
  keys: Record<string, ApiKeyRecord>;
  registryFileId?: string;
  registryMessageId?: number;
};

type CacheData = {
  pinned_message_id?: number;
  indexFile?: IndexFile;
  registryPtr?: { file_id: string; message_id: number };
  registryData?: Record<string, FileRecord>;
};

let _memCache: CacheData = {};

async function getLocalCache(): Promise<CacheData> {
  try {
    const text = await fs.promises.readFile(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(text);
    _memCache = { ..._memCache, ...parsed };
  } catch {}
  return _memCache;
}

async function updateLocalCache(patch: Partial<CacheData>) {
  _memCache = { ..._memCache, ...patch };
  try {
    await fs.promises.writeFile(CACHE_FILE, JSON.stringify(_memCache, null, 2), 'utf8');
  } catch {}
}

/* -------------------- Upload (uses native FormData + fetch) -------------------- */

/**
 * uploadFileStream
 * - Uses native Web FormData and fetch so there's no dependency on node-only `form-data`.
 * - Creates a Blob from the file bytes (works in Node 18+).
 */
async function uploadFileStream(tmpPath: string, filename?: string): Promise<{ message_id: number; file_id: string }> {
  if (!TELE_API) throw new Error('Telegram not configured');

  // Read file bytes
  const buffer = await fs.promises.readFile(tmpPath);

  // Use native FormData + Blob (Node 18+ provides global FormData and Blob)
  const form = new FormData();
  form.append('chat_id', CHAT_ID);

  // Create a Blob from the Buffer and append it with a filename
  // TypeScript may complain about Blob constructor typing in some setups; this works at runtime in Node 18+.
  // If you get TS errors, ensure "dom" libs are available or cast:
  const blob = new Blob([buffer]);
  form.append('document', blob, filename || path.basename(tmpPath));

  // Use fetch to POST the multipart form. Do NOT set Content-Type; fetch sets the boundary automatically.
  const res = await fetch(`${TELE_API}/sendDocument`, {
    method: 'POST',
    body: form
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`sendDocument network error: ${res.status} ${res.statusText} ${txt}`);
  }

  const json = await res.json().catch(() => null);
  if (!json?.ok) throw new Error('sendDocument failed: ' + JSON.stringify(json));

  return {
    message_id: json.result.message_id as number,
    file_id: json.result.document.file_id as string
  };
}

async function pinChatMessage(message_id: number): Promise<void> {
  if (!TELE_API) throw new Error('Telegram not configured');
  await axios.post(`${TELE_API}/pinChatMessage`, null, {
    params: { chat_id: CHAT_ID, message_id, disable_notification: true }
  });
}

/* -------------------- API key index (pinned, read-only after seeding) -------------------- */

async function readIndexFile(): Promise<IndexFile> {
  if (!TELE_API) throw new Error('Telegram not configured');
  
  const pinned = await getPinnedMessage();
  const pinnedMsgId = pinned?.message_id || 0;
  
  const local = await getLocalCache();
  // If Telegram returns an older pinned message due to API caching, use our local newer one
  if (local.indexFile && local.pinned_message_id && local.pinned_message_id >= pinnedMsgId) {
    return local.indexFile;
  }

  if (!pinned?.document?.file_id) return { keys: {} };
  try {
    const text = await downloadFileId(pinned.document.file_id, 'text');
    const parsed = JSON.parse(text);
    
    // Support old flat format migration
    const result = (parsed && !parsed.keys) ? { keys: parsed } : (parsed as IndexFile);
    await updateLocalCache({ pinned_message_id: pinnedMsgId, indexFile: result });
    return result;
  } catch (err) {
    console.warn('telegramStorage.readIndexFile: failed parse', (err as any).message || err);
    return { keys: {} };
  }
}

export async function readIndex(): Promise<Record<string, ApiKeyRecord>> {
  return (await readIndexFile()).keys;
}

export async function getRecordByApiKey(apiKey: string): Promise<ApiKeyRecord | null> {
  const index = await readIndex();
  for (const rec of Object.values(index)) {
    if (rec.apiKey === apiKey) return rec;
  }
  return null;
}

/* -------------------- API key helpers -------------------- */

export async function generateApiKeyForDiscordId(discordId: string, username?: string): Promise<ApiKeyRecord> {
  const index = await readIndex();
  if (index[discordId]) return index[discordId];
  // First time this allowed ID logs in — create and persist their API key
  const apiKey = crypto.randomUUID();
  const rec: ApiKeyRecord = { apiKey, discordId, username, createdAt: new Date().toISOString() };
  index[discordId] = rec;
  await writeIndex(index);
  return rec;
}

export async function saveRecord(rec: ApiKeyRecord): Promise<void> {
  const index = await readIndex();
  index[rec.discordId] = rec;
  await writeIndex(index);
}

export async function revokeApiKey(apiKey: string): Promise<boolean> {
  const index = await readIndex();
  let changed = false;
  for (const d of Object.keys(index)) {
    if (index[d].apiKey === apiKey) {
      delete index[d];
      changed = true;
    }
  }
  if (changed) await writeIndex(index);
  return changed;
}

async function writeIndex(index: Record<string, ApiKeyRecord>, extra?: Partial<IndexFile>): Promise<void> {
  const current = await readIndexFile();
  const oldMsgId = (await getPinnedMessage())?.message_id ?? 0;
  const payload: IndexFile = { ...current, ...extra, keys: index };

  const tmp = `/tmp/telegram_index_${Date.now()}.json`;
  await fs.promises.writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8');
  const { message_id } = await uploadFileStream(tmp, `index_${Date.now()}.json`);
  await pinChatMessage(message_id);
  await updateLocalCache({ pinned_message_id: message_id, indexFile: payload });
  await fs.promises.unlink(tmp).catch(() => { });
  if (oldMsgId && oldMsgId !== message_id) {
    await axios.post(`${TELE_API}/deleteMessage`, null, {
      params: { chat_id: CHAT_ID, message_id: oldMsgId }
    }).catch(() => { });
  }
}

/* -------------------- File registry (separate message, never pinned) -------------------- */

async function getRegistryPtr(): Promise<{ file_id: string; message_id: number } | null> {
  const idx = await readIndexFile();
  const reportedMsgId = idx.registryMessageId || 0;
  
  const local = await getLocalCache();
  // Bypass Telegram caching delays if we wrote a newer registry locally
  if (local.registryPtr && local.registryPtr.message_id >= reportedMsgId) {
    return local.registryPtr;
  }
  
  if (idx.registryFileId && typeof idx.registryMessageId === 'number') {
    const ptr = { file_id: idx.registryFileId, message_id: idx.registryMessageId };
    await updateLocalCache({ registryPtr: ptr });
    return ptr;
  }
  return null;
}

export async function readRegistry(): Promise<Record<string, FileRecord>> {
  const ptr = await getRegistryPtr();
  if (!ptr) return {};
  
  const local = await getLocalCache();
  if (local.registryData && local.registryPtr?.file_id === ptr.file_id) {
    return local.registryData;
  }

  try {
    const text = await downloadFileId(ptr.file_id, 'text');
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result = parsed as Record<string, FileRecord>;
    await updateLocalCache({ registryData: result, registryPtr: ptr });
    return result;
  } catch (err) {
    console.warn('telegramStorage.readRegistry: failed parse', (err as any).message || err);
    return {};
  }
}

export async function writeRegistry(registry: Record<string, any>): Promise<void> {
  const oldPtr = await getRegistryPtr();

  const tmp = `/tmp/_registry_${Date.now()}.json`;
  await fs.promises.writeFile(tmp, JSON.stringify(registry, null, 2), 'utf8');
  const { file_id, message_id } = await uploadFileStream(tmp, `_registry_${Date.now()}.json`);
  await fs.promises.unlink(tmp).catch(() => { });

  // Cache the new registry immediately
  await updateLocalCache({ 
    registryData: registry, 
    registryPtr: { file_id, message_id } 
  });

  // Persist registryFileId + registryMessageId into pinned index (writeIndex deletes old index)
  const currentKeys = await readIndex();
  await writeIndex(currentKeys, { registryFileId: file_id, registryMessageId: message_id });

  // Delete old registry message
  if (oldPtr?.message_id && oldPtr.message_id > 0 && oldPtr.message_id !== message_id) {
    await axios.post(`${TELE_API}/deleteMessage`, null, {
      params: { chat_id: CHAT_ID, message_id: oldPtr.message_id }
    }).catch(() => { });
  }
}

export async function registerFile(rec: FileRecord): Promise<void> {
  const registry = await readRegistry() ?? {};
  registry[rec.metaFileId] = rec;
  await writeRegistry(registry);
}

export async function listFiles(query?: string): Promise<FileRecord[]> {
  const registry = await readRegistry() ?? {};
  const all = Object.values(registry);
  if (!query || query === '*') return all;
  const q = query.toLowerCase();
  return all.filter(f => f.fileName.toLowerCase().includes(q));
}

export async function setFilePublicity(metaFileId: string, isPublic: boolean): Promise<boolean> {
  const registry = await readRegistry() ?? {};
  if (!registry[metaFileId]) return false;
  registry[metaFileId].public = isPublic;
  await writeRegistry(registry);
  return true;
}

export async function getPublicFileByPath(fullPath: string): Promise<FileRecord | null> {
  const registry = await readRegistry() ?? {};
  const all = Object.values(registry);

  function isFolderPublic(folderId: string | undefined): boolean {
    let id = folderId;
    while (id) {
      const f = registry[id];
      if (!f) break;
      if (f.public) return true;
      id = f.parentId;
    }
    return false;
  }

  for (const f of all) {
    if (f._type || !f.fileName) continue;
    if (!f.public && !isFolderPublic(f.folderId)) continue;

    // Reconstruct full path
    let currentPath = f.fileName;
    let parentId = f.folderId;
    while (parentId) {
      const parent = registry[parentId];
      if (!parent || parent._type !== 'folder') break;
      currentPath = parent.name + '/' + currentPath;
      parentId = parent.parentId;
    }

    if (currentPath === fullPath) return f;
  }

  return null;
}

/** @deprecated use getPublicFileByPath */
export async function getPublicFileByName(fileName: string): Promise<FileRecord | null> {
  const registry = await readRegistry() ?? {};
  const matches = Object.values(registry).filter(f => f.public && f.fileName === fileName);
  if (!matches.length) return null;
  // Most recent wins on collision
  return matches.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];
}

export async function renameFile(metaFileId: string, newName: string): Promise<boolean> {
  const registry = await readRegistry() ?? {};
  if (!registry[metaFileId]) return false;
  registry[metaFileId].fileName = newName;
  await writeRegistry(registry);
  return true;
}

export async function setFileTags(metaFileId: string, tags: string[]): Promise<boolean> {
  const registry = await readRegistry() ?? {};
  if (!registry[metaFileId]) return false;
  registry[metaFileId].tags = tags;
  await writeRegistry(registry);
  return true;
}

export async function toggleFavorite(metaFileId: string): Promise<{ success: boolean; favorite?: boolean }> {
  const registry = await readRegistry() ?? {};
  if (!registry[metaFileId]) return { success: false };
  registry[metaFileId].favorite = !registry[metaFileId].favorite;
  await writeRegistry(registry);
  return { success: true, favorite: registry[metaFileId].favorite };
}

export async function deleteFile(metaFileId: string): Promise<boolean> {
  const registry = await readRegistry() ?? {};
  const rec = registry[metaFileId];
  if (!rec) return false;

  // Delete actual Telegram messages (file/chunks + meta)
  const toDelete = [
    ...(rec.chunkMessageIds && rec.chunkMessageIds.length > 0 ? rec.chunkMessageIds : [rec.telegramMessageId]),
    rec.metaMessageId
  ].filter(id => id > 0);
  await Promise.all(toDelete.map(message_id =>
    axios.post(`${TELE_API}/deleteMessage`, null, {
      params: { chat_id: CHAT_ID, message_id }
    }).then(r => {
      if (!r.data?.ok) console.error('deleteMessage failed:', message_id, r.data);
      else console.log('deleteMessage ok:', message_id);
    }).catch(e => console.error('deleteMessage error:', message_id, e?.response?.data || e?.message))
  ));

  delete registry[metaFileId];
  await writeRegistry(registry);
  return true;
}

/* -------------------- File upload (never pins) -------------------- */

export async function uploadFileToTelegram(tmpPath: string, filename?: string): Promise<{ message_id: number; file_id: string }> {
  return uploadFileStream(tmpPath, filename);
}

/** @deprecated use uploadFileToTelegram */
export async function uploadFileToTelegramAndPin(tmpPath: string, filename?: string): Promise<{ message_id: number; file_id: string }> {
  // if you want to pin, call pinChatMessage after upload
  const res = await uploadFileStream(tmpPath, filename);
  // not pinning by default to preserve original behaviour (rename if you intend to pin)
  return res;
}

/* -------------------- File download -------------------- */

export async function downloadFileFromTelegram(fileId: string): Promise<{ data: Buffer; filename: string; mimeType: string }> {
  const data = await downloadFileId(fileId, 'arraybuffer');
  return { data, filename: 'download', mimeType: 'application/octet-stream' };
}

/* -------------------- Extra helpers for chunk / metadata upload -------------------- */

export async function uploadBytesToTelegram(
  bytes: Buffer | Uint8Array,
  filename = "chunk.bin"
): Promise<{ message_id: number; file_id: string }> {
  if (!bytes || bytes.length === 0) {
    throw new Error(`Cannot upload empty file: ${filename}. The file has 0 bytes.`);
  }
  const tmp = `/tmp/_chunk_${Date.now()}`;
  await fs.promises.writeFile(tmp, bytes);

  try {
    return await uploadFileStream(tmp, filename);
  } finally {
    await fs.promises.unlink(tmp).catch(() => {});
  }
}

export async function uploadJsonToTelegram(
  data: any,
  filename = "meta.json"
): Promise<{ message_id: number; file_id: string }> {
  const tmp = `/tmp/_meta_${Date.now()}.json`;
  await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");

  try {
    return await uploadFileStream(tmp, filename);
  } finally {
    await fs.promises.unlink(tmp).catch(() => {});
  }
}

/* -------------------- Public folder helper -------------------- */

export async function getPublicFolderByPath(folderPath: string): Promise<{
  folder: any;
  files: FileRecord[];
  subfolders: any[];
} | null> {
  const registry = await readRegistry() as Record<string, any>;
  const all = Object.values(registry);
  const allFolders = all.filter(r => r._type === 'folder');
  const allFiles   = all.filter(r => !r._type);

  // Check if a folder is publicly accessible (itself or any ancestor is public)
  function isFolderPublic(folder: any): boolean {
    if (folder.public) return true;
    let parentId = folder.parentId;
    while (parentId) {
      const parent = registry[parentId];
      if (!parent) break;
      if (parent.public) return true;
      parentId = parent.parentId;
    }
    return false;
  }

  // Reconstruct full path for a folder
  function folderFullPath(folder: any): string {
    let p = folder.name;
    let parentId = folder.parentId;
    while (parentId) {
      const parent = allFolders.find(f => f.folderId === parentId);
      if (!parent) break;
      p = parent.name + '/' + p;
      parentId = parent.parentId;
    }
    return p;
  }

  const matchingFolders = allFolders.filter(folder => isFolderPublic(folder) && folderFullPath(folder) === folderPath);

  if (matchingFolders.length === 0) return null;

  const targetFolderIds = matchingFolders.map(f => f.folderId);
  const files = allFiles.filter(f => f.folderId && targetFolderIds.includes(f.folderId));
  const subfolders = allFolders.filter(f => f.parentId && targetFolderIds.includes(f.parentId) && isFolderPublic(f));
  
  // Return the first matched folder as the primary metadata provider
  matchingFolders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  const folder = matchingFolders[0];

  return { folder, files, subfolders };
}

/* -------------------- default export -------------------- */

export default {
  readIndex,
  getRecordByApiKey,
  generateApiKeyForDiscordId,
  saveRecord,
  revokeApiKey,
  readRegistry,
  registerFile,
  listFiles,
  setFilePublicity,
  getPublicFileByName,
  deleteFile,
  renameFile,
  setFileTags,
  toggleFavorite,
  uploadFileToTelegram,
  uploadFileToTelegramAndPin,
  uploadBytesToTelegram,
  uploadJsonToTelegram,
  downloadFileFromTelegram,
  writeRegistry,
  uploadFileStream,
  pinChatMessage
};
