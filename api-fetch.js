// api-fetch.js (project root)
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
const auth = getAuth();


export async function getIdTokenOrReject() {
  if (auth.currentUser) return auth.currentUser.getIdToken();
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      if (!user) return reject(new Error("Not signed in"));
      try {
        const t = await user.getIdToken();
        resolve(t);
      } catch (e) {
        reject(e);
      }
    });
  });
}

export async function apiFetch(path, opts = {}) {
  const token = await getIdTokenOrReject();
  const headers = opts.headers ? { ...opts.headers } : {};
  headers["Authorization"] = `Bearer ${token}`;
  if (!headers["Content-Type"] && !(opts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(path, { credentials: "include", ...opts, headers });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
    const msg = parsed && (parsed.error || parsed.message) ? (parsed.error || parsed.message) : (text || res.statusText);
    const err = new Error(`Request failed ${res.status}: ${msg}`);
    err.status = res.status;
    err.body = parsed || text;
    throw err;
  }
  try { return JSON.parse(text); } catch (e) { return text; }
}
