// admin-student.js - Student Management (normalized progress DOM + template-based rows)
// Imports
import { db } from '../firebase-config.js';
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const applicantsMap = new Map();

const studentsBody = document.getElementById('students-body');         // renderTableRows
const cardsView = document.getElementById('cards-view');               // renderCards
const tableView = document.getElementById('table-view');               // applyFiltersAndRender
const cardsBtn = document.querySelector('[data-view="cards"]');        // attachUIListeners
const tableBtn = document.querySelector('[data-view="table"]');        // attachUIListeners
const searchInput = document.getElementById('search-input');           // applyFiltersAndRender
const filterStatus = document.getElementById('filter-status');         // applyFiltersAndRender
const sortBy = document.getElementById('sort-by');                     // applyFiltersAndRender

const counts = {
  total:    document.getElementById('count-total'),
  enrolled: document.getElementById('count-enrolled'),
  complete: document.getElementById('count-complete')
};

// Modal elements
const modal = document.getElementById('student-modal');
const modalClose = document.getElementById('modal-close');
const modalName = document.getElementById('modal-name');
const modalMeta = document.getElementById('modal-meta');
const modalRequirements = document.getElementById('modal-requirements');
const modalProgress = document.getElementById('modal-progress');
const btnApproveEnroll= document.getElementById('btn-approve-enroll');

const modalEditBtn = document.getElementById('modal-edit');
const modalArchiveBtn= document.getElementById('modal-archive');
const modalDeleteBtn = document.getElementById('modal-delete');
const modalViewBtn   = document.getElementById('modal-view');

const editPanel = document.getElementById('student-edit-panel');
const editFirst = document.getElementById('edit-first');
const editLast = document.getElementById('edit-last');
const editGrade = document.getElementById('edit-grade');
const editSection = document.getElementById('edit-section');
const editCancel  = document.getElementById('edit-cancel');
const editSave = document.getElementById('edit-save');
const editError = document.getElementById('edit-error');

const archivePanel = document.getElementById('archive-confirm');
const archiveCancel  = document.getElementById('archive-cancel');
const archiveConfirmBtn = document.getElementById('archive-confirm-btn');

const deletePanel = document.getElementById('delete-confirm');
const deleteCancel = document.getElementById('delete-cancel');
const deleteConfirmBtn = document.getElementById('delete-confirm-btn');

const toastContainer = document.getElementById('admin-toast-container');
const toastTemplate  = document.getElementById('toast-template'); // MUST be present in HTML

let activeTab     = 'all';
let activeView    = 'table';
let debounceTimer = null;
let currentModalApp = null;

/* ------------------ Utility helpers ------------------ */

// COMPUTE PROGRESS BASED ON REQUIREMENTS OBJECT
function computeReqProgress(requirements) {
  if (!requirements) return 0;
  const keys = Object.keys(requirements);
  if (!keys.length) return 0;
  const done = keys.filter(k => !!requirements[k]).length;
  return Math.round((done / keys.length) * 100);
}

/** formatDateTime(d) -> readable string or '-' */
function formatDateTime(d) {
  if (!d) return '-';
  try {
    const dt = (d instanceof Date) ? d : new Date(d);
    const opts = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return dt.toLocaleString(undefined, opts);
  } catch (e) {
    return String(d);
  }
}

/** normalizeApplicant(docId, data) -> object used by UI */
function normalizeApplicant(docId, data) {
  const reqs = data.requirements || {
    "Birth Certificate / PSA ": false,
    "FORM 137": false,
    "Report Card": false,
    "ID Photo": false,
    "Medical Form": false

  };
  const submittedAt = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate() :
                      (data.createdAt ? new Date(data.createdAt) : new Date());
  const archivedAt = data.archivedAt && data.archivedAt.toDate ? data.archivedAt.toDate() :
                     (data.archivedAt ? new Date(data.archivedAt) : null);
 // 
  const first = data.firstName || '';
  const last  = data.lastName || '';
  const grade = data.gradeLevel || data.grade || data.level || data.year || data.strand || '';
  return {
    id: docId,
    formType: data.formType || 'jhs',
    firstName: first,
    lastName: last,
    fullName: (first + ' ' + last).trim(),
    gradeLevel: grade,
    section: data.section || '',
    submittedAt,
    archivedAt,
    isNew: typeof data.isNew === 'boolean' ? data.isNew : true,
    requirements: reqs,
    enrolled: !!data.enrolled,
    archived: !!data.archived,
    raw: data
  };
}

/** createIcon(iClass) -> HTMLElement <i> */
function createIcon(iClass) {
  const i = document.createElement('i');
  i.className = iClass;
  i.setAttribute('aria-hidden', 'true');
  return i;
}


function createProgressBar(percent = 0) {
  const val = Math.max(0, Math.min(100, Number(percent) || 0));
  const wrapper = document.createElement('div');
  wrapper.className = 'progress'; // outer track

  const fill = document.createElement('div');
  fill.className = 'progress-bar'; // inner fill
  fill.style.width = val + '%';

  wrapper.appendChild(fill);
  return wrapper;
}

/* ------------------ Rendering helpers ------------------ */

/** updateCounts() - update stat cards excluding archived */
function updateCounts() {
  const list = Array.from(applicantsMap.values()).filter(a => !a.archived);
  if (counts.total) counts.total.textContent = list.length;
  if (counts.enrolled) counts.enrolled.textContent = list.filter(a => a.enrolled).length;
  if (counts.complete) counts.complete.textContent = list.filter(a => computeReqProgress(a.requirements) === 100).length;
}

/**
 * renderTableRows(list)
 * - clones #student-row-template (if present), fills .cell-* text,
 * - attaches event listeners to the cloned buttons,
 * - falls back to programmatic row creation if template missing.
 */
function renderTableRows(list) {
  if (!studentsBody) return;
  studentsBody.innerHTML = '';
  const frag = document.createDocumentFragment();
  const template = document.getElementById('student-row-template');

  list.forEach(app => {
    if (!app) return;

    // Template-based row (recommended)
    if (template && template.content) {
      const clone = template.content.cloneNode(true);
      const tr = clone.querySelector('tr');
      if (!tr) return;

      tr.dataset.id = app.id || '';

      // Fill cells by class selectors
      const idCell = tr.querySelector('.cell-id'); if (idCell) idCell.textContent = app.id || '-';
      const nameCell = tr.querySelector('.cell-name'); if (nameCell) {
        nameCell.textContent = app.fullName || '-';
        if (app.archived && app.archivedAt) {
          const small = document.createElement('div');
          small.className = 'muted small archived-ts';
          small.textContent = 'Archived: ' + formatDateTime(app.archivedAt);
          nameCell.appendChild(small);
        }
      }
      const gradeCell = tr.querySelector('.cell-grade'); if (gradeCell) gradeCell.textContent = app.gradeLevel || '-';
      const studentIdCell = tr.querySelector('.cell-studentid'); if (studentIdCell) studentIdCell.textContent = app.section || '-';
      const formCell = tr.querySelector('.cell-form'); if (formCell) formCell.textContent = (app.formType || '').toUpperCase();
      const oldNewCell = tr.querySelector('.cell-oldnew'); if (oldNewCell) oldNewCell.textContent = app.isNew ? 'New' : 'Old';

      // Progress: use canonical DOM
      const progressCell = tr.querySelector('.cell-progress');
      if (progressCell) {
        progressCell.innerHTML = '';
        const percent = computeReqProgress(app.requirements);
        progressCell.appendChild(createProgressBar(percent));
      }

      // Status
      const statusCell = tr.querySelector('.cell-status');
      if (statusCell) {
        statusCell.innerHTML = app.enrolled ? '<span class="badge enrolled">Enrolled</span>' : '<span class="badge pending">Pending</span>';
      }

      // Wire action buttons inside this cloned row
      const viewBtn = tr.querySelector('.student-view'); if (viewBtn) viewBtn.addEventListener('click', () => openStudentModal(app));
      const editBtn = tr.querySelector('.student-edit'); if (editBtn) editBtn.addEventListener('click', () => openEditPanel(app));
      const archiveBtn = tr.querySelector('.student-archive'); if (archiveBtn) archiveBtn.addEventListener('click', () => openArchiveConfirm(app));
      const deleteBtn = tr.querySelector('.student-delete'); if (deleteBtn) deleteBtn.addEventListener('click', () => openDeleteConfirm(app));
      const enrollBtn = tr.querySelector('.student-enroll'); if (enrollBtn) {
        enrollBtn.disabled = !!app.enrolled;
        enrollBtn.addEventListener('click', () => enrollApplicant(app));
        enrollBtn.textContent = app.enrolled ? 'Enrolled' : 'Enroll';
      }

      frag.appendChild(clone);
    } else {
      // Fallback: build row programmatically (keeps canonical progress DOM)
      const tr = document.createElement('tr');
      tr.dataset.id = app.id || '';

      const idTd = document.createElement('td'); idTd.textContent = app.id || '-'; tr.appendChild(idTd);
      const nameTd = document.createElement('td'); nameTd.textContent = app.fullName || '-'; tr.appendChild(nameTd);
      const gradeTd = document.createElement('td'); gradeTd.textContent = app.gradeLevel || '-'; tr.appendChild(gradeTd);
      const studentIdTd = document.createElement('td'); studentIdTd.textContent = app.section || '-'; tr.appendChild(studentIdTd);
      const formTd = document.createElement('td'); formTd.textContent = (app.formType || '').toUpperCase(); tr.appendChild(formTd);
      const oldNewTd = document.createElement('td'); oldNewTd.textContent = app.isNew ? 'New' : 'Old'; tr.appendChild(oldNewTd);

      const progressTd = document.createElement('td');
      const percent = computeReqProgress(app.requirements);
      progressTd.appendChild(createProgressBar(percent));
      tr.appendChild(progressTd);

      const statusTd = document.createElement('td');
      statusTd.innerHTML = app.enrolled ? '<span class="badge enrolled">Enrolled</span>' : '<span class="badge pending">Pending</span>';
      tr.appendChild(statusTd);

      const actionsTd = document.createElement('td');
      actionsTd.className = 'student-actions';

      const v = document.createElement('button'); v.className = 'student-btn student-view'; v.title = 'View'; v.appendChild(createIcon('fas fa-eye')); v.addEventListener('click', () => openStudentModal(app));
      const e = document.createElement('button'); e.className = 'student-btn student-edit'; e.title = 'Edit'; e.appendChild(createIcon('fas fa-pen')); e.addEventListener('click', () => openEditPanel(app));
      const a = document.createElement('button'); a.className = 'student-btn student-archive'; a.title = 'Archive'; a.appendChild(createIcon('fas fa-archive')); a.addEventListener('click', () => openArchiveConfirm(app));
      const d = document.createElement('button'); d.className = 'student-btn student-delete'; d.title = 'Delete'; d.appendChild(createIcon('fas fa-trash')); d.addEventListener('click', () => openDeleteConfirm(app));
      const en = document.createElement('button'); en.className = 'student-btn student-enroll'; en.textContent = app.enrolled ? 'Enrolled' : 'Enroll'; en.disabled = !!app.enrolled; en.addEventListener('click', () => enrollApplicant(app));

      [v,e,a,d,en].forEach(btn => actionsTd.appendChild(btn));
      tr.appendChild(actionsTd);

      frag.appendChild(tr);
    }
  });

  studentsBody.appendChild(frag);
}

/**
 * renderCards(list)
 * - builds applicant cards for card view
 * - uses student-* classes for action buttons for consistency
 */
function renderCards(list) {
  if (!cardsView) return;
  cardsView.innerHTML = '';
  const frag = document.createDocumentFragment();

  list.forEach(app => {
    if (!app) return;
    const card = document.createElement('div'); card.className = 'applicant-card';

    const header = document.createElement('div'); header.className = 'applicant-header';
    const left = document.createElement('div'); left.textContent = `${(app.formType || '').toUpperCase()} — ${app.gradeLevel || '-'}`;
    const right = document.createElement('div'); right.className = `status-badge ${app.enrolled ? 'status-active' : 'status-review'}`;
    right.textContent = app.enrolled ? 'Enrolled' : 'Pending';
    header.appendChild(left); header.appendChild(right);
    card.appendChild(header);

    const info = document.createElement('div'); info.className = 'applicant-info';
    const photo = document.createElement('div'); photo.className = 'applicant-photo';
    photo.appendChild(createIcon('fas fa-user-circle'));
    const details = document.createElement('div'); details.className = 'applicant-details';
    const h3 = document.createElement('h3'); h3.textContent = app.fullName || '-';
    const p1 = document.createElement('p'); p1.textContent = `Grade: ${app.gradeLevel || '-'}`;
    const p2 = document.createElement('p'); p2.textContent = `Section: ${app.section || '-'}`;
    details.appendChild(h3); details.appendChild(p1); details.appendChild(p2);

    if (app.archived && app.archivedAt) {
      const archivedP = document.createElement('p');
      archivedP.className = 'muted small archived-ts';
      archivedP.textContent = 'Archived: ' + formatDateTime(app.archivedAt);
      details.appendChild(archivedP);
    }

    info.appendChild(photo); info.appendChild(details);
    card.appendChild(info);

    const reqList = document.createElement('ul'); reqList.className = 'requirements-list';
    Object.entries(app.requirements).forEach(([k, v]) => {
      const li = document.createElement('li');
      const strong = document.createElement('strong'); strong.textContent = k;
      const statusSpan = document.createElement('span'); statusSpan.className = v ? 'complete' : 'incomplete';
      statusSpan.textContent = v ? '✓' : '✗';
      li.appendChild(strong); li.appendChild(document.createTextNode(': ')); li.appendChild(statusSpan);
      reqList.appendChild(li);
    });
    card.appendChild(reqList);

    // Action buttons (student-* classes)
    const actions = document.createElement('div'); actions.className = 'applicant-actions';

    const btnView = document.createElement('button'); btnView.className = 'student-btn student-view'; btnView.title = 'View';
    btnView.appendChild(createIcon('fas fa-eye'));
    btnView.addEventListener('click', () => openStudentModal(app));
    actions.appendChild(btnView);

    const btnEdit = document.createElement('button'); btnEdit.className = 'student-btn student-edit'; btnEdit.title = 'Edit';
    btnEdit.appendChild(createIcon('fas fa-pen'));
    btnEdit.addEventListener('click', () => openEditPanel(app));
    actions.appendChild(btnEdit);

    const btnArchive = document.createElement('button'); btnArchive.className = 'student-btn student-archive'; btnArchive.title = 'Archive';
    btnArchive.appendChild(createIcon('fas fa-archive'));
    btnArchive.addEventListener('click', () => openArchiveConfirm(app));
    actions.appendChild(btnArchive);

    const btnDelete = document.createElement('button'); btnDelete.className = 'student-btn student-delete'; btnDelete.title = 'Delete';
    btnDelete.appendChild(createIcon('fas fa-trash'));
    btnDelete.addEventListener('click', () => openDeleteConfirm(app));
    actions.appendChild(btnDelete);

    const btnEnroll = document.createElement('button'); btnEnroll.className = 'student-btn student-enroll';
    btnEnroll.textContent = app.enrolled ? 'Enrolled' : 'Enroll';
    btnEnroll.disabled = app.enrolled;
    btnEnroll.addEventListener('click', () => enrollApplicant(app));
    actions.appendChild(btnEnroll);

    card.appendChild(actions);
    frag.appendChild(card);
  });

  cardsView.appendChild(frag);
}

/* ------------------ Modal & actions ------------------ */

/** openStudentModal(app) - populate modal elements (no markup creation beyond icons inside buttons) */
function openStudentModal(app) {
  currentModalApp = app;

  if (!modal) return;
  modalName.textContent = app.fullName || '-';
  modalMeta.textContent = `${(app.formType || '').toUpperCase()} • Grade ${app.gradeLevel || '-'} • ${app.section || '-'}`;

  // populate requirements (clear existing)
  if (modalRequirements) modalRequirements.innerHTML = '';
  Object.entries(app.requirements).forEach(([key, val]) => {
    if (!modalRequirements) return;
    const li = document.createElement('div');
    li.className = 'req-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!val;
    checkbox.id = `req-${key}-${app.id}`;

    checkbox.addEventListener('change', async (e) => {
      try {
        const collectionName = app.formType === 'jhs' ? 'jhsApplicants' : 'shsApplicants';
        const docRef = doc(db, collectionName, app.id);
        const fieldPath = `requirements.${key}`;
        await updateDoc(docRef, { [fieldPath]: e.target.checked, updatedAt: serverTimestamp() });
      } catch (err) {
        console.error('Failed updating requirement', err);
        e.target.checked = !e.target.checked;
      }
    });

    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.textContent = key;

    li.appendChild(checkbox);
    li.appendChild(label);
    modalRequirements.appendChild(li);
  });

  // modal progress (use canonical DOM, modalProgress is inner element or container)
  if (modalProgress) {
    // If modalProgress is the inner fill element use width directly, else replace contents
    if (modalProgress.classList.contains('progress-bar')) {
      // it's the fill element: set width
      modalProgress.style.width = computeReqProgress(app.requirements) + '%';
    } else {
      // container: replace with structure
      const container = modalProgress;
      container.innerHTML = '';
      const percent = computeReqProgress(app.requirements);
      container.appendChild(createProgressBar(percent));
    }
  }

  // prefill edit inputs
  if (editPanel) {
    editFirst.value = app.firstName || '';
    editLast.value = app.lastName || '';
    editGrade.value = app.gradeLevel || '';
    editSection.value = app.section || '';
    editError.textContent = '';
    editPanel.classList.add('hidden');
  }

  if (archivePanel) archivePanel.classList.add('hidden');
  if (deletePanel) deletePanel.classList.add('hidden');

  // wire modal actions
  if (btnApproveEnroll) btnApproveEnroll.disabled = app.enrolled;
  if (btnApproveEnroll) btnApproveEnroll.onclick = () => enrollApplicant(app);
  if (modalEditBtn) modalEditBtn.onclick = () => openEditPanel(app);
  if (modalArchiveBtn) modalArchiveBtn.onclick = () => openArchiveConfirm(app);
  if (modalDeleteBtn) modalDeleteBtn.onclick = () => openDeleteConfirm(app);

  modal.style.display = 'block';
  modal.setAttribute('aria-hidden', 'false');
}

/** enrollApplicant(app) */
async function enrollApplicant(app) {
  if (!app || app.enrolled) return;
  try {
    const collectionName = app.formType === 'jhs' ? 'jhsApplicants' : 'shsApplicants';
    const docRef = doc(db, collectionName, app.id);
    await updateDoc(docRef, {
      enrolled: true,
      enrolledAt: serverTimestamp(),
      isNew: false,
      updatedAt: serverTimestamp()
    });
    if (modal) {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }
  } catch (err) {
    console.error('Enroll failed', err);
  }
}

/* ------------------ Edit panel ------------------ */

function openEditPanel(app) {
  currentModalApp = app;
  if (!modal || modal.style.display !== 'block') {
    openStudentModal(app);
    setTimeout(() => {
      if (editPanel) { editPanel.classList.remove('hidden'); if (editFirst) editFirst.focus(); }
    }, 80);
    return;
  }
  if (editPanel) { editPanel.classList.remove('hidden'); if (editFirst) editFirst.focus(); }
  if (archivePanel) archivePanel.classList.add('hidden');
  if (deletePanel) deletePanel.classList.add('hidden');
}

function closeEditPanel() {
  if (editPanel) editPanel.classList.add('hidden');
}

async function saveApplicantEdits() {
  if (!currentModalApp) return;
  const first = (editFirst.value || '').trim();
  const last  = (editLast.value || '').trim();
  const grade = (editGrade.value || '').trim();
  const section = (editSection.value || '').trim();

  editError.textContent = '';
  if (!first || !last) { editError.textContent = 'First and Last name required.'; return; }

  editSave.disabled = true;
  const prevText = editSave.textContent;
  editSave.textContent = 'Saving...';

  try {
    const collectionName = currentModalApp.formType === 'jhs' ? 'jhsApplicants' : 'shsApplicants';
    const docRef = doc(db, collectionName, currentModalApp.id);
    await updateDoc(docRef, {
      firstName: first,
      lastName: last,
      gradeLevel: grade,
      section,
      updatedAt: serverTimestamp()
    });

    editSave.disabled = false;
    editSave.textContent = prevText;
    closeEditPanel();
    if (modal) { modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); }
  } catch (err) {
    console.error('Edit save failed', err);
    editError.textContent = 'Failed to save changes.';
    editSave.disabled = false;
    editSave.textContent = prevText;
  }
}

/* ------------------ Archive / delete flow ------------------ */

function openArchiveConfirm(app, options = {}) {
  currentModalApp = app;
  if (!modal || modal.style.display !== 'block') {
    openStudentModal(app);
    setTimeout(() => {
      if (!archivePanel) return;
      archivePanel.dataset.allowHardDelete = options.allowHardDelete ? '1' : '0';
      archivePanel.classList.remove('hidden');
    }, 80);
    return;
  }
  if (archivePanel) {
    archivePanel.dataset.allowHardDelete = options.allowHardDelete ? '1' : '0';
    archivePanel.classList.remove('hidden');
  }
  if (editPanel) editPanel.classList.add('hidden');
  if (deletePanel) deletePanel.classList.add('hidden');
}

function closeArchiveConfirm() {
  if (archivePanel) archivePanel.classList.add('hidden');
}

async function confirmArchive() {
  if (!currentModalApp) return;
  const allowHardDelete = archivePanel && archivePanel.dataset && archivePanel.dataset.allowHardDelete === '1';
  try {
    const collectionName = currentModalApp.formType === 'jhs' ? 'jhsApplicants' : 'shsApplicants';
    const docRef = doc(db, collectionName, currentModalApp.id);
    const updatePayload = { archived: true, archivedAt: serverTimestamp(), updatedAt: serverTimestamp() };
    if (allowHardDelete) { updatePayload.deleted = true; updatePayload.deletedAt = serverTimestamp(); }
    await updateDoc(docRef, updatePayload);

    showToast('Applicant archived', 'Undo', async () => {
      try {
        await updateDoc(docRef, { archived: false, archivedAt: null, updatedAt: serverTimestamp() });
        applyFiltersAndRender(); // Refresh the UI after undo
      } catch (err) {
        console.error('Undo archive failed', err);
      }
    });

    if (modal) { modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); }
  } catch (err) {
    console.error('Archive failed', err);
  } finally {
    closeArchiveConfirm();
  }
}

/* ------------------ Unarchive flow ------------------ */
async function openUnarchiveConfirm(app) {
  currentModalApp = app;
  if (confirm(`Unarchive ${app.fullName}? This will restore them to active records.`)) {
    try {
      const collectionName = app.formType === 'jhs' ? 'jhsApplicants' : 'shsApplicants';
      const docRef = doc(db, collectionName, app.id);
      await updateDoc(docRef, {
        archived: false,
        archivedAt: null,
        updatedAt: serverTimestamp()
      });
      showToast('Applicant unarchived', 'Undo', async () => {
        await updateDoc(docRef, { 
          archived: true,
          archivedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        applyFiltersAndRender();
      });
    } catch (err) {
      console.error('Unarchive failed', err);
    }
  }
}

/* ------------------ Delete confirm flow ------------------ */

function openDeleteConfirm(app) {
  currentModalApp = app;
  if (!modal || modal.style.display !== 'block') {
    openStudentModal(app);
    setTimeout(() => {
      if (!deletePanel) return;
      deletePanel.classList.remove('hidden');
    }, 80);
    return;
  }
  if (deletePanel) deletePanel.classList.remove('hidden');
  if (editPanel) editPanel.classList.add('hidden');
  if (archivePanel) archivePanel.classList.add('hidden');
}

function closeDeleteConfirm() {
  if (deletePanel) deletePanel.classList.add('hidden');
}

async function confirmDelete() {
  if (!currentModalApp) return;
  try {
    const collectionName = currentModalApp.formType === 'jhs' ? 'jhsApplicants' : 'shsApplicants';
    const docRef = doc(db, collectionName, currentModalApp.id);

    // Mark deleted and archived for consistency; record timestamp
    await updateDoc(docRef, {
      deleted: true,
      deletedAt: serverTimestamp(),
      archived: true,
      archivedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // show undo toast that restores deleted/archived flags
    showToast('Applicant deleted', 'Undo', async () => {
      try {
        await updateDoc(docRef, {
          deleted: false,
          deletedAt: null,
          archived: false,
          archivedAt: null,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.error('Undo delete failed', err);
      }
    });

    if (modal) { modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); }
  } catch (err) {
    console.error('Delete failed', err);
  } finally {
    closeDeleteConfirm();
  }
}

/* ------------------ Toast (clone template from DOM, no inline styles) ------------------ */

function showToast(message, actionText, actionCallback) {
  if (!toastContainer) return;

  // Prefer using a toast template defined in HTML (id="toast-template")
  if (toastTemplate && toastTemplate.content) {
    const clone = toastTemplate.content.cloneNode(true);
    const root = clone.querySelector('.admin-toast');
    if (!root) return;

    const msgEl = root.querySelector('.toast-message');
    if (msgEl) msgEl.textContent = message;

    const actionBtn = root.querySelector('.toast-action');
    if (actionBtn) {
      if (actionText && actionCallback) {
        actionBtn.textContent = actionText;
        actionBtn.addEventListener('click', () => {
          try { actionCallback(); } catch (e) { console.error(e); }
          if (root.parentNode) root.parentNode.removeChild(root);
        });
      } else {
        // hide action area if not needed
        actionBtn.remove();
      }
    }

    // append cloned element to container
    const wrapper = document.createElement('div');
    wrapper.appendChild(clone);
    toastContainer.appendChild(wrapper);

    // auto remove after 8s
    setTimeout(() => {
      if (wrapper.parentNode === toastContainer) toastContainer.removeChild(wrapper);
    }, 8000);

    return;
  }

  // Fallback (if toast template not present) - create simple node (no inline styles)
  const t = document.createElement('div');
  t.className = 'admin-toast';
  const m = document.createElement('div'); m.className = 'toast-message'; m.textContent = message;
  t.appendChild(m);
  if (actionText && actionCallback) {
    const a = document.createElement('button'); a.className = 'toast-action'; a.textContent = actionText;
    a.addEventListener('click', () => { actionCallback(); if (t.parentNode) t.parentNode.removeChild(t); });
    t.appendChild(a);
  }
  toastContainer.appendChild(t);
  setTimeout(() => { if (t.parentNode === toastContainer) t.parentNode.removeChild(t); }, 8000);
}

/* ------------------ Filters / Render pipeline ------------------ */

function applyFiltersAndRender() {
  let list = Array.from(applicantsMap.values());

  if (activeTab === 'archived') {
    list = list.filter(a => a.archived);
  } else {
    list = list.filter(a => !a.archived);
    if (activeTab === 'jhs') list = list.filter(a => a.formType === 'jhs');
    else if (activeTab === 'shs') list = list.filter(a => a.formType === 'shs');
    else if (activeTab === 'enrolled') list = list.filter(a => a.enrolled);
  }

  const statusVal = filterStatus ? filterStatus.value : '';
  if (statusVal === 'new') list = list.filter(a => a.isNew);
  else if (statusVal === 'old') list = list.filter(a => !a.isNew);
  else if (statusVal === 'incomplete') list = list.filter(a => computeReqProgress(a.requirements) < 100);
  else if (statusVal === 'complete') list = list.filter(a => computeReqProgress(a.requirements) === 100);

  const q = (searchInput && searchInput.value || '').trim().toLowerCase();
  if (q) {
    list = list.filter(a =>
      (a.fullName || '').toLowerCase().includes(q) ||
      (a.id || '').toLowerCase().includes(q) ||
      (String(a.gradeLevel || '')).includes(q)
    );
  }

  if (sortBy && sortBy.value === 'name') list.sort((x, y) => (x.fullName || '').localeCompare(y.fullName || ''));
  else if (sortBy && sortBy.value === 'grade') list.sort((x, y) => String(x.gradeLevel || '').localeCompare(String(y.gradeLevel || '')));
  else list.sort((x, y) => y.submittedAt - x.submittedAt);

  updateCounts();

  if (activeView === 'table') {
    if (tableView) tableView.style.display = 'block';
    if (cardsView) cardsView.style.display = 'none';
    renderTableRows(list);
  } else {
    if (tableView) tableView.style.display = 'none';
    if (cardsView) cardsView.style.display = 'grid';
    renderCards(list);
  }
}

/* ------------------ UI event listeners ------------------ */

function attachUIListeners() {
  // Tabs (including archived)
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => btn.addEventListener('click', (e) => {
    tabButtons.forEach(b => b.classList.remove('active'));
    e.currentTarget.classList.add('active');
    activeTab = e.currentTarget.dataset.tab;
    applyFiltersAndRender();
  }));

  if (tableBtn) tableBtn.addEventListener('click', () => {
    activeView = 'table';
    tableBtn.classList.add('active');
    if (cardsBtn) cardsBtn.classList.remove('active');
    applyFiltersAndRender();
  });
  if (cardsBtn) cardsBtn.addEventListener('click', () => {
    activeView = 'cards';
    cardsBtn.classList.add('active');
    if (tableBtn) tableBtn.classList.remove('active');
    applyFiltersAndRender();
  });

  if (searchInput) searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => applyFiltersAndRender(), 250);
  });

  if (filterStatus) filterStatus.addEventListener('change', applyFiltersAndRender);
  if (sortBy) sortBy.addEventListener('change', applyFiltersAndRender);

  if (modalEditBtn) modalEditBtn.addEventListener('click', () => { 
    if (currentModalApp) openEditPanel(currentModalApp); 
  });
  if (modalArchiveBtn) modalArchiveBtn.addEventListener('click', () => { 
    if (currentModalApp) openArchiveConfirm(currentModalApp); 
  });
  if (modalDeleteBtn) modalDeleteBtn.addEventListener('click', () => { 
    if (currentModalApp) openDeleteConfirm(currentModalApp); 
  });

  if (editCancel) editCancel.addEventListener('click', () => closeEditPanel());
  if (editSave) editSave.addEventListener('click', () => saveApplicantEdits());

  if (archiveCancel) archiveCancel.addEventListener('click', () => closeArchiveConfirm());
  if (archiveConfirmBtn) archiveConfirmBtn.addEventListener('click', () => confirmArchive());

  if (deleteCancel) deleteCancel.addEventListener('click', () => closeDeleteConfirm());
  if (deleteConfirmBtn) deleteConfirmBtn.addEventListener('click', () => confirmDelete());

  if (modalClose) modalClose.addEventListener('click', () => {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    closeEditPanel();
    closeArchiveConfirm();
    closeDeleteConfirm();
  });

  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      closeEditPanel();
      closeArchiveConfirm();
      closeDeleteConfirm();
    }
  });
}

/*  Firestore realtime listeners  */
function setupRealtimeListeners() {
  const jhsCol = collection(db, 'jhsApplicants');
  onSnapshot(jhsCol, snapshot => {
    snapshot.docChanges().forEach(change => {
      const id = change.doc.id;
      const data = change.doc.data();
      if (change.type === 'removed') applicantsMap.delete(id);
      else applicantsMap.set(id, normalizeApplicant(id, data));
    });
    applyFiltersAndRender();
  }, err => { console.error('JHS onSnapshot error', err); });

  const shsCol = collection(db, 'shsApplicants');
  onSnapshot(shsCol, snapshot => {
    snapshot.docChanges().forEach(change => {
      const id = change.doc.id;
      const data = change.doc.data();
      if (change.type === 'removed') applicantsMap.delete(id);
      else applicantsMap.set(id, normalizeApplicant(id, data));
    });
    applyFiltersAndRender();
  }, err => { console.error('SHS onSnapshot error', err); });
}

/* ------------------ Initialization ------------------ */

function init() {
  attachUIListeners();
  setupRealtimeListeners();
}
init();
