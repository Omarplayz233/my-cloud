const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const BACKUP_CHAT_ID = process.env.TELEGRAM_BACKUP_CHAT_ID!;

let cachedVaultConfig: any = null;
let lastMessageId: number | null = null;

export async function saveVaultMetadata(userId: string, data: object) {
  const json = JSON.stringify(data);
  const text = `VAULT:${userId}:${json}`;
  
  if (lastMessageId) {
    // Try to edit existing message
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: BACKUP_CHAT_ID,
        message_id: lastMessageId,
        text: text
      })
    });
    const result = await res.json();
    if (result.ok) {
      cachedVaultConfig = data;
      return result;
    }
  }
  
  // Create new message
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
    lastMessageId = result.result.message_id;
    cachedVaultConfig = data;
    
    // Pin it
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/pinChatMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: BACKUP_CHAT_ID,
        message_id: lastMessageId
      })
    }).catch(() => {});
  }
  
  return result;
}

export async function getVaultMetadata(userId: string) {
  if (cachedVaultConfig?.userId === userId) {
    return cachedVaultConfig;
  }
  
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`);
    const data = await res.json();
    
    for (const update of data.result || []) {
      const msg = update.message || update.edited_message;
      if (msg?.text?.startsWith(`VAULT:${userId}:`)) {
        const json = msg.text.replace(`VAULT:${userId}:`, '');
        cachedVaultConfig = JSON.parse(json);
        lastMessageId = msg.message_id;
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
