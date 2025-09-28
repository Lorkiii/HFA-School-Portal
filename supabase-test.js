// supabase-test.js
import { supabaseServer } from "./server-supabase-config.js";

(async () => {
  const bucket = "uploads";
  const path = `studentFiles/test-debug/hello-${Date.now()}.txt`;

  try {
    const res = await supabaseServer.storage.from(bucket).createSignedUploadUrl(path);
    console.log("createSignedUploadUrl result:", res);
  } catch (err) {
    console.error("createSignedUploadUrl threw:", err);
  }
})();
