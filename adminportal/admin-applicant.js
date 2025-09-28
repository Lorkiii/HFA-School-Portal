// admin-applicant.js - rewritten with clear names and unique toast helpers
// single-line comments only

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { firebaseConfig } from "../firebase-config.js";
import { supabase } from "../supabase-config.js"; // kept for later

// init firebase
let app;
let db;
try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  console.log("[admin] Firebase initialized");
} catch (err) {
  console.error("[admin] Firebase init error", err);
}

// pagination & state
let currentPage = 1; // current page number
const applicantsPerPage = 9; // items per page
let allApplicants = []; // all applicants fetched
let visibleApplicants = []; // applicants after filters
let activeViewMode = "grid"; // 'grid' or 'table'
let selectedApplicantId = null; // currently selected applicant id
let isArchivedView = false; // toggle archived vs active

// dom ready
document.addEventListener("DOMContentLoaded", () => {
  safeInit();
});

// initialize UI and fetch data
async function safeInit() {
  // wire archived toggle
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

  await fetchApplicants();
  wireEventHandlers();
  filterAndRenderApplicants();
  updateStatsOverview();
}

// fetch applicants from firestore
async function fetchApplicants() {
  if (!db) return;
  try {
    const snap = await getDocs(collection(db, "teacherApplicants"));
    allApplicants = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      let appliedDate = new Date();
      if (data.createdAt) {
        if (typeof data.createdAt.toDate === "function")
          appliedDate = data.createdAt.toDate();
        else appliedDate = new Date(data.createdAt);
      } else if (data.appliedDate) appliedDate = new Date(data.appliedDate);
      allApplicants.push({
        id: d.id,
        ...data,
        status: data.status || "new",
        appliedDate,
        archived: data.archived || false,
      });
    });
    allApplicants.sort(
      (a, b) => new Date(b.appliedDate) - new Date(a.appliedDate)
    );
    console.log("[admin] loaded", allApplicants.length, "applicants");
  } catch (err) {
    console.error("[admin] fetchApplicants error", err);
    showErrorToast("Error loading applicants");
  }
}

// wire UI event handlers
function wireEventHandlers() {
  // view toggles
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

  // search & filters
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
    .getElementById("teacher-subject-filter")
    ?.addEventListener("change", () => {
      currentPage = 1;
      filterAndRenderApplicants();
    });

  // pagination
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
      const totalPages = Math.max(
        1,
        Math.ceil(visibleApplicants.length / applicantsPerPage)
      );
      if (currentPage < totalPages) {
        currentPage++;
        renderApplicantsPage();
      }
    });

  // modal buttons
  document
    .getElementById("close-teacher-modal")
    ?.addEventListener("click", closeTeacherModal);
  document
    .getElementById("cancel-schedule")
    ?.addEventListener("click", closeScheduleModal);
  document
    .getElementById("approve-teacher-btn")
    ?.addEventListener("click", () => updateApplicantStatus("approved"));
  document
    .getElementById("reject-teacher-btn")
    ?.addEventListener("click", () => updateApplicantStatus("rejected"));
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
  document
    .getElementById("edit-teacher-btn")
    ?.addEventListener("click", editApplicantDetails);
  document
    .getElementById("save-notes-btn")
    ?.addEventListener("click", saveAdminNotes);
  document
    .getElementById("schedule-interview-btn")
    ?.addEventListener("click", openScheduleModal);
  document
    .getElementById("reschedule-interview-btn")
    ?.addEventListener("click", openScheduleModal);
  document
    .getElementById("schedule-interview-form")
    ?.addEventListener("submit", handleScheduleInterview);

  // disabled actions
  document
    .getElementById("teacher-export-btn")
    ?.addEventListener("click", (e) => {
      e.preventDefault();
      showInfoToast("Export disabled");
    });
  document
    .getElementById("teacher-filter-btn")
    ?.addEventListener("click", (e) => {
      e.preventDefault();
      showInfoToast("Filter disabled");
    });
}

// apply filters and render
function filterAndRenderApplicants() {
  const base = isArchivedView
    ? allApplicants.filter((a) => a.archived)
    : allApplicants.filter((a) => !a.archived);
  const statusVal =
    document.getElementById("teacher-status-filter")?.value || "";
  const levelVal = document.getElementById("teacher-level-filter")?.value || "";
  const subjectVal =
    document.getElementById("teacher-subject-filter")?.value || "";
  const searchVal = (document.getElementById("teacher-search")?.value || "")
    .toLowerCase()
    .trim();

  visibleApplicants = base.filter((a) => {
    if (statusVal && a.status !== statusVal) return false;
    if (levelVal && a.preferredLevel !== levelVal) return false;
    if (subjectVal && !String(a.qualifiedSubjects || "").includes(subjectVal))
      return false;
    if (searchVal) {
      const hay = `${a.firstName || ""} ${a.lastName || ""} ${a.email || ""} ${
        a.qualifiedSubjects || ""
      } ${a.preferredLevel || ""}`.toLowerCase();
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
  const pageApplicants = visibleApplicants.slice(
    startIndex,
    startIndex + applicantsPerPage
  );
  if (activeViewMode === "grid") {
    renderGridApplicants(pageApplicants);
    document.getElementById("teacher-grid-view")?.style &&
      (document.getElementById("teacher-grid-view").style.display = "grid");
    document.getElementById("teacher-table-view")?.style &&
      (document.getElementById("teacher-table-view").style.display = "none");
  } else {
    renderTableApplicants(pageApplicants);
    document.getElementById("teacher-grid-view")?.style &&
      (document.getElementById("teacher-grid-view").style.display = "none");
    document.getElementById("teacher-table-view")?.style &&
      (document.getElementById("teacher-table-view").style.display = "block");
  }
  updatePagination();
}

// grid renderer
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

    //teacher card body
    const body = document.createElement("div");
    body.className = "teacher-card-body";
    const details = document.createElement("div");
    details.className = "teacher-details";
    details.appendChild(createDetail("fas fa-envelope", a.email || "No email"));
    details.appendChild(
      createDetail("fas fa-phone", a.contactNumber || "No phone")
    );
    details.appendChild(
      createDetail("fas fa-graduation-cap", a.highestDegree || "Not specified")
    );
    details.appendChild(
      createDetail("fas fa-briefcase", `${a.experienceYears || 0} years exp.`)
    );

    const quals = document.createElement("div");
    quals.className = "teacher-qualifications";
    const qTitle = document.createElement("strong");
    qTitle.textContent = "Subjects:";
    const qTags = document.createElement("div");
    qTags.className = "qualification-tags";
    if (a.qualifiedSubjects) {
      const subs =
        typeof a.qualifiedSubjects === "string"
          ? a.qualifiedSubjects.split(",")
          : a.qualifiedSubjects;
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

    const footer = document.createElement("div");
    footer.className = "teacher-card-footer";
    const viewBtn = createBtn("btn-view-teacher", "View", "fas fa-eye");
    viewBtn.addEventListener("click", () => viewApplicantDetails(a.id));
    footer.appendChild(viewBtn);

    if (!a.archived) {
      const msgBtn = createBtn(
        "btn-message-teacher",
        "Message",
        "fas fa-envelope"
      );
      msgBtn.addEventListener("click", () => {
        selectedApplicantId = a.id;
        sendApplicantMessage();
      });
      const schedBtn = createBtn(
        "btn-schedule-teacher",
        "Schedule",
        "fas fa-calendar"
      );
      schedBtn.addEventListener("click", () => {
        selectedApplicantId = a.id;
        openScheduleModal();
      });
      const archiveBtn = createBtn("btn-archive", "Archive", "fas fa-archive");
      archiveBtn.addEventListener("click", async () => {
        selectedApplicantId = a.id;
        await archiveApplicant(a.id);
      });
      footer.appendChild(msgBtn);
      footer.appendChild(schedBtn);
      footer.appendChild(archiveBtn);
    } else {
      const unarchiveBtn = createBtn(
        "btn-unarchive",
        "Unarchive",
        "fas fa-folder-open"
      );
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

// table renderer
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
    tr.appendChild(
      createTdComplex(a.email || "No email", a.contactNumber || "No phone")
    );
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

// modal details
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

  setText(
    "teacher-modal-name",
    `${a.firstName || ""} ${a.middleName || ""} ${a.lastName || ""}`.trim()
  );
  const stEl = document.getElementById("teacher-modal-status");
  if (stEl) {
    stEl.textContent = formatStatus(a.status);
    stEl.className = `status-badge status-${a.status}`;
  }
  setText("teacher-modal-id", `APP-${String(id).slice(0, 6).toUpperCase()}`);

  setText(
    "modal-teacher-fullname",
    `${a.firstName || ""} ${a.middleName || ""} ${a.lastName || ""} ${
      a.nameExtension || ""
    }`.trim()
  );
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
  setText("modal-teacher-license", a.licenseNumber || "Not provided");
  setText("modal-teacher-level", a.preferredLevel || "Not specified");
  setText("modal-teacher-subjects", a.qualifiedSubjects || "Not specified");
  setText("modal-teacher-employment", a.employmentType || "Not specified");

  renderDocuments(a.documents || []);
  updateProgressTracker(a.status);
  if (a.interview) showInterviewDetails(a.interview);
  else showNoInterview();

  const notesEl = document.getElementById("admin-notes");
  if (notesEl) notesEl.value = a.adminNotes || "";

  const modalArchiveBtn = document.getElementById("archive-teacher-btn");
  if (modalArchiveBtn) {
    if (a.archived)
      modalArchiveBtn.innerHTML =
        '<i class="fas fa-folder-open"></i> Unarchive';
    else modalArchiveBtn.innerHTML = '<i class="fas fa-archive"></i> Archive';
  }

  document.getElementById("teacher-detail-modal") &&
    (document.getElementById("teacher-detail-modal").style.display = "block");
}

// render documents - produce minimal markup (icons/extra html moved to your template/CSS)
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
    // minimal markup: leave icon decoration to HTML/CSS
    const nameSpan = document.createElement("span");
    nameSpan.className = "document-name";
    nameSpan.textContent = d.fileName || "Document";
    info.appendChild(nameSpan);

    const actions = document.createElement("div");
    actions.className = "document-actions";
    // add action hooks, but no embedded icon HTML so you can template icons in HTML/CSS
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
  // capture backup indexes & data for restore
  const allIndex = allApplicants.findIndex((x) => x.id === id);
  const visibleIndex = visibleApplicants.findIndex((x) => x.id === id);
  const backupData = allIndex !== -1 ? { ...allApplicants[allIndex] } : null;

  try {
    // update DB immediately (keeps server state in sync)
    await updateDoc(doc(db, "teacherApplicants", id), {
      archived: true,
      archivedAt: serverTimestamp(),
      archivedBy: "admin",
    });

    // update local state and UI immediately (preserve ordering)
    if (allIndex !== -1) allApplicants[allIndex].archived = true;
    if (visibleIndex !== -1) visibleApplicants.splice(visibleIndex, 1);
    renderApplicantsPage();

    // show undo toast; the callback restores local arrays and then updates DB to unarchive
    createToastWithAction(
      "Applicant archived",
      "toast-archive",
      6000,
      "Undo",
      async () => {
        try {
          // restore local object ordering and archived flag
          if (backupData) {
            // ensure archived flag is false locally
            const restored = { ...backupData, archived: false };
            if (allIndex >= 0 && allIndex <= allApplicants.length - 1) {
              allApplicants[allIndex] = restored;
            } else {
              // fallback: insert at start
              allApplicants.splice(allIndex >= 0 ? allIndex : 0, 0, restored);
            }

            if (visibleIndex !== -1) {
              visibleApplicants.splice(visibleIndex, 0, restored);
            } else {
              // if current view shows archived=false and item belongs in visible set by filters, consider inserting
            }

            renderApplicantsPage();
          }
          // update DB to unarchive without re-filtering UI
          await dbUnarchive(id);
          showInfoToast("Undo successful");
        } catch (err) {
          console.error("[admin] Undo archive failed", err);
          showErrorToast("Undo failed");
        }
      }
    );

    filterAndRenderApplicants(); // keep counts / filters updated (this will reset paging)
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

// status change
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
    // show modal confirmation then close modal after a short delay
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
  window.location.href = `mailto:${a.email}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
  showInfoToast("Opening email client");
}

function editApplicantDetails() {
  showInfoToast("Edit functionality coming soon");
  // if you build edit UI later, call showModalConfirmation("Changes saved") after saving
}

async function saveAdminNotes() {
  if (!selectedApplicantId) return showInfoToast("No applicant selected");
  const notes = document.getElementById("admin-notes")?.value || "";
  try {
    await updateDoc(doc(db, "teacherApplicants", selectedApplicantId), {
      adminNotes: notes,
      notesUpdatedAt: serverTimestamp(),
      notesUpdatedBy: "admin",
    });
    const a = allApplicants.find((x) => x.id === selectedApplicantId);
    if (a) a.adminNotes = notes;
    showSaveToast("Notes saved");
    showModalConfirmation("Notes saved");
  } catch (err) {
    console.error("[admin] saveAdminNotes", err);
    showErrorToast("Error saving notes");
  }
}

function openScheduleModal() {
  const modal = document.getElementById("schedule-interview-modal");
  if (modal) modal.style.display = "block";
  const a = allApplicants.find((x) => x.id === selectedApplicantId);
  if (!a) return;
  if (a.interview) {
    document.getElementById("interview-input-date") &&
      (document.getElementById("interview-input-date").value =
        a.interview.date || "");
    document.getElementById("interview-input-time") &&
      (document.getElementById("interview-input-time").value =
        a.interview.time || "");
    document.getElementById("interview-input-mode") &&
      (document.getElementById("interview-input-mode").value =
        a.interview.mode || "");
    document.getElementById("interview-input-location") &&
      (document.getElementById("interview-input-location").value =
        a.interview.location || "");
    document.getElementById("interview-input-notes") &&
      (document.getElementById("interview-input-notes").value =
        a.interview.notes || "");
  }
}

async function handleScheduleInterview(e) {
  e.preventDefault();
  if (!selectedApplicantId) return;
  const interviewData = {
    date: document.getElementById("interview-input-date")?.value || "",
    time: document.getElementById("interview-input-time")?.value || "",
    mode: document.getElementById("interview-input-mode")?.value || "",
    location: document.getElementById("interview-input-location")?.value || "",
    notes: document.getElementById("interview-input-notes")?.value || "",
    scheduledAt: serverTimestamp(),
    scheduledBy: "admin",
  };
  try {
    await updateDoc(doc(db, "teacherApplicants", selectedApplicantId), {
      interview: interviewData,
      status: "interview_scheduled",
    });
    const a = allApplicants.find((x) => x.id === selectedApplicantId);
    if (a) {
      a.interview = interviewData;
      a.status = "interview_scheduled";
    }
    showScheduleToast("Interview scheduled");
    showModalConfirmation("Interview scheduled");
    closeScheduleModal();
    filterAndRenderApplicants();
    updateStatsOverview();
  } catch (err) {
    console.error("[admin] schedule error", err);
    showErrorToast("Error scheduling");
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

// progress UI
function updateProgressTracker(status) {
  document
    .querySelectorAll(".progress-step")
    .forEach((s) => s.classList.remove("active", "completed"));
  const map = {
    new: -1,
    reviewing: 0,
    interview_scheduled: 1,
    interviewed: 1,
    approved: 2,
    rejected: 2,
  };
  const cur = map[status] ?? -1;
  if (cur >= 0)
    document.getElementById("step-review")?.classList.add("completed");
  if (cur >= 1)
    document.getElementById("step-interview")?.classList.add("completed");
  if (cur >= 2)
    document.getElementById("step-decision")?.classList.add("completed");
  if (status === "reviewing")
    document.getElementById("step-review")?.classList.add("active");
  else if (status === "interview_scheduled")
    document.getElementById("step-interview")?.classList.add("active");
}
function showInterviewDetails(interview) {
  document.getElementById("no-interview-scheduled") &&
    (document.getElementById("no-interview-scheduled").style.display = "none");
  document.getElementById("interview-scheduled") &&
    (document.getElementById("interview-scheduled").style.display = "block");
  document.getElementById("interview-date") &&
    (document.getElementById("interview-date").textContent = formatDate(
      new Date(interview.date)
    ));
  document.getElementById("interview-time") &&
    (document.getElementById("interview-time").textContent =
      interview.time || "");
  document.getElementById("interview-mode") &&
    (document.getElementById("interview-mode").textContent =
      interview.mode || "");
  document.getElementById("interview-notes") &&
    (document.getElementById("interview-notes").textContent =
      interview.notes || "");
}
function showNoInterview() {
  document.getElementById("no-interview-scheduled") &&
    (document.getElementById("no-interview-scheduled").style.display = "block");
  document.getElementById("interview-scheduled") &&
    (document.getElementById("interview-scheduled").style.display = "none");
}

// pagination & stats
function updatePagination() {
  const totalPages = Math.max(
    1,
    Math.ceil(visibleApplicants.length / applicantsPerPage)
  );
  document.getElementById("teacher-current-page") &&
    (document.getElementById("teacher-current-page").textContent = currentPage);
  document.getElementById("teacher-total-pages") &&
    (document.getElementById("teacher-total-pages").textContent = totalPages);
  document.getElementById("teacher-prev-page") &&
    (document.getElementById("teacher-prev-page").disabled = currentPage === 1);
  document.getElementById("teacher-next-page") &&
    (document.getElementById("teacher-next-page").disabled =
      currentPage === totalPages || totalPages === 0);
}

function updateStatsOverview() {
  const active = allApplicants.filter((a) => !a.archived);
  const stats = { new: 0, reviewing: 0, interview_scheduled: 0, approved: 0 };
  active.forEach((a) => {
    if (a.status === "new") stats.new++;
    else if (a.status === "reviewing") stats.reviewing++;
    else if (a.status === "interview_scheduled") stats.interview_scheduled++;
    else if (a.status === "approved") stats.approved++;
  });
  document.getElementById("new-teachers-count") &&
    (document.getElementById("new-teachers-count").textContent = stats.new);
  document.getElementById("review-teachers-count") &&
    (document.getElementById("review-teachers-count").textContent =
      stats.reviewing);
  document.getElementById("interview-teachers-count") &&
    (document.getElementById("interview-teachers-count").textContent =
      stats.interview_scheduled);
  document.getElementById("approved-teachers-count") &&
    (document.getElementById("approved-teachers-count").textContent =
      stats.approved);
}

// utilities
function formatDate(d) {
  if (!d) return "N/A";
  const dt = typeof d === "string" || typeof d === "number" ? new Date(d) : d;
  return dt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
function formatStatus(s) {
  const m = {
    new: "New",
    reviewing: "Under Review",
    interview_scheduled: "Interview Scheduled",
    interviewed: "Interviewed",
    approved: "Approved",
    rejected: "Rejected",
  };
  return m[s] || s || "Unknown";
}
function debounce(fn, wait = 300) {
  let t;
  return function (...a) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, a), wait);
  };
}

//toast notifications: ensure container exists
(function ensureToastContainer() {
  if (!document.getElementById("toast-container")) {
    const c = document.createElement("div");
    c.id = "toast-container";
    c.setAttribute("aria-live", "polite");
    c.className = "toast-stack";
    document.body.appendChild(c);
  }
})();

// clone template or fallback string builder for toast
function createToast(message, styleClass = "toast-info", timeout = 3500) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const tpl = document.getElementById("toast-template");
  let t = null;

  if (tpl && tpl.content) {
    // try to clone template and pick the .toast element
    const clone = tpl.content.cloneNode(true);
    t = clone.querySelector(".toast");
    if (t) {
      t.classList.add(styleClass);
      const msg = t.querySelector(".toast-msg");
      if (msg) msg.textContent = message;
      container.appendChild(t);
    } else {
      // template exists but doesn't include expected .toast structure
      console.warn("toast-template found but missing .toast wrapper — falling back to JS-created toast");
    }
  }

  // fallback if template not present or malformed (t is null)
  if (!t) {
    t = document.createElement("div");
    t.className = `toast ${styleClass}`;
    t.innerHTML = `<div class="toast-body"><span class="toast-msg">${escapeHtml(
      message
    )}</span><button class="toast-close" aria-label="Close">×</button></div>`;
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
    } else {
      console.warn("toast-template found but missing .toast wrapper — falling back to JS-created toast");
    }
  }

  if (!t) {
    t = document.createElement("div");
    t.className = `toast ${styleClass}`;
    t.innerHTML = `<div class="toast-body"><span class="toast-msg">${escapeHtml(
      message
    )}</span>${actionText ? ` <button class="toast-action" type="button">${escapeHtml(actionText)}</button>` : `` }<button class="toast-close" aria-label="Close">×</button></div>`;
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

// specialized toasts
function showSaveToast(msg = "Saved") {
  createToast(msg, "toast-save");
}
function showUpdateToast(msg = "Updated") {
  createToast(msg, "toast-update");
}
function showArchiveToast(msg = "Archived") {
  createToast(msg, "toast-archive");
}
function showRejectToast(msg = "Rejected") {
  createToast(msg, "toast-reject");
}
function showApproveToast(msg = "Approved") {
  createToast(msg, "toast-approve");
}
function showDeleteToast(msg = "Deleted") {
  createToast(msg, "toast-delete");
}
function showScheduleToast(msg = "Scheduled") {
  createToast(msg, "toast-schedule");
}
function showInfoToast(msg = "Info") {
  createToast(msg, "toast-info");
}
function showErrorToast(msg = "Error") {
  createToast(msg, "toast-error");
}

// small modal confirmation message shown inside modal
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

// escape HTML
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
