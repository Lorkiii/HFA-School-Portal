// server/routes/enrollees.js
import express from "express";
import multer from "multer";
import crypto from "crypto";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 } // 150MB limit (adjust as needed)
});

export default function createEnrolleesRouter(deps = {}) {
  const {
    db,
    supabase,
    admin,
    mailTransporter,
    defaultRequirementsObject,
    writeActivityLog,
    UPLOAD_BUCKET = "uploads",
    UPLOAD_SESSION_TTL_MS = (1000 * 60 * 60) // 1 hour default
  } = deps;

  const router = express.Router();

  // Helper: random suffix
  function randStr(len = 6) {
    return crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);
  }

  // POST /api/enrollees
  // Body: metadata (form fields) + metadata.requestedFiles = [{ slot, name }, ...]
  router.post("/enrollees", async (req, res) => {
    try {
      const formData = req.body || {};
      // basic validation: require formType (shs/jhs)
      const formType = String(formData.formType || "").trim().toLowerCase();
      if (!formType || (formType !== "shs" && formType !== "jhs")) {
        return res.status(400).json({ ok: false, error: "Missing or invalid formType (shs|jhs)" });
      }

      // requestedFiles can be an array of { slot, name }
      const requestedFiles = Array.isArray(formData.requestedFiles) ? formData.requestedFiles : [];

      // Prepare initial document
      const now = admin.firestore.FieldValue.serverTimestamp();
      const collection = (formType === "shs") ? "shsApplicants" : "jhsApplicants";
      const toSave = {
        ...formData,
        requestedFiles,
        status: "pending",
        requirements: defaultRequirementsObject ? defaultRequirementsObject() : {},
        isNew: true,
        createdAt: now,
        updatedAt: now
      };

      const docRef = await db.collection(collection).add(toSave);
      const studentId = docRef.id;

      // Build upload session doc that tracks allowed paths for this enrollee
      const allowedPaths = {};
      for (const rf of requestedFiles) {
        const slot = String(rf.slot || "").trim();
        const origName = String(rf.name || "").replace(/\s+/g, "_").slice(0, 200);
        if (!slot) continue;
        const ext = (origName.includes(".") ? origName.slice(origName.lastIndexOf(".") + 1) : "").slice(0, 10);
        const stamp = Date.now();
        const rand = randStr(6);
        const filename = ext ? `${slot}_${stamp}_${rand}.${ext}` : `${slot}_${stamp}_${rand}`;
        const path = `studentFiles/${studentId}/${filename}`;
        allowedPaths[slot] = { path, fileName: origName };
      }

      // Persist upload session so upload route can validate
      const expiresAt = Date.now() + UPLOAD_SESSION_TTL_MS;
      await db.collection("enrollee_upload_sessions").doc(studentId).set({
        studentId,
        allowedPaths,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt // store as number (ms since epoch) for easy server-side check
      });

      console.log("/api/enrollees created", { studentId, formType, requestedCount: requestedFiles.length });

      return res.json({
        ok: true,
        studentId,
        uploadTokens: allowedPaths // client will use server upload endpoint; tokens are server-trusted paths
      });
    } catch (err) {
      console.error("/api/enrollees error", err && (err.stack || err));
      return res.status(500).json({ ok: false, error: "Server error", message: err && err.message });
    }
  });

  // POST /api/enrollees/:id/upload
  // Accepts multipart form-data: fields: slot (string). File: 'file'
  // Server validates that slot is allowed and uploads file to Supabase (server role)
  router.post("/enrollees/:id/upload", upload.single("file"), async (req, res) => {
    try {
      const studentId = req.params.id;
      const slot = String(req.body.slot || "").trim();
      if (!studentId || !slot) return res.status(400).json({ ok: false, error: "Missing studentId or slot" });

      const sessionRef = db.collection("enrollee_upload_sessions").doc(studentId);
      const sessionSnap = await sessionRef.get();
      if (!sessionSnap.exists) return res.status(404).json({ ok: false, error: "Upload session not found" });
      const session = sessionSnap.data() || {};
      const allowed = (session.allowedPaths || {})[slot];
      if (!allowed || !allowed.path) {
        return res.status(403).json({ ok: false, error: "Slot not allowed for upload" });
      }

      // --- EXPIRY CHECK (added) ---
      if (session.expiresAt && typeof session.expiresAt === "number") {
        if (Date.now() > session.expiresAt) {
          return res.status(403).json({ ok: false, error: "Upload session expired" });
        }
      }
      // --- end expiry check ---

      if (!req.file || !req.file.buffer) return res.status(400).json({ ok: false, error: "No file provided" });

      // Upload to Supabase storage bucket using server client (service role)
      const bucket = UPLOAD_BUCKET;
      const path = allowed.path;
      const fileBuffer = req.file.buffer;
      const contentType = req.file.mimetype || "application/octet-stream";

      console.log(`/api/enrollees/${studentId}/upload: uploading slot=${slot} path=${path} size=${fileBuffer.length}`);

      // Use supabase server client to upload
      // supabase.storage.from(bucket).upload(path, fileBuffer, { upsert: true, contentType })
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, fileBuffer, {
        cacheControl: "3600",
        upsert: true,
        contentType
      });

      if (uploadError) {
        console.error("Supabase upload failed", uploadError);
        return res.status(500).json({ ok: false, error: "Upload failed", detail: uploadError.message || uploadError });
      }

      // get public url (server side)
      const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(path);
      const publicUrl = publicData ? (publicData.publicUrl || null) : null;

      // record upload entry in upload session (append)
      const docToAppend = {
        slot,
        fileName: allowed.fileName || (req.file.originalname || ""),
        size: req.file.size || fileBuffer.length,
        path,
        publicUrl,
        uploadedAt: admin.firestore.Timestamp.now()
      };

      await db.collection("enrollee_upload_sessions").doc(studentId).set({
        uploadedFiles: admin.firestore.FieldValue.arrayUnion(docToAppend),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      console.log(`/api/enrollees/${studentId}/upload success for slot=${slot}`);

      return res.json({ ok: true, slot, path, publicUrl, fileName: docToAppend.fileName, size: docToAppend.size });
    } catch (err) {
      console.error("/api/enrollees/:id/upload error", err && (err.stack || err));
      return res.status(500).json({ ok: false, error: "Server error", message: err && err.message });
    }
  });

  // POST /api/enrollees/:id/finalize
  // Body: { files: [ { slot, fileName, size, path, publicUrl } ] }
  // This will update the applicant doc: mark only uploaded slots as checked and save documents array
  router.post("/enrollees/:id/finalize", async (req, res) => {
    try {
      const studentId = req.params.id;
      const files = Array.isArray(req.body.files) ? req.body.files : [];
      if (!studentId) return res.status(400).json({ ok: false, error: "Missing studentId" });

      // Determine collection by checking document existence
      const shsRef = db.collection("shsApplicants").doc(studentId);
      const shsSnap = await shsRef.get();
      const jhsRef = db.collection("jhsApplicants").doc(studentId);
      const jhsSnap = await jhsRef.get();

      let appRef = null;
      let appSnap = null;
      let collectionName = null;
      if (shsSnap.exists) { appRef = shsRef; appSnap = shsSnap; collectionName = "shsApplicants"; }
      else if (jhsSnap.exists) { appRef = jhsRef; appSnap = jhsSnap; collectionName = "jhsApplicants"; }
      else {
        return res.status(404).json({ ok: false, error: "Enrollee application not found" });
      }

      const appData = appSnap.data() || {};
      // Only allow finalize when status is pending
      if ((appData.status || "").toLowerCase() !== "pending") {
        return res.status(403).json({ ok: false, error: "Application not pending or already processed" });
      }

      // Fetch the upload session to verify uploaded files
      const sessionRef = db.collection("enrollee_upload_sessions").doc(studentId);
      const sessionSnap = await sessionRef.get();
      const session = sessionSnap.exists ? sessionSnap.data() : null;
      const uploadedArray = session && Array.isArray(session.uploadedFiles) ? session.uploadedFiles : [];

      // If upload session expired, still allow finalize only if uploadedFiles recorded
      if (session && session.expiresAt && Date.now() > session.expiresAt && (!uploadedArray || !uploadedArray.length)) {
        return res.status(403).json({ ok: false, error: "Upload session expired and no uploaded files found" });
      }

      // Build map of uploaded slots (merge with provided files but prefer server recorded uploadedFiles)
      const uploadedBySlot = {};
      for (const u of uploadedArray) {
        if (u && u.slot) uploadedBySlot[u.slot] = u;
      }
      // override/augment with client-provided files (if any)
      for (const f of files) {
        if (f && f.slot) {
          uploadedBySlot[f.slot] = {
            slot: f.slot,
            fileName: f.fileName || f.name || "",
            path: f.path || (uploadedBySlot[f.slot] && uploadedBySlot[f.slot].path) || "",
            publicUrl: f.publicUrl || (uploadedBySlot[f.slot] && uploadedBySlot[f.slot].publicUrl) || "",
            size: f.size || (uploadedBySlot[f.slot] && uploadedBySlot[f.slot].size) || 0,
            uploadedAt: admin.firestore.Timestamp.now()
          };
        }
      }

      const uploadedSlots = Object.keys(uploadedBySlot);
      // Build documents array to persist
      const documents = uploadedSlots.map(s => {
        const u = uploadedBySlot[s];
        return {
          slot: s,
          fileName: u.fileName || "",
          filePath: u.path || "",
          fileUrl: u.publicUrl || "",
          size: u.size || 0,
          uploadedAt: u.uploadedAt || admin.firestore.Timestamp.now()
        };
      });

      // Update requirements: set checked=true only for uploaded slots
      const currentRequirements = appData.requirements || (defaultRequirementsObject ? defaultRequirementsObject() : {});
      const updatedRequirements = { ...currentRequirements };
      for (const slot of uploadedSlots) {
        if (!updatedRequirements[slot]) {
          // create a minimal requirement entry if missing
          updatedRequirements[slot] = { label: slot, checked: true };
        } else {
          updatedRequirements[slot] = { ...updatedRequirements[slot], checked: true };
        }
      }

      // Persist documents and updated requirements and mark status submitted
      await appRef.set({
        documents,
        requirements: updatedRequirements,
        status: "submitted",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      // Optionally delete upload session (clean up)
      await sessionRef.delete().catch(() => {});

      console.log(`/api/enrollees/${studentId}/finalize success: uploadedSlots=${uploadedSlots.join(",")}`);

      // Write activity log
      try {
        await writeActivityLog && writeActivityLog({
          actorUid: null,
          actorEmail: appData.email || appData.contactEmail || null,
          targetUid: null,
          action: "enrollee-submitted",
          detail: `studentId:${studentId} uploaded:${uploadedSlots.join(",")}`
        });
      } catch (e) {
        console.warn("writeActivityLog (enrollees finalize) failed", e && e.message);
      }

      return res.json({ ok: true, studentId, uploadedSlots, numFiles: documents.length });
    } catch (err) {
      console.error("/api/enrollees/:id/finalize error", err && (err.stack || err));
      return res.status(500).json({ ok: false, error: "Server error", message: err && err.message });
    }
  });

  // Expose router
  return router;
}
