// server/dbClient.js

export default function createDbClient({ db, admin } = {}) {
  if (!db) throw new Error("db (Firestore) must be provided to dbClient");
  if (!admin)
    throw new Error("admin (firebase-admin) must be provided to dbClient");

  return {
    // Insert new message into applicant_messages collection
    insertMessage: async (msg) => {
      const payload = {
        applicantId: msg.applicantId || null,
        fromUid: msg.fromUid || null,
        senderName: msg.senderName || null,
        senderEmail: msg.senderEmail || null,
        subject: msg.subject || "",
        body: msg.body || "",
        recipients: Array.isArray(msg.recipients)
          ? msg.recipients
          : msg.recipients
          ? [msg.recipients]
          : [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      const docRef = await db.collection("applicant_messages").add(payload);
      return { id: docRef.id };
    },

    // Return admin users from users collection (uid, email, name)
    getAdminUsers: async () => {
      const snap = await db
        .collection("users")
        .where("role", "==", "admin")
        .get();
      return snap.docs.map((d) => {
        const data = d.data() || {};
        return {
          uid: d.id,
          email: data.email || null,
          name: data.displayName || data.name || null,
        };
      });
    },

    // Insert a basic notification record
    insertNotification: async (notif) => {
      const payload = {
        type: notif.type || "applicant_message",
        applicantId: notif.applicantId || null,
        messageId: notif.messageId || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        seenBy: Array.isArray(notif.seenBy) ? notif.seenBy : [],
      };
      const docRef = await db.collection("notifications").add(payload);
      return { id: docRef.id };
    },

    // Get messages for an applicant (returns array with createdAt as ISO string)
    getMessagesForApplicant: async (applicantId) => {
      if (!applicantId) return [];
      try {
        const snap = await db
          .collection("applicant_messages")
          .where("applicantId", "==", applicantId)
          .orderBy("createdAt", "asc")
          .get();

        return snap.docs.map((d) => {
          const data = d.data() || {};
          let createdAt = null;
          try {
            if (data.createdAt && typeof data.createdAt.toDate === "function") {
              createdAt = data.createdAt.toDate().toISOString();
            } else if (data.createdAt) {
              createdAt = String(data.createdAt);
            }
          } catch (e) {
            createdAt = null;
          }
          return {
            id: d.id,
            applicantId: data.applicantId,
            fromUid: data.fromUid,
            senderName: data.senderName,
            senderEmail: data.senderEmail,
            subject: data.subject,
            body: data.body,
            recipients: data.recipients || [],
            createdAt,
          };
        });
      } catch (err) {
        // Friendly handling for missing composite index (Firestore returns "requires an index" in message)
        const msg = err && err.message ? String(err.message) : "";
        if (
          msg.toLowerCase().includes("requires an index") ||
          msg.toLowerCase().includes("failed_precondition")
        ) {
          console.error(
            "dbClient.getMessagesForApplicant - missing index",
            err
          );
          // Throw a custom Error that routes can catch, or return a rejected Promise with a friendly shape
          const e = new Error(
            "Firestore index required: create composite index for applicant_messages on (applicantId, createdAt)"
          );
          e.code = "INDEX_REQUIRED";
          throw e;
        }
        // otherwise rethrow
        console.error(
          "dbClient.getMessagesForApplicant error",
          err && (err.stack || err)
        );
        throw err;
      }
    },

    // Find the teacherApplicants doc id that matches uid (returns doc id or null)
    findApplicantIdByUid: async (uid) => {
      if (!uid) return null;
      const q = await db
        .collection("teacherApplicants")
        .where("uid", "==", uid)
        .limit(1)
        .get();
      if (q.empty) return null;
      return q.docs[0].id;
    },

    // Get a full applicant document by its Firestore doc id (returns plain object or null)
    getApplicantById: async (applicantId) => {
      try {
        if (!applicantId) return null;
        const snap = await db
          .collection("teacherApplicants")
          .doc(applicantId)
          .get();
        if (!snap.exists) return null;
        return { id: snap.id, ...(snap.data() || {}) };
      } catch (err) {
        console.error("dbClient.getApplicantById error", err && err.message);
        throw err;
      }
    },
  };
}
