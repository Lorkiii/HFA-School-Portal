// changepass.js
// Client-side change-password helper
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  updatePassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { firebaseConfig } from "../firebase-config.js";

// initialize (safe to call even if already initialized elsewhere)
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("pass-form");
  const newPassEl = document.getElementById("new-pass");
  const confirmPassEl = document.getElementById("confirm-pass");
  const submitBtn = document.getElementById("confirm-btn");

  function setLoading(loading, text = "Confirm") {
    if (!submitBtn) return;
    submitBtn.disabled = !!loading;
    if (loading) {
      if (!submitBtn.dataset.orig) submitBtn.dataset.orig = submitBtn.textContent;
      submitBtn.textContent = text;
    } else {
      submitBtn.textContent = submitBtn.dataset.orig || text;
    }
  }

  async function clearForceFlagOnServer(uid) {
    // attempt to call server route authenticated with ID token
    if (!auth.currentUser) return;
    try {
      const idToken = await auth.currentUser.getIdToken(true); // force refresh for freshest token
      await fetch("/auth/clear-force-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + idToken
        },
        body: JSON.stringify({ uid })
      });
    } catch (e) {
      // non-fatal, but log
      console.warn("clearForceFlagOnServer failed (non-fatal):", e);
    }
  }

  form?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!newPassEl || !confirmPassEl) {
      alert("Missing form fields.");
      return;
    }

    const newPass = newPassEl.value || "";
    const confirmPass = confirmPassEl.value || "";

    if (!newPass || !confirmPass) {
      alert("Please fill both password fields.");
      return;
    }
    if (newPass !== confirmPass) {
      alert("Passwords do not match.");
      return;
    }
    if (newPass.length < 8) {
      // enforce minimum length if you want
      const ok = confirm("Password is short (less than 8 characters). Continue?");
      if (!ok) return;
    }

    setLoading(true, "Updating password…");

    try {
      const user = auth.currentUser;
      if (!user) {
        alert("No authenticated user found. Please sign in again.");
        setLoading(false);
        return;
      }

      // attempt to update password
      try {
        await updatePassword(user, newPass); // modular function: updatePassword(user, newPassword)
      } catch (updErr) {
        console.error("updatePassword error:", updErr);
        // common case: requires recent login
        if (updErr && updErr.code === "auth/requires-recent-login") {
          alert("For security, please sign in again and then change your password.");
          // optionally redirect to login page
          try { await signOut(auth); } catch(_) {}
          window.location.href = "/login"; // send them back to login so they reauthenticate
          return;
        }
        // other firebase auth errors
        const msg = (updErr && (updErr.message || updErr.code)) ? (updErr.message || updErr.code) : "Failed to change password.";
        alert("Failed to change password. " + msg);
        setLoading(false);
        return;
      }

      // If password updated successfully, clear forcePasswordChange on server
      try {
        await clearForceFlagOnServer(user.uid);
      } catch (e) {
        console.warn("clearForceFlagOnServer threw:", e);
      }

      // Sign the user out and send them to login page
      try {
        await signOut(auth);
      } catch (signErr) {
        console.warn("Sign out after password change failed:", signErr);
      }

      alert("Password changed successfully. Please sign in with your new password.");
      window.location.href ="../login/login.html";

    } catch (err) {
      console.error("changepass error", err);
      alert("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  });
});
