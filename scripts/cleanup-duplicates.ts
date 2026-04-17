// scripts/cleanup-duplicates.ts
// Run with: npx ts-node --esm scripts/cleanup-duplicates.ts
// Or add to package.json scripts

import axios from 'axios';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import os from 'os';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_BACKUP_CHAT_ID;
const TELE_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const CACHE_FILE = path.join(os.tmpdir(), '_telegram_robust_cache.json');

interface ApiKeyRecord {
  apiKey: string;
  discordId: string;
  username?: string;
  createdAt: string;
}

interface FileRecord {
  fileName: string;
  type?: string;
  totalBytes?: number;
  time?: string;
  telegramFileId?: string;
  telegramMessageId?: number;
  metaFileId?: string;
  metaMessageId?: number;
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
  folderId_?: string;
}

async function getPinnedMessage(): Promise<any> {
  try {
    const res = await axios.get(`${TELE_API}/getChat`, { params: { chat_id: CHAT_ID } });
    if (!res.data.ok) return null;
    const chat = res.data.result;
    if (chat.pinned_message) {
      return chat.pinned_message;
    }
    return null;
  } catch {
    return null;
  }
}

async function downloadFile(fileId: string): Promise<string> {
  const res = await axios.get(`${TELE_API}/getFile`, { params: { file_id: fileId } });
  if (!res.data.ok) throw new Error('getFile failed');
  const token = res.data.result.file_path;
  const fileRes = await axios.get(`https://api.telegram.org/file/bot${BOT_TOKEN}/${token}`, { responseType: 'text' });
  return fileRes.data;
}

async function getLocalCache(): Promise<any> {
  try {
    const text = await fs.promises.readFile(CACHE_FILE, 'utf8');
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function uploadJson(data: any, filename: string): Promise<{ file_id: string; message_id: number }> {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });

  const form = new FormData();
  form.append('chat_id', CHAT_ID!);
  form.append('document', blob, filename);

  const res = await axios.post(`${TELE_API}/sendDocument`, form, {
    headers: form.getHeaders()
  });

  if (!res.data.ok) throw new Error('sendDocument failed: ' + JSON.stringify(res.data));
  return {
    file_id: res.data.result.document.file_id,
    message_id: res.data.result.message_id
  };
}

async function pinMessage(message_id: number): Promise<void> {
  await axios.post(`${TELE_API}/pinChatMessage`, null, {
    params: { chat_id: CHAT_ID, message_id, disable_notification: true }
  });
}

async function deleteMessage(message_id: number): Promise<void> {
  await axios.post(`${TELE_API}/deleteMessage`, null, {
    params: { chat_id: CHAT_ID, message_id }
  }).catch(() => {});
}

async function main() {
  console.log('Starting duplicate folder cleanup...');

  const pinned = await getPinnedMessage();
  const pinnedMsgId = pinned?.message_id || 0;

  const local = await getLocalCache();
  let indexFile: any = null;

  // Try local cache first
  if (local.indexFile) {
    indexFile = local.indexFile;
    console.log('Using cached index...');
  }

  // If pinned message has an index file, use it
  if (pinned?.document?.file_id) {
    try {
      const text = await downloadFile(pinned.document.file_id);
      indexFile = JSON.parse(text);
      if (!indexFile.keys) {
        indexFile = { keys: indexFile };
      }
      console.log('Found pinned index file.');
    } catch (e) {
      console.log('Failed to download pinned index, using cache if available...');
    }
  }

  if (!indexFile?.registryFileId) {
    console.log('No registry found. Make sure TELEGRAM_BOT_TOKEN and TELEGRAM_BACKUP_CHAT_ID are set correctly.');
    return;
  }

  console.log(`Registry file ID: ${indexFile.registryFileId}`);
  console.log(`Registry message ID: ${indexFile.registryMessageId}`);

  console.log('Reading registry...');
  const registryText = await downloadFile(indexFile.registryFileId);
  const registry: Record<string, FileRecord> = JSON.parse(registryText);

  // Find duplicate folders
  const folderKeyByName: Map<string, Map<string | null, { key: string; createdAt: string }[]>> = new Map();

  for (const [key, item] of Object.entries(registry)) {
    if (item._type === 'folder') {
      const name = item.name || '';
      const parentId = item.parentId || null;

      if (!folderKeyByName.has(name)) {
        folderKeyByName.set(name, new Map());
      }
      const parentMap = folderKeyByName.get(name)!;
      if (!parentMap.has(parentId)) {
        parentMap.set(parentId, []);
      }
      parentMap.get(parentId)!.push({
        key,
        createdAt: item.createdAt || '1970-01-01T00:00:00.000Z'
      });
    }
  }

  // Find duplicates (same name + same parent)
  const toDelete: string[] = [];
  const toKeep: string[] = [];

  for (const [, parentMap] of folderKeyByName) {
    for (const [parentId, folders] of parentMap) {
      if (folders.length > 1) {
        // Sort by creation time, keep oldest
        folders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        toKeep.push(folders[0].key);
        toDelete.push(...folders.slice(1).map(f => f.key));

        console.log(`\nDuplicate folder "${folders[0].name || parentId}" (parent: ${parentId || 'root'}):`);
        for (const f of folders) {
          const action = f.key === folders[0].key ? 'KEEP' : 'DELETE';
          console.log(`  [${action}] ${f.key} (created: ${f.createdAt})`);
        }
      }
    }
  }

  if (toDelete.length === 0) {
    console.log('\nNo duplicate folders found!');
    return;
  }

  console.log(`\nFound ${toDelete.length} duplicate folders to remove.`);

  // Create new registry without duplicates
  const newRegistry: Record<string, FileRecord> = {};
  for (const [key, item] of Object.entries(registry)) {
    if (!toDelete.includes(key)) {
      newRegistry[key] = item;
    }
  }

  console.log(`Registry size: ${Object.keys(registry).length} -> ${Object.keys(newRegistry).length} items`);

  // Upload new registry
  console.log('Uploading cleaned registry...');
  const { file_id, message_id } = await uploadJson(newRegistry, `registry_cleaned_${Date.now()}.json`);

  // Update index
  const newIndex = {
    ...indexFile,
    registryFileId: file_id,
    registryMessageId: message_id
  };

  console.log('Updating index...');
  const { file_id: indexFileId, message_id: newPinnedMsgId } = await uploadJson(newIndex, `index_${Date.now()}.json`);
  await pinMessage(newPinnedMsgId);

  // Delete old messages
  if (indexFile.registryMessageId && indexFile.registryMessageId !== message_id) {
    console.log(`Deleting old registry message ${indexFile.registryMessageId}...`);
    await deleteMessage(indexFile.registryMessageId);
  }

  if (pinnedMsgId && pinnedMsgId !== newPinnedMsgId) {
    console.log(`Deleting old pinned message ${pinnedMsgId}...`);
    await deleteMessage(pinnedMsgId);
  }

  console.log(`\nCleanup complete! Removed ${toDelete.length} duplicate folders.`);
}

main().catch(console.error);
