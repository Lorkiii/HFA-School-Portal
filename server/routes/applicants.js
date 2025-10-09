// server/routes/applicants.js
import express from "express";

/**
 * createApplicantsRouter({ db, requireAuth, requireAdmin })
 *
 * db: Firestore instance (admin.firestore())
 * requireAuth: middleware to require authenticated user (populates req.user { uid, role, email })
 * requireAdmin: middleware to require admin role (optional; used only if you need admin-only endpoints)
 */
export default function createApplicantsRouter({ db, requireAuth, requireAdmin } = {}) {
  if (!db) throw new Error("Firestore `db` must be provided to applicants router");

  const router = express.Router();

  // Helper: pick public fields from doc data and convert timestamps to ISO strings
  function sanitizeApplicantDoc(docSnapshot) {
    const data = docSnapshot && docSnapshot.exists ? docSnapshot.data() : null;
    if (!data) return null;

    const pick = (key) => {
      if (!(key in data)) return undefined;
      return data[key];
    };

    // Helper to convert Firestore Timestamp to ISO (if present)
    const toIso = (val) => {
      try {
        if (!val) return null;
        if (val.toDate && typeof val.toDate === "function") return val.toDate().toISOString();
        // if it's a Date object
        if (val instanceof Date) return val.toISOString();
        // if already a string, return as-is
        if (typeof val === "string") return val;
        return String(val);
      } catch (e) {
        return null;
      }
    };

    const out = {
      id: docSnapshot.id,
      uid: pick("uid") || null,
      displayName: pick("displayName") || pick("name") || null,
      email: pick("contactEmail") || pick("email") || null,
      submittedAt: toIso(pick("submittedAt") || pick("createdAt") || null),
      status: pick("status") || null,
      nextStepText: pick("nextStepText") || null,
      assignedReviewer: pick("assignedReviewer") || null,
      // interview can be an object; passthrough as-is
      interview: pick("interview") || null,
      // attachments/messages: keep arrays but ensure structure is simple
      attachments: Array.isArray(pick("documents") || pick("attachments")) ? (pick("documents") || pick("attachments")) : [],
      messages: Array.isArray(pick("messages")) ? pick("messages") : [],
      // public-facing admin notes, if present (do NOT include internalAdminNotes)
      publicAdminNotes: Array.isArray(pick("publicAdminNotes")) ? pick("publicAdminNotes") : [],
    };

    return out;
  }

  /**
   * GET /me
   * Return the applicant document associated with the logged-in user (req.user.uid).
   * Auth required.
   */
  router.get("/me", requireAuth, async (req, res) => {
    try {
      const requester = req.user;
      if (!requester || !requester.uid) return res.status(401).json({ ok: false, error: "Unauthorized" });

      // Query teacherApplicants where uid == requester.uid
      const q = db.collection("teacherApplicants").where("uid", "==", requester.uid).limit(1);
      const snap = await q.get();

      if (snap.empty) {
        // not found
        return res.status(404).json({ ok: false, error: "Applicant not found" });
      }

      const doc = snap.docs[0];
      const applicant = sanitizeApplicantDoc(doc);

      return res.json({ ok: true, applicant });
    } catch (err) {
      console.error("[applicants:me] error", err && (err.stack || err));
      return res.status(500).json({ ok: false, error: "Server error", message: err && err.message });
    }
  });

  /**
   * GET /:id
   * Return applicant document by Firestore doc id.
   * Admins can fetch any applicant. Non-admins can fetch only if doc.uid === req.user.uid.
   */
  router.get("/:id", requireAuth, async (req, res) => {
    try {
      const requester = req.user;
      if (!requester || !requester.uid) return res.status(401).json({ ok: false, error: "Unauthorized" });

      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });

      const ref = db.collection("teacherApplicants").doc(id);
      const snap = await ref.get();

      if (!snap.exists) return res.status(404).json({ ok: false, error: "Applicant not found" });

      const docData = snap.data() || {};
      const ownerUid = docData.uid || null;

      // If requester is admin, allow
      const isAdmin = (requester.role && String(requester.role).toLowerCase() === "admin");

      if (!isAdmin) {
        // allow only if owner uid matches requester.uid
        if (!ownerUid || ownerUid !== requester.uid) {
          return res.status(403).json({ ok: false, error: "Forbidden" });
        }
      }

      const applicant = sanitizeApplicantDoc(snap);
      return res.json({ ok: true, applicant });
    } catch (err) {
      console.error("[applicants/:id] error", err && (err.stack || err));
      return res.status(500).json({ ok: false, error: "Server error", message: err && err.message });
    }
  });

  // Optionally, add other applicant endpoints here in future (attachments listing, admin-only fields, etc.)

  return router;
}
