import { json } from "@sveltejs/kit";
import telegramStorage from "$lib/telegramStorage"; // Adjust this import path if needed

export const PATCH = async ({ request }) => {
  // 1. Read the exact headers the frontend is sending
  const apiKey = request.headers.get("X-Api-Key");
  const metaFileId = request.headers.get("X-Meta-File-Id");
  const encodedNewName = request.headers.get("X-New-Name");

  if (!apiKey || !metaFileId || !encodedNewName) {
    return json({ success: false, error: "missing_headers" }, { status: 400 });
  }

  // 2. Decode the new name (since the frontend uses encodeURIComponent)
  const newName = decodeURIComponent(encodedNewName);

  try {
    // 3. Pass the metaFileId and the new name to your Telegram storage logic
    const success = await telegramStorage.renameFile(metaFileId, newName);
    
    if (success) {
      return json({ success: true }, { status: 200 });
    } else {
      return json({ success: false, error: "file_not_found" }, { status: 404 });
    }
  } catch (err: any) {
    console.error("Rename Error:", err);
    return json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
};
