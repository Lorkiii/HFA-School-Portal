// server/routes/files.js
import express from "express";

/**
 * createFilesRouter({ supabaseServer, requireAdmin, BUCKET = 'uploads', MAX_TTL = 300 })
 *
 * - supabaseServer: server-side supabase client (service role)
 * - requireAdmin: middleware to protect route (optional); if omitted, route will be accessible
 * - BUCKET: bucket name where files are stored (default 'uploads')
 * - MAX_TTL: maximum signed url ttl in seconds (default 300)
 */
export default function createFilesRouter({
  supabaseServer,
  requireAdmin = (req, res, next) => next(),
  BUCKET = "uploads",
  MAX_TTL = 300
} = {}) {
  if (!supabaseServer) {
    throw new Error("supabaseServer must be provided to files router");
  }

  const router = express.Router();

  // sanitize/normalize object path for Supabase storage API
  function normalizeObjectPath(rawPath = "") {
    if (typeof rawPath !== "string") return "";
    let p = rawPath.trim();
    // remove any leading `uploads/` if present (bucket is provided separately)
    if (p.startsWith("uploads/")) p = p.slice("uploads/".length);
    // remove any accidental leading slashes
    while (p.startsWith("/")) p = p.slice(1);
    // basic cleanup of angle brackets or accidental wrappers
    p = p.replace(/^[<\s]+|[>\s]+$/g, "");
    return p;
  }

  // GET /signed-url?path=<objectPath>&ttl=<seconds>
  router.get("/signed-url", requireAdmin, async (req, res) => {
    try {
      const rawPath = String(req.query.path || "").trim();
      if (!rawPath) return res.status(400).json({ ok: false, error: "Missing path" });

      // parse TTL and cap it
      let ttl = parseInt(req.query.ttl, 10) || 60;
      if (ttl <= 0) ttl = 60;
      if (ttl > MAX_TTL) ttl = MAX_TTL;

      const objectPath = normalizeObjectPath(rawPath);
      if (!objectPath) return res.status(400).json({ ok: false, error: "Invalid path" });

      // call Supabase storage service role to create signed url
      // Note: bucket must be the bucket name (uploads)
      const { data, error } = await supabaseServer.storage
        .from(BUCKET)
        .createSignedUrl(objectPath, ttl);

      if (error) {
        // include helpful details in server logs but return sanitized error to client
        console.error("[files:signed-url] createSignedUrl error", { path: objectPath, ttl, error });
        return res.status(500).json({ ok: false, error: "Failed to create signed url", detail: error.message || error });
      }

      // success: data.signedUrl is returned by supabase storage
      const expiresAt = Date.now() + (ttl * 1000);
      return res.json({ ok: true, url: data && data.signedUrl ? data.signedUrl : null, expiresAt });
    } catch (err) {
      console.error("[files:signed-url] unexpected error", err && (err.stack || err));
      return res.status(500).json({ ok: false, error: "Server error", message: err && err.message });
    }
  });

  return router;
}
