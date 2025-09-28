(function () {
  'use strict';
  const STORE_KEY = "hfa_announcements";

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); }
    catch (e) { return []; }
  }
  function save(list) {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  }
  function escapeHtml(s) { return String(s||'').replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])); }

  function render() {
    const wrap = document.getElementById("announcements-list");
    if (!wrap) return;
    const items = load().slice().sort((a,b)=> b.createdAt.localeCompare(a.createdAt));
    wrap.innerHTML = "";
    if (!items.length) {
      const p = document.createElement("div");
      p.className = "announcement-item";
      p.innerHTML = `<div style="flex:1"><strong>No announcements</strong><div class="meta muted">—</div></div>`;
      wrap.appendChild(p);
      return;
    }
    items.forEach(it => {
      const el = document.createElement("div");
      el.className = "announcement-item";
      el.innerHTML = `<div style="flex:1">
          <div class="title" style="font-weight:600">${escapeHtml(it.title)}</div>
          <div class="meta muted">${escapeHtml(it.body)} • ${new Date(it.createdAt).toLocaleString()}</div>
        </div>`;
      wrap.appendChild(el);
    });
  }

  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.style.display = "block";
    modalEl.setAttribute("aria-hidden","false");
    const titleInput = modalEl.querySelector("#ann-title");
    if (titleInput) titleInput.focus();
  }
  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.style.display = "none";
    modalEl.setAttribute("aria-hidden","true");
  }

  function moveViewAll() {
    const viewAll = document.getElementById("view-all-ann") || document.getElementById("view-all-full");
    const header = document.querySelector(".updates-header");
    if (!viewAll || !header) return;
    let headerActions = header.querySelector(".header-actions");
    if (!headerActions) {
      headerActions = document.createElement("div");
      headerActions.className = "header-actions";
      header.appendChild(headerActions);
    }
    headerActions.appendChild(viewAll);
  }

  function init() {
    const postBtn = document.getElementById("post-ann-btn") || document.querySelector(".btn-post");
    const modal = document.getElementById("post-modal");
    const saveBtn = document.getElementById("post-save");
    const cancelBtn = document.getElementById("post-cancel");

    moveViewAll();
    render();

    if (postBtn && modal) {
      postBtn.addEventListener("click", () => openModal(modal));
    }
    if (cancelBtn && modal) {
      cancelBtn.addEventListener("click", () => closeModal(modal));
    }
    if (saveBtn && modal) {
      saveBtn.addEventListener("click", () => {
        const titleEl = modal.querySelector("#ann-title");
        const bodyEl = modal.querySelector("#ann-body");
        const pinEl = modal.querySelector("#ann-pin");
        const title = titleEl ? titleEl.value.trim() : "";
        const body = bodyEl ? bodyEl.value.trim() : "";
        const pinned = pinEl ? !!pinEl.checked : false;
        if (!title && !body) { alert("Please enter a title or body."); return; }
        const list = load();
        list.push({ id: Date.now().toString(36), title: title || "(no title)", body, pinned, createdAt: new Date().toISOString() });
        save(list);
        // reset form
        if (titleEl) titleEl.value = "";
        if (bodyEl) bodyEl.value = "";
        if (pinEl) pinEl.checked = false;
        closeModal(modal);
        render();
      });
    }

    // allow clicking backdrop to close modal
    if (modal) {
      modal.addEventListener("click", (ev) => {
        if (ev.target === modal) closeModal(modal);
      });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();