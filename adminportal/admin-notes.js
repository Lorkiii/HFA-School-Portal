(function () {
  const KEY = "hfa_quick_notes";

  // load/save helpers
  function loadNotes() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
    catch (e) { return []; }
  }
  function saveNotes(notes) {
    localStorage.setItem(KEY, JSON.stringify(notes));
  }

  // simple sanitize
  function esc(s) { return String(s || "").replace(/[&<>"']/g, c =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;", "'":"&#39;" })[c] ); }

  // render: newest first (prepend style)
  function renderNotes(highlightId) {
    const ul = document.getElementById("note-list");
    if (!ul) return;
    const notes = loadNotes().slice().reverse(); // newest first
    ul.innerHTML = "";
    if (!notes.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "No quick notes";
      ul.appendChild(li);
      return;
    }
    for (const n of notes) {
      const li = document.createElement("li");
      li.dataset.id = n.id;
      li.className = "announcement-item"; // reuse card-like styling from announcements
      li.innerHTML = `
        <div style="flex:1">
          <div style="font-weight:600">${esc(n.text)}</div>
          <div class="meta muted" style="font-size:0.85rem">${new Date(n.createdAt).toLocaleString()}</div>
        </div>
        <div style="margin-left:12px">
          <button class="task-btn outline remove-note" data-id="${n.id}" aria-label="Remove note">Remove</button>
        </div>
      `;
      ul.appendChild(li);
    }

    // scroll the list to top so newest is visible and highlight the added note
    ul.scrollTop = 0;
    if (highlightId) {
      const node = ul.querySelector(`li[data-id="${highlightId}"]`);
      if (node) {
        node.classList.add("new-highlight");
        setTimeout(() => node && node.classList.remove("new-highlight"), 1200);
      }
    }
  }

  // add/remove operations
  function addNote(text) {
    if (!text || !text.trim()) return null;
    const notes = loadNotes();
    const item = { id: Date.now().toString(36), text: text.trim(), createdAt: new Date().toISOString() };
    notes.push(item);
    saveNotes(notes);
    return item.id;
  }

  function removeNote(id) {
    const notes = loadNotes().filter(n => n.id !== id);
    saveNotes(notes);
    renderNotes();
  }

  // find add button (supports .btn-add-note or fallback #add-note)
  function findAddBtn() {
    return document.querySelector(".btn-add-note") || document.getElementById("add-note");
  }

  // init: wire events
  function init() {
    const input = document.getElementById("note-input");
    const addBtn = findAddBtn();
    const list = document.getElementById("note-list");
    if (!input || !addBtn || !list) {
      // graceful: still attempt to render whatever exists
      renderNotes();
      return;
    }

    addBtn.addEventListener("click", () => {
      const id = addNote(input.value);
      if (id) {
        input.value = "";
        renderNotes(id);
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addBtn.click();
      }
    });

    // delegate remove buttons
    list.addEventListener("click", (ev) => {
      const t = ev.target;
      if (!t) return;
      if (t.matches(".remove-note")) {
        const id = t.dataset.id;
        if (id) removeNote(id);
      }
    });

    // initial render
    renderNotes();
  }

  document.addEventListener("DOMContentLoaded", init);
})();