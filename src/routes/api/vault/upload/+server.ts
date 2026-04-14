import { randomBytes, deriveKey } from "../_crypto";
import { getVaultMetadata, saveVaultMetadata, saveEncryptedFile } from "../_db";

export const POST = async ({ request, cookies }) => {
  const userId = "default_user";
  const session = cookies.get("vault_session");

  const vault = await getVaultMetadata(userId);
  if (!vault || session !== vault.hash) {
    return new Response("unauthorized", { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");

  const raw = await file.arrayBuffer();

  const salt = Buffer.from(vault.salt, "base64");
  const key = await deriveKey(session, salt);

  const iv = randomBytes(12);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    raw
  );

  const fileId = await saveEncryptedFile(userId, crypto.randomUUID(), encrypted);

  const entry = {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    createdAt: Date.now(),
    iv: Buffer.from(iv).toString("base64"),
    file_id: fileId
  };

  vault.files.push(entry);
  await saveVaultMetadata(userId, vault);

  return new Response(JSON.stringify({ ok: true }));
};
