// adminportal/admin-user-management.js
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { auth } from "../firebase-config.js";
import { apiFetch } from "../api-fetch.js"; // <-- centralized helper; put api-fetch.js at project root or adjust path

// Debug handle
window._debugAuth = auth;
console.log('[debug] admin-user-management loaded, auth:', !!auth, 'currentUser:', auth.currentUser);

// helper
const $ = (s) => document.querySelector(s);



// timestamp formatting helper
function safeFormatTimestamp(ts) {
  if (!ts) return "-";
  if (ts instanceof Date) return ts.toLocaleString();
  if (typeof ts === "string") {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? ts : d.toLocaleString();
  }
  const seconds = ts.seconds ?? ts._seconds;
  if (typeof seconds === "number") return new Date(seconds * 1000).toLocaleString();
  return String(ts);
}

// build table row without template strings (no HTML injection)
function buildUserRow(u) {
  const tr = document.createElement('tr');
  tr.dataset.userId = u.uid;
  tr.dataset.userStatus = u.archived ? 'archived' : (u.status || 'active');

  // Name cell
  const tdName = document.createElement('td');
  tdName.className = 'name-cell';
  const nameDiv = document.createElement('div');
  nameDiv.className = 'user-name';
  nameDiv.textContent = u.displayName || '-';
  const metaDiv = document.createElement('div');
  metaDiv.className = 'muted small';
  metaDiv.textContent = u.customId || '';
  tdName.appendChild(nameDiv);
  tdName.appendChild(metaDiv);

  // Email cell
  const tdEmail = document.createElement('td');
  tdEmail.className = 'email-cell';
  tdEmail.textContent = u.email || '-';

  // Role cell (badge)
  const tdRole = document.createElement('td');
  tdRole.className = 'role-cell';
  const spanRole = document.createElement('span');
  spanRole.className = 'badge ' + (u.role === 'admin' ? 'badge-admin' : 'badge-applicant');
  spanRole.textContent = u.role || 'applicant';
  tdRole.appendChild(spanRole);

  // Status cell
  const tdStatus = document.createElement('td');
  tdStatus.className = 'status-cell';
  const dot = document.createElement('span');
  dot.className = 'status-dot ' + ((u.status === 'active') ? 'status-active' : 'status-inactive');
  dot.setAttribute('aria-hidden', 'true');
  const small = document.createElement('span');
  small.className = 'small';
  small.textContent = u.status || 'active';
  tdStatus.appendChild(dot);
  tdStatus.appendChild(small);

  // Created cell
  const tdCreated = document.createElement('td');
  tdCreated.className = 'created-cell hide-mobile';
  tdCreated.textContent = safeFormatTimestamp(u.createdAt);

  // Actions cell - build buttons
  const tdActions = document.createElement('td');
  tdActions.className = 'actions-cell';

  // Inline actions container
  const inlineWrap = document.createElement('div');
  inlineWrap.className = 'actions-inline';

  // helper to create button
  function createBtn(btnClass, title, iconClass) {
    const b = document.createElement('button');
    b.className = 'table-action-btn ' + btnClass;
    b.type = 'button';
    b.title = title;
    const i = document.createElement('i');
    i.className = iconClass;
    b.appendChild(i);
    return b;
  }

  // View
  const btnView = createBtn('btn-view', 'View', 'fas fa-eye');
  inlineWrap.appendChild(btnView);

  // Edit
  const btnEdit = createBtn('btn-edit', 'Edit', 'fas fa-pen');
  inlineWrap.appendChild(btnEdit);

  // Reset
  const btnReset = createBtn('btn-reset', 'Reset password', 'fas fa-key');
  btnReset.dataset.uid = u.uid;
  btnReset.dataset.confirm = 'Reset password for this user?';
  inlineWrap.appendChild(btnReset);

  // Dropdown details (we keep markup but create nodes)
  const dropdownWrap = document.createElement('div');
  dropdownWrap.className = 'action-dropdown';
  const details = document.createElement('details');
  details.className = 'dropdown-details';
  const summary = document.createElement('summary');
  summary.className = 'dropdown-summary table-action-btn';
  summary.setAttribute('aria-haspopup', 'true');
  const ell = document.createElement('i');
  ell.className = 'fas fa-ellipsis-v';
  summary.appendChild(ell);
  details.appendChild(summary);

  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';
  menu.setAttribute('role', 'menu');

  // Toggle active
  const btnToggle = document.createElement('button');
  btnToggle.className = 'dropdown-item btn-toggle';
  btnToggle.type = 'button';
  btnToggle.textContent = 'Activate / Deactivate';
  btnToggle.dataset.action = 'toggle-active';
  menu.appendChild(btnToggle);

  // Archive
  const btnArchive = document.createElement('button');
  btnArchive.className = 'dropdown-item btn-archive';
  btnArchive.type = 'button';
  btnArchive.textContent = 'Archive';
  btnArchive.dataset.action = 'archive';
  menu.appendChild(btnArchive);

  // Delete (danger)
  const btnDelete = document.createElement('button');
  btnDelete.className = 'dropdown-item danger btn-delete';
  btnDelete.type = 'button';
  btnDelete.textContent = 'Delete (hard)';
  btnDelete.dataset.action = 'delete';
  btnDelete.dataset.archivedOnly = 'true';
  menu.appendChild(btnDelete);

  details.appendChild(menu);
  dropdownWrap.appendChild(details);
  inlineWrap.appendChild(dropdownWrap);

  // mobile actions wrapper - keep existing markup but build
  const collapseWrap = document.createElement('div');
  collapseWrap.className = 'actions-collapse';
  const mobileDetails = document.createElement('details');
  mobileDetails.className = 'mobile-actions';
  const mobileSummary = document.createElement('summary');
  mobileSummary.className = 'mobile-summary table-action-btn';
  const mobileI = document.createElement('i');
  mobileI.className = 'fas fa-ellipsis-h';
  mobileSummary.appendChild(mobileI);
  mobileDetails.appendChild(mobileSummary);

  const mobileMenu = document.createElement('div');
  mobileMenu.className = 'mobile-menu';

  const mView = document.createElement('button'); mView.className = 'mobile-item'; mView.textContent = 'View profile'; mView.dataset.action = 'view';
  const mEdit = document.createElement('button'); mEdit.className = 'mobile-item'; mEdit.textContent = 'Edit'; mEdit.dataset.action = 'edit';
  const mReset = document.createElement('button'); mReset.className = 'mobile-item'; mReset.textContent = 'Reset password'; mReset.dataset.action = 'reset-password';
  const mToggle = document.createElement('button'); mToggle.className = 'mobile-item'; mToggle.textContent = 'Activate / Deactivate'; mToggle.dataset.action = 'toggle-active';
  const mArchive = document.createElement('button'); mArchive.className = 'mobile-item'; mArchive.textContent = 'Archive'; mArchive.dataset.action = 'archive';
  const mDelete = document.createElement('button'); mDelete.className = 'mobile-item danger'; mDelete.textContent = 'Delete (hard)'; mDelete.dataset.action = 'delete'; mDelete.dataset.archivedOnly = 'true';

  [mView, mEdit, mReset, mToggle, mArchive, mDelete].forEach(el => mobileMenu.appendChild(el));
  mobileDetails.appendChild(mobileMenu);
  collapseWrap.appendChild(mobileDetails);

  tdActions.appendChild(inlineWrap);
  tdActions.appendChild(collapseWrap);

  // assemble tr
  tr.appendChild(tdName);
  tr.appendChild(tdEmail);
  tr.appendChild(tdRole);
  tr.appendChild(tdStatus);
  tr.appendChild(tdCreated);
  tr.appendChild(tdActions);

  return tr;
}

// load users and append rows
async function loadUsers() {
  const tbody = document.querySelector('#users-tbody');
  if (!tbody) return;
  tbody.innerHTML = ''; // clear
  // show loading row
  const loadingRow = document.createElement('tr');
  const loadingTd = document.createElement('td');
  loadingTd.colSpan = 6;
  loadingTd.textContent = 'Loading...';
  loadingRow.appendChild(loadingTd);
  tbody.appendChild(loadingRow);

  try {
    const { users } = await apiFetch('/admin/users');
    tbody.innerHTML = '';
    if (!users || users.length === 0) {
      const r = document.createElement('tr');
      const c = document.createElement('td');
      c.colSpan = 6;
      c.textContent = 'No users found.';
      r.appendChild(c);
      tbody.appendChild(r);
      return;
    }
    users.forEach(u => {
      const tr = buildUserRow(u);
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '';
    const r = document.createElement('tr');
    const c = document.createElement('td');
    c.colSpan = 6;
    c.textContent = 'Failed to load users';
    r.appendChild(c);
    tbody.appendChild(r);
    alert('Failed to load users: ' + (err.message || err));
  }
}

// event delegation for clicks - uses classes/data-action
async function handleTableClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  // find row
  const tr = btn.closest('tr');
  const uid = tr?.dataset?.userId;
  if (!uid) return;

  // Reset password
  if (btn.classList.contains('btn-reset')) {
    if (!confirm(btn.dataset.confirm || 'Reset password for this user?')) return;
    try {
      const res = await apiFetch('/admin/reset-password', {
        method: 'POST',
        body: JSON.stringify({ uid, notifyUser: true })
      });
      if (res.emailed) alert('Password reset link emailed to the user.');
      else alert('Password reset link generated.');
    } catch (err) {
      console.error(err);
      alert('Reset failed: ' + (err.message || err));
    }
    return;
  }

  // View
  if (btn.classList.contains('btn-view') || btn.dataset.action === 'view') {
    openViewModal(uid);
    return;
  }

  // Edit - uses prompt() to avoid HTML in JS
  if (btn.classList.contains('btn-edit') || btn.dataset.action === 'edit') {
    try {
      // fetch current values to suggest defaults (optional)
      const displayName = prompt('Enter display name (leave empty to cancel):', tr.querySelector('.user-name')?.textContent || '');
      if (displayName === null) return; // cancelled
      const currentRole = tr.querySelector('.role-cell .badge')?.textContent?.trim() || 'applicant';
      const newRole = prompt('Enter role (admin or applicant):', currentRole) || currentRole;
      if (!['admin', 'applicant'].includes(newRole.toLowerCase())) { alert('Role must be admin or applicant'); return; }

      // send update
      await apiFetch(`/admin/users/${encodeURIComponent(uid)}`, {
        method: 'PUT',
        body: JSON.stringify({ displayName: displayName.trim(), role: newRole.toLowerCase() })
      });
      alert('User updated.');
      // refresh row list
      await loadUsers();
    } catch (err) {
      console.error(err);
      alert('Update failed: ' + (err.message || err));
    }
    return;
  }

  // Toggle active - placeholder: implement your endpoint if desired
  if (btn.classList.contains('btn-toggle') || btn.dataset.action === 'toggle-active') {
    // toggle based on current status in row
    const current = tr.dataset.userStatus === 'active' ? 'active' : 'inactive';
    const setTo = current === 'active' ? 'inactive' : 'active';
    if (!confirm(`Set user to ${setTo}?`)) return;
    try {
      // Using PUT to update status
      await apiFetch(`/admin/users/${encodeURIComponent(uid)}`, {
        method: 'PUT',
        body: JSON.stringify({ status: setTo }) // server will ignore unknown fields unless you choose to support them
      });
      alert('Status updated (refreshing list).');
      await loadUsers();
    } catch (err) {
      console.error(err);
      alert('Failed to update status: ' + (err.message || err));
    }
    return;
  }

  // Archive
  if (btn.classList.contains('btn-archive') || btn.dataset.action === 'archive') {
    if (!confirm('Archive this user? You can unarchive later.')) return;
    try {
      await apiFetch(`/admin/users/${encodeURIComponent(uid)}/archive`, { method: 'POST' });
      alert('Archived. The list will refresh.');
      await loadUsers();
    } catch (err) {
      console.error(err);
      alert('Archive failed: ' + (err.message || err));
    }
    return;
  }

  // Unarchive support via mobile menu? We can map a special button - not included in markup by default.

  // Delete (hard)
  if (btn.classList.contains('btn-delete') || btn.dataset.action === 'delete') {
    // Enforce archive-only server side; here do a strong confirmation
    if (!confirm('THIS WILL PERMANENTLY DELETE this user. This action cannot be undone.')) return;
    try {
      await apiFetch(`/admin/users/${encodeURIComponent(uid)}`, { method: 'DELETE' });
      alert('User deleted.');
      await loadUsers();
    } catch (err) {
      console.error(err);
      alert('Delete failed: ' + (err.message || err));
    }
    return;
  }
}

// simple view modal placeholder
function openViewModal(uid) {
  alert('Open view modal for user: ' + uid + ' (implement UI).');
}

// init
document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.querySelector('#users-tbody');
  if (!tbody) return;
  tbody.addEventListener('click', handleTableClick);
  loadUsers();
});
