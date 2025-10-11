// server/routes/applicants.js
import express from "express";

/**
 * createApplicantsRouter({ db, dbClient, requireAuth, requireAdmin })
 *
 * - db: Firestore instance (admin.firestore())  [optional if dbClient provided]
 * - dbClient: your wrapper (with findApplicantIdByUid, getApplicantById)  [optional]
 * - requireAuth: middleware to require authenticated user
 * - requireAdmin: middleware to require admin role (optional)
 *
 * This router will prefer dbClient methods if provided; otherwise it will query Firestore directly.
 */
export default function createApplicantsRouter({ db, dbClient, requireAuth, requireAdmin } = {}) {
  if (!db && !dbClient) throw new Error("Either Firestore `db` or `dbClient` must be provided to applicants router");

  const router = express.Router();

  // Helper: convert Firestore doc snapshot to sanitized applicant shape (same keys returned in both codepaths)
  function sanitizeApplicantDocFromSnapshot(docSnapshot) {
    if (!docSnapshot || !docSnapshot.exists) return null;
    const data = docSnapshot.data() || {};

    const toIso = (val) => {
      try {
        if (!val) return null;
        if (typeof val === "object" && typeof val.toDate === "function") return val.toDate().toISOString();
        if (val instanceof Date) return val.toISOString();
        if (typeof val === "string") return val;
        return String(val);
      } catch (e) {
        return null;
      }
    };

    return {
      id: docSnapshot.id,
      uid: data.uid || null,
      displayName: data.displayName || data.name || null,
      email: data.contactEmail || data.email || null,
      submittedAt: toIso(data.submittedAt || data.createdAt || null),
      status: data.status || null,
      nextStepText: data.nextStepText || null,
      assignedReviewer: data.assignedReviewer || null,
      interview: data.interview || null,
      attachments: Array.isArray(data.documents) ? data.documents : (Array.isArray(data.attachments) ? data.attachments : []),
      messages: Array.isArray(data.messages) ? data.messages : [],
      publicAdminNotes: Array.isArray(data.publicAdminNotes) ? data.publicAdminNotes : [],
      // include other personal fields as-is so client can render them (e.g. address, phone, etc.)
      ...data // NOTE: this will include raw fields; it's convenient but be mindful of sensitive fields
    };
  }

  // Helper: sanitize when using dbClient (dbClient.getApplicantById likely returns plain object)
  function sanitizeApplicantFromDbClient(obj) {
    if (!obj) return null;
    // normalize createdAt/submittedAt if it's Firestore timestamp-like
    const toIso = (val) => {
      try {
        if (!val) return null;
        if (val && typeof val.toDate === "function") return val.toDate().toISOString();
        if (val instanceof Date) return val.toISOString();
        if (typeof val === "string") return val;
        return String(val);
      } catch (e) { return null; }
    };

    return {
      id: obj.id || obj._id || null,
      uid: obj.uid || null,
      displayName: obj.displayName || obj.name || null,
      email: obj.contactEmail || obj.email || null,
      submittedAt: toIso(obj.submittedAt || obj.createdAt || obj.submittedAt),
      status: obj.status || null,
      nextStepText: obj.nextStepText || null,
      assignedReviewer: obj.assignedReviewer || null,
      interview: obj.interview || null,
      attachments: Array.isArray(obj.documents) ? obj.documents : (Array.isArray(obj.attachments) ? obj.attachments : []),
      messages: Array.isArray(obj.messages) ? obj.messages : [],
      publicAdminNotes: Array.isArray(obj.publicAdminNotes) ? obj.publicAdminNotes : [],
      ...obj
    };
  }

  /**
   * GET /me
   * Return the applicant document associated with the logged-in user (req.user.uid).
   * Auth required.
   * This function will use dbClient if present (preferred) otherwise it will query Firestore via db.
   */
  router.get("/me", requireAuth, async (req, res) => {
    try {
      const requester = req.user;
      if (!requester || !requester.uid) return res.status(401).json({ ok: false, error: "Unauthorized" });

      // If dbClient is available, use it to find applicantId and load doc (preferred).
      if (dbClient && typeof dbClient.findApplicantIdByUid === "function" && typeof dbClient.getApplicantById === "function") {
        try {
          const applicantId = await dbClient.findApplicantIdByUid(requester.uid);
          if (!applicantId) {
            return res.status(404).json({ ok: false, error: "Applicant record not found for this user" });
          }
          const applicantRaw = await dbClient.getApplicantById(applicantId);
          if (!applicantRaw) return res.status(404).json({ ok: false, error: "Applicant not found" });

          const applicant = sanitizeApplicantFromDbClient(applicantRaw);
          return res.json({ ok: true, applicant });
        } catch (err) {
          console.error("[applicants:me] dbClient path error", err && (err.stack || err));
          return res.status(500).json({ ok: false, error: "Server error", details: err && err.message });
        }
      }

      // Otherwise, fall back to using Firestore db directly
      if (!db) {
        // shouldn't happen because we required db or dbClient earlier
        return res.status(500).json({ ok: false, error: "Server misconfiguration" });
      }

      try {
        const q = db.collection("teacherApplicants").where("uid", "==", requester.uid).limit(1);
        const snap = await q.get();
        if (snap.empty) {
          return res.status(404).json({ ok: false, error: "Applicant not found" });
        }
        const doc = snap.docs[0];
        const applicant = sanitizeApplicantDocFromSnapshot(doc);
        return res.json({ ok: true, applicant });
      } catch (err) {
        console.error("[applicants:me] firestore query failed", err && (err.stack || err));
        return res.status(500).json({ ok: false, error: "Server error", details: err && err.message });
      }
    } catch (err) {
      console.error("[applicants:me] unexpected error", err && (err.stack || err));
      return res.status(500).json({ ok: false, error: "Server error", details: err && err.message });
    }
  });

  /**
   * GET /:id
   * Return applicant document by Firestore doc id.
   * Admins can fetch any applicant. Non-admins can fetch only if doc.uid === req.user.uid.
   * This will also support both dbClient and db path.
   */
  router.get("/:id", requireAuth, async (req, res) => {
    try {
      const requester = req.user;
      if (!requester || !requester.uid) return res.status(401).json({ ok: false, error: "Unauthorized" });

      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });

      // If dbClient exists and has getApplicantById, use it
      if (dbClient && typeof dbClient.getApplicantById === "function") {
        try {
          const docObj = await dbClient.getApplicantById(id);
          if (!docObj) return res.status(404).json({ ok: false, error: "Applicant not found" });

          const ownerUid = docObj.uid || null;
          const isAdmin = !!(requester.role && String(requester.role).toLowerCase() === "admin");
          if (!isAdmin && (!ownerUid || ownerUid !== requester.uid)) {
            return res.status(403).json({ ok: false, error: "Forbidden" });
          }

          const applicant = sanitizeApplicantFromDbClient(docObj);
          return res.json({ ok: true, applicant });
        } catch (err) {
          console.error("[applicants/:id] dbClient.getApplicantById failed", err && (err.stack || err));
          return res.status(500).json({ ok: false, error: "Server error", details: err && err.message });
        }
      }

      // Fallback to Firestore db path
      if (!db) return res.status(500).json({ ok: false, error: "Server misconfiguration" });

      try {
        const ref = db.collection("teacherApplicants").doc(id);
        const snap = await ref.get();
        if (!snap.exists) return res.status(404).json({ ok: false, error: "Applicant not found" });

        const docData = snap.data() || {};
        const ownerUid = docData.uid || null;
        const isAdmin = !!(requester.role && String(requester.role).toLowerCase() === "admin");
        if (!isAdmin && (!ownerUid || ownerUid !== requester.uid)) {
          return res.status(403).json({ ok: false, error: "Forbidden" });
        }

        const applicant = sanitizeApplicantDocFromSnapshot(snap);
        return res.json({ ok: true, applicant });
      } catch (err) {
        console.error("[applicants/:id] firestore get failed", err && (err.stack || err));
        return res.status(500).json({ ok: false, error: "Server error", details: err && err.message });
      }
    } catch (err) {
      console.error("[applicants/:id] unexpected", err && (err.stack || err));
      return res.status(500).json({ ok: false, error: "Server error", details: err && err.message });
    }
  });

  return router;
}
