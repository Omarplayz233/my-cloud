import { deriveKey } from "../_crypto";
import { getVaultMetadata, getEncryptedFile } from "../_db";

export const GET = async ({ url, cookies }) => {
  const userId = "default_user";
  const session = cookies.get("vault_session");

  const vault = await getVaultMetadata(userId);
  if (!vault || session !== vault.hash) {
    return new Response("unauthorized", { status: 401 });
  }

  const id = url.searchParams.get("id");
  const file = vault.files.find(f => f.id === id);

  const encrypted = await getEncryptedFile(file.file_id);

  const key = await deriveKey(session, Buffer.from(vault.salt, "base64"));

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: Buffer.from(file.iv, "base64")
    },
    key,
    encrypted
  );

  return new Response(decrypted);
};
