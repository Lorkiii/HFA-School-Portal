// jhs-server.js (client-side) — upload via server endpoints (same flow as shs-server)
// Drop-in replacement for your current jhs-server.js
document.addEventListener("DOMContentLoaded", () => {
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB (adjust as needed)

  const submitTrigger = document.getElementById("submit-btn");
  const confirmationModal = document.getElementById("confirmation-modal");
  const confirmBtn = document.getElementById("modal-confirm-btn");
  const cancelBtn = document.getElementById("modal-cancel-btn");
  const confirmationClose = document.getElementById("confirmation-close");
  const successModal = document.getElementById("success-modal");
  const modalOkBtn = document.getElementById("modal-ok-btn");

  // Map file slots to your input element IDs
  const slotToInputId = {
    reportcard: "reportcard-upload",
    psa: "psa-upload",
    goodMoral: "good-moral-upload",
    form137: "form-137",
    clearance: "clearance-upload"
  };

  function fileInputFor(slot) {
    const id = slotToInputId[slot];
    return id ? document.getElementById(id) : null;
  }

  function getOrCreateStatusContainer(slot) {
    const input = fileInputFor(slot);
    if (!input) return null;
    const container = input.closest(".file-input-container") || input.parentElement;
    if (!container) return null;
    const id = `upload-status-${slot}`;
    let statusEl = container.querySelector(`#${id}`);
    if (!statusEl) {
      statusEl = document.createElement("div");
      statusEl.id = id;
      statusEl.className = "upload-status";
      statusEl.style.marginTop = "0.4rem";
      statusEl.style.fontSize = "0.95rem";
      statusEl.style.color = "#439928ff";
      container.appendChild(statusEl);
    }
    return statusEl;
  }

  function humanFileSize(bytes) {
    if (bytes === 0) return "0 B";
    const thresh = 1024;
    if (Math.abs(bytes) < thresh) return bytes + " B";
    const units = ["KB", "MB", "GB", "TB", "PB"];
    let u = -1;
    do {
      bytes /= thresh;
      ++u;
    } while (Math.abs(bytes) >= thresh && u < units.length - 1);
    return `${bytes.toFixed(1)} ${units[u]}`;
  }

  function renderStatus(slot, { state = "idle", file = null, message = "" } = {}) {
    const container = getOrCreateStatusContainer(slot);
    if (!container) return;
    container.textContent = "";
    let text = "";
    if (state === "selected") {
      text = file ? `Selected: ${file.name} (${humanFileSize(file.size)})` : "Selected";
      container.style.color = "#333";
    } else if (state === "uploading") {
      text = file ? `Uploading: ${file.name}` : "Uploading...";
      container.style.color = "#444";
    } else if (state === "success") {
      text = file ? `Uploaded: ${file.name}` : "Uploaded";
      container.style.color = "#1a7f1a";
    } else if (state === "error") {
      text = message || "Upload error";
      container.style.color = "red";
    } else {
      text = message || "";
      container.style.color = "#333";
    }
    container.textContent = text;
  }

  // enforce MAX_FILE_SIZE and show selected state
  for (const slot of Object.keys(slotToInputId)) {
    const input = fileInputFor(slot);
    if (!input) continue;
    input.addEventListener("change", () => {
      const file = input.files?.[0] || null;
      if (!file) {
        const c = getOrCreateStatusContainer(slot);
        if (c) c.textContent = "";
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        renderStatus(slot, {
          state: "error",
          message: `File too large (${humanFileSize(file.size)}). Max is ${humanFileSize(MAX_FILE_SIZE)}.`
        });
        input.value = "";
        return;
      }
      renderStatus(slot, { state: "selected", file });
    });
  }

  function collectFormDataAndFiles() {
    const getVal = (id) => document.getElementById(id)?.value?.trim() || "";

    const metadata = {
      formType: "jhs",
      firstName: getVal("first-name"),
      lastName: getVal("last-name"),
      middleName: getVal("middle-name"),
      birthdate: getVal("birth-date"),
      email: getVal("email-address"),
      gender: getVal("gender"),
      gradeLevel: getVal("grade-level"),
      address: getVal("address"),
      contactNumber: getVal("contact-number"),
      studentType: document.querySelector('input[name="student-type"]:checked')?.value || "",
      previousSchool: getVal("previous-school"),
      studentNumber: getVal("student-number")
    };

    const files = {};
    const requestedFiles = [];
    for (const slot of Object.keys(slotToInputId)) {
      const el = fileInputFor(slot);
      const f = el?.files?.[0] || null;
      files[slot] = f;
      if (f) requestedFiles.push({ slot, name: f.name });
    }
    metadata.requestedFiles = requestedFiles;
    return { metadata, files };
  }

  // Main submit flow: create enrollee -> upload files -> finalize
  async function performSubmitFlow() {
    // optional age validation
    if (typeof window.validateAge === "function") {
      const ok = window.validateAge();
      if (!ok) return;
    }

    if (confirmBtn) confirmBtn.disabled = true;
    const origConfirmText = confirmBtn?.textContent || "Confirm";
    if (confirmBtn) confirmBtn.textContent = "Submitting...";

    try {
      const { metadata, files } = collectFormDataAndFiles();

      // 1) Create enrollee (server returns planned paths)
      const createResp = await fetch("/api/enrollees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadata)
      });

      if (!createResp.ok) {
        const body = await createResp.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${createResp.status}`);
      }
      const createResult = await createResp.json();
      const studentId = createResult.studentId;
      const uploadTokens = createResult.uploadTokens || {}; // { slot: { path, fileName } }

      // 2) Upload each file via server endpoint /api/enrollees/:id/upload
      const uploadedFilesMeta = [];
      for (const slot of Object.keys(uploadTokens)) {
        const info = uploadTokens[slot];
        if (!info || !info.path) continue;
        const fileObj = files[slot];
        if (!fileObj) continue; // nothing selected for this slot

        renderStatus(slot, { state: "uploading", file: fileObj });

        const form = new FormData();
        form.append("slot", slot);
        form.append("file", fileObj, fileObj.name);

        const upResp = await fetch(`/api/enrollees/${encodeURIComponent(studentId)}/upload`, {
          method: "POST",
          body: form
        });

        if (!upResp.ok) {
          const b = await upResp.json().catch(() => ({}));
          renderStatus(slot, { state: "error", file: fileObj, message: b && b.error ? b.error : `Upload failed ${upResp.status}` });
          throw new Error(b && b.error ? b.error : `Upload failed ${upResp.status}`);
        }

        const upResult = await upResp.json();
        renderStatus(slot, { state: "success", file: fileObj });

        uploadedFilesMeta.push({
          slot,
          fileName: upResult.fileName || fileObj.name,
          size: upResult.size || fileObj.size,
          path: upResult.path,
          publicUrl: upResult.publicUrl || null
        });
      }

      // 3) Finalize
      const finalizeResp = await fetch(`/api/enrollees/${encodeURIComponent(studentId)}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: uploadedFilesMeta })
      });

      if (!finalizeResp.ok) {
        const body = await finalizeResp.json().catch(() => ({}));
        throw new Error(body.error || `Finalize failed ${finalizeResp.status}`);
      }

      // success UI
      if (confirmationModal) confirmationModal.style.display = "none";
      if (successModal) successModal.style.display = "block";

      // reset form after short delay
      setTimeout(() => {
        const form = document.getElementById("enrollment-form");
        form?.reset();
        for (const slot of Object.keys(slotToInputId)) {
          const el = getOrCreateStatusContainer(slot);
          if (el) el.textContent = "";
        }
        if (typeof window.handleStudentTypeChange === "function") window.handleStudentTypeChange();
      }, 800);

    } catch (err) {
      console.error("Submit error:", err);
      alert("Submission failed: " + (err.message || "check console"));
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = origConfirmText;
      }
    }
  }

  // wire UI open/close
  if (submitTrigger) {
    submitTrigger.addEventListener("click", (e) => {
      e.preventDefault();
      if (typeof window.validateAge === "function" && !window.validateAge()) return;
      if (confirmationModal) confirmationModal.style.display = "block";
    });
  }
  if (cancelBtn) cancelBtn.addEventListener("click", () => {
    if (confirmationModal) confirmationModal.style.display = "none";
  });
  if (confirmationClose) confirmationClose.addEventListener("click", () => {
    if (confirmationModal) confirmationModal.style.display = "none";
  });
  if (confirmBtn) {
    confirmBtn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      await performSubmitFlow();
    });
  }
  if (modalOkBtn) {
    modalOkBtn.addEventListener("click", () => {
      if (successModal) successModal.style.display = "none";
      window.location.reload();
    });
  }
});
