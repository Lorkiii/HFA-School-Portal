// capstone/logout-auth.js
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export async function logoutAndRedirect(loginPath = "/login/login.html") {
  try {
    const auth = getAuth();
    let tokenToRevoke = null;

    // prefer Firebase client ID token if signed in
    try {
      if (auth.currentUser) {
        tokenToRevoke = await auth.currentUser.getIdToken();
      }
    } catch (e) {
      // ignore, fallback to localStorage token (legacy)
    }

    // fallback: if legacy server JWT exists in localStorage, use it
    try {
      if (!tokenToRevoke && typeof localStorage !== "undefined") {
        tokenToRevoke = localStorage.getItem("token");
      }
    } catch (e) {
      // ignore storage issues
    }

    // Remove any existing legacy token from storage (we are moving away from it)
    try { localStorage.removeItem("token"); } catch (e) {}

    // Attempt to hit server logout endpoint (best-effort)
    if (tokenToRevoke) {
      try {
        await fetch("/auth/logout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + tokenToRevoke
          },
          body: JSON.stringify({ token: tokenToRevoke })
        });
      } catch (err) {
        console.warn("Logout: revoke request failed", err);
      }
    }

    // Sign out Firebase client so auth.currentUser becomes null
    try {
      await signOut(auth);
    } catch (e) {
      console.warn("Firebase signOut failed:", e);
    }

    // Finally redirect to login
    window.location.replace(loginPath);
  } catch (err) {
    console.error("logout error", err);
    try { window.location.replace(loginPath); } catch (e) {}
  }
}
