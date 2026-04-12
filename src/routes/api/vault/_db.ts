const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const BACKUP_CHAT_ID = process.env.TELEGRAM_BACKUP_CHAT_ID!;

let pinnedMessageId: number | null = null;
let cachedVaultConfig: any = null;

async function getPinnedMessage() {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`);
    const data = await res.json();
    
    for (const update of data.result || []) {
      const msg = update.message || update.edited_message;
      if (msg?.chat?.id == BACKUP_CHAT_ID && msg?.text?.startsWith('VAULT:')) {
        return msg.message_id;
      }
    }
  } catch (e) {
    console.error('Error getting pinned message:', e);
  }
  return null;
}

export async function saveVaultMetadata(userId: string, data: object) {
  const json = JSON.stringify(data);
  const text = `VAULT:${userId}:${json}`;
  
  if (!pinnedMessageId) {
    pinnedMessageId = await getPinnedMessage();
  }
  
  if (pinnedMessageId) {
    // Update existing message
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: BACKUP_CHAT_ID,
        message_id: pinnedMessageId,
        text: text
      })
    });
    const result = await res.json();
    if (result.ok) {
      cachedVaultConfig = data;
      return result;
    }
  }
  
  // Create new message if update failed
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: BACKUP_CHAT_ID,
      text: text
    })
  });
  
  const result = await res.json();
  if (result.ok) {
    pinnedMessageId = result.result.message_id;
    cachedVaultConfig = data;
    
    // Pin it
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/pinChatMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: BACKUP_CHAT_ID,
        message_id: pinnedMessageId
      })
    }).catch(e => console.error('Pin error:', e));
  }
  
  return result;
}

export async function getVaultMetadata(userId: string) {
  if (cachedVaultConfig) {
    return cachedVaultConfig;
  }
  
  if (!pinnedMessageId) {
    pinnedMessageId = await getPinnedMessage();
  }
  
  if (!pinnedMessageId) return null;
  
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`);
    const data = await res.json();
    
    for (const update of data.result || []) {
      const msg = update.message || update.edited_message;
      if (msg?.message_id === pinnedMessageId && msg?.text?.startsWith(`VAULT:${userId}:`)) {
        const json = msg.text.replace(`VAULT:${userId}:`, '');
        cachedVaultConfig = JSON.parse(json);
        return cachedVaultConfig;
      }
    }
  } catch (e) {
    console.error('Error getting vault metadata:', e);
  }
  
  return null;
}

export async function saveEncryptedFile(userId: string, fileId: string, encryptedData: ArrayBuffer) {
  const form = new FormData();
  form.append('document', new File([encryptedData], `vault_${userId}_${fileId}.bin`));
  
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
    method: 'POST',
    body: form
  });
  
  const json = await res.json();
  return json.ok ? json.result.document.file_id : null;
}

export async function getEncryptedFile(telegramFileId: string) {
  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${telegramFileId}`
  );
  const data = await res.json();
  
  if (!data.ok) return null;
  
  const fileRes = await fetch(
    `https://api.telegram.org/file/bot${BOT_TOKEN}/${data.result.file_path}`
  );
  return fileRes.arrayBuffer();
}
