import { deriveKey, randomBytes, sha256 } from "../_crypto";
import { saveVaultMetadata, getVaultMetadata } from "../_db";

export const POST = async ({ request, cookies }) => {
  const { password } = await request.json();
  const userId = "default_user";

  let vault = await getVaultMetadata(userId);

  if (!vault) {
    const salt = randomBytes(16);
    const key = await deriveKey(password, salt);

    const hash = await sha256(new TextEncoder().encode(password));

    vault = {
      salt: Buffer.from(salt).toString("base64"),
      hash,
      files: []
    };

    await saveVaultMetadata(userId, vault);

    cookies.set("vault_session", hash, { path: "/" });

    return new Response(JSON.stringify({ ok: true, created: true }));
  }

  const hash = await sha256(new TextEncoder().encode(password));

  if (hash !== vault.hash) {
    return new Response(JSON.stringify({ error: "wrong password" }), { status: 401 });
  }

  cookies.set("vault_session", hash, { path: "/" });

  return new Response(JSON.stringify({ ok: true }));
};
