// shs-server.js (updated client-side)
document.addEventListener("DOMContentLoaded", () => {
  const submitTrigger = document.getElementById("submit-btn");
  const confirmationModal = document.getElementById("confirmation-modal");
  const confirmBtn = document.getElementById("modal-confirm-btn");
  const cancelBtn = document.getElementById("modal-cancel-btn");
  const confirmationClose = document.getElementById("confirmation-close");
  const successModal = document.getElementById("success-modal");
  const modalOkBtn = document.getElementById("modal-ok-btn");

  const slotToInputId = {
    reportcard: "reportcard-upload",
    psa: "psa-upload",
    goodMoral: "good-moral-upload",
    form137: "form-137",
    completionCertificate: "completion-certificate",
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

  function renderStatus(slot, { state = "idle", file = null, message = "" } = {}) {
    const container = getOrCreateStatusContainer(slot);
    if (!container) return;
    container.textContent = "";
    let text = "";
    if (state === "selected") text = file ? `Selected: ${file.name}` : "Selected";
    else if (state === "uploading") text = file ? `Uploading: ${file.name}` : "Uploading...";
    else if (state === "success") text = file ? `Uploaded: ${file.name}` : "Uploaded";
    else if (state === "error") text = message || "Upload error";
    else text = message || "";
    container.textContent = text;
  }

  for (const slot of Object.keys(slotToInputId)) {
    const input = fileInputFor(slot);
    if (!input) continue;
    input.addEventListener("change", () => {
      const f = input.files?.[0] || null;
      if (f) {
        renderStatus(slot, { state: "selected", file: f });
      } else {
        const container = getOrCreateStatusContainer(slot);
        if (container) container.textContent = "";
      }
    });
  }

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

  async function performSubmitFlow() {
    if (typeof window.validateAge === "function") {
      const ok = window.validateAge();
      if (!ok) return;
    }

    if (confirmBtn) confirmBtn.disabled = true;
    const origConfirmText = confirmBtn?.textContent || "Confirm";
    if (confirmBtn) confirmBtn.textContent = "Submitting...";

    try {
      const { metadata, files } = collectFormDataAndFiles();

      // 1) Create enrollee server-side
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

      // 2) For each requested slot that has a file, upload to server endpoint (server will push to Supabase)
      const uploadedFilesMeta = [];
      for (const slot of Object.keys(uploadTokens)) {
        const info = uploadTokens[slot];
        if (!info) continue;
        const fileObj = files[slot];
        if (!fileObj) {
          // no file selected for slot (server will still have a planned path, but nothing uploaded)
          continue;
        }

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
          name: upResult.fileName || (fileObj && fileObj.name) || "",
          size: upResult.size || (fileObj && fileObj.size) || 0,
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

      const finalizeResult = await finalizeResp.json();

      // show success UI
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
