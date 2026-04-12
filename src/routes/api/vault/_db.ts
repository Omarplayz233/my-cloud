const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const BACKUP_CHAT_ID = process.env.TELEGRAM_BACKUP_CHAT_ID!;

let pinnedMessageId: number | null = null;

async function getPinnedMessage() {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: BACKUP_CHAT_ID })
  });
  const data = await res.json();
  return data.result?.pinned_message?.message_id || null;
}

export async function saveVaultMetadata(userId: string, data: object) {
  const json = JSON.stringify(data);
  const text = `VAULT:${userId}:${json}`;
  
  if (!pinnedMessageId) {
    pinnedMessageId = await getPinnedMessage();
  }
  
  if (pinnedMessageId) {
    // Update existing pinned message
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: BACKUP_CHAT_ID,
        message_id: pinnedMessageId,
        text: text,
        parse_mode: 'HTML'
      })
    });
    return res.json();
  } else {
    // Create new pinned message
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: BACKUP_CHAT_ID,
        text: text,
        parse_mode: 'HTML'
      })
    });
    const data = await res.json();
    
    if (data.ok) {
      pinnedMessageId = data.result.message_id;
      
      // Pin the message
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/pinChatMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: BACKUP_CHAT_ID,
          message_id: pinnedMessageId
        })
      });
    }
    
    return data;
  }
}

export async function getVaultMetadata(userId: string) {
  if (!pinnedMessageId) {
    pinnedMessageId = await getPinnedMessage();
  }
  
  if (!pinnedMessageId) return null;
  
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMessages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: BACKUP_CHAT_ID,
      message_ids: [pinnedMessageId]
    })
  });
  
  const data = await res.json();
  const msg = data.result?.[0];
  
  if (msg?.text?.startsWith(`VAULT:${userId}:`)) {
    const json = msg.text.replace(`VAULT:${userId}:`, '');
    return JSON.parse(json);
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
