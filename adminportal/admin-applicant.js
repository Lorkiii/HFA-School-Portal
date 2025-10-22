// admin-applicant.js (merged: realtime, progress modal, edit mode, schedule->server)
import {
  collection,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  query,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "../firebase-config.js";
import { apiFetch } from "../api-fetch.js";

// pagination & state
let currentPage = 1;
const applicantsPerPage = 9;
let allApplicants = [];
let visibleApplicants = [];
let activeViewMode = "grid";
let selectedApplicantId = null;
let isArchivedView = false;
let selectedMessageAttachment = null;

let applicantsUnsubscribe = null;

// flag used when schedule modal was opened from progress modal
let openedFromProgress = false;



// dom ready
document.addEventListener("DOMContentLoaded", () => {
  safeInit();
});

// initialize UI and fetch data
async function safeInit() {
  const archivedBtn = document.getElementById("teacher-archived-btn");
  if (archivedBtn) {
    archivedBtn.addEventListener("click", () => {
      isArchivedView = !isArchivedView;
      archivedBtn.setAttribute("aria-pressed", String(isArchivedView));
      archivedBtn.innerHTML = `${
        isArchivedView
          ? '<i class="fas fa-folder-open"></i> Show Active'
          : '<i class="fas fa-archive"></i> Show Archived'
      }`;
      filterAndRenderApplicants();
    });
    archivedBtn.setAttribute("aria-pressed", "false");
    archivedBtn.innerHTML = '<i class="fas fa-archive"></i> Show Archived';
  }

  await initApplicantsRealtime();
  wireEventHandlers();
  filterAndRenderApplicants();
  updateStatsOverview();
  wireProgressModalHandlers();
}

// realtime snapshot for applicants
async function initApplicantsRealtime() {
  if (!db) return;
  try {
    if (typeof applicantsUnsubscribe === "function") applicantsUnsubscribe();

    const q = query(collection(db, "teacherApplicants"));
    applicantsUnsubscribe = onSnapshot(
      q,
      (snap) => {
        const arr = [];
        snap.forEach((d) => {
          const data = d.data() || {};
          let appliedDate = new Date();
          if (data.createdAt) {
            if (typeof data.createdAt.toDate === "function")
              appliedDate = data.createdAt.toDate();
            else appliedDate = new Date(data.createdAt);
          } else if (data.appliedDate) appliedDate = new Date(data.appliedDate);
          arr.push({
            id: d.id,
            ...data,
            status: data.status || "new",
            appliedDate,
            archived: data.archived || false,
          });
        });
        arr.sort((a, b) => new Date(b.appliedDate) - new Date(a.appliedDate));
        allApplicants = arr;
        filterAndRenderApplicants();
        updateStatsOverview();
        console.log("[admin] realtime applicants updated", allApplicants.length);
      },
      (err) => {
        console.error("[admin] applicants onSnapshot error", err);
        // Handle permission errors gracefully (don't show toast)
        if (err.code === 'permission-denied' || err.message?.includes('insufficient permissions')) {
          console.warn('[admin] Firestore permission issue - this is expected if rules are restrictive');
          // Don't show error toast for permission issues - not critical
        } else {
          // Only show toast for unexpected errors
          showErrorToast("Realtime update failed");
        }
      }
    );
  } catch (err) {
    console.error("[admin] initApplicantsRealtime error", err);
    showErrorToast("Error initializing applicants");
  }
}

// -------------------- Progress modal wiring --------------------
function wireProgressModalHandlers() {
  // close / cancel / save
  document.getElementById("hfa-progress-close")?.addEventListener("click", closeProgressModal);
  document.getElementById("hfa-progress-cancel-btn")?.addEventListener("click", closeProgressModal);
  document.getElementById("hfa-progress-save-btn")?.addEventListener("click", handleProgressSave);

  // open interview from progress modal: we will hide progress and open schedule modal
  document.getElementById("hfa-progress-open-interview-btn")?.addEventListener("click", () => {
    // open schedule modal normally (not a reschedule triggered from scheduled view)
    openedFromProgress = true;
    // hide progress modal so schedule modal can sit on top
    const pm = document.getElementById("hfa-progress-modal");
    if (pm) pm.style.display = "none";
    openScheduleModal();
  });

  // reschedule button inside scheduled view - behave same as open but set flag so we re-open progress later
  document.getElementById("hfa-progress-reschedule-btn")?.addEventListener("click", () => {
    openedFromProgress = true;
    const pm = document.getElementById("hfa-progress-modal");
    if (pm) pm.style.display = "none";
    openScheduleModal();
  });

  // cancel interview button inside scheduled view - perform client-side cancel update to Firestore
  document.getElementById("hfa-progress-cancel-interview-btn")?.addEventListener("click", async () => {
    if (!selectedApplicantId) return showInfoToast("No applicant selected");
    if (!confirm("Cancel this interview? This will remove the scheduled interview.")) return;
    try {
      await updateDoc(doc(db, "teacherApplicants", selectedApplicantId), {
        interview: null,
        status: "screening",
        statusUpdatedAt: serverTimestamp(),
        statusUpdatedBy: "admin",
      });
      const a = allApplicants.find((x) => x.id === selectedApplicantId);
      if (a) { a.interview = null; a.status = "screening"; }
      showInfoToast("Interview cancelled");
      // update progress modal UI
      renderProgressSteps(allApplicants.find((x) => x.id === selectedApplicantId) || {});
      // also update teacher modal if open
      if (document.getElementById("teacher-detail-modal")?.style.display === "block") {
        showNoInterview();
      }
      filterAndRenderApplicants();
      updateStatsOverview();
    } catch (err) {
      console.error("[admin] cancel interview error", err);
      showErrorToast("Failed to cancel interview");
    }
  });

  // Approve / Reject inside decision - Now uses new final decision API
  document.getElementById("hfa-progress-approve-btn")?.addEventListener("click", async () => {
    if (!selectedApplicantId) return showInfoToast("No applicant selected");
    if (!confirm("✅ Approve this applicant?\n\nThis will:\n• Send approval email\n• Archive their account\n• Schedule deletion in 30 days")) return;
    await handleFinalDecision("approved");
  });
  document.getElementById("hfa-progress-reject-btn")?.addEventListener("click", async () => {
    if (!selectedApplicantId) return showInfoToast("No applicant selected");
    if (!confirm("❌ Reject this applicant?\n\nThis will:\n• Send rejection email\n• Schedule deletion in 30 days")) return;
    await handleFinalDecision("rejected");
  });
}

// -------------------- UI wiring --------------------
function wireEventHandlers() {
  const gridBtn = document.getElementById("teacher-grid-view-toggle");
  const tableBtn = document.getElementById("teacher-table-view-toggle");
  gridBtn?.addEventListener("click", () => {
    activeViewMode = "grid";
    gridBtn.classList.add("active");
    tableBtn?.classList.remove("active");
    renderApplicantsPage();
  });
  tableBtn?.addEventListener("click", () => {
    activeViewMode = "table";
    tableBtn.classList.add("active");
    gridBtn?.classList.remove("active");
    renderApplicantsPage();
  });

  document.getElementById("teacher-search")?.addEventListener(
    "input",
    debounce((e) => {
      currentPage = 1;
      filterAndRenderApplicants();
    }, 300)
  );
  document
    .getElementById("teacher-status-filter")
    ?.addEventListener("change", () => {
      currentPage = 1;
      filterAndRenderApplicants();
    });
  document
    .getElementById("teacher-level-filter")
    ?.addEventListener("change", () => {
      currentPage = 1;
      filterAndRenderApplicants();
    });

  document
    .getElementById("teacher-prev-page")
    ?.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        renderApplicantsPage();
      }
    });
  document
    .getElementById("teacher-next-page")
    ?.addEventListener("click", () => {
      const totalPages = Math.max(1, Math.ceil(visibleApplicants.length / applicantsPerPage));
      if (currentPage < totalPages) {
        currentPage++;
        renderApplicantsPage();
      }
    });

  document
    .getElementById("close-teacher-modal")
    ?.addEventListener("click", closeTeacherModal);
  
  // PHASE 1B: Close modal when clicking outside (backdrop)
  document
    .getElementById("teacher-detail-modal")
    ?.addEventListener("click", (e) => {
      if (e.target.id === "teacher-detail-modal") {
        closeTeacherModal();
      }
    });
  
  document
    .getElementById("cancel-schedule")
    ?.addEventListener("click", closeScheduleModal);
  document
    .getElementById("approve-teacher-btn")
    ?.addEventListener("click", () => confirmStatusChange("approved"));
  document
    .getElementById("reject-teacher-btn")
    ?.addEventListener("click", () => confirmStatusChange("rejected"));
  document
    .getElementById("archive-teacher-btn")
    ?.addEventListener("click", async () => {
      const a = allApplicants.find((x) => x.id === selectedApplicantId);
      if (!a) return;
      if (a.archived) await unarchiveApplicant(selectedApplicantId);
      else await archiveApplicant(selectedApplicantId);
    });
  document
    .getElementById("message-teacher-btn")
    ?.addEventListener("click", sendApplicantMessage);
  document.getElementById("edit-teacher-btn")?.addEventListener("click", editApplicantDetails);

  document.getElementById("schedule-interview-form")?.addEventListener("submit", handleScheduleInterview);

  document.getElementById("teacher-export-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    showInfoToast("Export disabled");
  });
  document.getElementById("teacher-filter-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    showInfoToast("Filter disabled");
  });

  // PHASE 2: Message modal event listeners
  document
    .getElementById("close-message-modal")
    ?.addEventListener("click", closeMessageModal);
  document
    .getElementById("cancel-message-btn")
    ?.addEventListener("click", closeMessageModal);
  
  // Backdrop click to close message modal
  document
    .getElementById("message-applicant-modal")
    ?.addEventListener("click", (e) => {
      if (e.target.id === "message-applicant-modal") {
        closeMessageModal();
      }
    });
  
  // Character counter for message body
  document
    .getElementById("message-body")
    ?.addEventListener("input", (e) => {
      const charCount = e.target.value.length;
      const counter = document.getElementById("message-char-count");
      if (counter) counter.textContent = charCount;
    });
  
  // Attachment upload handlers
  const attachmentInput = document.getElementById("message-attachment");
  const btnSelectAttachment = document.getElementById("btn-select-attachment");
  const btnRemoveAttachment = document.getElementById("btn-remove-attachment");
  
  if (btnSelectAttachment && attachmentInput) {
    btnSelectAttachment.addEventListener("click", () => {
      attachmentInput.click();
    });
  }
  
  if (attachmentInput) {
    attachmentInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      // Validate file size (10MB max)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        showErrorToast("File too large. Maximum size is 10MB.");
        attachmentInput.value = "";
        return;
      }
      
      // Store selected file
      selectedMessageAttachment = file;
      
      // Show preview
      const preview = document.getElementById("message-attachment-preview");
      const nameEl = document.getElementById("message-attachment-name");
      const sizeEl = document.getElementById("message-attachment-size");
      
      if (preview && nameEl && sizeEl) {
        nameEl.textContent = file.name;
        sizeEl.textContent = `(${(file.size / 1024).toFixed(1)} KB)`;
        preview.style.display = "flex";
      }
      
      // Hide choose button
      if (btnSelectAttachment) {
        btnSelectAttachment.style.display = "none";
      }
    });
  }
  
  if (btnRemoveAttachment) {
    btnRemoveAttachment.addEventListener("click", () => {
      // Clear file
      selectedMessageAttachment = null;
      if (attachmentInput) attachmentInput.value = "";
      
      // Hide preview
      const preview = document.getElementById("message-attachment-preview");
      if (preview) preview.style.display = "none";
      
      // Show choose button
      if (btnSelectAttachment) {
        btnSelectAttachment.style.display = "inline-flex";
      }
    });
  }
  
  // Message form submission
  document
    .getElementById("message-applicant-form")
    ?.addEventListener("submit", handleSendMessage);
}

// filters + render
function filterAndRenderApplicants() {
  const base = isArchivedView ? allApplicants.filter((a) => a.archived) : allApplicants.filter((a) => !a.archived);
  const statusVal = document.getElementById("teacher-status-filter")?.value || "";
  const levelVal = document.getElementById("teacher-level-filter")?.value || "";
  const searchVal = (document.getElementById("teacher-search")?.value || "").toLowerCase().trim();

  visibleApplicants = base.filter((a) => {
    if (statusVal && a.status !== statusVal) return false;
    if (levelVal && a.preferredLevel !== levelVal) return false;
    if (searchVal) {
      const hay = `${a.firstName || ""} ${a.lastName || ""} ${a.email || ""} ${a.qualifiedSubjects || ""} ${a.preferredLevel || ""}`.toLowerCase();
      if (!hay.includes(searchVal)) return false;
    }
    return true;
  });

  currentPage = 1;
  renderApplicantsPage();
  updateStatsOverview();
}

// render current page
function renderApplicantsPage() {
  const startIndex = (currentPage - 1) * applicantsPerPage;
  const pageApplicants = visibleApplicants.slice(startIndex, startIndex + applicantsPerPage);
  if (activeViewMode === "grid") {
    renderGridApplicants(pageApplicants);
    document.getElementById("teacher-grid-view")?.style && (document.getElementById("teacher-grid-view").style.display = "grid");
    document.getElementById("teacher-table-view")?.style && (document.getElementById("teacher-table-view").style.display = "none");
  } else {
    renderTableApplicants(pageApplicants);
    document.getElementById("teacher-grid-view")?.style && (document.getElementById("teacher-grid-view").style.display = "none");
    document.getElementById("teacher-table-view")?.style && (document.getElementById("teacher-table-view").style.display = "block");
  }
  updatePagination();
}

// ---------- Renderers ---------- //
function renderGridApplicants(applicants) {
  const container = document.getElementById("teacher-grid-view");
  if (!container) return;
  container.innerHTML = "";
  if (!applicants || applicants.length === 0) {
    container.innerHTML = '<div class="no-results">No applicants found</div>';
    return;
  }

  applicants.forEach((a) => {
    const card = document.createElement("div");
    card.className = "teacher-card";
    card.dataset.id = a.id;

    const header = document.createElement("div");
    header.className = "teacher-card-header";

    const basic = document.createElement("div");
    basic.className = "teacher-basic-info";
    const h3 = document.createElement("h3");
    h3.textContent = `${a.firstName || ""} ${a.lastName || ""}`.trim();
    const pLevel = document.createElement("p");
    pLevel.textContent = a.preferredLevel || "Not specified";
    const pDate = document.createElement("p");
    pDate.className = "applied-date";
    pDate.textContent = `Applied: ${formatDate(a.appliedDate)}`;
    basic.appendChild(h3);
    basic.appendChild(pLevel);
    basic.appendChild(pDate);

    const status = document.createElement("span");
    status.className = `teacher-status-badge status-${a.status}`;
    status.textContent = formatStatus(a.status);

    header.appendChild(basic);
    header.appendChild(status);

    // body
    const body = document.createElement("div");
    body.className = "teacher-card-body";
    const details = document.createElement("div");
    details.className = "teacher-details";
    details.appendChild(createDetail("fas fa-envelope", a.email || "No email"));
    details.appendChild(createDetail("fas fa-phone", a.contactNumber || "No phone"));
    details.appendChild(createDetail("fas fa-graduation-cap", a.highestDegree || "Not specified"));
    details.appendChild(createDetail("fas fa-briefcase", `${a.experienceYears || 0} years exp.`));

    const quals = document.createElement("div");
    quals.className = "teacher-qualifications";
    const qTitle = document.createElement("strong");
    qTitle.textContent = "Subjects:";
    const qTags = document.createElement("div");
    qTags.className = "qualification-tags";
    if (a.qualifiedSubjects) {
      const subs = typeof a.qualifiedSubjects === "string" ? a.qualifiedSubjects.split(",") : a.qualifiedSubjects;
      subs.forEach((s) => {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = s.trim();
        qTags.appendChild(tag);
      });
    } else {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "Not specified";
      qTags.appendChild(tag);
    }
    quals.appendChild(qTitle);
    quals.appendChild(qTags);

    body.appendChild(details);
    body.appendChild(quals);

    // footer actions
    const footer = document.createElement("div");
    footer.className = "teacher-card-footer";
    const viewBtn = createBtn("btn-view-teacher", "View", "fas fa-eye");
    viewBtn.addEventListener("click", () => viewApplicantDetails(a.id));
    footer.appendChild(viewBtn);

    if (!a.archived) {
      const msgBtn = createBtn("btn-message-teacher", "Message", "fas fa-envelope");
      msgBtn.addEventListener("click", () => {
        selectedApplicantId = a.id;  // Set the correct applicantId before opening modal
        openMessageModal(a.id);
      });

      // REPLACED: Schedule -> Progress (use unique btn-hfa-progress per your request)
      const progressBtn = createBtn("btn-hfa-progress", "Progress", "fas fa-tasks");
      progressBtn.classList.add("btn-hfa-progress");
      progressBtn.addEventListener("click", () => {
        selectedApplicantId = a.id;
        openProgressModal(a.id);
      });

      const archiveBtn = createBtn("btn-archive", "Archive", "fas fa-archive");
      archiveBtn.addEventListener("click", async () => {
        selectedApplicantId = a.id;
        await archiveApplicant(a.id);
      });

      footer.appendChild(msgBtn);
      footer.appendChild(progressBtn);
      footer.appendChild(archiveBtn);
    } else {
      const unarchiveBtn = createBtn("btn-unarchive", "Unarchive", "fas fa-folder-open");
      unarchiveBtn.addEventListener("click", async () => {
        selectedApplicantId = a.id;
        await unarchiveApplicant(a.id);
      });
      footer.appendChild(unarchiveBtn);
    }

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);
    container.appendChild(card);
  });
}

function createDetail(iconCls, text) {
  const div = document.createElement("div");
  div.className = "detail-item";
  const i = document.createElement("i");
  i.className = iconCls;
  const span = document.createElement("span");
  span.textContent = text;
  div.appendChild(i);
  div.appendChild(span);
  return div;
}

function createBtn(cls, label, iconCls) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `btn ${cls}`;
  btn.innerHTML = `<i class="${iconCls}"></i> ${label}`;
  return btn;
}

// table renderer (unchanged)
function renderTableApplicants(applicants) {
  const tbody = document.getElementById("teacher-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (!applicants || applicants.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 9;
    td.className = "text-center";
    td.textContent = "No applicants found";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  applicants.forEach((a) => {
    const tr = document.createElement("tr");
    tr.dataset.id = a.id;
    tr.appendChild(createTd(`APP-${String(a.id).slice(0, 6).toUpperCase()}`));
    tr.appendChild(createTd(`${a.firstName || ""} ${a.lastName || ""}`.trim()));
    tr.appendChild(createTdComplex(a.email || "No email", a.contactNumber || "No phone"));
    tr.appendChild(createTd(a.preferredLevel || "Not specified"));
    tr.appendChild(createTd(`${a.experienceYears || 0} years`));
    tr.appendChild(createTd(formatDate(a.appliedDate)));
    const stTd = document.createElement("td");
    const stSpan = document.createElement("span");
    stSpan.className = `teacher-status-badge status-${a.status}`;
    stSpan.textContent = formatStatus(a.status);
    stTd.appendChild(stSpan);
    tr.appendChild(stTd);
    const docsTd = document.createElement("td");
    const docWrap = document.createElement("div");
    docWrap.className = "document-count";
    const dIcon = document.createElement("i");
    dIcon.className = "fas fa-file-alt";
    const dBadge = document.createElement("span");
    dBadge.className = "doc-badge";
    dBadge.textContent = a.documents?.length || 0;
    docWrap.appendChild(dIcon);
    docWrap.appendChild(dBadge);
    docsTd.appendChild(docWrap);
    tr.appendChild(docsTd);
    const actionsTd = document.createElement("td");
    actionsTd.className = "actions";
    const v = actionIcon("fas fa-eye", "View");
    v.addEventListener("click", () => viewApplicantDetails(a.id));
    const e = actionIcon("fas fa-edit", "Edit");
    e.addEventListener("click", () => {
      selectedApplicantId = a.id;
      editApplicantDetails();
    });

    if (!a.archived) {
      const ar = actionIcon("fas fa-archive", "Archive");
      ar.addEventListener("click", async () => {
        selectedApplicantId = a.id;
        await archiveApplicant(a.id);
      });
      const del = actionIcon("fas fa-trash", "Delete");
      del.addEventListener("click", async () => {
        if (!confirm("Permanently delete?")) return;
        try {
          await deleteDoc(doc(db, "teacherApplicants", a.id));
          const idx = allApplicants.findIndex((x) => x.id === a.id);
          if (idx !== -1) allApplicants.splice(idx, 1);
          filterAndRenderApplicants();
          updateStatsOverview();
          showDeleteToast("Applicant deleted");
        } catch (err) {
          console.error("[admin] delete error", err);
          showErrorToast("Error deleting");
        }
      });
      actionsTd.appendChild(v);
      actionsTd.appendChild(e);
      actionsTd.appendChild(ar);
      actionsTd.appendChild(del);
    } else {
      const un = actionIcon("fas fa-folder-open", "Unarchive");
      un.addEventListener("click", async () => {
        selectedApplicantId = a.id;
        await unarchiveApplicant(a.id);
      });
      actionsTd.appendChild(v);
      actionsTd.appendChild(e);
      actionsTd.appendChild(un);
    }

    tr.appendChild(actionsTd);
    tbody.appendChild(tr);
  });
}
function createTd(txt) {
  const td = document.createElement("td");
  td.textContent = txt;
  return td;
}
function createTdComplex(l1, l2) {
  const td = document.createElement("td");
  const d1 = document.createElement("div");
  d1.textContent = l1;
  const d2 = document.createElement("div");
  d2.textContent = l2;
  td.appendChild(d1);
  td.appendChild(d2);
  return td;
}
function actionIcon(iconCls, title) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "action-btn";
  btn.title = title;
  btn.innerHTML = `<i class="${iconCls}"></i>`;
  return btn;
}

// ---------------- Modal: Applicant Details ----------------
function viewApplicantDetails(id) {
  selectedApplicantId = id;
  const a = allApplicants.find((x) => x.id === id);
  if (!a) {
    showErrorToast("Applicant not found");
    return;
  }

  const setText = (elId, txt) => {
    const el = document.getElementById(elId);
    if (el) el.textContent = txt;
  };

  setText("teacher-modal-name", `${a.firstName || ""} ${a.middleName || ""} ${a.lastName || ""}`.trim());
  const stEl = document.getElementById("teacher-modal-status");
  if (stEl) {
    stEl.textContent = formatStatus(a.status);
    stEl.className = `status-badge status-${a.status}`;
  }
  setText("teacher-modal-id", `APP-${String(id).slice(0, 6).toUpperCase()}`);
  setText("modal-teacher-fullname", `${a.firstName || ""} ${a.middleName || ""} ${a.lastName || ""} ${a.nameExtension || ""}`.trim());
  setText("modal-teacher-email", a.email || "Not provided");
  setText("modal-teacher-contact", a.contactNumber || "Not provided");
  setText("modal-teacher-address", a.address || "Not provided");
  setText("modal-teacher-birthdate", a.birthdate || "Not provided");

  setText("modal-teacher-degree", a.highestDegree || "Not provided");
  setText("modal-teacher-major", a.major || "Not provided");
  setText("modal-teacher-institution", a.institution || "Not provided");
  setText("modal-teacher-gradyear", a.gradYear || "Not provided");

  setText("modal-teacher-experience", `${a.experienceYears || 0} years`);
  setText("modal-teacher-schools", a.previousSchools || "None");
  setText("modal-teacher-level", a.preferredLevel || "Not specified");
  setText("modal-teacher-subjects", a.qualifiedSubjects ? (Array.isArray(a.qualifiedSubjects) ? a.qualifiedSubjects.join(", ") : a.qualifiedSubjects) : "Not specified");
  setText("modal-teacher-employment", a.employmentType || "Not specified");

  setText("interview-date", a.interview?.date || "Not scheduled");
  setText("interview-time", a.interview?.time || "Not scheduled");

  // PHASE 1: Populate application info section
  const submittedDate = a.createdAt ? formatDate(a.createdAt.toDate ? a.createdAt.toDate() : a.createdAt) : "--";
  setText("modal-submitted-date", submittedDate);

  if (a.interview && a.interview.date && a.interview.time) {
    setText("modal-interview-time", `${a.interview.date} at ${a.interview.time}`);
    setText("modal-interview-location", a.interview.location || a.interview.mode || "--");
  } else {
    setText("modal-interview-time", "Not scheduled");
    setText("modal-interview-location", "--");
  }

  renderDocuments(a.documents || []);
  updateProgressTracker(a.status);
  if (a.interview) showInterviewDetails(a.interview);
  else showNoInterview();

  const modalArchiveBtn = document.getElementById("archive-teacher-btn");
  if (modalArchiveBtn) {
    if (a.archived) modalArchiveBtn.innerHTML = '<i class="fas fa-folder-open"></i> Unarchive';
    else modalArchiveBtn.innerHTML = '<i class="fas fa-archive"></i> Archive';
  }

  document.getElementById("teacher-detail-modal") && (document.getElementById("teacher-detail-modal").style.display = "block");
}

// PHASE 1: Wire up 2x2 button grid event handlers
function wireUpActionGrid(applicantId, isArchived) {
  // View Details button - scrolls to details section (already showing)
  const viewDetailsBtn = document.getElementById("view-details-btn");
  if (viewDetailsBtn) {
    viewDetailsBtn.onclick = () => {
      const modalBody = document.querySelector(".teacher-modal-body");
      if (modalBody) modalBody.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  }

  // Message button - opens message modal
  const messageBtn = document.getElementById("message-applicant-btn");
  if (messageBtn) {
    messageBtn.onclick = () => {
      openMessageModal(applicantId);
    };
  }

  // Progress button - opens progress modal (existing functionality)
  const progressBtn = document.getElementById("view-progress-btn");
  if (progressBtn) {
    progressBtn.onclick = () => {
      openProgressModal(applicantId);
    };
  }

  // Archive button - archives/unarchives applicant (existing functionality)
  const archiveBtn = document.getElementById("archive-applicant-btn");
  if (archiveBtn) {
    // Update button text based on archived status
    const archiveIcon = archiveBtn.querySelector("i");
    const archiveText = archiveBtn.querySelector("span");
    if (isArchived) {
      if (archiveIcon) archiveIcon.className = "fas fa-folder-open";
      if (archiveText) archiveText.textContent = "Unarchive";
    } else {
      if (archiveIcon) archiveIcon.className = "fas fa-archive";
      if (archiveText) archiveText.textContent = "Archive";
    }

    archiveBtn.onclick = async () => {
      const a = allApplicants.find((x) => x.id === applicantId);
      if (!a) return;
      if (a.archived) await unarchiveApplicant(applicantId);
      else await archiveApplicant(applicantId);
    };
  }
}

// render documents
function renderDocuments(docs) {
  const container = document.getElementById("modal-teacher-documents");
  if (!container) return;
  container.innerHTML = "";
  if (!docs || docs.length === 0) {
    container.innerHTML = "<p>No documents uploaded</p>";
    return;
  }
  docs.forEach((d) => {
    const wrap = document.createElement("div");
    wrap.className = "document-item";
    const info = document.createElement("div");
    info.className = "document-info";
    const nameSpan = document.createElement("span");
    nameSpan.className = "document-name";
    nameSpan.textContent = d.fileName || "Document";
    info.appendChild(nameSpan);

    const actions = document.createElement("div");
    actions.className = "document-actions";
    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "doc-view";
    viewBtn.setAttribute("aria-label", "View document");
    viewBtn.textContent = "View";
    viewBtn.addEventListener("click", () => viewDocument(d.fileUrl));

    const dlBtn = document.createElement("button");
    dlBtn.type = "button";
    dlBtn.className = "doc-download";
    dlBtn.setAttribute("aria-label", "Download document");
    dlBtn.textContent = "Download";
    dlBtn.addEventListener("click", () => downloadDocument(d.fileUrl, d.fileName));

    actions.appendChild(viewBtn);
    actions.appendChild(dlBtn);
    wrap.appendChild(info);
    wrap.appendChild(actions);
    container.appendChild(wrap);
  });
}

// DB helper to unarchive without re-filtering UI
async function dbUnarchive(id) {
  try {
    await updateDoc(doc(db, "teacherApplicants", id), {
      archived: false,
      unarchivedAt: serverTimestamp(),
      unarchivedBy: "admin",
    });
  } catch (err) {
    console.error("[admin] dbUnarchive error", err);
    throw err;
  }
}

// archive/unarchive with undo support
async function archiveApplicant(id) {
  if (!id) return showInfoToast("No applicant selected");
  const allIndex = allApplicants.findIndex((x) => x.id === id);
  const visibleIndex = visibleApplicants.findIndex((x) => x.id === id);
  const backupData = allIndex !== -1 ? { ...allApplicants[allIndex] } : null;

  try {
    await updateDoc(doc(db, "teacherApplicants", id), {
      archived: true,
      archivedAt: serverTimestamp(),
      archivedBy: "admin",
    });

    if (allIndex !== -1) allApplicants[allIndex].archived = true;
    if (visibleIndex !== -1) visibleApplicants.splice(visibleIndex, 1);
    renderApplicantsPage();

    createToastWithAction("Applicant archived", "toast-archive", 6000, "Undo", async () => {
      try {
        if (backupData) {
          const restored = { ...backupData, archived: false };
          if (allIndex >= 0 && allIndex <= allApplicants.length - 1) {
            allApplicants[allIndex] = restored;
          } else {
            allApplicants.splice(allIndex >= 0 ? allIndex : 0, 0, restored);
          }
          if (visibleIndex !== -1) {
            visibleApplicants.splice(visibleIndex, 0, restored);
          }
          renderApplicantsPage();
        }
        await dbUnarchive(id);
        showInfoToast("Undo successful");
      } catch (err) {
        console.error("[admin] Undo archive failed", err);
        showErrorToast("Undo failed");
      }
    });

    filterAndRenderApplicants();
  } catch (err) {
    console.error("[admin] archiveApplicant error", err);
    showErrorToast("Error archiving applicant");
  }
}

async function unarchiveApplicant(id) {
  if (!id) return showInfoToast("No applicant selected");
  try {
    await updateDoc(doc(db, "teacherApplicants", id), {
      archived: false,
      unarchivedAt: serverTimestamp(),
      unarchivedBy: "admin",
    });
    const a = allApplicants.find((x) => x.id === id);
    if (a) a.archived = false;
    showArchiveToast("Applicant unarchived");
    filterAndRenderApplicants();
  } catch (err) {
    console.error("[admin] unarchiveApplicant error", err);
    showErrorToast("Error unarchiving applicant");
  }
}

// PHASE 1B: Confirmation dialog for status change
function confirmStatusChange(newStatus) {
  if (!selectedApplicantId) return showInfoToast("No applicant selected");
  
  const applicant = allApplicants.find((x) => x.id === selectedApplicantId);
  if (!applicant) return showErrorToast("Applicant not found");
  
  const statusText = newStatus === "approved" ? "approve" : "reject";
  const message = `Are you sure you want to ${statusText} ${applicant.firstName} ${applicant.lastName}?`;
  
  // Create custom confirmation dialog
  if (confirm(message)) {
    updateApplicantStatusWithUndo(newStatus, applicant.status);
  }
}

// PHASE 1B: Update status with undo functionality
async function updateApplicantStatusWithUndo(newStatus, previousStatus) {
  if (!selectedApplicantId) return showInfoToast("No applicant selected");
  
  try {
    // Save the ID before closing modal
    const applicantId = selectedApplicantId;
    
    // Update in Firestore
    await updateDoc(doc(db, "teacherApplicants", applicantId), {
      status: newStatus,
      statusUpdatedAt: serverTimestamp(),
      statusUpdatedBy: "admin",
    });
    
    // Update local data
    const a = allApplicants.find((x) => x.id === applicantId);
    if (a) a.status = newStatus;
    
    // Show toast with undo button
    const statusText = newStatus === "approved" ? "Approved" : "Rejected";
    const toastClass = newStatus === "approved" ? "toast-approve" : "toast-reject";
    
    createToastWithAction(
      `Applicant ${statusText.toLowerCase()}`,
      toastClass,
      5000, // 5 second timeout
      "Undo",
      async () => {
        // Undo action - revert status
        try {
          await updateDoc(doc(db, "teacherApplicants", applicantId), {
            status: previousStatus,
            statusUpdatedAt: serverTimestamp(),
            statusUpdatedBy: "admin",
          });
          
          const applicant = allApplicants.find((x) => x.id === applicantId);
          if (applicant) applicant.status = previousStatus;
          
          filterAndRenderApplicants();
          updateStatsOverview();
          showInfoToast("Status change undone");
        } catch (err) {
          console.error("[admin] undo status change error", err);
          showErrorToast("Failed to undo status change");
        }
      }
    );
    
    // Close modal and refresh
    setTimeout(() => {
      closeTeacherModal();
      filterAndRenderApplicants();
      updateStatsOverview();
    }, 600);
    
  } catch (err) {
    console.error("[admin] updateApplicantStatus", err);
    showErrorToast("Error updating status");
  }
}

// NEW: Handle final decision (approve/reject) - Uses backend API
async function handleFinalDecision(decision) {
  if (!selectedApplicantId) return showInfoToast("No applicant selected");
  
  try {
    // Show loading state
    const approveBtn = document.getElementById("hfa-progress-approve-btn");
    const rejectBtn = document.getElementById("hfa-progress-reject-btn");
    const originalApproveText = approveBtn?.textContent;
    const originalRejectText = rejectBtn?.textContent;
    
    if (decision === "approved" && approveBtn) {
      approveBtn.disabled = true;
      approveBtn.textContent = "Processing...";
    }
    if (decision === "rejected" && rejectBtn) {
      rejectBtn.disabled = true;
      rejectBtn.textContent = "Processing...";
    }

    // Call API endpoint
    const response = await apiFetch(`/api/teacher-applicants/${selectedApplicantId}/final-decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision })
    });

    if (response.ok) {
      // Update local data
      const applicant = allApplicants.find((x) => x.id === selectedApplicantId);
      if (applicant) {
        applicant.finalDecision = decision;
        applicant.status = decision === 'approved' ? 'archived' : applicant.status;
      }

      // Show success message
      if (decision === "approved") {
        showApproveToast("✅ Applicant approved! Email sent & account archived.");
      } else {
        showRejectToast("❌ Applicant rejected. Email sent & deletion scheduled.");
      }

      // Close modal and refresh
      setTimeout(() => {
        closeProgressModal();
        filterAndRenderApplicants();
        updateStatsOverview();
      }, 1500);
    } else {
      throw new Error(response.error || "Failed to process decision");
    }

  } catch (err) {
    console.error("[admin] handleFinalDecision error:", err);
    showErrorToast("Failed to process decision: " + (err.message || "Unknown error"));
    
    // Reset buttons
    const approveBtn = document.getElementById("hfa-progress-approve-btn");
    const rejectBtn = document.getElementById("hfa-progress-reject-btn");
    if (approveBtn) {
      approveBtn.disabled = false;
      approveBtn.textContent = "Approve";
    }
    if (rejectBtn) {
      rejectBtn.disabled = false;
      rejectBtn.textContent = "Reject";
    }
  }
}

// status change (legacy - kept for backward compatibility)
async function updateApplicantStatus(newStatus) {
  if (!selectedApplicantId) return showInfoToast("No applicant selected");
  try {
    await updateDoc(doc(db, "teacherApplicants", selectedApplicantId), {
      status: newStatus,
      statusUpdatedAt: serverTimestamp(),
      statusUpdatedBy: "admin",
    });
    const a = allApplicants.find((x) => x.id === selectedApplicantId);
    if (a) a.status = newStatus;
    if (newStatus === "approved") {
      showModalConfirmation("Applicant approved");
      showApproveToast("Applicant approved");
    } else if (newStatus === "rejected") {
      showModalConfirmation("Applicant rejected");
      showRejectToast("Applicant rejected");
    } else {
      showModalConfirmation("Status updated");
      showUpdateToast("Status updated");
    }
    setTimeout(() => {
      closeTeacherModal();
      filterAndRenderApplicants();
      updateStatsOverview();
    }, 900);
  } catch (err) {
    console.error("[admin] updateApplicantStatus", err);
    showErrorToast("Error updating status");
  }
}

function sendApplicantMessage() {
  const a = allApplicants.find((x) => x.id === selectedApplicantId);
  if (!a) return;
  const subject = `Regarding your teaching application at HFA`;
  const body = `Dear ${a.firstName || ""} ${a.lastName || ""},\n\n`;
  window.location.href = `mailto:${a.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  showInfoToast("Opening email client");
}

// PHASE 2: Message modal functions
function openMessageModal(applicantId) {
  const applicant = allApplicants.find((x) => x.id === applicantId);
  if (!applicant) {
    showErrorToast("Applicant not found");
    return;
  }

  // Auto-fill recipient email
  const recipientInput = document.getElementById("message-recipient-email");
  if (recipientInput) {
    recipientInput.value = applicant.email || "";
  }

  // Set default subject
  const subjectInput = document.getElementById("message-subject");
  if (subjectInput) {
    subjectInput.value = `Update on Your Teaching Application`;
  }

  // Clear message body
  const bodyInput = document.getElementById("message-body");
  if (bodyInput) {
    bodyInput.value = "";
  }

  // Reset character counter
  const charCounter = document.getElementById("message-char-count");
  if (charCounter) {
    charCounter.textContent = "0";
  }
  
  // Reset attachment
  selectedMessageAttachment = null;
  const attachmentInput = document.getElementById("message-attachment");
  if (attachmentInput) attachmentInput.value = "";
  
  const preview = document.getElementById("message-attachment-preview");
  if (preview) preview.style.display = "none";
  
  const btnSelectAttachment = document.getElementById("btn-select-attachment");
  if (btnSelectAttachment) btnSelectAttachment.style.display = "inline-flex";

  // Show modal
  const modal = document.getElementById("message-applicant-modal");
  if (modal) {
    modal.style.display = "block";
  }
}

function closeMessageModal() {
  const modal = document.getElementById("message-applicant-modal");
  if (modal) {
    modal.style.display = "none";
  }

  // Reset form
  const form = document.getElementById("message-applicant-form");
  if (form) {
    form.reset();
  }
  
  // Clear attachment
  selectedMessageAttachment = null;
  const attachmentInput = document.getElementById("message-attachment");
  if (attachmentInput) attachmentInput.value = "";
  
  const preview = document.getElementById("message-attachment-preview");
  if (preview) preview.style.display = "none";
  
  const btnSelectAttachment = document.getElementById("btn-select-attachment");
  if (btnSelectAttachment) btnSelectAttachment.style.display = "inline-flex";
}

async function handleSendMessage(e) {
  e.preventDefault();

  const recipientEmail = document.getElementById("message-recipient-email")?.value;
  const subject = document.getElementById("message-subject")?.value.trim();
  const body = document.getElementById("message-body")?.value.trim();

  // Validation
  if (!recipientEmail) {
    showErrorToast("Recipient email is required");
    return;
  }

  if (!subject) {
    showErrorToast("Subject is required");
    document.getElementById("message-subject")?.focus();
    return;
  }

  if (!body) {
    showErrorToast("Message body is required");
    document.getElementById("message-body")?.focus();
    return;
  }

  // Disable send button and show loading state
  const sendBtn = document.getElementById("send-message-btn");
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
  }

  try {
    // Prepare request data
    let response;
    
    if (selectedMessageAttachment) {
      // Use FormData for multipart upload with attachment
      const formData = new FormData();
      formData.append("recipient", recipientEmail);
      formData.append("subject", subject);
      formData.append("body", body);
      formData.append("attachment", selectedMessageAttachment);
      
      // Call backend API with multipart form data
      response = await apiFetch(`/api/teacher-applicants/${selectedApplicantId}/send-message`, {
        method: "POST",
        body: formData,
        // Don't set Content-Type header - browser will set it with boundary
      });
    } else {
      // Regular JSON request without attachment
      response = await apiFetch(`/api/teacher-applicants/${selectedApplicantId}/send-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: recipientEmail,
          subject: subject,
          body: body,
        }),
      });
    }

    if (response.success) {
      showSaveToast(response.message || "Message sent successfully");
      closeMessageModal();
    } else {
      // response is already parsed JSON from apiFetch, don't call .json()
      showErrorToast(response.error || "Failed to send message");
    }
  } catch (err) {
    console.error("[admin] handleSendMessage error:", err);
    showErrorToast("Failed to send message. Please try again.");
  } finally {
    // Re-enable send button
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Message';
    }
  }
}

// ------------------ Edit applicant details (inline inside modal) ------------------
function editApplicantDetails() {
  if (!selectedApplicantId) {
    showInfoToast("No applicant selected");
    return;
  }
  const a = allApplicants.find((x) => x.id === selectedApplicantId);
  if (!a) return showErrorToast("Applicant not found");

  const mapping = {
    "input-modal-firstName": "firstName",
    "input-modal-middleName": "middleName",
    "input-modal-lastName": "lastName",
    "input-modal-email": "email",
    "input-modal-contactNumber": "contactNumber",
    "input-modal-address": "address",
    "input-modal-birthdate": "birthdate",
    "input-modal-highestDegree": "highestDegree",
    "input-modal-major": "major",
    "input-modal-institution": "institution",
    "input-modal-gradYear": "gradYear",
    "input-modal-experienceYears": "experienceYears",
    "input-modal-previousSchools": "previousSchools",
    "input-modal-preferredLevel": "preferredLevel",
    "input-modal-qualifiedSubjects": "qualifiedSubjects",
    "input-modal-employmentType": "employmentType"
  };

  // Show and prefill inputs
  Object.entries(mapping).forEach(([inputId, field]) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    let val = a[field];
    if (Array.isArray(val)) val = val.join(", ");
    if (val === undefined || val === null) val = "";
    input.value = String(val);
    input.style.display = "";
  });

  // Hide static spans
  const staticIds = [
    "modal-teacher-fullname",
    "modal-teacher-email",
    "modal-teacher-contact",
    "modal-teacher-address",
    "modal-teacher-birthdate",
    "modal-teacher-degree",
    "modal-teacher-major",
    "modal-teacher-institution",
    "modal-teacher-gradyear",
    "modal-teacher-experience",
    "modal-teacher-schools",
    "modal-teacher-level",
    "modal-teacher-subjects",
    "modal-teacher-employment"
  ];
  staticIds.forEach((sid) => {
    const el = document.getElementById(sid);
    if (el) el.style.display = "none";
  });

  // Show controls
  const controls = document.getElementById("teacher-edit-controls");
  if (controls) controls.style.display = "";

  // hook save (one-time)
  const saveBtn = document.getElementById("teacher-edit-save");
  const discardBtn = document.getElementById("teacher-edit-discard");
  const errEl = document.getElementById("teacher-edit-error");
  if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }

  const onSave = async () => {
    const updates = {};
    Object.entries(mapping).forEach(([inputId, field]) => {
      const inEl = document.getElementById(inputId);
      if (!inEl) return;
      let v = inEl.value;
      if (typeof v === "string") v = v.trim();
      if (field === "qualifiedSubjects" || field === "previousSchools") {
        updates[field] = v === "" ? [] : v.split(",").map((s) => s.trim()).filter(Boolean);
      } else if (field === "experienceYears") {
        updates[field] = v === "" ? 0 : Number(v);
      } else {
        updates[field] = v === "" ? null : v;
      }
    });

    try {
      await updateDoc(doc(db, "teacherApplicants", selectedApplicantId), {
        ...updates,
        updatedAt: serverTimestamp(),
        updatedBy: "admin"
      });

      const aLocal = allApplicants.find((x) => x.id === selectedApplicantId);
      if (aLocal) Object.assign(aLocal, updates);

      // restore UI
      staticIds.forEach((sid) => {
        const el = document.getElementById(sid);
        if (el) el.style.display = "";
      });
      Object.keys(mapping).forEach((inputId) => {
        const inEl = document.getElementById(inputId);
        if (inEl) inEl.style.display = "none";
      });
      if (controls) controls.style.display = "none";
      showSaveToast("Changes saved");
      showModalConfirmation("Changes saved");
      viewApplicantDetails(selectedApplicantId);
      filterAndRenderApplicants();
    } catch (err) {
      console.error("[admin] save edit error", err);
      if (errEl) {
        errEl.style.display = "";
        errEl.textContent = "Failed to save changes. Try again.";
      }
      showErrorToast("Error saving changes");
    }
  };

  const onDiscard = () => {
    Object.keys(mapping).forEach((inputId) => {
      const inEl = document.getElementById(inputId);
      if (inEl) {
        inEl.value = "";
        inEl.style.display = "none";
      }
    });
    staticIds.forEach((sid) => {
      const el = document.getElementById(sid);
      if (el) el.style.display = "";
    });
    if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }
    if (controls) controls.style.display = "none";
  };

  if (saveBtn) {
    saveBtn.removeEventListener("click", onSave);
    saveBtn.addEventListener("click", onSave, { once: true });
  }
  if (discardBtn) {
    discardBtn.removeEventListener("click", onDiscard);
    discardBtn.addEventListener("click", onDiscard, { once: true });
  }
}


/**
 * STEP 5: Check interview availability
 * Validates max 3 interviews per day and no time overlap (1 hour buffer)
 * @param {string} dateVal - Interview date (YYYY-MM-DD)
 * @param {string} timeVal - Interview time (HH:MM)
 * @param {string} currentApplicantId - ID of current applicant (to exclude from checks when rescheduling)
 * @returns {Promise<{valid: boolean, error: string}>}
 */
async function checkInterviewAvailability(dateVal, timeVal, currentApplicantId) {
  try {
    // Get all teacher applicants
    const applicantsRef = collection(db, "teacherApplicants");
    const applicantsQuery = query(applicantsRef);
    const snapshot = await applicantsRef.get ? await applicantsRef.get() : await getDocs(applicantsQuery);
    
    // Filter interviews for the same date (excluding current applicant if rescheduling)
    const interviewsOnDate = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      const docId = doc.id;
      
      // Skip current applicant (when rescheduling)
      if (docId === currentApplicantId) return;
      
      // Only check active interviews
      const activeStatuses = ["interview_scheduled", "screening", "submitted"];
      if (!activeStatuses.includes(data.status)) return;
      
      // Check if interview exists and matches date
      if (data.interview && data.interview.date === dateVal && data.interview.time) {
        interviewsOnDate.push({
          id: docId,
          time: data.interview.time,
          name: `${data.firstName || ""} ${data.lastName || ""}`.trim()
        });
      }
    });
    
    // Check 1: Max 3 interviews per day
    if (interviewsOnDate.length >= 3) {
      return {
        valid: false,
        error: `Daily interview limit reached (${interviewsOnDate.length}/3 scheduled). Please select another date.`
      };
    }
    
    // Check 2: Time overlap (1 hour buffer)
    const newTimeMinutes = timeToMinutes(timeVal);
    if (newTimeMinutes === null) {
      return {
        valid: false,
        error: "Invalid time format. Please use HH:MM format."
      };
    }
    
    const conflicts = [];
    for (const interview of interviewsOnDate) {
      const existingTimeMinutes = timeToMinutes(interview.time);
      if (existingTimeMinutes === null) continue;
      
      const timeDifference = Math.abs(newTimeMinutes - existingTimeMinutes);
      
      // Must be at least 60 minutes apart
      if (timeDifference < 60) {
        conflicts.push(interview.time);
      }
    }
    
    if (conflicts.length > 0) {
      return {
        valid: false,
        error: `Time slot unavailable. Existing interviews at: ${conflicts.join(", ")}. Please choose a time at least 1 hour apart.`
      };
    }
    
    return { valid: true, error: null };
    
  } catch (error) {
    console.error("[checkInterviewAvailability] Error:", error);
    // Don't block scheduling on validation errors, just warn
    return { valid: true, error: null };
  }
}

/**
 * Helper: Convert time string (HH:MM) to minutes since midnight
 * @param {string} timeStr - Time in HH:MM format
 * @returns {number|null} - Minutes since midnight, or null if invalid
 */
function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  
  const parts = timeStr.split(':');
  if (parts.length !== 2) return null;
  
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  
  return hours * 60 + minutes;
}

// Schedule interview (client calls server endpoint first; fallback to client update)
async function openScheduleModal() {
  const modal = document.getElementById("schedule-interview-modal");
  if (modal) modal.style.display = "flex";
  const a = allApplicants.find((x) => x.id === selectedApplicantId);
  if (!a) return;
  if (a.interview) {
    document.getElementById("interview-input-date") && (document.getElementById("interview-input-date").value = a.interview.date || "");
    document.getElementById("interview-input-time") && (document.getElementById("interview-input-time").value = a.interview.time || "");
    document.getElementById("interview-input-mode") && (document.getElementById("interview-input-mode").value = a.interview.mode || "");
    document.getElementById("interview-input-location") && (document.getElementById("interview-input-location").value = a.interview.location || "");
    document.getElementById("interview-input-notes") && (document.getElementById("interview-input-notes").value = a.interview.notes || "");
  }
}

async function handleScheduleInterview(e) {
  e.preventDefault();
  if (!selectedApplicantId) return;
 const dateVal = (document.getElementById("interview-input-date")?.value || "").trim(); // expected YYYY-MM-DD
const timeVal = (document.getElementById("interview-input-time")?.value || "").trim(); // expected HH:MM (24h) or "HH:MM AM/PM"
let datetimeISO = "";

// Try best-effort parse to ISO
if (dateVal) {
  // prefer explicit HH:MM; fallback to 09:00 if missing
  const tv = timeVal || "09:00";
  // If time includes AM/PM, rely on Date parsing of "YYYY-MM-DD hh:mm AM/PM"
  if (/(am|pm)$/i.test(tv)) {
    const parsed = new Date(`${dateVal} ${tv}`);
    if (!isNaN(parsed.getTime())) datetimeISO = parsed.toISOString();
  } else {
    // Try local parse with T separator and seconds
    const tryIso = new Date(`${dateVal}T${tv}:00`);
    if (!isNaN(tryIso.getTime())) datetimeISO = tryIso.toISOString();
    else {
      // last resort: parse as "YYYY-MM-DD HH:MM" (some browsers accept space)
      const parsed = new Date(`${dateVal} ${tv}`);
      if (!isNaN(parsed.getTime())) datetimeISO = parsed.toISOString();
    }
  }
}

const interviewData = {
  date: dateVal,
  time: timeVal,
  mode: document.getElementById("interview-input-mode")?.value || "",
  location: document.getElementById("interview-input-location")?.value || "",
  notes: document.getElementById("interview-input-notes")?.value || "",
  datetimeISO: datetimeISO, // server requires this
  scheduledAt: serverTimestamp(),
  scheduledBy: "admin",
};

if (!interviewData.datetimeISO) {
  showErrorToast("Please provide a valid date and time for the interview.");
  return;
}

// STEP 5: Validate interview availability (max 3/day, 1 hour buffer)
const availability = await checkInterviewAvailability(dateVal, timeVal, selectedApplicantId);
if (!availability.valid) {
  showErrorToast(availability.error);
  return;
}

  // Try server-side authoritative endpoint
  try {
    const res = await fetch("/api/scheduleInterview", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicantId: selectedApplicantId, interview: interviewData }),
    });

    if (res.status === 200 || res.status === 201) {
      const json = await res.json().catch(() => ({}));
      const storedInterview = (json && json.interview) ? json.interview : interviewData;
      // update applicant doc referencing the stored interview
      await updateDoc(doc(db, "teacherApplicants", selectedApplicantId), {
        interview: storedInterview,
        status: "interview_scheduled",
        statusUpdatedAt: serverTimestamp(),
        statusUpdatedBy: "admin",
      });
      const a = allApplicants.find((x) => x.id === selectedApplicantId);
      if (a) { a.interview = storedInterview; a.status = "interview_scheduled"; }
      showScheduleToast("Interview scheduled");
      showModalConfirmation("Interview scheduled");
      closeScheduleModal();

      // If the schedule modal was opened from progress modal, reopen progress and refresh its view
      if (openedFromProgress) {
        openedFromProgress = false;
        const pm = document.getElementById("hfa-progress-modal");
        if (pm) {
          pm.style.display = "flex";
          pm.style.justifyContent = "center";
          pm.style.alignItems = "center";
        }
        const refreshed = allApplicants.find((x) => x.id === selectedApplicantId);
        if (refreshed) renderProgressSteps(refreshed);
      }

      // update teacher modal view if open
      if (document.getElementById("teacher-detail-modal")?.style.display === "block") {
        const stored = allApplicants.find((x) => x.id === selectedApplicantId)?.interview || storedInterview;
        showInterviewDetails(stored);
      }

      filterAndRenderApplicants();
      updateStatsOverview();
      return;
    }

    if (res.status === 409) {
      const json = await res.json().catch(() => ({}));
      console.warn("Scheduling conflict:", json);
      showErrorToast("Scheduling conflict detected");
      return;
    }

    // non-ok fallback
    const text = await res.text().catch(() => "");
    console.warn("server scheduleInterview non-ok:", res.status, text);
    showInfoToast("Server scheduling unavailable; attempting local update");
  } catch (err) {
    console.warn("server scheduleInterview failed, falling back to client update", err);
    showInfoToast("Server endpoint unavailable; performing local schedule");
  }

  // Fallback local update
  try {
    await updateDoc(doc(db, "teacherApplicants", selectedApplicantId), {
      interview: interviewData,
      status: "interview_scheduled",
      statusUpdatedAt: serverTimestamp(),
      statusUpdatedBy: "admin",
    });
    const a = allApplicants.find((x) => x.id === selectedApplicantId);
    if (a) {
      a.interview = interviewData;
      a.status = "interview_scheduled";
    }
    showScheduleToast("Interview scheduled (client-side)");
    showModalConfirmation("Interview scheduled (local)");
    closeScheduleModal();

    if (openedFromProgress) {
      openedFromProgress = false;
      const pm = document.getElementById("hfa-progress-modal");
      if (pm) {
        pm.style.display = "flex";
        pm.style.justifyContent = "center";
        pm.style.alignItems = "center";
      }
      const refreshed = allApplicants.find((x) => x.id === selectedApplicantId);
      if (refreshed) renderProgressSteps(refreshed);
    }

    if (document.getElementById("teacher-detail-modal")?.style.display === "block") {
      showInterviewDetails(allApplicants.find((x) => x.id === selectedApplicantId)?.interview || interviewData);
    }

    filterAndRenderApplicants();
    updateStatsOverview();
  } catch (err) {
    console.error("[admin] local scheduling fallback failed", err);
    showErrorToast("Scheduling failed");
  }
}

function viewDocument(url) {
  if (!url) return showErrorToast("No file URL");
  window.open(url, "_blank");
}
function downloadDocument(url, filename) {
  if (!url) return showErrorToast("No file URL");
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "";
  a.click();
}

// modal helpers
function closeTeacherModal() {
  const modal = document.getElementById("teacher-detail-modal");
  if (modal) modal.style.display = "none";
  selectedApplicantId = null;
}
function closeScheduleModal() {
  const modal = document.getElementById("schedule-interview-modal");
  if (modal) modal.style.display = "none";
  const form = document.getElementById("schedule-interview-form");
  if (form) form.reset();
}

// -------------------- Progress modal implementation --------------------
function openProgressModal(id) {
  if (id) selectedApplicantId = id;
  const a = allApplicants.find((x) => x.id === selectedApplicantId);
  if (!a) return showErrorToast("Applicant not found");

  const modal = document.getElementById("hfa-progress-modal");
  if (modal) modal.style.display = "flex";

  const nameEl = document.getElementById("hfa-progress-name");
  const statusEl = document.getElementById("hfa-progress-status");
  const idEl = document.getElementById("hfa-progress-applicant-id");
  if (nameEl) nameEl.textContent = `${a.firstName || ""} ${a.lastName || ""}`.trim() || (a.displayName || "Applicant");
  if (statusEl) statusEl.textContent = `Status: ${formatStatus(a.status)}`;
  if (idEl) idEl.textContent = `APP-${String(a.id).slice(0,6).toUpperCase()}`;

  // interview info in progress modal
  const interviewScheduled = !!a.interview;
  const interviewScheduledView = document.getElementById("hfa-progress-interview-scheduled");
  const noInterview = document.getElementById("hfa-progress-no-interview");
  if (interviewScheduledView && noInterview) {
    if (interviewScheduled) {
      noInterview.style.display = "none";
      interviewScheduledView.style.display = "block";
      document.getElementById("hfa-progress-interview-date") && (document.getElementById("hfa-progress-interview-date").textContent = a.interview.date || '—');
      document.getElementById("hfa-progress-interview-time") && (document.getElementById("hfa-progress-interview-time").textContent = a.interview.time || '—');
      document.getElementById("hfa-progress-interview-location") && (document.getElementById("hfa-progress-interview-location").textContent = a.interview.location || '—');
    } else {
      noInterview.style.display = "block";
      interviewScheduledView.style.display = "none";
    }
  }

  renderProgressSteps(a);
}

function closeProgressModal() {
  const modal = document.getElementById("hfa-progress-modal");
  if (modal) modal.style.display = "none";
}

function renderProgressSteps(applicant) {
  const container = document.getElementById("hfa-progress-steps");
  if (!container) return;
  container.innerHTML = "";

  // PHASE 2: Unified 6-step progress aligned with teacher portal
  const order = [
    { key: "submitted", label: "Application Submitted", desc: "Your application documents have been received." },
    { key: "screening", label: "Initial Screening", desc: "Qualifications are being reviewed." },
    { key: "interview_scheduled", label: "Interview Scheduled", desc: "Interview will be scheduled." },
    { key: "demo", label: "Demo Teaching", desc: "Demo teaching (if applicable)." },
    { key: "result", label: "Pass or Fail", desc: "Evaluation results after demo teaching." },
    { key: "onboarding", label: "Onboarding", desc: "Final onboarding process and document upload." }
  ];

  // Backward compatibility: map old status names to new ones
  let currentStatus = applicant.status || "submitted";
  if (currentStatus === "reviewing") currentStatus = "screening";
  if (currentStatus === "decision") currentStatus = "result";
  
  let curIndex = order.findIndex((s) => s.key === currentStatus);
  if (curIndex === -1) curIndex = 0;

  order.forEach((step, i) => {
    // create each step item but use your static classes (we are not injecting new interactive buttons outside of step)
    const item = document.createElement("div");
    item.className = "hfa-progress-step-item";
    const completed = (i < curIndex);
    item.setAttribute("data-completed", completed ? "true" : "false");

    const main = document.createElement("div");
    main.className = "hfa-progress-step-main";

    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "hfa-progress-step-checkbox";
    cb.dataset.stepKey = step.key;
    cb.dataset.stepIndex = String(i);
    cb.checked = (i <= curIndex);  // Check current step AND all previous steps
    if (i < curIndex) cb.disabled = true;
    if (i > curIndex) cb.disabled = true;
    if (i === curIndex) cb.disabled = false;

    const titleSpan = document.createElement("span");
    titleSpan.textContent = step.label;

    label.appendChild(cb);
    label.appendChild(titleSpan);

    main.appendChild(label);

    const desc = document.createElement("div");
    desc.className = "hfa-progress-step-desc";
    desc.textContent = step.desc;

    item.appendChild(main);
    // PHASE 2: Show Approve/Reject when step is "result" (Pass or Fail)
    if (step.key === "result") {
      // static decision area already exists; we won't duplicate buttons here.
      // simply append a small notice and then show the static #hfa-progress-decision when appropriate
      const decisionNotice = document.createElement("div");
      decisionNotice.className = "hfa-progress-decision-notice";
      decisionNotice.textContent = "Use the decision controls below to Approve or Reject.";
      item.appendChild(decisionNotice);

      // show static decision container if applicant is at/after result step
      const decisionBlock = document.getElementById("hfa-progress-decision");
      if (decisionBlock) {
        if (i <= curIndex) decisionBlock.style.display = "block";
        else decisionBlock.style.display = "none";
      }
    }

    item.appendChild(desc);

    container.appendChild(item);
  });

  // ensure interview actions visibility correct
  const openInterviewBtn = document.getElementById("hfa-progress-open-interview-btn");
  if (openInterviewBtn) openInterviewBtn.style.display = "inline-block";
}

// Save progress checks and update
async function handleProgressSave(ev) {
  if (!selectedApplicantId) return showInfoToast("No applicant selected");
  const a = allApplicants.find((x) => x.id === selectedApplicantId);
  if (!a) return showErrorToast("Applicant not found");

  // Updated to 6-step unified progress order
  const order = ["submitted", "screening", "interview_scheduled", "demo", "result", "onboarding"];
  
  // Backward compatibility: map old statuses to new ones
  let currentStatus = a.status || "submitted";
  if (currentStatus === "reviewing") currentStatus = "screening"; // old → new
  if (currentStatus === "decision") currentStatus = "result"; // old → new
  
  const curIdx = Math.max(0, order.indexOf(currentStatus));
  const checkbox = document.querySelector(`.hfa-progress-step-checkbox[data-step-index="${curIdx}"]`);

  if (checkbox && checkbox.checked) {
    const nextStatus = order[curIdx + 1] || order[curIdx];
    const completedStep = order[curIdx]; // The step that was just completed
    
    if (nextStatus === "interview_scheduled" && !a.interview) {
      showErrorToast("Please schedule interview before marking this step done.");
      return;
    }

    try {
      // Update status in Firestore
      await updateDoc(doc(db, "teacherApplicants", selectedApplicantId), {
        status: nextStatus,
        statusUpdatedAt: serverTimestamp(),
        statusUpdatedBy: "admin",
      });

      if (a) a.status = nextStatus;
      
      //  Send notification for completed step
      try {
        const data = await apiFetch(`/api/teacher-applicants/${selectedApplicantId}/notify-progress`, {
          method: 'POST',
          body: JSON.stringify({ step: completedStep })
        });
        
        if (data.success) {
          console.log(`[admin] Notification sent for step: ${completedStep}`);
          showToast(`Progress updated & applicant notified`);
        } else {
          console.warn(`[admin] Notification failed:`, data.error);
          showToast("Progress updated (notification failed)");
        }
      } catch (notifError) {
        console.error("[admin] Notification error:", notifError);
        showToast("Progress updated (notification failed)");
      }
      
      closeProgressModal();
      filterAndRenderApplicants();
      updateStatsOverview();
    } catch (err) {
      console.error("[admin] handleProgressSave error", err);
      showErrorToast("Failed to update progress");
    }
  } else {
    closeProgressModal();
  }
}

// progress UI for teacher modal
function updateProgressTracker(status) {
  document.querySelectorAll(".progress-step").forEach((s) => s.classList.remove("active", "completed"));
  const map = {
    new: -1,
    reviewing: 0,
    interview_scheduled: 1,
    interviewed: 1,
    approved: 2,
    rejected: 2,
  };
  const cur = map[status] ?? -1;
  if (cur >= 0) document.getElementById("step-review")?.classList.add("completed");
  if (cur >= 1) document.getElementById("step-interview")?.classList.add("completed");
  if (cur >= 2) document.getElementById("step-decision")?.classList.add("completed");
  if (status === "reviewing") document.getElementById("step-review")?.classList.add("active");
  else if (status === "interview_scheduled") document.getElementById("step-interview")?.classList.add("active");
}

function showInterviewDetails(interview) {
  if (!interview) {
    showNoInterview();
    return;
  }

  document.getElementById("no-interview-scheduled") && (document.getElementById("no-interview-scheduled").style.display = "none");
  document.getElementById("interview-scheduled") && (document.getElementById("interview-scheduled").style.display = "block");
  
  // Display date
  const dateEl = document.getElementById("interview-date");
  if (dateEl) {
    if (interview.date) {
      try {
        // Handle date string format (YYYY-MM-DD or Date object)
        const dateObj = interview.date.toDate ? interview.date.toDate() : new Date(interview.date);
        dateEl.textContent = formatDate(dateObj);
      } catch (err) {
        dateEl.textContent = interview.date; // Fallback to raw string
      }
    } else {
      dateEl.textContent = "Not set";
    }
  }
  
  // Display time
  const timeEl = document.getElementById("interview-time");
  if (timeEl) {
    timeEl.textContent = interview.time || "Not set";
  }
  
  // Display mode/location - use 'location' field (not 'mode')
  const modeEl = document.getElementById("interview-mode");
  if (modeEl) {
    modeEl.textContent = interview.location || interview.mode || "Not specified";
  }
}
function showNoInterview() {
  document.getElementById("no-interview-scheduled") && (document.getElementById("no-interview-scheduled").style.display = "block");
  document.getElementById("interview-scheduled") && (document.getElementById("interview-scheduled").style.display = "none");
}

// pagination & stats
function updatePagination() {
  const totalPages = Math.max(1, Math.ceil(visibleApplicants.length / applicantsPerPage));
  document.getElementById("teacher-current-page") && (document.getElementById("teacher-current-page").textContent = currentPage);
  document.getElementById("teacher-total-pages") && (document.getElementById("teacher-total-pages").textContent = totalPages);
  document.getElementById("teacher-prev-page") && (document.getElementById("teacher-prev-page").disabled = currentPage === 1);
  document.getElementById("teacher-next-page") && (document.getElementById("teacher-next-page").disabled = currentPage === totalPages || totalPages === 0);
}

function updateStatsOverview() {
  const active = allApplicants.filter((a) => !a.archived);
  // PHASE 2: Include new status names with backward compatibility
  const stats = { new: 0, screening: 0, interview_scheduled: 0, approved: 0 };
  active.forEach((a) => {
    if (a.status === "new") stats.new++;
    else if (a.status === "reviewing" || a.status === "screening") stats.screening++;
    else if (a.status === "interview_scheduled") stats.interview_scheduled++;
    else if (a.status === "approved") stats.approved++;
  });
  document.getElementById("new-teachers-count") && (document.getElementById("new-teachers-count").textContent = stats.new);
  document.getElementById("review-teachers-count") && (document.getElementById("review-teachers-count").textContent = stats.screening);
  document.getElementById("interview-teachers-count") && (document.getElementById("interview-teachers-count").textContent = stats.interview_scheduled);
  document.getElementById("approved-teachers-count") && (document.getElementById("approved-teachers-count").textContent = stats.approved);
}

// utilities
function formatDate(d) {
  if (!d) return "N/A";
  const dt = typeof d === "string" || typeof d === "number" ? new Date(d) : d;
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
function formatStatus(s) {
  const status = {
    new: "New",
    reviewing: "Under Review", // backward compatibility
    screening: "Initial Screening",
    interview_scheduled: "Interview Scheduled",
    interviewed: "Interviewed",
    demo: "Demo Teaching",
    result: "Pass or Fail",
    onboarding: "Onboarding",
    approved: "Approved",
    rejected: "Rejected",
  };
  return status[s] || s || "Unknown";
}
function debounce(fn, wait = 300) {
  let t;
  return function (...a) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, a), wait);
  };
}

// toast helpers (unchanged)
(function ensureToastContainer() {
  if (!document.getElementById("toast-container")) {
    const c = document.createElement("div");
    c.id = "toast-container";
    c.setAttribute("aria-live", "polite");
    c.className = "toast-stack";
    document.body.appendChild(c);
  }
})();

function createToast(message, styleClass = "toast-info", timeout = 3500) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const tpl = document.getElementById("toast-template");
  let t = null;

  if (tpl && tpl.content) {
    const clone = tpl.content.cloneNode(true);
    t = clone.querySelector(".toast");
    if (t) {
      t.classList.add(styleClass);
      const msg = t.querySelector(".toast-msg");
      if (msg) msg.textContent = message;
      container.appendChild(t);
    }
  }
  if (!t) {
    t = document.createElement("div");
    t.className = `toast ${styleClass}`;
    t.innerHTML = `<div class="toast-body"><span class="toast-msg">${escapeHtml(message)}</span><button class="toast-close" aria-label="Close">×</button></div>`;
    container.appendChild(t);
  }

  requestAnimationFrame(() => t.classList.add("show"));
  const remove = () => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  };
  const timer = setTimeout(remove, timeout);
  t.querySelector(".toast-close")?.addEventListener("click", () => {
    clearTimeout(timer);
    remove();
  });
  return { node: t, removeFn: remove, timerId: timer };
}

function createToastWithAction(message, styleClass = "toast-info", timeout = 3500, actionText = null, actionCallback = null) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const tpl = document.getElementById("toast-template");
  let t = null;

  if (tpl && tpl.content) {
    const clone = tpl.content.cloneNode(true);
    t = clone.querySelector(".toast");
    if (t) {
      t.classList.add(styleClass);
      const msg = t.querySelector(".toast-msg");
      if (msg) msg.textContent = message;
      const act = t.querySelector(".toast-action");
      if (actionText && act) {
        act.style.display = "";
        act.textContent = actionText;
      } else if (act) {
        act.style.display = "none";
      }
      container.appendChild(t);
    }
  }

  if (!t) {
    t = document.createElement("div");
    t.className = `toast ${styleClass}`;
    t.innerHTML = `<div class="toast-body"><span class="toast-msg">${escapeHtml(message)}</span>${actionText ? ` <button class="toast-action" type="button">${escapeHtml(actionText)}</button>` : ``}<button class="toast-close" aria-label="Close">×</button></div>`;
    container.appendChild(t);
  }

  requestAnimationFrame(() => t.classList.add("show"));
  const remove = () => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  };
  const timer = setTimeout(remove, timeout);

  if (actionText && actionCallback && typeof actionCallback === "function") {
    const actBtn = t.querySelector(".toast-action");
    actBtn?.addEventListener("click", async (ev) => {
      try {
        await actionCallback();
      } catch (err) {
        console.error("Toast action error", err);
      } finally {
        clearTimeout(timer);
        remove();
      }
    });
  }
  t.querySelector(".toast-close")?.addEventListener("click", () => {
    clearTimeout(timer);
    remove();
  });
  return { node: t, removeFn: remove, timerId: timer };
}

// Generic toast function (used by notification system)
function showToast(msg = "Success", styleClass = "toast-info") { 
  createToast(msg, styleClass); 
}

function showSaveToast(msg = "Saved") { createToast(msg, "toast-save"); }
function showUpdateToast(msg = "Updated") { createToast(msg, "toast-update"); }
function showArchiveToast(msg = "Archived") { createToast(msg, "toast-archive"); }
function showRejectToast(msg = "Rejected") { createToast(msg, "toast-reject"); }
function showApproveToast(msg = "Approved") { createToast(msg, "toast-approve"); }
function showDeleteToast(msg = "Deleted") { createToast(msg, "toast-delete"); }
function showScheduleToast(msg = "Scheduled") { createToast(msg, "toast-schedule"); }
function showInfoToast(msg = "Info") { createToast(msg, "toast-info"); }
function showErrorToast(msg = "Error") { createToast(msg, "toast-error"); }

function showModalConfirmation(message, duration = 900) {
  const modal = document.getElementById("teacher-detail-modal");
  if (!modal) return;
  let conf = document.getElementById("modal-action-confirmation");
  if (!conf) {
    conf = document.createElement("div");
    conf.id = "modal-action-confirmation";
    conf.className = "modal-confirm";
    const content = modal.querySelector(".modal-content") || modal;
    content.insertBefore(conf, content.firstChild);
  }
  conf.textContent = message;
  conf.classList.add("show");
  setTimeout(() => {
    conf.classList.remove("show");
    setTimeout(() => {
      if (conf && conf.parentNode) conf.parentNode.removeChild(conf);
    }, 300);
  }, duration);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* -------------------------
   expose functions for global use
------------------------- */
window.viewApplicantDetails = viewApplicantDetails;
window.messageApplicant = (id) => {
  selectedApplicantId = id;
  sendApplicantMessage();
};
window.scheduleInterview = (id) => {
  selectedApplicantId = id;
  openScheduleModal();
};
window.editApplicant = (id) => {
  selectedApplicantId = id;
  editApplicantDetails();
};
window.archiveApplicant = async (id) => {
  selectedApplicantId = id;
  await archiveApplicant(id);
};
window.unarchiveApplicant = async (id) => {
  selectedApplicantId = id;
  await unarchiveApplicant(id);
};
window.deleteApplicant = async (id) => {
  if (!confirm("Permanently delete this applicant?")) return;
  try {
    await deleteDoc(doc(db, "teacherApplicants", id));
    const idx = allApplicants.findIndex((a) => a.id === id);
    if (idx !== -1) allApplicants.splice(idx, 1);
    filterAndRenderApplicants();
    updateStatsOverview();
    showDeleteToast("Applicant deleted");
  } catch (err) {
    console.error("[admin] deleteApplicant", err);
    showErrorToast("Error deleting");
  }
};
window.viewDocument = viewDocument;
window.downloadDocument = downloadDocument;
