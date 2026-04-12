const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const BACKUP_CHAT_ID = process.env.TELEGRAM_BACKUP_CHAT_ID!;

export async function saveVaultMetadata(userId: string, data: object) {
  const json = JSON.stringify(data);
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: BACKUP_CHAT_ID,
      text: `VAULT:${userId}:${json}`,
      parse_mode: 'HTML'
    })
  });
  return res.json();
}

export async function getVaultMetadata(userId: string) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`);
  const data = await res.json();
  
  for (const msg of data.result || []) {
    const text = msg.message?.text || '';
    if (text.startsWith(`VAULT:${userId}:`)) {
      const json = text.replace(`VAULT:${userId}:`, '');
      return JSON.parse(json);
    }
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
