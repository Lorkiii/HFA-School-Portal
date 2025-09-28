// adminportal/admin-user-management.js
// Simple, modular client for admin user management

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { auth } from "../firebase-config.js"; 

// helper selector
const $ = (s) => document.querySelector(s);
window._debugAuth = auth;
console.log('[debug] admin-user-management loaded, auth:', !!auth, 'currentUser:', auth.currentUser);
// get current user's id token 
async function getAdminIdToken() {
  if (auth.currentUser) {
    return auth.currentUser.getIdToken();
  }
  // wait for auth state change (user to sign in)
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        unsub();
        reject(new Error("Not signed in"));
        return;
      }
      try {
        const token = await user.getIdToken();
        unsub();
        resolve(token);
      } catch (err) {
        unsub();
        reject(err);
      }
    });
  });
}

// wrapper to call server endpoints with auth
async function apiFetch(path, opts = {}) {
  const token = await getAdminIdToken();
  const headers = opts.headers || {};
  headers["Authorization"] = `Bearer ${token}`;
  if (!headers["Content-Type"] && !(opts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(path, { credentials: "include", ...opts, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }
  return res.json();
}

/* ---------- small timestamp helper ---------- */
function safeFormatTimestamp(ts) {
  // handles: null, JS Date, Firestore Timestamp object { seconds } or {_seconds}, ISO string
  if (!ts) return "-";
  if (ts instanceof Date) return ts.toLocaleString();
  if (typeof ts === "string") {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? ts : d.toLocaleString();
  }
  // Firestore node object may be { _seconds, _nanoseconds } or { seconds, nanoseconds }
  const seconds = ts.seconds ?? ts._seconds;
  if (typeof seconds === "number") return new Date(seconds * 1000).toLocaleString();
  return String(ts);
}

/* ---------- UI rendering ---------- */
async function loadUsers() {
  const tbody = document.querySelector("#users-table tbody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6">Loading...</td></tr>`;
  try {
    const { users } = await apiFetch("/admin/users");
    if (!users || users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6">No users found.</td></tr>`;
      return;
    }
    tbody.innerHTML = "";
    users.forEach((u) => {
      const tr = document.createElement("tr");
      tr.dataset.uid = u.uid;
      tr.innerHTML = `
        <td>${u.customId || u.uid}</td>
        <td>${u.displayName || "-"}</td>
        <td>${u.email || "-"}</td>
        <td class="role-cell">${u.role}</td>
        <td>${safeFormatTimestamp(u.createdAt)}</td>
        <td class="actions">
          <button class="btn-reset" title="Reset Password">Reset</button>
          <button class="btn-setrole" title="Set Role">Role</button>
          <button class="btn-logs" title="View Logs">Logs</button>
        </td>`;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6">Failed to load users</td></tr>`;
    alert("Failed to load users: " + err.message);
  }
}

/* ---------- event handling ---------- */
async function handleTableClick(e) {
  const btn = e.target.closest("button");
  if (!btn) return;
  const row = btn.closest("tr");
  const uid = row?.dataset?.uid;
  if (!uid) return;

  if (btn.classList.contains("btn-reset")) {
    if (!confirm("Reset password for this user?")) return;
    try {
      const res = await apiFetch("/admin/reset-password", {
        method: "POST",
        body: JSON.stringify({ uid }),
      });
      if (res.newPassword) {
        alert("New password: " + res.newPassword + "\nGive this to the user (ask them to change after login).");
      } else if (res.emailed) {
        alert("Password reset and emailed to user.");
      } else {
        alert("Password reset.");
      }
    } catch (err) {
      console.error(err);
      alert("Reset failed: " + err.message);
    }
  } else if (btn.classList.contains("btn-setrole")) {
    const current = row.querySelector(".role-cell")?.textContent || "teacher";
    const newRole = prompt("Enter new role (admin or teacher):", current);
    if (!newRole) return;
    if (!["admin", "teacher"].includes(newRole.toLowerCase())) {
      alert("Role must be admin or teacher");
      return;
    }
    try {
      await apiFetch("/admin/set-role", {
        method: "POST",
        body: JSON.stringify({ uid, role: newRole.toLowerCase() }),
      });
      row.querySelector(".role-cell").textContent = newRole.toLowerCase();
      alert("Role updated");
    } catch (err) {
      console.error(err);
      alert("Set role failed: " + err.message);
    }
  } else if (btn.classList.contains("btn-logs")) {
    try {
      const q = `/admin/activity-logs?targetUid=${encodeURIComponent(uid)}&limit=25`;
      const res = await apiFetch(q);
      const items = res.items || [];
      const list = items
        .map((i) => `${safeFormatTimestamp(i.timestamp)} — ${i.actorEmail || i.actorUid} — ${i.action} — ${i.detail || ""}`)
        .join("\n");
      alert("Recent logs:\n\n" + (list || "No logs"));
    } catch (err) {
      console.error(err);
      alert("Failed to fetch logs: " + err.message);
    }
  }
}
/* ---------- init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const table = document.querySelector("#users-table");
  if (!table) return;
  table.addEventListener("click", handleTableClick);
  loadUsers();
});
