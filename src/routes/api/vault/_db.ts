const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const BACKUP_CHAT_ID = process.env.TELEGRAM_BACKUP_CHAT_ID!;

let cachedVaultConfig: any = null;
let lastMessageId: number | null = null;
let pinnedMessageId: number | null = null;

async function pinMessage(messageId: number) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/pinChatMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: parseInt(BACKUP_CHAT_ID),
        message_id: messageId,
        disable_notification: true
      })
    });
    const data = await res.json();
    if (data.ok) {
      pinnedMessageId = messageId;
      console.log('✓ Pinned message:', messageId);
      return true;
    } else {
      console.error('✗ Pin failed:', data.description || data.error_code);
    }
  } catch (e) {
    console.error('✗ Pin error:', e);
  }
  return false;
}

async function unpinMessage(messageId: number) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/unpinChatMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: parseInt(BACKUP_CHAT_ID),
        message_id: messageId
      })
    });
    const data = await res.json();
    if (data.ok) {
      console.log('✓ Unpinned message:', messageId);
      return true;
    }
  } catch (e) {
    console.error('✗ Unpin error:', e);
  }
  return false;
}

export async function saveVaultMetadata(userId: string, data: object) {
  const json = JSON.stringify(data);
  const text = `VAULT:${userId}:${json}`;
  
  if (lastMessageId && pinnedMessageId === lastMessageId) {
    // Try to edit existing pinned message
    try {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: parseInt(BACKUP_CHAT_ID),
          message_id: lastMessageId,
          text: text
        })
      });
      const result = await res.json();
      if (result.ok) {
        cachedVaultConfig = data;
        console.log('✓ Updated pinned message:', lastMessageId);
        return result;
      }
    } catch (e) {
      console.error('✗ Edit error:', e);
    }
  }
  
  // Create new message
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: parseInt(BACKUP_CHAT_ID),
        text: text
      })
    });
    
    const result = await res.json();
    if (result.ok) {
      lastMessageId = result.result.message_id;
      cachedVaultConfig = data;
      console.log('✓ Created message:', lastMessageId);
      
      // Unpin old message if exists
      if (pinnedMessageId && pinnedMessageId !== lastMessageId) {
        unpinMessage(pinnedMessageId).catch(() => {});
      }
      
      // Pin new message
      setTimeout(() => {
        pinMessage(lastMessageId!);
      }, 500);
      
      return result;
    } else {
      console.error('✗ Send failed:', result.description || result.error_code);
    }
  } catch (e) {
    console.error('✗ Send error:', e);
  }
  
  return null;
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
    console.error('✗ Error getting vault metadata:', e);
  }
  
  return null;
}

export async function saveEncryptedFile(userId: string, fileId: string, encryptedData: ArrayBuffer) {
  const form = new FormData();
  form.append('document', new File([encryptedData], `vault_${userId}_${fileId}.bin`));
  
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
      method: 'POST',
      body: form
    });
    
    const json = await res.json();
    return json.ok ? json.result.document.file_id : null;
  } catch (e) {
    console.error('✗ Upload error:', e);
    return null;
  }
}

export async function getEncryptedFile(telegramFileId: string) {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${telegramFileId}`
    );
    const data = await res.json();
    
    if (!data.ok) return null;
    
    const fileRes = await fetch(
      `https://api.telegram.org/file/bot${BOT_TOKEN}/${data.result.file_path}`
    );
    return fileRes.arrayBuffer();
  } catch (e) {
    console.error('✗ Download error:', e);
    return null;
  }
}
