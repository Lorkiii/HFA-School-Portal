(function(){
  // small date/time widget
  function updateDateTime(){
    const d = new Date();
    const dateStr = d.toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' });
    const timeStr = d.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' });
    document.getElementById('header-current-date').textContent = dateStr;
    document.getElementById('header-current-time').textContent = timeStr;
  }
  updateDateTime();
  setInterval(updateDateTime, 60*1000);

  // fetch fallback stats (no server call here)
  const statsFallback = {
    totalStudents: 0,
    teacherApplicants: 0,
    totalClasses: 0,
    enrollmentTarget: 200
  };

  // try to read pre-provided stats stored in window (optional)
  const stats = window.__ADMIN_STATS__ || statsFallback;

  // fill quick stats
  document.getElementById('stat-total-students').textContent = (stats.totalStudents || 0).toLocaleString();
  document.getElementById('stat-students-meta').textContent = `as of ${new Date().toLocaleDateString()}`;
  document.getElementById('stat-total-teachers').textContent = (stats.teacherApplicants || 0).toLocaleString();

  // enrollment numbers stored in localStorage or fallback
  const enrolKey = 'admin_enrollment_status';
  let enrollmentStatus = (() => {
    try {
      return JSON.parse(localStorage.getItem(enrolKey)) || { total: 0, completed: 0, pending: 0, missing: 0 };
    } catch(e){ return { total:0, completed:0, pending:0, missing:0 }; }
  })();

  // render enrollment overview
  function renderEnrollment() {
    const total = enrollmentStatus.total || 0;
    const completed = enrollmentStatus.completed || 0;
    const target = stats.enrollmentTarget || Math.max(total, 1);
    const percent = Math.round((completed / target) * 100);
    document.getElementById('stat-enrollment-percent').textContent = `${percent}%`;
    document.getElementById('enrollment-bar').style.width = `${Math.min(100, percent)}%`;
    document.getElementById('stat-enrollment-meta').textContent = `${completed} / ${target}`;

    document.getElementById('completed-count').textContent = completed;
    document.getElementById('pending-count').textContent = enrollmentStatus.pending || 0;
    document.getElementById('missing-count').textContent = enrollmentStatus.missing || 0;

    const denom = Math.max(1, total);
    document.getElementById('completed-bar').style.width = `${Math.round((completed/denom)*100)}%`;
    document.getElementById('pending-bar').style.width = `${Math.round(((enrollmentStatus.pending||0)/denom)*100)}%`;
    document.getElementById('missing-bar').style.width = `${Math.round(((enrollmentStatus.missing||0)/denom)*100)}%`;
  }
  renderEnrollment();

  // Recent Activity: simple sample -> replace with server data later
  (function renderRecentActivity(){
    const table = document.getElementById('recent-activity-table');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    const sample = [
      { date: new Date().toISOString().slice(0,10), activity:'System initialized', user:'System' }
    ];
    sample.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${s.date}</td><td>${s.activity}</td><td>${s.user}</td>`;
      tbody.appendChild(tr);
    });
  })();

  // ---------------- Quick Notes ----------------
  const noteKey = 'admin_quick_notes';
  function loadNotes(){
    try { return JSON.parse(localStorage.getItem(noteKey) || '[]'); }
    catch(e){ return []; }
  }
  function saveNotes(notes){ localStorage.setItem(noteKey, JSON.stringify(notes || [])); }
  function renderNotes(){
    const list = document.getElementById('note-list');
    if (!list) return;
    const notes = loadNotes();
    list.innerHTML = '';
    if (notes.length === 0){
      const li = document.createElement('li');
      li.innerHTML = `<div class="txt">No notes yet</div><div class="meta">—</div>`;
      list.appendChild(li);
      return;
    }
    notes.slice().reverse().forEach(n => {
      const li = document.createElement('li');
      li.innerHTML = `<div><div class="txt">${escapeHtml(n.text)}</div><div class="meta">${new Date(n.ts).toLocaleString()}</div></div>
                      <div><button class="del-note" data-id="${n.ts}">Delete</button></div>`;
      list.appendChild(li);
    });
    list.querySelectorAll('button.del-note').forEach(b => {
      b.addEventListener('click', e => {
        const id = e.currentTarget.dataset.id;
        let arr = loadNotes();
        arr = arr.filter(x => String(x.ts) !== String(id));
        saveNotes(arr); renderNotes();
      });
    });
  }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  document.getElementById('add-note')?.addEventListener('click', () => {
    const input = document.getElementById('note-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    const notes = loadNotes();
    notes.push({ text, ts: Date.now() });
    saveNotes(notes);
    input.value = '';
    renderNotes();
  });
  document.getElementById('note-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('add-note').click(); }
  });

  renderNotes();

  // ---------------- Quick action confirm modal ----------------
  const confirmModal = document.getElementById('confirm-modal');
  const confirmTitle = document.getElementById('confirm-title');
  const confirmBody = document.getElementById('confirm-body');
  const confirmOk = document.getElementById('confirm-ok');
  const confirmCancel = document.getElementById('confirm-cancel');

  let confirmResolve = null;
  function showConfirm(title, body){
    confirmTitle.textContent = title;
    confirmBody.textContent = body || '';
    confirmModal.style.display = 'block';
    document.getElementById('ui-modals').setAttribute('aria-hidden','false');
    return new Promise((resolve) => {
      confirmResolve = resolve;
    });
  }
  function hideConfirm(){ confirmModal.style.display='none'; document.getElementById('ui-modals').setAttribute('aria-hidden','true'); }

  confirmOk.addEventListener('click', () => { hideConfirm(); if (confirmResolve) confirmResolve(true); });
  confirmCancel.addEventListener('click', () => { hideConfirm(); if (confirmResolve) confirmResolve(false); });

  // wire quick action buttons
  document.querySelectorAll('.quick-action').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      const action = btn.dataset.action;
      const map = {
        'verify-application': { title:'Verify Application', body:'Mark selected application as verified (UI-only).' },
        'verify-enrollment': { title:'Verify Enrollment', body:'Mark selected enrollment as verified (UI-only).' },
        'schedule-interview': { title:'Schedule Interview', body:'Open the schedule form (use the Schedule Interview quick task).' },
        'edit-account': { title:'Edit Account', body:'Open the edit account modal (UI-only).' },
        'reset-password': { title:'Reset Password', body:'Reset password for a user (UI-only).' }
      };
      const info = map[action] || { title: 'Confirm', body: action };
      const ok = await showConfirm(info.title, info.body);
      if (ok) {
        // simple toast effect: reuse confirm modal to show success then hide
        confirmTitle.textContent = 'Done';
        confirmBody.textContent = `${info.title} performed (demo UI).`;
        confirmOk.style.display = 'none';
        setTimeout(()=>{ confirmOk.style.display = 'inline-block'; hideConfirm(); }, 900);
      }
    });
  });

})();