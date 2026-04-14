const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID = process.env.TELEGRAM_BACKUP_CHAT_ID!;

async function getPinnedMessage() {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChat?chat_id=${CHAT_ID}`);
  const data = await res.json();
  return data?.result?.pinned_message || null;
}

async function downloadFile(fileId: string) {
  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
  );
  const data = await res.json();
  if (!data.ok) return null;

  const fileRes = await fetch(
    `https://api.telegram.org/file/bot${BOT_TOKEN}/${data.result.file_path}`
  );

  return fileRes.arrayBuffer();
}

export async function getVaultMetadata(userId: string) {
  try {
    const pinned = await getPinnedMessage();

    if (!pinned) return null;

    if (pinned.document?.file_id) {
      const buf = await downloadFile(pinned.document.file_id);
      if (!buf) return null;

      const json = new TextDecoder().decode(buf);
      return JSON.parse(json);
    }

    if (pinned.text?.startsWith(`VAULT:${userId}:`)) {
      return JSON.parse(pinned.text.replace(`VAULT:${userId}:`, ""));
    }
  } catch (e) {
    console.error("getVaultMetadata error:", e);
  }

  return null;
}

export async function saveVaultMetadata(userId: string, data: any) {
  const json = JSON.stringify(data, null, 2);

  const form = new FormData();
  form.append("chat_id", CHAT_ID);
  form.append("document", new Blob([json]), "vault.json");

  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
    { method: "POST", body: form }
  );

  const result = await res.json();
  if (!result.ok) return null;

  const messageId = result.result.message_id;

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/pinChatMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      message_id: messageId,
      disable_notification: true
    })
  });

  return result;
}

export async function saveEncryptedFile(userId: string, fileId: string, data: ArrayBuffer) {
  const form = new FormData();
  form.append("document", new File([data], `${fileId}.bin`));

  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
    { method: "POST", body: form }
  );

  const json = await res.json();
  return json.ok ? json.result.document.file_id : null;
}

export async function getEncryptedFile(fileId: string) {
  return downloadFile(fileId);
}
