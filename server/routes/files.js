// server/routes/files.js
import express from "express";

export default function createFilesRouter({
  supabaseServer,
  requireAdmin = (req, res, next) => next(),
  requireAuth = null,
  dbClient = null,
  BUCKET = "uploads",
  MAX_TTL = 300,
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

  // Admin-only signed URL (existing)
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

      const { data, error } = await supabaseServer.storage.from(BUCKET).createSignedUrl(objectPath, ttl);

      if (error) {
        console.error("[files:signed-url] createSignedUrl error", { path: objectPath, ttl, error });
        return res.status(500).json({ ok: false, error: "Failed to create signed url", detail: error.message || error });
      }

      const expiresAt = Date.now() + ttl * 1000;
      return res.json({ ok: true, url: data && data.signedUrl ? data.signedUrl : null, expiresAt });
    } catch (err) {
      console.error("[files:signed-url] unexpected error", err && (err.stack || err));
      return res.status(500).json({ ok: false, error: "Server error", message: err && err.message });
    }
  });

  // Simplified owner-signed-url endpoint
  router.get("/signed-url-owner", async (req, res) => {
    try {
      // requireAuth must be provided
      if (!requireAuth) {
        return res.status(500).json({ ok: false, error: "Server misconfiguration: requireAuth not provided" });
      }

      // Run requireAuth middleware inline (so this route works regardless of outer mounting)
      await new Promise((resolve) => {
        requireAuth(req, res, () => resolve());
      });
      if (res.headersSent) return; // auth middleware already responded

      const user = req.user || {};
      if (!user || !user.uid) return res.status(401).json({ ok: false, error: "Unauthorized" });

      const rawPath = String(req.query.path || "").trim();
      if (!rawPath) return res.status(400).json({ ok: false, error: "Missing path" });

      // parse TTL and cap it
      let ttl = parseInt(req.query.ttl, 10) || 60;
      if (ttl <= 0) ttl = 60;
      if (ttl > MAX_TTL) ttl = MAX_TTL;

      const objectPath = normalizeObjectPath(rawPath);
      if (!objectPath) return res.status(400).json({ ok: false, error: "Invalid path" });

      // Ownership verification: two simple strategies
      let ownerVerified = false;

      // Strategy 1: path-encoded app id: teacherApplicants/<appId>/...
      const parts = objectPath.split("/").filter(Boolean);
      if (parts.length >= 2 && parts[0] === "teacherApplicants") {
        const appId = parts[1];
        if (dbClient && typeof dbClient.getApplicantById === "function") {
          try {
            const applicant = await dbClient.getApplicantById(appId);
            if (applicant && applicant.uid && String(applicant.uid) === String(user.uid)) {
              ownerVerified = true;
            }
          } catch (e) {
            console.warn("[files:signed-url-owner] getApplicantById failed", e && e.message);
          }
        }
      }

      // Strategy 2: fallback - find the applicant doc for this uid and inspect its documents array
      if (!ownerVerified) {
        if (dbClient && typeof dbClient.findApplicantIdByUid === "function" && typeof dbClient.getApplicantById === "function") {
          try {
            const myAppId = await dbClient.findApplicantIdByUid(user.uid);
            if (myAppId) {
              const myApplicant = await dbClient.getApplicantById(myAppId);
              const docsArr = Array.isArray(myApplicant?.documents) ? myApplicant.documents : (Array.isArray(myApplicant?.attachments) ? myApplicant.attachments : []);
              ownerVerified = docsArr.some((f) => {
                const fp = (f && (f.filePath || f.path || f.fileUrl || f.url || f.file_url) || "").toString().replace(/^\/+/, "");
                return fp === objectPath;
              });
            }
          } catch (e) {
            console.warn("[files:signed-url-owner] fallback ownership lookup failed", e && e.message);
          }
        } else {
          // dbClient missing helper methods -> cannot verify ownership here
          console.warn("[files:signed-url-owner] dbClient lacks expected methods (findApplicantIdByUid/getApplicantById)");
        }
      }

      if (!ownerVerified) {
        return res.status(403).json({ ok: false, error: "Forbidden: you do not own this file" });
      }

      // Create signed URL via Supabase
      const { data, error } = await supabaseServer.storage.from(BUCKET).createSignedUrl(objectPath, ttl);
      if (error) {
        console.error("[files:signed-url-owner] createSignedUrl error", { path: objectPath, ttl, error });
        return res.status(500).json({ ok: false, error: "Failed to create signed url", detail: error.message || error });
      }

      const expiresAt = Date.now() + ttl * 1000;
      return res.json({ ok: true, url: data && data.signedUrl ? data.signedUrl : null, expiresAt });
    } catch (err) {
      console.error("[files:signed-url-owner] unexpected error", err && (err.stack || err));
      return res.status(500).json({ ok: false, error: "Server error", message: err && err.message });
    }
  });

  return router;
}
