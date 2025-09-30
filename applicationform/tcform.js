/* tcform.js - Full file (OCR autofill, uploads, modal + success flow)
   Replace your current tcform.js with this file.
*/

/*  Firebase & Supabase  */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { firebaseConfig } from "../firebase-config.js";
import { supabase } from "../supabase-config.js";

// init firebase (client only for future client needs)
const app = initializeApp(firebaseConfig);

/* ----------------- Helpers ----------------- */
// generate a random lowercase+digit string
function randStr(len = 6) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function safePart(s = "") {
  return s.toLowerCase()
    .replace(/@/g, "-at-")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/* ---------- OCR / PDF helpers ---------- */
const PDFJS_VERSION = "2.16.105";
const TESSERACT_VERSION = "v4.0.2";

async function loadPDF() {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
    return window.pdfjsLib;
  }
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Failed to load PDF.js from CDN."));
    document.head.appendChild(s);
  });
  if (!window.pdfjsLib) throw new Error("PDF.js loaded but pdfjsLib missing.");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
  return window.pdfjsLib;
}

async function loadTess() {
  if (window.Tesseract) return window.Tesseract;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/tesseract.min.js`;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Failed to load Tesseract.js from CDN."));
    document.head.appendChild(s);
  });
  if (!window.Tesseract) throw new Error("Tesseract loaded but missing.");
  return window.Tesseract;
}

async function ocrCanvas(canvas, onProgress = null) {
  const T = await loadTess();
  const worker = T.createWorker({ logger: onProgress || (() => {}) });
  await worker.load();
  await worker.loadLanguage('eng');
  await worker.initialize('eng');
  const { data } = await worker.recognize(canvas);
  await worker.terminate();
  return data?.text || "";
}

async function renderPdfAndOcr(page, scale = 2, onProgress = null) {
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return await ocrCanvas(canvas, onProgress);
}

async function extractPdfText(file, onProgress = null) {
  const pdfjsLib = await loadPDF();
  const fr = new FileReader();
  return new Promise((resolve, reject) => {
    fr.onload = async function () {
      try {
        const arr = new Uint8Array(this.result);
        const pdf = await pdfjsLib.getDocument(arr).promise;
        let allText = "";
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          const txt = content.items.map(i => i.str).join(" ").trim();
          allText += txt + "\n";
        }
        const MIN_LEN = 80;
        if ((allText.trim().length < MIN_LEN) && pdf.numPages > 0) {
          try {
            const page = await pdf.getPage(1);
            const ocrText = await renderPdfAndOcr(page, 2, onProgress);
            allText = (allText + "\n" + ocrText).trim();
          } catch (ocrErr) {
            console.warn("PDF OCR fallback failed:", ocrErr);
          }
        }
        resolve(allText);
      } catch (err) {
        reject(err);
      }
    };
    fr.onerror = () => reject(new Error("Failed to read file."));
    fr.readAsArrayBuffer(file);
  });
}

async function extractImageText(file, onProgress = null) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async function () {
      try {
        const canvas = document.createElement("canvas");
        const maxDim = 2000;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (Math.max(w, h) > maxDim) {
          const scale = maxDim / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const text = await ocrCanvas(canvas, onProgress);
        resolve(text);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Failed to load image for OCR."));
    img.src = URL.createObjectURL(file);
  });
}

/* ---------- Autofill / parsing helpers ---------- */
function birthdate(s) {
  const months = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };
  const pad = n => String(n).padStart(2, "0");
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/); if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) { const a = +m[1], b = +m[2], y = m[3]; return a > 12 ? `${y}-${pad(b)}-${pad(a)}` : `${y}-${pad(a)}-${pad(b)}`; }
  m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})$/);
  if (m) { const mo = months[m[1].toLowerCase()]; if (mo) return `${m[3]}-${pad(mo)}-${pad(m[2])}`; }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+),?\s*(\d{4})$/);
  if (m) { const mo = months[m[2].toLowerCase()]; if (mo) return `${m[3]}-${pad(mo)}-${pad(m[1])}`; }
  return s;
}

/**
 * autoFillFromText
 * Tries to extract: name, email, phone, birthdate, license number, license expiry,
 * institution, degree/major. Writes into existing inputs ONLY if user hasn't edited them.
 */
function autoFillFromText(text) {
  if (!text || !text.trim()) return;
  const raw = text.replace(/\r/g, ' ').replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();

  // 1) Name
  const labeledName =
    raw.match(/(?:Applicant(?:'s)?\s+)?(?:Full|Complete|Name)\s*[:\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i)
    || raw.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/);
  const nameStr = (labeledName && labeledName[1]) ? labeledName[1].trim() : "";
  if (nameStr) {
    const parts = nameStr.split(/\s+/);
    const fn = parts[0] || "";
    const ln = parts.length > 1 ? parts[parts.length - 1] : "";
    const mid = parts.length > 2 ? parts.slice(1, -1).join(" ") : "";
    const firstEl = document.getElementById("first-name");
    const lastEl = document.getElementById("last-name");
    const midEl = document.getElementById("middle-name");
    if (firstEl && firstEl.dataset.userEdited !== 'true' && !firstEl.value) firstEl.value = fn;
    if (lastEl && lastEl.dataset.userEdited !== 'true' && !lastEl.value) lastEl.value = ln;
    if (midEl && midEl.dataset.userEdited !== 'true' && !midEl.value) midEl.value = mid;
  }

  // 2) Email
  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) {
    const emailEl = document.getElementById("email");
    if (emailEl && emailEl.dataset.userEdited !== 'true' && !emailEl.value) {
      emailEl.value = emailMatch[0].toLowerCase();
    }
  }

  // 3) Phone
  const phoneMatch = raw.match(/(\+?\d{1,3}[\s-\.]?)?(?:\(?\d{2,4}\)?[\s-\.]?)\d{3,4}[\s-\.]?\d{3,4}/);
  if (phoneMatch) {
    const phone = phoneMatch[0].replace(/[^\d+]/g, '');
    const phoneEl = document.getElementById("contact-number");
    if (phoneEl && phoneEl.dataset.userEdited !== 'true' && !phoneEl.value) {
      phoneEl.value = phone;
    }
  }

  // 4) Birthdate
  const dateMatch = raw.match(/\b(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|\d{1,2}[-\/]\d{1,2}[-\/]\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s*\d{4}|\d{1,2}\s+[A-Za-z]{3,9},?\s*\d{4})\b/);
  if (dateMatch) {
    const bdVal = birthdate(dateMatch[1]);
    const bdEl = document.getElementById("birthdate");
    if (bdEl && bdEl.dataset.userEdited !== 'true' && !bdEl.value) {
      bdEl.value = bdVal;
    }
  }

  // 5) License number & expiry
  const licMatch = raw.match(/\b(?:License|Licence|Lic\.)\s*(?:No\.?|Number|#)?\s*[:\-]?\s*([A-Z0-9\-]{4,20})\b/i);
  if (licMatch) {
    const licEl = document.getElementById("license-number");
    if (licEl && licEl.dataset.userEdited !== 'true' && !licEl.value) licEl.value = licMatch[1].trim();
  }
  const licExpMatch = raw.match(/\b(?:Expiry|Expiration|Exp|EXP|Expires)\s*(?:Date|:)?\s*[:\-]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|[A-Za-z]+\s+\d{1,2},?\s*\d{4})\b/);
  if (licExpMatch) {
    const val = birthdate(licExpMatch[1]);
    const el = document.getElementById("license-expiry");
    if (el && el.dataset.userEdited !== 'true' && !el.value) el.value = val;
  }

  // 6) Degree / Institution
  const degreeMatch = raw.match(/\b(Bachelor(?:'s)?|Bachelor of|B\.?A\.?|B\.?S\.?|Master(?:'s)?|M\.?A\.?|M\.?S\.?|Doctor|Ph\.?D\.?)\b/i);
  if (degreeMatch) {
    const degEl = document.getElementById("highest-degree");
    if (degEl && degEl.dataset.userEdited !== 'true' && !degEl.value) degEl.value = degreeMatch[0];
  }
  const instMatch = raw.match(/\b([A-Z][\w&\s,.-]{3,60}\b(?:University|College|Institute|School|Academy|Center))\b/i);
  if (instMatch) {
    const instEl = document.getElementById("institution");
    if (instEl && instEl.dataset.userEdited !== 'true' && !instEl.value) instEl.value = instMatch[0].trim();
  }

  // 7) Major/qualified subjects
  const majorMatch = raw.match(/\bMajor\s*[:\-]?\s*([A-Za-z &\/\-]{3,60})\b/i) || raw.match(/\b(?:Field of Study|Specialization)\s*[:\-]?\s*([A-Za-z &\/\-]{3,60})\b/i);
  if (majorMatch) {
    const majorEl = document.getElementById("major");
    if (majorEl && majorEl.dataset.userEdited !== 'true' && !majorEl.value) majorEl.value = majorMatch[1].trim();
  }
}

/* ---------- in-memory upload state ---------- */
const uploads = {}; // e.g. { resume: { file, name }, license: {...} }

/* ---------------- DOM wiring and submit handling ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  // DOM refs
  const resumeIn = document.getElementById("resume-upload");
  const resumeBtn = document.getElementById("browse-btn");
  const resumeLabel = document.getElementById("file-name");
  const progBar = document.getElementById("progress-bar");
  const progFill = document.getElementById("progress-fill");
  const progText = document.getElementById("progress-text");
  const submitBtn = document.getElementById("submit-btn");

  const licenseIn = document.getElementById("license-upload");
  const transcriptIn = document.getElementById("transcript-upload");
  const cvIn = document.getElementById("cv-upload");

  // inputs protect from overwrite
  const firstIn = document.getElementById("first-name");
  const lastIn = document.getElementById("last-name");
  const midIn = document.getElementById("middle-name");

  [firstIn, lastIn, midIn].forEach(el => {
    if (!el) return;
    el.addEventListener("input", () => { el.dataset.userEdited = 'true'; });
  });

  async function handleFileSelect(el, key) {
    if (!el || !el.files || el.files.length === 0) return;
    const file = el.files[0];
    uploads[key] = { file, name: file.name };
    const labelSpan = document.querySelector(`label[for="${el.id}"] .file-input-text`);
    if (labelSpan) labelSpan.textContent = `Selected: ${file.name}`;

    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isImage = /^image\//.test(file.type) || /\.(jpe?g|png|bmp|tiff?)$/i.test(file.name);

    if (isPdf) {
      try {
        if (progText) progText.textContent = "Reading PDF content...";
        const txt = await extractPdfText(file, (p) => {
          try { if (progText) progText.textContent = `OCR progress: ${Math.round((p.progress||0)*100)}%`; } catch(e){}
        });
        if (txt && txt.trim().length) {
          try { autoFillFromText(txt); } catch (e) { console.warn('autoFillFromText failed', e); }
        }
      } catch (err) {
        console.warn("PDF extraction failed:", err);
      } finally {
        if (progText) progText.textContent = "Ready to upload on submit!";
      }
    } else if (isImage) {
      try {
        if (progText) progText.textContent = "Running OCR on image...";
        const txt = await extractImageText(file, (p) => {
          try { if (progText) progText.textContent = `OCR progress: ${Math.round((p.progress||0)*100)}%`; } catch(e){}
        });
        if (txt && txt.trim().length) {
          try { autoFillFromText(txt); } catch (e) { console.warn('autoFillFromText failed', e); }
        }
      } catch (err) {
        console.warn("Image OCR failed:", err);
      } finally {
        if (progText) progText.textContent = "Ready to upload on submit!";
      }
    } else {
      if (progText) progText.textContent = "File selected (no OCR attempted).";
    }
  }

  if (licenseIn) licenseIn.addEventListener("change", () => handleFileSelect(licenseIn, "license"));
  if (transcriptIn) transcriptIn.addEventListener("change", () => handleFileSelect(transcriptIn, "transcript"));
  if (cvIn) cvIn.addEventListener("change", () => handleFileSelect(cvIn, "cv"));

  if (resumeBtn && resumeIn) resumeBtn.addEventListener("click", () => resumeIn.click());

  if (resumeIn) resumeIn.addEventListener("change", async function () {
    if (!this.files.length) return;
    const f = this.files[0];
    uploads.resume = { file: f, name: f.name };
    if (resumeLabel) resumeLabel.textContent = `Selected: ${f.name}`;
    if (progBar) progBar.style.display = "block";
    if (progFill) progFill.style.width = "0%";
    if (progText) progText.textContent = "Ready to upload on submit...";
    await handleFileSelect(this, "resume");
    if (progFill) progFill.style.width = "100%";
    if (progText) progText.textContent = "Ready to upload on submit!";
  });

  /* ---------- Confirmation modal wiring (keeps your existing elements) ---------- */
  const confirmationModal = document.getElementById('confirmation-modal');
  const confirmationClose = document.getElementById('confirmation-close');
  const modalCancel = document.getElementById('modal-cancel-btn');
  const modalConfirmBtn = document.getElementById('modal-confirm-btn');

  const emailInput = document.getElementById('confirm-email-input'); // editable input you added
  const btnGetCode = document.getElementById('btn-get-code');
  const countdownSpan = document.getElementById('confirmation-countdown');
  const codeBlock = document.getElementById('confirmation-code-block'); // visible by default in your HTML
  const codeInput = document.getElementById('confirm-code-input');
  const btnConfirmCode = document.getElementById('btn-confirm-code');
  const btnResend = document.getElementById('btn-resend');
  const confirmError = document.getElementById('confirm-error');

  const successCard = document.getElementById('success-message');
  const successOkay = successCard ? successCard.querySelector('.okay-btn') : null;

  function showModal() { if (confirmationModal) confirmationModal.style.display = 'block'; }
  function hideModal() { if (confirmationModal) confirmationModal.style.display = 'none'; }

  confirmationClose?.addEventListener('click', hideModal);
  modalCancel?.addEventListener('click', hideModal);

  // countdown state
  let countdownTimer = null;
  function startCountdown(seconds) {
    if (!countdownSpan) return;
    let remaining = Math.max(0, Math.floor(Number(seconds) || 0));
    countdownSpan.style.display = 'inline';
    function tick() {
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        countdownSpan.style.display = 'none';
        if (btnGetCode) { btnGetCode.disabled = false; btnGetCode.textContent = 'Get code'; }
        if (btnResend) btnResend.disabled = false;
        return;
      }
      const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
      const ss = String(remaining % 60).padStart(2, '0');
      countdownSpan.textContent = `Resend in ${mm}:${ss}`;
      remaining--;
    }
    if (btnGetCode) { btnGetCode.disabled = true; }
    if (btnResend) btnResend.disabled = true;
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  // server calls
  async function sendCode(applicationId, email) {
    if (!applicationId || !email) {
      if (confirmError) confirmError.textContent = 'Missing application context or email.';
      return;
    }
    if (!btnGetCode) return;
    btnGetCode.disabled = true;
    btnGetCode.textContent = 'Sending...';
    if (confirmError) confirmError.textContent = '';
    try {
      const r = await fetch('/applicants/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, email })
      });

      if (r.status === 429) {
        const j = await r.json().catch(() => ({}));
        const retry = j && (j.retryAfter || j.nextAllowedIn) ? Number(j.retryAfter || j.nextAllowedIn) : 180;
        if (btnGetCode) { btnGetCode.disabled = false; btnGetCode.textContent = 'Get code'; }
        startCountdown(retry);
        if (confirmError) confirmError.textContent = j && (j.error || j.message) ? (j.error || j.message) : 'Please wait before resending.';
        return;
      }

      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        const msg = j && (j.error || j.message) ? (j.error || j.message) : 'Failed to send code.';
        if (countdownSpan) {
          countdownSpan.style.display = 'block';
          countdownSpan.textContent = msg;
        } else if (confirmError) confirmError.textContent = msg;
        if (btnGetCode) { btnGetCode.disabled = false; btnGetCode.textContent = 'Get code'; }
        const after = (j && (j.nextAllowedIn || j.retryAfter)) ? Number(j.nextAllowedIn || j.retryAfter) : 180;
        startCountdown(after);
        return;
      }

      // Success -> show code input block and start cooldown
      if (codeBlock) codeBlock.style.display = 'block';
      if (codeInput) codeInput.focus();
      if (btnGetCode) btnGetCode.textContent = 'Sent';
      const after = (j && j.nextAllowedIn) ? Number(j.nextAllowedIn) : 180;
      startCountdown(after);
    } catch (err) {
      console.error('sendCode error', err);
      if (btnGetCode) { btnGetCode.disabled = false; btnGetCode.textContent = 'Get code'; }
      if (confirmError) confirmError.textContent = 'Network error. Try again.';
    }
  }

  async function verifyCode(applicationId, email, code, displayName) {
    if (confirmError) confirmError.textContent = '';
    if (!code || code.trim().length < 6) {
      if (confirmError) confirmError.textContent = 'Please enter the 6-digit code.';
      return;
    }
    if (!btnConfirmCode) return;
    btnConfirmCode.disabled = true;
    const orig = btnConfirmCode.textContent;
    btnConfirmCode.textContent = 'Verifying...';

    try {
      const resp = await fetch('/applicants/confirm-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, email, code, displayName })
      });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok || !j.ok) {
        const msg = j && (j.error || j.message) ? (j.error || j.message) : 'Verification failed.';
        if (confirmError) confirmError.textContent = msg;
        btnConfirmCode.disabled = false;
        btnConfirmCode.textContent = orig || 'Confirm';
        return;
      }

      // Success: show success UI
      if (successCard) {
        successCard.style.display = 'block';
      } else {
        alert('Application submitted and credentials emailed.');
      }

      if (j && j.emailed === false) {
        const note = successCard ? successCard.querySelector('.email-note') : null;
        if (note) note.textContent = 'Account created but email delivery failed. Contact support.';
        else alert('Account created but email delivery failed. Contact support.');
      }

      btnConfirmCode.disabled = false;
      btnConfirmCode.textContent = orig || 'Confirm';
    } catch (err) {
      console.error('verifyCode error', err);
      if (confirmError) confirmError.textContent = 'Network error. Try again later.';
      btnConfirmCode.disabled = false;
      btnConfirmCode.textContent = orig || 'Confirm';
    }
  }

  // Wire modal buttons
  if (btnGetCode) {
    btnGetCode.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (!window._currentApplicationId) {
        if (confirmError) confirmError.textContent = 'Application context missing. Please submit the form first.';
        return;
      }
      const email = (emailInput && emailInput.value && emailInput.value.trim()) ? emailInput.value.trim() : '';
      if (!email) {
        if (confirmError) confirmError.textContent = 'Please enter your email address.';
        return;
      }
      sendCode(window._currentApplicationId, email);
    });
  }

  if (btnResend) {
    btnResend.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (!window._currentApplicationId) {
        if (confirmError) confirmError.textContent = 'Application context missing.';
        return;
      }
      const email = (emailInput && emailInput.value && emailInput.value.trim()) ? emailInput.value.trim() : '';
      sendCode(window._currentApplicationId, email);
    });
  }

  if (btnConfirmCode) {
    btnConfirmCode.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (!window._currentApplicationId) {
        if (confirmError) confirmError.textContent = 'Application context missing.';
        return;
      }
      const email = (emailInput && emailInput.value && emailInput.value.trim()) ? emailInput.value.trim() : '';
      const code = (codeInput && codeInput.value) ? codeInput.value.trim() : '';
      const displayName = `${document.getElementById('first-name').value || ''} ${document.getElementById('last-name').value || ''}`.trim();
      verifyCode(window._currentApplicationId, email, code, displayName);
    });
  }

  // Map modal Confirm button to code verification too
  if (modalConfirmBtn) {
    modalConfirmBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (btnConfirmCode) btnConfirmCode.click();
    });
  }

  // Open confirmation modal
  function openConfirmationModal(applicationId, emailPrefill) {
    window._currentApplicationId = applicationId;
    if (emailInput) emailInput.value = emailPrefill || '';
    if (codeBlock) codeBlock.style.display = 'block'; // show by default as you requested
    if (confirmError) confirmError.textContent = '';
    if (countdownSpan) { countdownSpan.style.display = 'none'; countdownSpan.textContent = ''; }
    if (btnGetCode) { btnGetCode.disabled = false; btnGetCode.textContent = 'Get code'; }
    if (btnResend) btnResend.disabled = false;
    showModal();
  }

  /* ---------- Submit handler ---------- */
  if (submitBtn) submitBtn.addEventListener("click", async (ev) => {
    ev.preventDefault();

    // read fields
    const ln = document.getElementById("last-name").value.trim();
    const fn = document.getElementById("first-name").value.trim();
    const mn = document.getElementById("middle-name").value.trim();
    const ext = document.getElementById("name-extension").value;
    const phone = document.getElementById("contact-number").value.trim();
    const userEmail = document.getElementById("email").value.trim();
    const bd = document.getElementById("birthdate").value;
    const addr = document.getElementById("address").value.trim();
    const degree = document.getElementById("highest-degree").value;
    const major = document.getElementById("major").value.trim();
    const grad = document.getElementById("grad-year").value;
    const inst = document.getElementById("institution").value.trim();
    const exp = document.getElementById("experience-years").value;
    const prev = document.getElementById("previous-schools").value.trim();
    const licNo = document.getElementById("license-number").value.trim();
    const licExp = document.getElementById("license-expiry").value;
    const pref = document.getElementById("preferred-level").value;
    const subjects = document.getElementById("qualified-subjects").value.trim();
    const empType = document.getElementById("employment-type").value;

    // basic validation
    if (!fn || !ln || !userEmail) {
      alert('Please fill required fields (first name, last name, email).');
      return;
    }

    const payload = {
      formType: "teacher",
      lastName: ln,
      firstName: fn,
      middleName: mn,
      nameExtension: ext,
      contactNumber: phone,
      email: userEmail,
      birthdate: bd,
      address: addr,
      highestDegree: degree,
      major,
      gradYear: grad,
      institution: inst,
      experienceYears: exp,
      previousSchools: prev,
      licenseNumber: licNo,
      licenseExpiry: licExp,
      preferredLevel: pref,
      qualifiedSubjects: subjects,
      employmentType: empType
    };

    // disable submit button while creating application
    submitBtn.disabled = true;
    const origText = submitBtn.textContent;
    submitBtn.textContent = 'Submitting…';

    try {
      // Call server to create application (server must NOT create Auth user nor send credentials)
      const res = await fetch("/applicants/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) {
        console.error("Server creation error:", result);
        alert("Server error: " + (result.error || "Failed to create applicant"));
        submitBtn.disabled = false;
        submitBtn.textContent = origText;
        return;
      }

      const applicationId = result.applicationId;
      // upload files to supabase in folder last-applicationId
      const safeLast = safePart(ln || "unknown");
      const folder = `${safeLast}-${applicationId}`;
      const bucket = "uploads";
      const uploadedFiles = [];

      async function uploadFinal(fileObj, name) {
        if (!fileObj) return null;
        const stamp = `${Date.now()}_${name}`;
        const path = `teacherApplicants/${folder}/${stamp}`;
        const { error: uErr } = await supabase.storage.from(bucket).upload(path, fileObj, { cacheControl: "3600", upsert: true });
        if (uErr) {
          console.error("Upload failed:", path, uErr);
          return null;
        }
        const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
        return { fileName: name, fileUrl: pub.publicUrl, filePath: path };
      }

      for (const k of Object.keys(uploads)) {
        const entry = uploads[k];
        if (!entry || !entry.file) continue;
        const up = await uploadFinal(entry.file, entry.name || `${k}.dat`);
        if (up) uploadedFiles.push(up);
      }

      // call server to attach files to application (server will write to Firestore)
      try {
        await fetch(`/applicants/${encodeURIComponent(applicationId)}/attach-files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: uploadedFiles })
        }).catch(() => {});
      } catch (_) { /* non-fatal */ }

      // cleanup UI & state (but keep form fields — user confirms via modal)
      Object.keys(uploads).forEach(k => delete uploads[k]);
      if (resumeIn) resumeIn.value = "";
      if (licenseIn) licenseIn.value = "";
      if (transcriptIn) transcriptIn.value = "";
      if (cvIn) cvIn.value = "";
      if (resumeLabel) resumeLabel.textContent = "";
      if (progBar) progBar.style.display = "none";

      // Open confirmation modal so applicant can confirm the email and get code
      openConfirmationModal(applicationId, userEmail);

    } catch (err) {
      console.error("Error submitting application:", err);
      alert("Failed to submit application. Please try again later.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = origText;
    }
  });

  /* ---------- Success card OK button: clear form & close ---------- */
  function clearFormAndResetUI() {
    // clear text inputs
    const inputs = document.querySelectorAll("input[type=text], input[type=email], input[type=tel], input[type=date], input[type=number], textarea");
    inputs.forEach(i => {
      try { i.value = ""; i.dataset.userEdited = 'false'; } catch(e) {}
    });
    // clear selects
    const selects = document.querySelectorAll("select");
    selects.forEach(s => { try { s.selectedIndex = 0; } catch(e) {} });

    // reset file inputs and in-memory uploads
    const fileInputs = document.querySelectorAll("input[type=file]");
    fileInputs.forEach(f => { try { f.value = ""; } catch(e) {} });

    // reset custom UI elements
    const resumeLabel = document.getElementById("file-name");
    if (resumeLabel) resumeLabel.textContent = "";
    const progBar = document.getElementById("progress-bar");
    const progFill = document.getElementById("progress-fill");
    const progText = document.getElementById("progress-text");
    if (progBar) progBar.style.display = "none";
    if (progFill) progFill.style.width = "0%";
    if (progText) progText.textContent = "";

    // clear in-memory upload state
    try {
      Object.keys(uploads).forEach(k => delete uploads[k]);
    } catch (e) { console.warn("clear uploads error", e); }

    // hide modal and success card
    if (successCard) successCard.style.display = 'none';
    hideModal();
  }

  if (successOkay) {
    successOkay.addEventListener('click', (ev) => {
      ev.preventDefault();
      clearFormAndResetUI();
    });
  }

}); 
