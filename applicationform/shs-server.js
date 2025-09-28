// shs-server.js (client-side module)

import { supabase } from "../supabase-config.js"; // adjust path if needed

document.addEventListener("DOMContentLoaded", () => {
  const submitTrigger = document.getElementById("submit-btn");
  const confirmationModal = document.getElementById("confirmation-modal");
  const confirmBtn = document.getElementById("modal-confirm-btn");
  const cancelBtn = document.getElementById("modal-cancel-btn");
  const confirmationClose = document.getElementById("confirmation-close");
  const successModal = document.getElementById("success-modal");
  const modalOkBtn = document.getElementById("modal-ok-btn");

  // Map file slots to the input element IDs used in your HTML
  const slotToInputId = {
    reportcard: "reportcard-upload",
    psa: "psa-upload",
    goodMoral: "good-moral-upload",
    form137: "form-137",
    completionCertificate: "completion-certificate",
    clearance: "clearance-upload"
  };

  // Helper: return file input element for a slot
  function fileInputFor(slot) {
    const id = slotToInputId[slot];
    return id ? document.getElementById(id) : null;
  }

  // Helper: create or get a status container next to a file input
  function getOrCreateStatusContainer(slot) {
    const input = fileInputFor(slot);
    if (!input) return null;

    // prefer the .file-input-container wrapper if available
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

  // Simple text-only render status
  function renderStatus(slot, { state = "idle", file = null, message = "" } = {}) {
    const container = getOrCreateStatusContainer(slot);
    if (!container) return;
    container.textContent = ""; // clear

    // Choose message based on state
    let text = "";
    if (state === "selected") {
      text = file ? `Selected: ${file.name}` : "Selected";
    } else if (state === "uploading") {
      text = file ? `Uploading: ${file.name}` : "Uploading...";
    } else if (state === "success") {
      text = file ? `Uploaded: ${file.name}` : "Uploaded";
    } else if (state === "error") {
      text = message || "Upload error";
    } else {
      text = message || "";
    }

    container.textContent = text;
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

  // Add immediate "Selected" listeners to file inputs
  for (const slot of Object.keys(slotToInputId)) {
    const input = fileInputFor(slot);
    if (!input) continue;
    input.addEventListener("change", (e) => {
      const f = input.files?.[0] || null;
      if (f) {
        renderStatus(slot, { state: "selected", file: f });
      } else {
        // cleared
        const container = getOrCreateStatusContainer(slot);
        if (container) container.textContent = "";
      }
    });
  }

  // Collect metadata and files from the form
  function collectFormDataAndFiles() {
  const getVal = (id) => document.getElementById(id)?.value?.trim() || "";

    const metadata = {
      formType: "shs",
      firstName: getVal("first-name"),
      lastName: getVal("last-name"),
      middleName: getVal("middle-name"),
      birthdate: getVal("birth-date"),
      email: getVal("email-address"),
      gender: getVal("gender"),
      gradeLevel: getVal("grade-level"),
      academicTrack: getVal("academic-track"),
      address: getVal("address"),
      contactNumber: getVal("contact-number"),
      completionYear: getVal("completion-year"),
      studentType: document.querySelector('input[name="student-type"]:checked')?.value || "",
      previousSchool: getVal("previous-school"),
      studentNumber: getVal("student-number")
    };

    const files = {
      reportcard: document.getElementById("reportcard-upload")?.files?.[0] || null,
      psa: document.getElementById("psa-upload")?.files?.[0] || null,
      goodMoral: document.getElementById("good-moral-upload")?.files?.[0] || null,
      form137: document.getElementById("form-137")?.files?.[0] || null,
      completionCertificate: document.getElementById("completion-certificate")?.files?.[0] || null,
      clearance: document.getElementById("clearance-upload")?.files?.[0] || null
    };

    // Build an array of requested files for server (slot + original filename)
    const requestedFiles = [];
    for (const slot of Object.keys(files)) {
      if (files[slot]) requestedFiles.push({ slot, name: files[slot].name });
    }
    metadata.requestedFiles = requestedFiles;
    return { metadata, files };
  }

  // Main submit workflow
  async function performSubmitFlow() {
    // optional: check client-side age validation if available
    if (typeof window.validateAge === "function") {
      const ok = window.validateAge();
      if (!ok) {
        return;
      }
    }

    if (confirmBtn) confirmBtn.disabled = true;
    const origConfirmText = confirmBtn?.textContent || "Confirm";
    if (confirmBtn) confirmBtn.textContent = "Submitting...";

    try {
      const { metadata, files } = collectFormDataAndFiles();

      // 1) Create enrollee server-side and get signed tokens
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
      const uploadTokens = createResult.uploadTokens || {}; // { slot: { token, path, signedUrl } }

      // 2) Upload each file using tokens
      const uploadedFilesMeta = [];
      for (const slot of Object.keys(uploadTokens)) {
        const info = uploadTokens[slot];
        if (!info || !info.token || !info.path) continue;
        const fileObj = files[slot];
        if (!fileObj) {
          // no file selected for this slot
          continue;
        }

        // update UI -> Uploading
        renderStatus(slot, { state: "uploading", file: fileObj });

        try {
          // upload via supabase client to signed url
          const { data, error } = await supabase
            .storage
            .from("uploads")
            .uploadToSignedUrl(info.path, info.token, fileObj);

          if (error) {
            renderStatus(slot, { state: "error", file: fileObj, message: error.message || "Upload failed" });
            throw new Error(`Upload failed for ${slot}: ${error.message || JSON.stringify(error)}`);
          }

          // success
          renderStatus(slot, { state: "success", file: fileObj });

          uploadedFilesMeta.push({
            slot,
            name: fileObj.name,
            size: fileObj.size,
            type: fileObj.type,
            path: info.path
          });
        } catch (uploadErr) {
          console.error("Upload exception:", uploadErr);
          throw uploadErr;
        }
      }

      // 3) Finalize: tell server which files uploaded
      const finalizeResp = await fetch(`/api/enrollees/${encodeURIComponent(studentId)}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: uploadedFilesMeta })
      });

      if (!finalizeResp.ok) {
        const body = await finalizeResp.json().catch(() => ({}));
        throw new Error(body.error || `Finalize failed ${finalizeResp.status}`);
      }

      const finalizeResult = await finalizeResp.json();

      // show success modal
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

  // Wire up modal & buttons
  if (submitTrigger) {
    submitTrigger.addEventListener("click", (e) => {
      e.preventDefault();
      if (typeof window.validateAge === "function" && !window.validateAge()) {
        return;
      }
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
