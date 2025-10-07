// test-signed-url.mjs
import dotenv from "dotenv";
dotenv.config();

import { supabaseServer } from "./server-supabase-config.js";

async function run() {
  try {
    // Replace these with a real studentId and a sample filename you see in Supabase UI.
    const studentId = "1t5clfR8VxoKBHapminH"; // example folder
    const folder = `studentFiles/${studentId}`;

    console.log("Listing objects under:", folder);
    const { data: listData, error: listErr } = await supabaseServer.storage.from('uploads').list(folder, { limit: 200, offset: 0 });

    console.log("listErr:", listErr);
    console.log("listData:", JSON.stringify(listData, null, 2));

    if (!Array.isArray(listData) || listData.length === 0) {
      console.warn("No objects returned. Double-check the folder path and bucket name ('uploads').");
      return;
    }

    // pick the first file (exact name)
    const item = listData.find(i => i && i.name);
    if (!item) {
      console.warn("No item found in listData");
      return;
    }
    const key = `${folder}/${item.name}`;
    console.log("Testing createSignedUrl for:", key);

    // clean path helper
    const cleanPath = (p) => String(p || '').trim().replace(/^\s*<\s*|\s*>\s*$/g, '');

    const ttl = 300; // 5 minutes
    const { data: signedData, error: signedErr } = await supabaseServer.storage
      .from('uploads')
      .createSignedUrl(cleanPath(key), ttl);

    console.log("createSignedUrl error:", signedErr);
    console.log("createSignedUrl data:", signedData);
  } catch (e) {
    console.error("Exception:", e && (e.stack || e));
  }
}

run();
