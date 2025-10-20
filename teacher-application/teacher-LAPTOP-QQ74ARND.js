// teacher.js (fixed)
// Replaces your existing teacher.js — preserves original behavior and only fixes applicant status population mapping & exposure.

import { logoutAndRedirect } from "../logout-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    // ---------- ORIGINAL SIDEBAR / LAYOUT CODE (kept exactly) ----------
    // DOM elements
    const openSidebar = document.getElementById('open-sidebar');
    const closeSidebar = document.getElementById('close-sidebar');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    const navLinks = document.querySelectorAll('.sidebar a[href^="#"]:not([href="#"])'); // Get all sidebar navigation links with href starting with #

    // Create overlay element for mobile
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    document.body.appendChild(overlay);

    function updateLayout() {
        const isDesktop = window.innerWidth >= 992;
        const sidebarVisible = sidebar.classList.contains('show');
        mainContent.classList.toggle("with-sidebar", isDesktop && sidebarVisible);
    }
    // Function to open sidebar
    function showSidebar() {
        sidebar.classList.add('show');
        overlay.classList.add('active');
        updateLayout();
    }

    // Function to close sidebar
    function hideSidebar() {
        sidebar.classList.remove('show');
        overlay.classList.remove('active');
        updateLayout();
    }

    // Handle window resize
    window.addEventListener('resize', updateLayout);
    // Close sidebar when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.sidebar') && !openSidebar.contains(e.target)) {
            hideSidebar();
        }
    });
    // Event Listeners
    openSidebar.addEventListener('click', showSidebar);
    closeSidebar.addEventListener('click', hideSidebar);
    overlay.addEventListener('click', hideSidebar);

    function checkHash() {
        const hash = window.location.hash || "#dashboard";
        const targetSection = document.querySelector(hash);

        document
            .querySelectorAll("section")
            .forEach((sec) => (sec.style.display = "none"));
        if (targetSection) targetSection.style.display = "block";
        else document.querySelector("#dashboard").style.display = "block";

        navLinks.forEach((link) => {
            link.classList.remove("active");
            if (link.getAttribute("href") === hash) {
                link.classList.add("active");

            }
        });
    }
    // Smooth scrolling for sidebar links
    navLinks.forEach((link) => {
        link.addEventListener("click", function (e) {
            if (this.hash && this.hash !== "#") {
                e.preventDefault();
                history.pushState(null, null, this.hash);
                checkHash();
                if (window.innerWidth < 992) hideSidebar();
            }
        });
    });

    window.addEventListener("hashchange", checkHash);
    checkHash();
    // Logout button
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            logoutAndRedirect("../login/login.html");
        });
    }

    // ---------- ADDED TEACHER DASHBOARD BEHAVIOR (minimal & approved) ----------

    // Basic helper: safe HTML escape for inserting text content
    function escapeHtml(raw) {
        if (raw === null || raw === undefined) return '';
        return String(raw).replace(/[&<>"']/g, function (m) {
            return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
        });
    }
    function timestampToIso(val) {
    if (!val) return null;
  // already ISO/string
  if (typeof val === 'string') return val;
  // Firestore Timestamp (has toDate)
  if (typeof val.toDate === 'function') {
    try { return val.toDate().toISOString(); } catch (e) {}
  }
  // Plain object with _seconds/_nanoseconds (common when server serializes)
  if (typeof val === 'object' && (val._seconds !== undefined || val.seconds !== undefined)) {
    const seconds = Number(val._seconds ?? val.seconds ?? 0);
    const nanos = Number(val._nanoseconds ?? val.nanoseconds ?? 0);
    const ms = seconds * 1000 + Math.floor(nanos / 1e6);
    try { return new Date(ms).toISOString(); } catch (e) { return String(val); }
  }
  // Date instance
  if (val instanceof Date) return val.toISOString();
  // Fallback to string conversion
  try { return String(val); } catch (e) { return null; }
}

// Helper: convert ISO or timestamp-ish to local friendly string for display
function formatForDisplay(val) {
  const iso = timestampToIso(val);
  if (!iso) return '—';
  try {
    // show locale string — easier to read than raw ISO
    return new Date(iso).toLocaleString();
  } catch (e) {
    return iso;
  }
}

    // Minimal applicant state; will be replaced by server data on loadApplicant()
    const applicantState = {
        id: '',
        uid: '',
        createdAt: '',
        submittedAt: '',
        status: 'submitted', // default
        nextStepText: '',
        assignedReviewer: '—',
        interview: null, // or { date: '...', location: '...' }
        attachments: [],
        messages: [],
        // personal fields placeholders (will be set in loadApplicant)
        firstName: '',
        middleName: '',
        lastName: '',
        displayName: null,
        email: null,
        phone: null,
        address: null,
        birthDate: null,
        preferredLevel: null,
        degree: null,
        major: null,
        institution: null,
        gradYear: null,
        experience: null,
        previousSchools: null,
        license: null,
        subjects: null,
        employment: null
    };

    // ---------- AUTH helper ----------
    // Try Firebase client SDK first (if available), otherwise fall back to window.AUTH_TOKEN
    // Note: server cookie (Set-Cookie __session) will be sent automatically when we use fetch(..., { credentials: 'include' })
    async function getAuthToken() {
        try {
            if (window.firebase && firebase && firebase.auth && firebase.auth().currentUser) {
                // get a fresh ID token (not forced)
                try {
                    return await firebase.auth().currentUser.getIdToken(false);
                } catch (err) {
                    // fallback silently
                    console.warn('getAuthToken: firebase.getIdToken failed', err);
                }
            }
        } catch (e) {}
        // fallback: window.AUTH_TOKEN (server-signed JWT) if your login flow uses it
        if (window.AUTH_TOKEN) return window.AUTH_TOKEN;
        // nothing found
        return null;
    }

    // ---------- Load applicant from server ----------
    async function loadApplicant() {
        // Attempt to use a token if available; otherwise rely on cookie-based session.
        const token = await getAuthToken();

        try {
            const opts = {
                method: 'GET',
                credentials: 'include', // ensure cookie is sent when available
                headers: { 'Accept': 'application/json' }
            };
            if (token) opts.headers['Authorization'] = 'Bearer ' + token;

            const res = await fetch('/api/applicants/me', opts);

            if (res.status === 401) {
                // token invalid or expired - force logout
                logoutAndRedirect("../login/login.html");
                return null;
            }

            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                console.error('/api/applicants/me failed', res.status, txt);
                showToast('Failed to load applicant data. Please try again.');
                return null;
            }

            const payload = await res.json();
            const app = payload && payload.applicant ? payload.applicant : payload;

            const createdIso = timestampToIso(app.createdAt || app.created_at || null) || timestampToIso(app.submittedAt || app.submitted_at || null) || null;

            if (!app) {
                console.warn('/api/applicants/me returned unexpected payload', payload);
                showToast('Failed to load applicant information.');
                return null;
            }

            // Normalize fields into applicantState
            applicantState.id = app.id || app.applicationId || app.docId || applicantState.id || '';
            applicantState.uid = app.uid || app.userUid || '';
            // use createdAt || submittedAt (server may return Firestore timestamp object)
            applicantState.createdAt = createdIso;          
            applicantState.submittedAt = createdIso;         
            applicantState.submittedAt = applicantState.createdAt;
            applicantState.status = app.status || app.currentStatus || applicantState.status;
            applicantState.nextStepText = app.nextStepText || app.nextStep || '';
            applicantState.assignedReviewer = app.assignedReviewer || app.reviewer || '—';
            applicantState.interview = app.interview || null;

            // attachments/documents normalization
            const docs = Array.isArray(app.documents) ? app.documents : (Array.isArray(app.attachments) ? app.attachments : []);
            // Normalize each doc to { fileName, filePath, fileUrl? }
            applicantState.attachments = docs.map(d => {
                if (!d) return null;
                return {
                    fileName: d.fileName || d.name || (d.filePath ? d.filePath.split('/').pop() : 'Attachment'),
                    filePath: d.filePath || d.path || d.filePathNormalized || d.url || '',
                    fileUrl: d.fileUrl || d.url || null,
                };
            }).filter(Boolean);

            // messages normalization
            applicantState.messages = Array.isArray(app.messages) ? app.messages.slice() : [];

            // store other personal fields for status view (if present in app)
            // === IMPORTANT: copy name parts too (this fixes the fullname not showing) ===
            applicantState.firstName = app.firstName || app.first_name || (app.name && typeof app.name === 'string' ? app.name.split(' ')[0] : '') || '';
            applicantState.middleName = app.middleName || app.middle_name || '';
            applicantState.lastName = app.lastName || app.last_name || (app.name && typeof app.name === 'string' ? app.name.split(' ').slice(1).join(' ') : '') || '';
            applicantState.displayName = app.displayName || app.fullName || app.name || applicantState.displayName || null;
            applicantState.email = app.contactEmail || app.email || applicantState.email || null;
            applicantState.phone = app.contactNumber || app.contactNum || app.phone || app.contact || applicantState.phone || null;
            applicantState.address = app.address || null;
            applicantState.birthDate = app.birthdate || app.birthDate || null;
            applicantState.preferredLevel = app.preferredLevel || app.preferred || null;
            applicantState.degree = app.highestDegree || app.highest_degree || app.degree || null;
            applicantState.major = app.major || app.field || null;
            applicantState.institution = app.institution || null;
            applicantState.gradYear = app.gradYear || app.yearGraduated || app.grad_year || null;
            applicantState.experience = app.experienceYears || app.experience || app.teachingExperience || null;
            applicantState.previousSchools = app.previousSchools || null;
            applicantState.license = app.licenseNumber || app.license_no || app.license || null;
            applicantState.subjects = app.qualifiedSubjects || app.subjects || null;
            applicantState.employment = app.employmentType || app.employment || null;

            return applicantState;
        } catch (err) {
            console.error('loadApplicant error', err);
            showToast('Failed to load applicant data (network).');
            return null;
        }
    }

    // ---------- Load messages for current applicant ----------
    async function loadApplicantMessages() {
        const id = applicantState.id || window.CURRENT_APPLICANT_ID || '';
        if (!id) {
            console.warn('loadApplicantMessages: no applicant id');
            return [];
        }

        try {
            const res = await fetch('/api/applicant-messages/' + encodeURIComponent(id), {
                method: 'GET',
                credentials: 'include',
                headers: { 'Accept': 'application/json' }
            });

            // Helpful handling for index-required Firestore errors surfaced as 503/500 with details
            if (res.status === 503) {
                const json = await res.json().catch(() => ({}));
                const msg = (json && json.message) ? json.message : 'Service temporarily unavailable. Firestore index may be building.';
                showToast(msg);
                return [];
            }

            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                // If backend returned details about index required, show helpful message
                const details = (json && json.details) ? json.details : null;
                if (details && /index/i.test(details)) {
                    showToast('A Firestore index is required. Please create the missing composite index and wait a moment.');
                } else if (res.status === 403) {
                    showToast('Not authorized to view messages for this applicant.');
                } else {
                    showToast('Failed to load messages. See console for details.');
                }
                console.warn('loadApplicantMessages failed', res.status, json || details);
                return [];
            }

            const data = await res.json().catch(() => ({}));
            if (!data || !data.ok) {
                showToast('Failed to load messages.');
                return [];
            }

            // assign messages to state and render
            applicantState.messages = Array.isArray(data.messages) ? data.messages.slice() : [];
            renderNotes();
            return applicantState.messages;
        } catch (err) {
            console.error('loadApplicantMessages error', err);
            showToast('Network error while loading messages.');
            return [];
        }
    }

    // --------- Render helpers (use existing DOM ids/classes in teacher.html) ----------
    function renderOverviewCards() {
        const elAppId = document.getElementById('app-id');
        const elSubmitted = document.getElementById('app-submitted-date');
        const elStatus = document.getElementById('app-status');
        const elNextStep = document.getElementById('next-step');
        const elAssigned = document.getElementById('assigned-reviewer');
        const elNextAction = document.getElementById('next-action');
        const elInterviewDate = document.getElementById('interview-date');
        const elInterviewDetails = document.getElementById('interview-details');

        if (elAppId) elAppId.textContent = applicantState.id || '';
        if (elSubmitted) elSubmitted.textContent = applicantState.submittedAt || applicantState.createdAt || '';
        if (elStatus) {
            elStatus.textContent = niceStatus(applicantState.status);
            // keep class for styling (status-<key>)
            elStatus.className = 'status-badge status-' + (applicantState.status || 'submitted');
        }
        if (elNextStep) elNextStep.textContent = 'Next: ' + (applicantState.nextStepText || '—');
        if (elAssigned) elAssigned.textContent = applicantState.assignedReviewer || '—';

        if (applicantState.interview) {
            if (elNextAction) elNextAction.textContent = (applicantState.interview.date || '') + (applicantState.interview.location ? ' — ' + applicantState.interview.location : '');
            if (elInterviewDate) elInterviewDate.textContent = applicantState.interview.date || '—';
            if (elInterviewDetails) elInterviewDetails.textContent = applicantState.interview.location || '';
            // small note for scheduled interview
            let noteEl = document.getElementById('interview-note');
            if (!noteEl) {
                // optional: append small note under next-action
                if (elNextAction && elNextAction.parentNode) {
                    const span = document.createElement('div');
                    span.id = 'interview-note';
                    span.style.fontSize = '12px';
                    span.style.marginTop = '6px';
                    span.textContent = 'Interview scheduled by Admissions. For changes contact admin.';
                    elNextAction.parentNode.appendChild(span);
                }
            }
        } else {
            if (elNextAction) elNextAction.textContent = 'No interview scheduled';
            if (elInterviewDate) elInterviewDate.textContent = '—';
            if (elInterviewDetails) elInterviewDetails.textContent = 'No interview scheduled.';
            const noteExisting = document.getElementById('interview-note');
            if (noteExisting) noteExisting.remove();
        }
    }

    function niceStatus(key) {
        const map = {
            submitted: 'Submitted',
            reviewing: 'Reviewing',
            interview_scheduled: 'Interview scheduled',
            interview_confirmed: 'Interview confirmed',
            demo: 'Demo teaching',
            decision: 'Final decision'
        };
        return map[key] || (key || '');
    }

    // Render attachments into #attachments-list (uses signed-url endpoints)
    function renderAttachments() {
        const container = document.getElementById('attachments-list');
        if (!container) return;
        container.innerHTML = '';

        if (!Array.isArray(applicantState.attachments) || applicantState.attachments.length === 0) {
            const emptyLi = document.createElement('li');
            emptyLi.className = 'empty';
            emptyLi.textContent = 'No attachments yet';
            container.appendChild(emptyLi);
            return;
        }
        applicantState.attachments.forEach(function (f) {
            const li = document.createElement('li');
            li.className = 'attachment-item';
            const name = escapeHtml(f.fileName || (f.filePath ? f.filePath.split('/').pop() : 'Attachment'));
            const left = document.createElement('div');
            left.textContent = name;

            const right = document.createElement('div');
            right.style.display = 'flex';
            right.style.gap = '8px';
            right.style.alignItems = 'center';

            // View/Download button
            const btn = document.createElement('button');
            btn.className = 'btn small';
            btn.type = 'button';
            btn.textContent = 'Download';
            btn.addEventListener('click', async function () {
                btn.disabled = true;
                const old = btn.textContent;
                btn.textContent = 'Preparing…';
                try {
                    const path = String(f.filePath || f.path || f.fileUrl || '');
                    if (!path) throw new Error('No file path stored for this attachment.');

                    // Try owner signed-url first
                    try {
                        const signed = await getSignedUrlOwner(path, 60);
                        window.open(signed, '_blank');
                    } catch (err) {
                        // If forbidden, attempt admin signed-url fallback (useful for admin users)
                        const payload = err && err.payload;
                        let forbidden = false;
                        try {
                            if (payload && payload.error) {
                                const eStr = (typeof payload.error === 'string') ? payload.error.toLowerCase() : JSON.stringify(payload.error).toLowerCase();
                                if (eStr.includes('forbidden')) forbidden = true;
                            }
                            // Also if err.message contains 403
                            if (!forbidden && err && err.message && err.message.indexOf('403') !== -1) forbidden = true;
                        } catch (e) {}
                        if (forbidden) {
                            // try admin route
                            const signedAdmin = await getSignedUrlAdmin(path, 60);
                            window.open(signedAdmin, '_blank');
                        } else {
                            throw err;
                        }
                    }
                } catch (err) {
                    console.error('Download failed', err);
                    showToast('Failed to prepare download. See console for details.');
                } finally {
                    btn.disabled = false;
                    btn.textContent = old;
                }
            });

            right.appendChild(btn);

            li.appendChild(left);
            const spacer = document.createElement('span');
            spacer.style.flex = '1';
            li.appendChild(spacer);
            li.appendChild(right);
            container.appendChild(li);
        });
    }
    // Render notes/messages into #note-list
    function renderNotes() {
        const container = document.getElementById('note-list');
        if (!container) return;
        container.innerHTML = '';
        if (!Array.isArray(applicantState.messages) || applicantState.messages.length === 0) {
            const none = document.createElement('div');
            none.className = 'message empty';
            none.textContent = 'No messages yet';
            container.appendChild(none);
            return;
        }
        // newest first
        const copy = applicantState.messages.slice().reverse();
        copy.forEach(function (m) {
            const div = document.createElement('div');
            div.className = 'message';
            const header = '<div style="font-weight:600">' + escapeHtml(m.senderName || 'You') + (m.subject ? ' — ' + escapeHtml(m.subject) : '') + '</div>';
            const body = '<div style="margin-top:6px">' + escapeHtml(m.body) + '</div>';
            const time = '<div style="font-size:12px;color:#6b7280;margin-top:6px">' + escapeHtml(m.createdAt || '') + '</div>';
            div.innerHTML = header + body + time;
            container.appendChild(div);
        });
    }
    // Update timeline 'completed' classes based on status
    function updateTimeline(statusKey) {
        const mapping = {
            submitted: 0,
            reviewing: 1,
            interview_scheduled: 2,
            interview_confirmed: 2,
            demo: 3,
            decision: 4
        };
        const idx = (mapping.hasOwnProperty(statusKey) ? mapping[statusKey] : 0);

        const items = document.querySelectorAll('#status-timeline .timeline-item');
        for (let i = 0; i < items.length; i++) {
            if (i <= idx) {
                if (!items[i].classList.contains('completed')) items[i].classList.add('completed');
            } else {
                items[i].classList.remove('completed');
            }
        }
    }
    // ----------------- Application Status population helpers -----------------

    // Populate the application-status view (reads from normalized applicant state)
    // Build and write applicant fields into the #application-status card
    function populateApplicationStatus(state) {
      if (!state) return;

      function set(id, val) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = (val === null || val === undefined || (typeof val === 'string' && val.trim() === '')) ? '—' : String(val);
      }

      // Build full name from firstName, middleName (if present), lastName. Fallback to displayName.
      const first = (state.firstName || '').toString().trim();
      const middle = (state.middleName || '').toString().trim();
      const last = (state.lastName || '').toString().trim();
      const parts = [];
      if (first) parts.push(first);
      if (middle) parts.push(middle);
      if (last) parts.push(last);
      const fullName = parts.length ? parts.join(' ') : (state.displayName || '');

      // Map fields (robust to a few variant key names)
      const email = state.email || state.contactEmail || '';
      const phone = state.phone || state.contactNumber || state.contact || '';
      const address = state.address || '';
      const birthdate = state.birthDate || state.birthdate || '';
      const preferredLevel = state.preferredLevel || state.preferred || '';
      const degree = state.degree || state.highestDegree || '';
      const major = state.major || '';
      const institution = state.institution || '';
      const gradYear = state.gradYear || state.yearGraduated || '';
      const experience = state.experience || state.experienceYears || '';
      const previousSchools = Array.isArray(state.previousSchools) ? state.previousSchools.join(', ') : (state.previousSchools || '');
      const licenseNo = state.license || state.licenseNumber || '';
      const subjects = Array.isArray(state.subjects) ? state.subjects.join(', ') : (state.subjects || state.qualifiedSubjects || '');
      const employment = state.employment || state.employmentType || '';

      // Write to DOM (these IDs must exist in your teacher.html)
      set('status-fullname', fullName || state.displayName || '—');
      set('status-email', email || '—');
      set('status-phone', phone || '—');
      set('status-address', address || '—');
      set('status-birthdate', birthdate || '—');

      set('status-preferred-level', preferredLevel || '—');
      set('status-degree', degree || '—');
      set('status-major', major || '—');
      set('status-institution', institution || '—');
      set('status-gradyear', gradYear || '—');
      set('status-experience', experience || '—');
      set('status-previous-schools', previousSchools || '—');
      set('status-license', licenseNo || '—');
      set('status-subjects', subjects || '—');
      set('status-employment', employment || '—');

      // update submitted-at in two possible places (safe if HTML has duplicate id)
        const submittedVal = state.submittedAt || state.createdAt || null;
        const submittedDisplay = formatForDisplay(submittedVal);
        const el1 = document.getElementById('status-submitted-at');
        if (el1) el1.textContent = 'Submitted: ' + (submittedDisplay || '—');
        const el2 = document.getElementById('submitted-at-timeline');
        if (el2) el2.textContent = 'Submitted: ' + (submittedDisplay || '—');


      // Interview info mapping
      if (state.interview && (state.interview.date || state.interview.location)) {
        const dateEl = document.getElementById('status-interview-date');
        const detailsEl = document.getElementById('status-interview-details');
        if (dateEl) dateEl.textContent = state.interview.date || '—';
        if (detailsEl) detailsEl.textContent = state.interview.location || '—';
        const infoEl = document.getElementById('status-interview-info');
        if (infoEl) infoEl.style.display = 'block';
      } else {
        const infoEl = document.getElementById('status-interview-info');
        if (infoEl) infoEl.style.display = 'none';
      }
    }

    // expose for convenience/debugging
    try { window.populateApplicationStatus = populateApplicationStatus; } catch (e) {}

    function updateApplicationStatusTimeline(statusKey, interview) {
        const order = ['submitted', 'reviewing', 'interview_scheduled', 'demo', 'decision'];
        const idx = Math.max(0, order.indexOf(statusKey || 'submitted'));
        const items = document.querySelectorAll('#app-status-timeline .timeline-item');
        items.forEach((it, i) => {
            if (i <= idx) it.classList.add('completed');
            else it.classList.remove('completed');
        });

        // Interview info
        const meta = document.getElementById('status-interview-info');
        if (interview && (interview.date || interview.location)) {
            const dateEl = document.getElementById('status-interview-date');
            const detailsEl = document.getElementById('status-interview-details');
            if (dateEl) dateEl.textContent = interview.date || '—';
            if (detailsEl) detailsEl.textContent = interview.location || '—';
            if (meta) meta.style.display = 'block';
        } else {
            if (meta) meta.style.display = 'none';
        }
    }

    // ----------------- Message modal logic (use existing modal & toast template) -----------------
    const btnMessage = document.getElementById('btn-message-admin');
    const btnCompose = document.getElementById('btn-compose');
    const modalOverlay = document.getElementById('hfaMsgModalOverlay');
    const modalSend = document.getElementById('hfaMsgSendBtn');
    const modalCancel = document.getElementById('hfaMsgCancelBtn');
    const modalClose = document.getElementById('hfaMsgClose');
    const inputRecipient = document.getElementById('hfaMsgRecipient');
    const inputSubject = document.getElementById('hfaMsgSubject');
    const inputBody = document.getElementById('hfaMsgBody');
    const modalError = document.getElementById('hfaMsgError');
    const toastTemplate = document.getElementById('toast-template');

    function openMessageModal() {
        if (!modalOverlay) return;
        // prefill recipient and keep readonly
        if (inputRecipient) {
            inputRecipient.value = 'Admissions';
            inputRecipient.setAttribute('readonly', 'readonly');
        }
        if (inputSubject) inputSubject.value = '';
        if (inputBody) inputBody.value = '';
        if (modalError) modalError.textContent = '';
        if (modalSend) modalSend.disabled = true;

        modalOverlay.style.display = 'block';
        modalOverlay.setAttribute('aria-hidden', 'false');
        if (inputBody) inputBody.focus();
    }

    function closeMessageModal() {
        if (!modalOverlay) return;
        modalOverlay.style.display = 'none';
        modalOverlay.setAttribute('aria-hidden', 'true');
    }

    // enable send only if body has content
    if (inputBody && modalSend) {
        inputBody.addEventListener('input', function () {
            modalSend.disabled = inputBody.value.trim().length === 0;
            if (modalError) modalError.textContent = '';
        });
    }

    if (btnMessage) btnMessage.addEventListener('click', openMessageModal);
    if (btnCompose) btnCompose.addEventListener('click', openMessageModal);
    if (modalClose) modalClose.addEventListener('click', closeMessageModal);
    if (modalCancel) modalCancel.addEventListener('click', closeMessageModal);

    // append note to UI (after successful send)
    function appendNoteToUI(note) {
        if (!note) return;
        if (!applicantState.messages) applicantState.messages = [];
        applicantState.messages.push(note);
        renderNotes();
    }

    // show toast using your existing template (#toast-template)
    function showToast(message, actionText) {
        if (!toastTemplate) {
            // fallback: simple alert
            try { alert(message); } catch (e) {}
            return;
        }
        const clone = toastTemplate.content.firstElementChild.cloneNode(true);
        const msgEl = clone.querySelector('.toast-message');
        const actBtn = clone.querySelector('.toast-action');
        if (msgEl) msgEl.textContent = message;
        if (actBtn) {
            if (actionText) {
                actBtn.style.display = 'inline-block';
                actBtn.textContent = actionText;
            } else {
                actBtn.style.display = 'none';
            }
        }
        document.body.appendChild(clone);
        // auto remove after 3s
        setTimeout(function () {
            if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
        }, 3200);
    }

    // Send message to server (now uses loaded applicantState.id and cookie/Authorization)
    if (modalSend) {
        modalSend.addEventListener('click', async function () {
            const bodyText = inputBody ? inputBody.value.trim() : '';
            const subject = inputSubject ? inputSubject.value.trim() : '';
            const applicantId = applicantState.id || window.CURRENT_APPLICANT_ID || '';

            if (!bodyText) {
                if (modalError) modalError.textContent = 'Message cannot be empty.';
                return;
            }

            // payload
            const payload = {
                applicantId: applicantId,
                subject: subject,
                body: bodyText
            };

            modalSend.disabled = true;
            modalSend.textContent = 'Sending...';

            try {
                const token = await getAuthToken(); // optional
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers['Authorization'] = 'Bearer ' + token;

                const res = await fetch('/api/applicant-messages', {
                    method: 'POST',
                    credentials: 'include', // send cookie if present
                    headers: headers,
                    body: JSON.stringify(payload)
                });

                if (res.status === 401) {
                    logoutAndRedirect("../login/login.html");
                    return;
                }

                const data = await res.json().catch(() => ({ ok: false, error: 'Server error' }));
                if (!data || !data.ok) {
                    throw new Error((data && data.error) ? data.error : 'Failed to send message');
                }

                // Refresh messages from server to ensure persistence and correct ordering
                await loadApplicantMessages();

                closeMessageModal();
                showToast('Message sent — Admissions will respond soon.');
            } catch (err) {
                console.error('Send message failed', err);
                if (modalError) modalError.textContent = 'Failed to send message. Please try again.';
                showToast('Failed to send message.');
            } finally {
                if (modalSend) {
                    modalSend.disabled = false;
                    modalSend.textContent = 'Send';
                }
            }
        });
    }

    // ---------- Attachments upload UI-only (client-side) ----------
    const uploadBtn = document.getElementById('btn-upload');
    const fileInput = document.getElementById('file-input');

    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', function () {
            fileInput.click();
        });

        fileInput.addEventListener('change', function (e) {
            const files = Array.prototype.slice.call(e.target.files || []);
            if (!files || files.length === 0) return;
            files.forEach(function (f) {
                if (!applicantState.attachments) applicantState.attachments = [];
                // placeholder URL — integrate actual upload server later
                applicantState.attachments.push({ fileName: f.name, filePath: '', fileUrl: '#' });
            });
            renderAttachments();
            // TODO: integrate server upload endpoint (server/routes/files.js)
            fileInput.value = '';
        });
    }

    // ---------- Signed-url helpers ----------
    async function getSignedUrlOwner(path, ttl) {
        ttl = ttl || 60;
        const token = await getAuthToken(); // optional; cookie will be used if present
        const q = '?path=' + encodeURIComponent(path) + '&ttl=' + encodeURIComponent(String(ttl));
        const headers = { 'Accept': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;

        const res = await fetch('/api/signed-url-owner' + q, {
            method: 'GET',
            credentials: 'include',
            headers: headers
        });
        if (res.status === 401) {
            // not authorized -> logout
            logoutAndRedirect("../login/login.html");
            return;
        }
        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            let parsed = null;
            try { parsed = JSON.parse(txt); } catch (e) { parsed = txt; }
            const err = new Error('signed-url-owner failed: ' + res.status);
            err.payload = parsed;
            throw err;
        }
        const data = await res.json();
        if (!data || !data.url) throw new Error('signed-url-owner returned no url');
        return data.url;
    }

    async function getSignedUrlAdmin(path, ttl) {
        ttl = ttl || 60;
        const token = await getAuthToken(); // optional; cookie will be used if present
        const q = '?path=' + encodeURIComponent(path) + '&ttl=' + encodeURIComponent(String(ttl));
        const headers = { 'Accept': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;

        const res = await fetch('/api/signed-url' + q, {
            method: 'GET',
            credentials: 'include',
            headers: headers
        });

        if (res.status === 401) {
            logoutAndRedirect("../login/login.html");
            return;
        }

        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            let parsed = null;
            try { parsed = JSON.parse(txt); } catch (e) { parsed = txt; }
            const err = new Error('signed-url admin failed: ' + res.status);
            err.payload = parsed;
            throw err;
        }
        const data = await res.json();
        if (!data || !data.url) throw new Error('signed-url returned no url');
        return data.url;
    }

    // ----------------- Application Status Refresh Button Handler -----------------
    const statusRefreshBtn = document.getElementById('status-refresh-btn');
    if (statusRefreshBtn) {
        statusRefreshBtn.addEventListener('click', async function () {
            statusRefreshBtn.disabled = true;
            const orig = statusRefreshBtn.textContent;
            statusRefreshBtn.textContent = 'Refreshing…';
            try {
                const loaded = await loadApplicant();
                if (!loaded) {
                    // loadApplicant handles redirect/toast
                    return;
                }
                populateApplicationStatus(applicantState);
                await loadApplicantMessages();
                // populate the static status panel

                updateApplicationStatusTimeline(applicantState.status, applicantState.interview);
                // refresh other UI
                renderOverviewCards();
                renderAttachments();
                renderNotes();
                updateTimeline(applicantState.status); // existing dashboard timeline
            } catch (err) {
                console.error('status refresh failed', err);
                showToast('Refresh failed. Check console.');
            } finally {
                statusRefreshBtn.disabled = false;
                statusRefreshBtn.textContent = orig || 'Refresh';
            }
        });
    }
    // ---------- Initialize UI (render everything) ----------
    async function init() {
        // load applicant from server then render
        const loaded = await loadApplicant();
        if (!loaded) {
            // load failed: either redirected or toast shown
            return;
        }
        // Load messages explicitly from server so they persist after refresh
        await loadApplicantMessages();

        // Render UI using loaded applicantState
        renderOverviewCards();
        renderAttachments();
        renderNotes();

        // update dashboard timeline
        updateTimeline(applicantState.status);

        // populate the static Application Status panel (left fields) and its timeline (right)
        try {
            populateApplicationStatus(applicantState);
            updateApplicationStatusTimeline(applicantState.status, applicantState.interview);
        } catch (e) {
            console.warn('populateApplicationStatus failed', e);
        }
    }
    // Call init (do not block DOMContentLoaded)
    init().catch(function (err) {
        console.error('init failed', err);
    });
    // Expose small helpers for debugging (optional)
    window._teacherApp = {
        state: applicantState,
        renderOverview: renderOverviewCards,
        renderNotes: renderNotes,
        renderAttachments: renderAttachments,
        updateTimeline: updateTimeline,
        openMessageModal: openMessageModal,
        getAuthToken: getAuthToken,
        loadApplicant: loadApplicant,
        loadApplicantMessages: loadApplicantMessages
    };
}); // end DOMContentLoaded
