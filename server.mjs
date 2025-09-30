// server.mjs
// --- MODULE IMPORTS ---
import dotenv from "dotenv";
dotenv.config();
import express from "express";
import admin from "firebase-admin";
import nodemailer from "nodemailer";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import cors from "cors";
import { supabaseServer } from "./server-supabase-config.js";

// --- FILE PATH HELPERS ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- IN-MEMORY STORE---
const otpStore = new Map(); // uid -> { otp, expiresAt, email, lastSentAt, resendCount, firstResendAt }
// revoked tokens store (in-memory)
// token string -> expiryTimestamp
const revokedTokens = new Map();

// revoke token helper: store token with its expiry (decoded.exp)
function revokeToken(token) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) {
      const fallbackExpiry = Date.now() + 60 * 60 * 1000;
      revokedTokens.set(token, fallbackExpiry);
      setTimeout(() => revokedTokens.delete(token), 60 * 60 * 1000);
      return;
    }
    const expMs = decoded.exp * 1000;
    const ttl = Math.max(expMs - Date.now(), 0);
    revokedTokens.set(token, expMs);
    if (ttl > 0) setTimeout(() => revokedTokens.delete(token), ttl);
  } catch (err) {
    const fallbackExpiry = Date.now() + 60 * 60 * 1000;
    revokedTokens.set(token, fallbackExpiry);
    setTimeout(() => revokedTokens.delete(token), 60 * 60 * 1000);
  }
}

// --- LOAD FIREBASE SERVICE ACCOUNT (server-side only) ---
const serviceAccount = JSON.parse(
  fs.readFileSync(new URL("./serviceAccountKey.json", import.meta.url))
);

// --- EXPRESS APP SETUP ---
const app = express();

// Enable CORS for development origins — update as necessary for production
app.use(
  cors({
    origin: ["http://127.0.0.1:5500", "http://localhost:3000", "http://localhost:5500"],
    credentials: true,
  })
);

app.use(bodyParser.json({ limit: "15mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

// --- INITIALIZE FIREBASE ADMIN ---
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// --- SUPABASE SERVER CLIENT (service role) ---
const supabase = supabaseServer; // from server-supabase-config.js

// --- SMTP / EMAIL SETUP ---
// jwt .env secret
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("FATAL: JWT_SECRET is not set. Please set JWT_SECRET in your environment or .env file and restart the server.");
  process.exit(1);
}

// SMTP credentials: support SMTP_USER or SMTP_EMAIL env var names
const SMTP_USER = process.env.SMTP_USER || process.env.SMTP_EMAIL;
const SMTP_PASS = process.env.SMTP_PASS;

if (!SMTP_USER || !SMTP_PASS) {
  console.warn("Warning: SMTP_USER or SMTP_PASS not set. Email sending (OTP, notifications) may fail.");
}

// create transporter (nodemailer)
const mailTransporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

// Helper to generate 6-digit OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ----------------- AUTH ENDPOINTS -----------------

/**
 * POST /auth/login
 * Body: { idToken }
 * - verifies Firebase idToken using admin.auth().verifyIdToken
 * - checks users/{uid}.role and profile.forcePasswordChange
 * - if admin: generate OTP, email it, store in otpStore keyed by uid
 * - if applicant (or other roles): sign JWT immediately and return forcePasswordChange flag
 */
app.post("/auth/login", async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: "Missing idToken" });

    // verify Firebase idToken
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      console.warn("/auth/login invalid idToken", err && err.message);
      return res.status(401).json({ error: "Invalid idToken" });
    }

    const uid = decoded.uid;
    const email = decoded.email || null;

    // fetch profile from Firestore users/{uid}
    const userSnap = await db.collection("users").doc(uid).get();
    const profile = userSnap.exists ? userSnap.data() : null;
    const role = profile?.role || "applicant";
    const forcePasswordChange = profile?.forcePasswordChange ? true : false;

    // OTP only for admins
    if (role === "admin") {
      // require email to send OTP
      const userEmail = (profile && profile.email) || email;
      if (!userEmail) {
        return res.status(400).json({ error: "No email available for this account. Contact support." });
      }

      const otp = generateOtp();
      const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
      // store by uid (new OTP session or overwrite)
      otpStore.set(uid, {
        otp,
        expiresAt,
        email: userEmail,
        lastSentAt: Date.now(),
        resendCount: 0,
        firstResendAt: Date.now()
      });

      // send it via your mailTransporter
      const mailOptions = {
        from: `"Holy Family Academy" <${SMTP_USER}>`,
        to: userEmail,
        subject: "Your login code",
        html: `<p>Your admin login code is <strong>${otp}</strong>. It expires in 5 minutes.</p>`
      };
      try {
        await mailTransporter.sendMail(mailOptions);
      } catch (mailErr) {
        console.warn("/auth/login: failed to send OTP email:", mailErr && mailErr.message);
        // proceed: return needsOtp even if email failed (client may ask admin to check)
      }

      return res.json({ ok: true, needsOtp: true, message: "OTP sent to email" });
    }

    // Applicant and other roles: sign JWT immediately
    const tokenPayload = { uid, role, email };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "1d" });

    return res.json({ ok: true, token, role, forcePasswordChange });
  } catch (err) {
    console.error("/auth/login error", err && (err.stack || err));
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /auth/verify-otp
 * Body: { otp, idToken?, email? }
 * - If OTP valid: issue server JWT { uid, role, email } and return forcePasswordChange if present
 */
app.post("/auth/verify-otp", async (req, res) => {
  try {
    const { otp, idToken, email } = req.body;
    if (!otp) return res.status(400).json({ error: "Missing otp" });

    let uid = null;
    let decoded = null;
    if (idToken) {
      try {
        decoded = await admin.auth().verifyIdToken(idToken);
        uid = decoded.uid;
      } catch (err) {
        // invalid idToken - we'll try to locate by email if provided
        uid = null;
      }
    }

    if (!uid) {
      if (!email) return res.status(400).json({ error: "Missing uid/idToken or email to locate OTP" });
      // find entry in otpStore by email
      for (const [k, v] of otpStore.entries()) {
        if (v.email && v.email.toLowerCase() === (email || "").toLowerCase()) {
          uid = k;
          break;
        }
      }
    }

    if (!uid) return res.status(400).json({ error: "No pending OTP found. Please login again." });

    const stored = otpStore.get(uid);
    if (!stored) return res.status(400).json({ error: "No pending OTP for this account. Please login again." });

    if (Date.now() > stored.expiresAt) {
      otpStore.delete(uid);
      return res.status(400).json({ error: "OTP expired. Please resend code." });
    }

    if (stored.otp !== otp) {
      return res.status(401).json({ error: "Invalid code. Please try again." });
    }

    // Valid: delete OTP, issue server JWT
    otpStore.delete(uid);

    const profileSnap = await db.collection('users').doc(uid).get();
    const role = profileSnap && profileSnap.exists ? (profileSnap.data().role || "admin") : "admin";
    const userEmail = (profileSnap && profileSnap.exists && profileSnap.data().email) || stored.email || null;
    const forcePasswordChange = profileSnap && profileSnap.exists ? !!profileSnap.data().forcePasswordChange : false;

    const tokenPayload = { uid, role, email: userEmail };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "1d" });

    return res.json({ ok: true, token, role, forcePasswordChange });
  } catch (err) {
    console.error("/auth/verify-otp error", err && (err.stack || err));
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /auth/logout
 * - Revokes a server-issued JWT so it cannot be used again (in-memory blacklist)
 * - Accepts token via Authorization header or { token } in body
 */
app.post("/auth/logout", (req, res) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) token = authHeader.split("Bearer ")[1];
    else token = req.body && req.body.token;
    if (!token) return res.status(400).json({ error: "No token provided to revoke" });

    revokeToken(token);
    return res.json({ success: true, message: "Logged out" });
  } catch (err) {
    console.error("/auth/logout error", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ========== Resend OTP configuration & helper ==========
const RESEND_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes
const RESEND_WINDOW_MS = 60 * 60 * 1000; // 1 hour rolling window
const MAX_RESENDS = 5; // max resends per RESEND_WINDOW_MS

// helper: find uid by email in otpStore (returns uid or null)
function findUidByEmailInOtpStore(email) {
  if (!email) return null;
  const low = (email || "").toLowerCase();
  for (const [k, v] of otpStore.entries()) {
    if (v && v.email && v.email.toLowerCase() === low) return k;
  }
  return null;
}

// ========== POST /auth/resend-otp ==========
app.post("/auth/resend-otp", async (req, res) => {
  try {
    const { idToken, email } = req.body || {};
    let uid = null;
    let userEmail = email || null;

    // Try to verify idToken if provided (preferred)
    if (idToken) {
      try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        uid = decoded.uid;
        userEmail = decoded.email || userEmail;
      } catch (err) {
        // invalid idToken -> we'll fall back to email lookup if provided
        uid = null;
      }
    }

    // if no uid yet, try to find by email in otpStore
    if (!uid) {
      if (!userEmail) {
        return res.status(400).json({ error: "Missing idToken or email to identify account." });
      }
      uid = findUidByEmailInOtpStore(userEmail);
      if (!uid) {
        // No existing OTP session found for this email -> ask client to re-login
        return res.status(400).json({ error: "No pending OTP session found. Please login again." });
      }
    }

    // Now we have uid and userEmail (if userEmail still null, try to read from store)
    let entry = otpStore.get(uid) || null;
    if (!entry) {
      // If no entry exists in otpStore for uid, create a minimal one (email should exist)
      entry = {
        email: userEmail,
        otp: null,
        expiresAt: 0,
        lastSentAt: 0,
        resendCount: 0,
        firstResendAt: 0
      };
    } else {
      if (!entry.email && userEmail) entry.email = userEmail;
    }

    const now = Date.now();

    // Rate limit window reset if firstResendAt older than window
    if (!entry.firstResendAt || (now - (entry.firstResendAt || 0) > RESEND_WINDOW_MS)) {
      entry.firstResendAt = now;
      entry.resendCount = 0;
    }

    // Check overall rate limit (max resends in window)
    if ((entry.resendCount || 0) >= MAX_RESENDS) {
      const retryAfter = Math.ceil(((entry.firstResendAt || 0) + RESEND_WINDOW_MS - now) / 1000);
      return res.status(429).json({ error: "Resend limit reached. Try later.", retryAfter });
    }

    // Check cooldown (3 minutes between sends)
    const sinceLast = now - (entry.lastSentAt || 0);
    if (entry.lastSentAt && sinceLast < RESEND_COOLDOWN_MS) {
      const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - sinceLast) / 1000);
      return res.status(429).json({ error: "Cooldown active. Try again later.", retryAfter });
    }

    // Generate new OTP and update entry
    const otp = generateOtp();
    entry.otp = otp;
    entry.expiresAt = now + 5 * 60 * 1000; // 5 minutes expiry
    entry.lastSentAt = now;
    entry.resendCount = (entry.resendCount || 0) + 1;
    if (!entry.firstResendAt) entry.firstResendAt = now;

    // persist back to otpStore
    otpStore.set(uid, entry);

    // Prepare email
    const mailOptions = {
      from: `"Holy Family Academy" <${SMTP_USER}>`,
      to: entry.email,
      subject: "Your admin login code (resend)",
      html: `<p>Your admin login code is <strong>${otp}</strong>. It expires in 5 minutes.</p>`
    };

    try {
      await mailTransporter.sendMail(mailOptions);
      const nextAllowedIn = Math.ceil(RESEND_COOLDOWN_MS / 1000);
      return res.json({
        ok: true,
        message: "OTP resent to your email.",
        nextAllowedIn,
        emailed: true
      });
    } catch (mailErr) {
      console.warn("/auth/resend-otp: sendMail failed:", mailErr && (mailErr.message || mailErr));
      const nextAllowedIn = Math.ceil(RESEND_COOLDOWN_MS / 1000);
      return res.json({
        ok: false,
        message: "Failed to send OTP. Please try logging in again.",
        nextAllowedIn,
        emailed: false
      });
    }
  } catch (err) {
    console.error("/auth/resend-otp error", err && (err.stack || err));
    return res.status(500).json({ error: "Server error" });
  }
});

// --- MIDDLEWARE ---
// Updated requireAdmin: accept Firebase ID tokens OR server JWTs (signed with JWT_SECRET)
// and reject revoked server JWTs
async function requireAdmin(req, res, next) {
  try {
    // Read token only from Authorization header (Bearer ...)
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.split('Bearer ')[1];

    if (!token) return res.status(401).json({ error: 'No token provided', message: 'Missing authentication token. Please sign in.' });

    let uid = null;
    // Try Firebase ID token verification first
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      uid = decoded.uid;
    } catch (firebaseErr) {
      // If not a Firebase ID token, try verifying our server-signed JWT
      try {
        if (revokedTokens.has(token)) {
          return res.status(401).json({ error: "Token revoked", message: "Your session has been revoked. Please sign in again." });
        }
        const decoded2 = jwt.verify(token, JWT_SECRET);
        uid = decoded2.uid;
      } catch (jwtErr) {
        console.error('requireAdmin token verification failed', firebaseErr && firebaseErr.message, jwtErr && jwtErr.message);
        return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token. Please sign in.' });
      }
    }

    if (!uid) return res.status(401).json({ error: 'Invalid token', message: 'Invalid authentication token.' });

    const userDoc = await db.collection('users').doc(uid).get();
    const role = userDoc.exists ? userDoc.data().role : null;
    if (role !== 'admin') return res.status(403).json({ error: 'Forbidden: admin only', message: 'You must be an admin to access this resource.' });

    // attach admin info
    req.adminUser = { uid, email: userDoc.exists ? userDoc.data().email : null };
    next();
  } catch (err) {
    console.error('requireAdmin error', err);
    return res.status(401).json({ error: 'Unauthorized', message: 'Authentication failed.' });
  }
}

// requireAuth middleware (for applicants / teacher-protected endpoints) ----
// Accepts Firebase ID tokens OR server JWTs (signed with JWT_SECRET).
async function requireAuth(req, res, next) {
  try {
    // get token from Authorization: Bearer <token> or cookie __session
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.split('Bearer ')[1];

    if (!token) return res.status(401).json({ error: 'No token provided' });

    let uid = null;
    let email = null;
    let role = null;

    // Try Firebase ID token first
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      uid = decoded.uid;
      email = decoded.email || null;
    } catch (firebaseErr) {
      // Not a Firebase token: try server JWT
      try {
        // reject revoked tokens early
        if (revokedTokens.has(token)) {
          return res.status(401).json({ error: "Token revoked" });
        }
        const decoded2 = jwt.verify(token, JWT_SECRET);
        uid = decoded2.uid;
        email = decoded2.email || null;
        role = decoded2.role || null;
      } catch (jwtErr) {
        console.error('requireAuth token verification failed', firebaseErr && firebaseErr.message, jwtErr && jwtErr.message);
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    if (!uid) return res.status(401).json({ error: 'Invalid token' });

    // Read role/email from Firestore users/{uid} if present, otherwise use role/email from token
    const userDoc = await db.collection('users').doc(uid).get();
    const docRole = userDoc.exists ? userDoc.data().role : null;
    const docEmail = userDoc.exists ? userDoc.data().email : null;

    req.user = {
      uid,
      role: docRole || role || null,
      email: docEmail || email || null
    };

    next();
  } catch (err) {
    console.error('requireAuth error', err);
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

/* helper to write activity logs */
async function writeActivityLog({ actorUid, actorEmail, targetUid = null, action, detail = '' }) {
  try {
    await db.collection('activity_logs').add({
      actorUid,
      actorEmail,
      targetUid,
      action,
      detail,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('Failed to write activity log:', err);
  }
}

// ---- NEW: GET /auth/validate endpoint ----
app.get('/auth/validate', async (req, res) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.split('Bearer ')[1];
    else if (req.cookies && req.cookies.__session) token = req.cookies.__session;

    if (!token) return res.status(401).json({ error: 'Missing token' });

    let uid = null;
    let role = null;
    let email = null;

    // Try Firebase ID token first
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      uid = decoded.uid;
      email = decoded.email || null;
    } catch (firebaseErr) {
      // Not a Firebase token: try server JWT
      try {
        if (revokedTokens.has(token)) return res.status(401).json({ error: 'Token revoked' });
        const decoded2 = jwt.verify(token, JWT_SECRET);
        uid = decoded2.uid;
        role = decoded2.role || null;
        email = decoded2.email || null;
      } catch (jwtErr) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    // Try to enrich from Firestore
    try {
      const snap = await db.collection('users').doc(uid).get();
      if (snap.exists) {
        role = snap.data().role || role;
        email = snap.data().email || email;
      }
    } catch (e) {
      console.warn('/auth/validate: failed to read user doc', e && e.message);
    }

    return res.json({ ok: true, uid, role, email });
  } catch (err) {
    console.error('/auth/validate error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /auth/clear-force-password
 * Body: { uid? }
 * - Requires authentication (Firebase ID token or server JWT) via requireAuth middleware.
 * - Clears users/{uid}.forcePasswordChange = false for the requesting user (or for uid if admin).
 */
app.post('/auth/clear-force-password', requireAuth, async (req, res) => {
  try {
    const requester = req.user; // set by requireAuth
    if (!requester || !requester.uid) return res.status(401).json({ error: 'Unauthorized' });

    const { uid: bodyUid } = req.body || {};
    const targetUid = (bodyUid && String(bodyUid).trim()) ? String(bodyUid).trim() : requester.uid;

    // allow admins to clear any uid; non-admins only their own
    const isAdmin = requester.role === 'admin';
    if (!isAdmin && targetUid !== requester.uid) {
      return res.status(403).json({ error: 'Forbidden', message: 'Only admins may clear other users' });
    }

    const userRef = db.collection('users').doc(targetUid);
    await userRef.set({
      forcePasswordChange: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await writeActivityLog({
      actorUid: requester.uid,
      actorEmail: requester.email || null,
      targetUid,
      action: 'clear-force-password',
      detail: `cleared_by:${requester.uid}`
    });

    return res.json({ ok: true, clearedFor: targetUid });
  } catch (err) {
    console.error('/auth/clear-force-password error', err && (err.stack || err));
    return res.status(500).json({ error: 'Server error' });
  }
});

// --- STATIC FILE SERVING ---
app.use("/adminportal", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});
app.use(express.static(path.join(__dirname)));
app.use("/login", express.static(path.join(__dirname, "login")));
app.use("/adminportal", express.static(path.join(__dirname, "adminportal")));
app.use("/applicationform", express.static(path.join(__dirname, "applicationform")));
app.use("/teacher-application", express.static(path.join(__dirname, "teacher-application")));
app.use("/assets", express.static(path.join(__dirname, "assets")));

// Serve main.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "main.html"));
});
app.get("/main.html", (req, res) => {
  res.sendFile(path.join(__dirname, "main.html"));
});

// requirements mapping
const requirementMap = {
  reportcard: "FORM 138 / Report Card",
  psa: "PSA / Birth Certificate",
  goodMoral: "Certificate of Good Moral Character",
  form137: "FORM 137",
  completionCertificate: "Certificate of Completion",
  clearance: "Clearance Certificate",
  idPhoto: "ID Photo",
  medicalForm: "Medical Form",
};

const defaultSlots = Object.keys(requirementMap);
function defaultRequirementsObject() {
  const out = {};
  for (const [slot, label] of Object.entries(requirementMap)) {
    out[slot] = { label, checked: false };
  }
  return out;
}

// routes
app.get("/teachers", async (req, res) => {
  try {
    const snapshot = await db.collection("teachers").get();
    const teachers = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(teachers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve applicant and move to teachers
app.post("/approve-applicant/:id", async (req, res) => {
  try {
    const applicantRef = db.collection("applicants").doc(req.params.id);
    const snap = await applicantRef.get();

    if (!snap.exists) {
      return res.status(404).json({ error: "Applicant not found" });
    }
    const applicantData = snap.data();

    await db.collection("teachers").add({
      name: applicantData.name,
      position: applicantData.position,
      department: applicantData.department,
      status: "Active",
      createdAt: new Date(),
    });

    await applicantRef.delete();
    res.json({ message: "Applicant approved and moved to teachers" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- FORM SUBMISSION ENDPOINT (legacy) ---
app.post("/api/submit-application", async (req, res) => {
  try {
    const formData = req.body;
    // Determine Firestore collection
    let collectionName = "";
    if (formData.formType === "jhs") collectionName = "jhsApplicants";
    else if (formData.formType === "shs") collectionName = "shsApplicants";
    else if (formData.formType === "teacher") {
      
      // The new client should call /applicants/create. Here we still support old calls:
      // create auth user & send credentials (legacy, not recommended).
      // For safety, return an error telling client to use /applicants/create.
      return res.status(400).json({ error: "Use /applicants/create for teacher applications" });
    } else return res.status(400).json({ error: "Invalid form type." });

    // JHS / SHS applicant
    const toSave = {
      ...formData,
      status: "pending",
      requirements: defaultRequirementsObject(),
      isNew: true,
      enrolled: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection(collectionName).add(toSave);
    const newId = docRef.id;
    res.status(200).json({ success: true, newId });
  } catch (error) {
    console.error("Submission error:", error && (error.stack || error));
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/* ---------- NEW endpoints for applicant create + email confirmation ---------- */

/**
 * POST /applicants/create
 * Body: application payload (teacher form)
 * Creates teacherApplicants/{id} doc with status "pending" and returns applicationId.
 * DOES NOT create Firebase Auth user or send credentials.
 */
app.post('/applicants/create', async (req, res) => {
  try {
    const formData = req.body || {};
    if (formData.formType !== 'teacher') return res.status(400).json({ error: 'Invalid call for non-teacher form' });

    const firstName = (formData.firstName || "").trim();
    const lastName = (formData.lastName || "").trim();
    const displayName = `${firstName} ${lastName}`.trim();

    // create a Firestore doc with auto-id
    const docRef = db.collection('teacherApplicants').doc(); // new id
    const id = docRef.id;

    const toSave = {
      ...formData,
      firstName,
      lastName,
      displayName,
      contactEmail: (formData.email || "").toLowerCase(),
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await docRef.set(toSave);
    return res.json({ success: true, applicationId: id });
  } catch (err) {
    console.error('/applicants/create error', err && (err.stack || err));
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /applicants/:id/attach-files
 * Body: { files: [...] }
 * Optional helper: attach uploaded file metadata to the application record.
 */
app.post('/applicants/:id/attach-files', async (req, res) => {
  try {
    const id = req.params.id;
    const files = Array.isArray(req.body.files) ? req.body.files : [];
    if (!id) return res.status(400).json({ error: 'Missing id' });

    await db.collection('teacherApplicants').doc(id).set({
      documents: files,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return res.json({ ok: true });
  } catch (err) {
    console.error('/applicants/:id/attach-files error', err && (err.stack || err));
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /applicants/send-code
 * Body: { applicationId, email }
 * Generate 6-digit code, store to Firestore collection email_confirmations/{applicationId},
 * send email to applicant, and return cooldown info.
 */
app.post('/applicants/send-code', async (req, res) => {
  try {
    const { applicationId, email } = req.body || {};
    if (!applicationId || !email) return res.status(400).json({ error: 'Missing applicationId or email' });

    // fetch application to validate it exists
    const appSnap = await db.collection('teacherApplicants').doc(applicationId).get();
    if (!appSnap.exists) return res.status(404).json({ error: 'Application not found' });

    const CONF = db.collection('email_confirmations').doc(applicationId);
    const now = Date.now();
    const cooldownMs = 3 * 60 * 1000; // 3 minutes
    const windowMs = 60 * 60 * 1000; // 1 hour
    const MAX_RESENDS = 5;

    const doc = await CONF.get();
    let entry = doc.exists ? doc.data() : null;

    if (!entry) {
      entry = {
        email,
        otp: null,
        expiresAt: 0,
        lastSentAt: 0,
        resendCount: 0,
        firstResendAt: now
      };
    } else {
      if (entry.lastSentAt && (now - entry.lastSentAt) < cooldownMs) {
        const retryAfter = Math.ceil((cooldownMs - (now - entry.lastSentAt)) / 1000);
        return res.status(429).json({ error: 'Cooldown active', retryAfter });
      }
      if (!entry.firstResendAt || (now - entry.firstResendAt) > windowMs) {
        entry.firstResendAt = now;
        entry.resendCount = 0;
      }
      if ((entry.resendCount || 0) >= MAX_RESENDS) {
        const retryAfter = Math.ceil(((entry.firstResendAt || 0) + windowMs - now) / 1000);
        return res.status(429).json({ error: 'Resend limit reached', retryAfter });
      }
    }

    const otp = generateOtp();
    entry.otp = otp;
    entry.expiresAt = now + (5 * 60 * 1000); // 5 min
    entry.lastSentAt = now;
    entry.resendCount = (entry.resendCount || 0) + 1;

    await CONF.set(entry, { merge: true });

    // send email
    const mailOptions = {
      from: `"Holy Family Academy" <${SMTP_USER}>`,
      to: email,
      subject: "Your application confirmation code",
      html: `<p>Your confirmation code is <strong>${otp}</strong>. It expires in 5 minutes.</p>`
    };

    try {
      await mailTransporter.sendMail(mailOptions);
      const nextAllowedIn = Math.ceil(cooldownMs / 1000);
      return res.json({ ok: true, message: 'Code sent', nextAllowedIn, emailed: true });
    } catch (mailErr) {
      console.warn('/applicants/send-code mail fail', mailErr && mailErr.message);
      const nextAllowedIn = Math.ceil(cooldownMs / 1000);
      return res.json({ ok: false, message: 'Failed to send code. Try again later', nextAllowedIn, emailed: false });
    }
  } catch (err) {
    console.error('/applicants/send-code error', err && (err.stack || err));
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /applicants/confirm-email
 * Body: { applicationId, email, code, displayName }
 * Verifies the code; if valid:
 *  - create Firebase Auth user (email + temp password),
 *  - create users/{uid} doc with forcePasswordChange,
 *  - update teacherApplicants/{applicationId} with uid & status,
 *  - send credentials email (temp password) to applicant
 */
app.post('/applicants/confirm-email', async (req, res) => {
  try {
    const { applicationId, email, code, displayName } = req.body || {};
    if (!applicationId || !email || !code) return res.status(400).json({ error: 'Missing fields' });

    const CONF = db.collection('email_confirmations').doc(applicationId);
    const confSnap = await CONF.get();
    if (!confSnap.exists) return res.status(400).json({ error: 'No confirmation session found. Please submit application and request code.' });

    const data = confSnap.data();
    if (!data || String(data.otp) !== String(code)) {
      return res.status(401).json({ error: 'Invalid code' });
    }
    if (Date.now() > (data.expiresAt || 0)) {
      await CONF.delete().catch(()=>{});
      return res.status(400).json({ error: 'Code expired. Please resend.' });
    }

    // delete confirmation to avoid reuse
    await CONF.delete().catch(()=>{});

    // ensure application exists
    const appRef = db.collection('teacherApplicants').doc(applicationId);
    const appSnap = await appRef.get();
    if (!appSnap.exists) return res.status(404).json({ error: 'Application not found' });

    // check if email already has a user
    try {
      await admin.auth().getUserByEmail(email);
      return res.status(400).json({ error: 'Email already in use' });
    } catch (err) {
      if (!(err && err.code && err.code === 'auth/user-not-found')) {
        console.error('getUserByEmail check failed', err && err.message);
        return res.status(500).json({ error: 'Failed verifying email availability' });
      }
    }

    // create temp password
    const tempPassword = (function() {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
      return Array.from({ length: 12 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join("");
    })();

    let userRecord;
    try {
      userRecord = await admin.auth().createUser({
        email,
        password: tempPassword,
        displayName: displayName || (email.split('@')[0])
      });
    } catch (e) {
      console.error('createUser failed', e && e.message);
      return res.status(500).json({ error: 'Failed to create user account' });
    }

    const newUid = userRecord.uid;

    // create users/{uid} doc with forcePasswordChange flag
    await db.collection('users').doc(newUid).set({
      uid: newUid,
      email,
      displayName: displayName || null,
      role: 'applicant',
      forcePasswordChange: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // update application doc
    await appRef.set({
      uid: newUid,
      status: 'submitted',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // send credentials email
    const mailOptions = {
      from: `"Holy Family Academy" <${SMTP_USER}>`,
      to: email,
      subject: "Your account is ready",
      html: `
        <h3>Your application account</h3>
        <p>Your account has been created. Login using:</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Temporary password:</strong> ${tempPassword}</p>
        <p>On first login you will be required to change your password.</p>
      `
    };

    try {
      await mailTransporter.sendMail(mailOptions);
      return res.json({ ok: true, emailed: true });
    } catch (mailErr) {
      console.warn('/applicants/confirm-email: mail send failed', mailErr && mailErr.message);
      return res.json({ ok: true, emailed: false, message: 'Account created but emailing failed' });
    }

  } catch (err) {
    console.error('/applicants/confirm-email error', err && (err.stack || err));
    return res.status(500).json({ error: 'Server error' });
  }
});

/* GET /admin/users - returns merged list from Auth and Firestore */
app.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const { role: roleFilter, q, limit = 100 } = req.query;
    const users = [];
    let nextPageToken;
    do {
      const list = await admin.auth().listUsers(1000, nextPageToken);
      for (const u of list.users) {
        users.push(u);
      }
      nextPageToken = list.pageToken;
    } while (nextPageToken);

    const uids = users.map(u => u.uid);
    const profilePromises = uids.map(uid => db.collection('users').doc(uid).get());
    const profileSnaps = await Promise.all(profilePromises);
    const profileMap = {};
    profileSnaps.forEach((snap) => {
      if (snap && snap.exists) profileMap[snap.id] = snap.data();
    });

    let out = users.map((u) => {
      const profile = profileMap[u.uid] || {};
      let createdAt = null;
      if (profile.createdAt) {
        try {
          if (profile.createdAt.toDate) createdAt = profile.createdAt.toDate().toISOString();
          else createdAt = new Date(profile.createdAt).toISOString();
        } catch (e) {
          createdAt = String(profile.createdAt);
        }
      } else if (u.metadata && u.metadata.creationTime) {
        try {
          createdAt = new Date(u.metadata.creationTime).toISOString();
        } catch (e) {
          createdAt = u.metadata.creationTime;
        }
      } else {
        createdAt = null;
      }

      const role = profile.role || 'applicant';
      const status = profile.status || (u.disabled ? 'inactive' : 'active');
      const archived = !!profile.archived;

      return {
        uid: u.uid,
        customId: profile.customId || null,
        displayName: u.displayName || profile.displayName || null,
        email: u.email || profile.email || null,
        role,
        status,
        archived,
        createdAt,
      };
    });

    if (q && q.trim()) {
      const ql = q.trim().toLowerCase();
      out = out.filter((it) => {
        return (it.displayName && it.displayName.toLowerCase().includes(ql)) ||
               (it.email && it.email.toLowerCase().includes(ql)) ||
               (it.customId && it.customId.toLowerCase().includes(ql));
      });
    }
    if (roleFilter) {
      const rf = roleFilter.toLowerCase();
      out = out.filter(it => (it.role || '').toLowerCase() === rf);
    }

    const numLimit = Math.max(1, Math.min(1000, Number(limit || 100)));
    out = out.slice(0, numLimit);

    return res.json({ users: out });
  } catch (err) {
    console.error('/admin/users error', err && (err.stack || err));
    return res.status(500).json({ error: err.message || 'Server error', message: 'Failed to list users.' });
  }
});

/* POST /admin/reset-password -> body: { uid, newPassword?, notifyUser? } */
app.post('/admin/reset-password', requireAdmin, async (req, res) => {
  try {
    const { uid, notifyUser = false } = req.body;
    if (!uid) return res.status(400).json({ error: 'Missing uid', message: 'User id is required.' });

    // Get user email (try Firestore first, fallback to Auth)
    let email = null;
    try {
      const profileSnap = await db.collection('users').doc(uid).get();
      if (profileSnap.exists) email = profileSnap.data().email || null;
    } catch (e) {
      console.warn('/admin/reset-password: failed to read profile', e && e.message);
    }
    if (!email) {
      try {
        const userRecord = await admin.auth().getUser(uid);
        email = userRecord.email || null;
      } catch (e) {
        console.error('/admin/reset-password failed to get user', e && e.message);
      }
    }

    if (!email) {
      return res.status(400).json({ error: 'No email', message: 'Cannot locate an email address for this user.' });
    }

    // Generate password reset link using the Admin SDK
    let resetLink;
    try {
      resetLink = await admin.auth().generatePasswordResetLink(email);
    } catch (e) {
      console.error('/admin/reset-password generatePasswordResetLink error', e && e.message);
      return res.status(500).json({ error: 'Failed to generate reset link', message: 'Could not create password reset link.' });
    }

    if (notifyUser) {
      const mailOptions = {
        from: `"Holy Family Academy" <${SMTP_USER}>`,
        to: email,
        subject: "Password reset instructions",
        html: `<p>We received a request to reset your password. You can reset your password using this secure link:</p>
               <p><a href="${resetLink}">Reset your password</a></p>
               <p>If you didn't request this, please ignore this email.</p>`
      };
      try {
        await mailTransporter.sendMail(mailOptions);
      } catch (mailErr) {
        console.warn('/admin/reset-password: failed to send email', mailErr && mailErr.message);
        await writeActivityLog({
          actorUid: req.adminUser.uid,
          actorEmail: req.adminUser.email,
          targetUid: uid,
          action: 'reset-password',
          detail: 'generated_link_but_email_failed'
        });
        return res.status(500).json({ error: 'Email send failed', message: 'Failed to email the reset link. Please try again.' });
      }

      await writeActivityLog({
        actorUid: req.adminUser.uid,
        actorEmail: req.adminUser.email,
        targetUid: uid,
        action: 'reset-password',
        detail: 'reset-link-generated-and-emailed'
      });

      return res.json({ success: true, emailed: true, message: 'Password reset link emailed to user.' });
    }

    await writeActivityLog({
      actorUid: req.adminUser.uid,
      actorEmail: req.adminUser.email,
      targetUid: uid,
      action: 'reset-password',
      detail: 'reset-link-generated-not-emailed'
    });

    return res.json({ success: true, emailed: false, message: 'Password reset link generated (not emailed).' });

  } catch (err) {
    console.error('/admin/reset-password error', err && (err.stack || err));
    return res.status(500).json({ error: err.message || 'Server error', message: 'Failed to reset password.' });
  }
});

// supports updates
app.put('/admin/users/:uid', requireAdmin, async (req, res) => {
  try {
    const targetUid = req.params.uid;
    if (!targetUid) return res.status(400).json({ error: 'Missing uid' });

    const { displayName, role, status } = req.body || {};
    const updates = {};
    const authUpdates = {};

    if (displayName !== undefined) {
      const dn = String(displayName).trim();
      if (dn.length === 0) return res.status(400).json({ error: 'Invalid displayName' });
      updates.displayName = dn;
      authUpdates.displayName = dn;
    }

    if (role !== undefined) {
      const r = String(role).toLowerCase();
      if (r !== 'admin' && r !== 'applicant') {
        return res.status(400).json({ error: 'Invalid role', message: 'Role must be "admin" or "applicant".' });
      }
      updates.role = r;
    }

    if (status !== undefined) {
      const s = String(status).toLowerCase();
      if (s !== 'active' && s !== 'inactive') {
        return res.status(400).json({ error: 'Invalid status', message: 'Status must be "active" or "inactive".' });
      }
      updates.status = s;
    }

    if (Object.keys(updates).length === 0 && Object.keys(authUpdates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    if (Object.keys(authUpdates).length > 0) {
      try {
        await admin.auth().updateUser(targetUid, authUpdates);
      } catch (e) {
        console.warn('PUT /admin/users: failed to update Auth user', targetUid, e && e.message);
      }
    }

    if (updates.status !== undefined) {
      try {
        const disabled = updates.status === 'inactive';
        await admin.auth().updateUser(targetUid, { disabled });
      } catch (e) {
        console.warn('PUT /admin/users: failed to update Auth disabled flag for', targetUid, e && e.message);
      }
    }

    await db.collection('users').doc(targetUid).set({
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    await writeActivityLog({
      actorUid: req.adminUser.uid,
      actorEmail: req.adminUser.email,
      targetUid,
      action: 'update-user',
      detail: JSON.stringify({ updates })
    });

    return res.json({ success: true, updates });
  } catch (err) {
    console.error('PUT /admin/users/:uid error', err && (err.stack || err));
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

// archive
app.post('/admin/users/:uid/archive', requireAdmin, async (req, res) => {
  try {
    const targetUid = req.params.uid;
    if (!targetUid) return res.status(400).json({ error: 'Missing uid' });

    await db.collection('users').doc(targetUid).set({
      archived: true,
      archivedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'inactive',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    try {
      await admin.auth().updateUser(targetUid, { disabled: true });
    } catch (e) {
      console.warn('Failed to disable auth for archived user', targetUid, e && e.message);
    }

    await writeActivityLog({
      actorUid: req.adminUser.uid,
      actorEmail: req.adminUser.email,
      targetUid,
      action: 'archive-user',
      detail: 'archived user'
    });

    return res.json({ success: true, message: 'User archived' });
  } catch (err) {
    console.error('POST /admin/users/:uid/archive error', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

// unarchive
app.post('/admin/users/:uid/unarchive', requireAdmin, async (req, res) => {
  try {
    const targetUid = req.params.uid;
    if (!targetUid) return res.status(400).json({ error: 'Missing uid' });

    await db.collection('users').doc(targetUid).set({
      archived: false,
      archivedAt: null,
      status: 'active',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    try {
      await admin.auth().updateUser(targetUid, { disabled: false });
    } catch (e) {
      console.warn('Failed to enable auth for unarchived user', targetUid, e && e.message);
    }

    await writeActivityLog({
      actorUid: req.adminUser.uid,
      actorEmail: req.adminUser.email,
      targetUid,
      action: 'unarchive-user',
      detail: 'unarchived user'
    });

    return res.json({ success: true, message: 'User unarchived' });
  } catch (err) {
    console.error('POST /admin/users/:uid/unarchive error', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

// delete - allowed when archived
app.delete('/admin/users/:uid', requireAdmin, async (req, res) => {
  try {
    const targetUid = req.params.uid;
    if (!targetUid) return res.status(400).json({ error: 'Missing uid' });

    const userDoc = await db.collection('users').doc(targetUid).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      if (!data.archived) {
        return res.status(400).json({ error: 'Must be archived', message: 'User must be archived before permanent deletion.' });
      }
    }

    try {
      await db.collection('users').doc(targetUid).delete();
    } catch (e) {
      console.warn('Failed to delete users doc for', targetUid, e && e.message);
    }

    try {
      await admin.auth().deleteUser(targetUid);
    } catch (e) {
      if (e && e.code !== 'auth/user-not-found') {
        console.error('Failed to delete auth user', targetUid, e && e.message);
        return res.status(500).json({ error: 'Failed to delete auth user', message: e.message || String(e) });
      }
    }

    await writeActivityLog({
      actorUid: req.adminUser.uid,
      actorEmail: req.adminUser.email,
      targetUid,
      action: 'delete-user',
      detail: 'hard delete executed'
    });

    return res.json({ success: true, message: 'User permanently deleted' });
  } catch (err) {
    console.error('DELETE /admin/users/:uid error', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

/* POST /admin/set-role -> body: { uid, role } */
app.post('/admin/set-role', requireAdmin, async (req, res) => {
  try {
    const { uid, role } = req.body;
    if (!uid || !role) return res.status(400).json({ error: 'Missing uid or role' });
    await db.collection('users').doc(uid).set({ role }, { merge: true });

    await writeActivityLog({
      actorUid: req.adminUser.uid,
      actorEmail: req.adminUser.email,
      targetUid: uid,
      action: 'set-role',
      detail: `role:${role}`
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('/admin/set-role error', err);
    return res.status(500).json({ error: err.message });
  }
});

/* GET /admin/activity-logs?targetUid=...&limit=25 */
app.get('/admin/activity-logs', requireAdmin, async (req, res) => {
  try {
    const { targetUid, limit = 50 } = req.query;
    let q = db.collection('activity_logs').orderBy('timestamp', 'desc').limit(Number(limit));
    if (targetUid) q = q.where('targetUid', '==', targetUid);
    const snap = await q.get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return res.json({ items });
  } catch (err) {
    console.error('/admin/activity-logs error', err);
    return res.status(500).json({ error: err.message });
  }
});

// HELPERS

function generateRandomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  return Array.from({ length: 12 }, () =>
    chars.charAt(Math.floor(Math.random() * Math.random() * chars.length))
  ).join("");
}

function generateEmailFromSurname(surname) {
  const base = (surname || "user")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const suffix = Math.random().toString(36).substring(2, 6); // 4 chars
  return `${base}.${suffix}@hfa-application.com`;
}

async function generateUniqueEmailFromSurname(surname, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    const candidate = generateEmailFromSurname(surname);
    try {
      await admin.auth().getUserByEmail(candidate);
      continue;
    } catch (err) {
      if (err && (err.code === "auth/user-not-found" || err.code === "auth/user-not-found")) {
        return candidate;
      }
      if (err && err.code && err.code !== "auth/user-not-found") {
        throw err;
      }
      return candidate;
    }
  }
  return `${(surname || "user")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")}.${Date.now()}@hfa-application.com`;
}

// --- START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on: http://localhost:${PORT}`);
});
