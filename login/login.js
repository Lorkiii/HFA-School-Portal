// /login/login.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";

// checking when the page is loaded
console.log("login.js loaded");
// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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

  // Ensure there are inline error containers. If not present, create them.
  function ensureErrorBox(selectorParent, id) {
    let box = selectorParent.querySelector(`#${id}`);
    if (!box) {
      box = document.createElement("div");
      box.id = id;
      box.style.color = "#c00";
      box.style.marginTop = "6px";
      selectorParent.appendChild(box);
    }
    return box;
  }

  // ADMIN login
  const adminForm = document.querySelector(".sign-in-form");
  if (adminForm) {
    const adminParent = adminForm;
    const adminErrorBox = ensureErrorBox(adminParent, "admin-error");

    adminForm.addEventListener("submit", function (e) {
      e.preventDefault();
      adminErrorBox.textContent = "";

      const email = document.getElementById("admin-email").value.trim();
      const password = document.getElementById("admin-password").value;
      loginUserWithRole(email, password, "admin", "/adminportal/admin.html", adminErrorBox);
    });
  }

  // APPLICANT login
  const applicantForm = document.querySelector(".sign-in-applicant");
  if (applicantForm) {
    const applicantParent = applicantForm;
    const applicantErrorBox = ensureErrorBox(applicantParent, "applicant-error");

    applicantForm.addEventListener("submit", function (e) {
      e.preventDefault();
      applicantErrorBox.textContent = "";

      const email = document.getElementById("applicant-email").value.trim();
      const password = document.getElementById("applicant-password").value;
      // redirect to teacher-applicant dashboard on success
      loginUserWithRole(email, password, "applicant", "/teacher-application/teacher.html", applicantErrorBox);
    });
  }
});

// main login helper
async function loginUserWithRole(email, password, expectedRole, redirectUrl, errorBox) {
  if (!email || !password) {
    if (errorBox) errorBox.textContent = "Please fill both fields.";
    else alert("Please fill both fields.");
    return;
  }

  try {
    // sign in with Firebase client (password is NOT sent to your server)
    const userCredential = await signInWithEmailAndPassword(auth, email, password);

    const uid = userCredential.user.uid;
    // check Firestore users/{uid} role locally first (quick feedback)
    try {
      const docRef = doc(db, "users", uid);
      const userDoc = await getDoc(docRef);
      if (!userDoc.exists()) {
        if (errorBox) errorBox.textContent = "Account not configured in the application database. Contact admin.";
        else alert("Account not configured in the application database. Please contact the system administrator.");
        return;
      }

      const actualRole = userDoc.data().role;
      if (actualRole !== expectedRole) {
        if (errorBox) errorBox.textContent = `Access denied: You are not an ${expectedRole}.`;
        else alert(`Access denied: You are not an ${expectedRole}.`);
        return;
      }
    } catch (err) {
      console.error("Error reading user document:", err);
      if (errorBox) errorBox.textContent = "Unable to verify user role. Try again later.";
      else alert("Unable to verify user role. Try again later.");
      return;
    }

    // get idToken from Firebase user and send to server for OTP/JWT flow
    const idToken = await userCredential.user.getIdToken();

    // call server to start login flow
    const res = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    });

    const data = await res.json();
    if (!res.ok) {
      // show inline server error if available
      const msg = data && (data.error || data.message) ? (data.error || data.message) : "Login failed";
      if (errorBox) errorBox.textContent = msg;
      else alert(msg);
      return;
    }

    if (data.needsOtp) {
      // admin needs OTP: preserve email and idToken in sessionStorage for verify step
      sessionStorage.setItem("verifyEmail", email);
      sessionStorage.setItem("idToken", idToken);

      window.location.href = "/login/verify-otp.html?uid=" + userCredential.user.uid + "&redirect=" + encodeURIComponent(redirectUrl);
      return;
    }

    if (data.token) {
      // successful immediate login (admin)
      localStorage.setItem("token", data.token);
      if (data.role === "admin") window.location.href = "/adminportal/admin.html";
      else window.location.href = redirectUrl;
      return;
    }
   if (data.token) {
      // successful immediate login (applicant)
      localStorage.setItem("token", data.token);
      if (data.role === "applicant") window.location.href = "/teacher-application/teacher.html";
      else window.location.href = redirectUrl;
      return;
    }

    if (errorBox) errorBox.textContent = "Unexpected response from server.";
    else alert("Unexpected response from server.");

  } catch (error) {
    console.error('signIn error detailed', error);
    const friendly = (error && (error.code || error.message)) ? (error.message || String(error)) : "Authentication failed";
    if (errorBox) errorBox.textContent = friendly;
    else alert(friendly);
  }
}
