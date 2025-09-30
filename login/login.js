// /login/login.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

console.log("login.js loaded");

document.addEventListener('DOMContentLoaded', function () {
  const container = document.querySelector(".container");

  // Toggle form panels
  const applicantBtn = document.getElementById("sign-up-btn");
  const adminBtn = document.getElementById("sign-in-btn");

  if (applicantBtn) {
    applicantBtn.addEventListener("click", function(e) {
      e.preventDefault();
      container.classList.add("sign-up-mode");
    });
  }

  if (adminBtn) {
    adminBtn.addEventListener("click", function(e) {
      e.preventDefault();
      container.classList.remove("sign-up-mode");
    });
  }

  // Create inline error box if missing
  function ensureErrorBox(parent, id) {
    let box = parent.querySelector(`#${id}`);
    if (!box) {
      box = document.createElement("div");
      box.id = id;
      box.style.color = "#c00";
      box.style.marginTop = "6px";
      parent.appendChild(box);
    }
    return box;
  }

  // ADMIN form
  const adminForm = document.querySelector(".sign-in-form");
  if (adminForm) {
    const adminError = ensureErrorBox(adminForm, "admin-error");
    adminForm.addEventListener("submit", (e) => {
      e.preventDefault();
      adminError.textContent = "";
      const email = document.getElementById("admin-email").value.trim();
      const password = document.getElementById("admin-password").value;
      loginUserWithRole(email, password, "admin", "/adminportal/admin.html", adminError, adminForm);
    });
  }

  // APPLICANT form
  const applicantForm = document.querySelector(".sign-in-applicant");
  if (applicantForm) {
    const applicantError = ensureErrorBox(applicantForm, "applicant-error");
    applicantForm.addEventListener("submit", (e) => {
      e.preventDefault();
      applicantError.textContent = "";
      const email = document.getElementById("applicant-email").value.trim();
      const password = document.getElementById("applicant-password").value;
      loginUserWithRole(email, password, "applicant", "/teacher-application/teacher.html", applicantError, applicantForm);
    });
  }
});

// Friendly mapping for common Firebase auth errors
function friendlyFirebaseError(err) {
  if (!err) return "Authentication failed.";
  const code = err.code || "";
  switch (code) {
    case "auth/invalid-email": return "The email address is invalid.";
    case "auth/user-disabled": return "This account has been disabled. Contact admin.";
    case "auth/user-not-found": return "No account found with that email.";
    case "auth/wrong-password": return "Incorrect email or password.";
    case "auth/too-many-requests": return "Too many attempts. Try again later or reset your password.";
    case "auth/network-request-failed": return "Network error. Check your connection.";
    default:
      return err.message || "Authentication failed. Please try again.";
  }
}

// Set "Logging in..." text on submit button and disable inputs
function setFormLoading(formEl, loading, text = "Logging in\u2026") {
  if (!formEl) return;
  const inputs = formEl.querySelectorAll("input, button, select, textarea");
  inputs.forEach(i => i.disabled = !!loading);
  const submitBtn = formEl.querySelector('button[type="submit"], button');
  if (submitBtn) {
    if (loading) {
      if (!submitBtn.dataset.orig) submitBtn.dataset.orig = submitBtn.textContent;
      submitBtn.textContent = text;
    } else {
      if (submitBtn.dataset.orig) submitBtn.textContent = submitBtn.dataset.orig;
    }
  }
}

// Main login helper
async function loginUserWithRole(email, password, expectedRole, redirectUrl, errorBox, formEl) {
  if (!email || !password) {
    if (errorBox) errorBox.textContent = "Please fill both fields.";
    else alert("Please fill both fields.");
    return;
  }

  // show "Logging in..." and disable
  setFormLoading(formEl, true, "Logging in\u2026");
  if (errorBox) errorBox.textContent = "";

  try {
    // Firebase sign-in
    let userCredential;
    try {
      userCredential = await signInWithEmailAndPassword(auth, email, password);
    } catch (authErr) {
      const friendly = friendlyFirebaseError(authErr);
      if (errorBox) errorBox.textContent = friendly;
      else alert(friendly);
      return;
    }

    // Quick Firestore role check (optional, local quick feedback)
    const uid = userCredential.user.uid;
    try {
      const docRef = doc(db, "users", uid);
      const userDoc = await getDoc(docRef);
      if (!userDoc.exists()) {
        if (errorBox) errorBox.textContent = "Account not configured in the application database. Contact admin.";
        else alert("Account not configured. Contact admin.");
        return;
      }
      const actualRole = userDoc.data().role;
      if (actualRole !== expectedRole) {
        if (errorBox) errorBox.textContent = `Access denied: You are not an ${expectedRole}.`;
        else alert(`Access denied: You are not an ${expectedRole}.`);
        return;
      }
    } catch (e) {
      console.error("Error reading user doc:", e);
      if (errorBox) errorBox.textContent = "Unable to verify user role. Try again later.";
      else alert("Unable to verify user role. Try again later.");
      return;
    }

    // Obtain fresh ID token (force refresh to ensure any forcePasswordChange flag is current)
    const idToken = await userCredential.user.getIdToken(true);

    // Call server /auth/login
    const resp = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = (data && (data.error || data.message)) ? (data.error || data.message) : "Login failed.";
      if (errorBox) errorBox.textContent = msg;
      else alert(msg);
      return;
    }

    // Admin OTP flow
    if (data.needsOtp) {
      // keep idToken and email for OTP verification (short-lived)
      sessionStorage.setItem("verifyEmail", email);
      sessionStorage.setItem("idToken", idToken);
      // optionally keep server "message" for UX
      window.location.href = "/login/verify-otp.html?uid=" + encodeURIComponent(uid) + "&redirect=" + encodeURIComponent(redirectUrl);
      return;
    }

    // If server returned a token, store it in sessionStorage (optional) for server-side calls.
    if (data.token) {
      // optional: store server token for API calls that prefer server JWT
      try { sessionStorage.setItem("serverToken", data.token); } catch (e) { /* ignore */ }
    }

    // If user must change password, redirect to change password page.
    // Keep user signed-in (so changepass can use Firebase SDK to update password).
    if (data.forcePasswordChange) {
      // store idToken in sessionStorage so changepass page may re-authenticate/use it if needed
      try { sessionStorage.setItem("idToken", idToken); } catch (e) { /* ignore */ }
      // redirect to change password page (you can read uid from query in changepass)
      window.location.href = "/login/changepass.html?uid=" + encodeURIComponent(uid);
      return;
    }

    // Normal successful login: redirect based on role (server returned role too)
    if (data.role === "admin") {
      window.location.href = "/adminportal/admin.html";
      return;
    } else {
      window.location.href = redirectUrl;
      return;
    }

  } catch (err) {
    console.error("Login error:", err);
    if (errorBox) errorBox.textContent = "Network or server error. Try again.";
    else alert("Network error. Try again.");
  } finally {
    setFormLoading(formEl, false);
  }
}
