/*  Firebase & Supabase  */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { firebaseConfig } from "../firebase-config.js";
import { supabase } from "../supabase-config.js";

// init firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Helpers
// generate a random lowercase+digit string
function randStr(len = 6) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// build an email from last name + rand suffix
function makeEmail(last) {
  return `${(last || "user").toLowerCase()}${randStr(4)}@hfa-applicants.com`;
}

// make a random password
function makePassword() {
  return randStr(10);
}

// safe folder name for storage
function safePart(s = "") {
  return s.toLowerCase()
    .replace(/@/g, "-at-")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ---------- OCR / PDF helpers ----------

const PDFJS_VERSION = "2.16.105";
const TESSERACT_VERSION = "v4.0.2";

// load PDF.js library dynamically
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

// load Tesseract.js dynamically
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

// run OCR on a canvas and return extracted text
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

// render a PDF page to canvas and OCR it
async function renderPdfAndOcr(page, scale = 2, onProgress = null) {
  const vp = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return await ocrCanvas(canvas, onProgress);
}

// extract text from PDF
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

// extract text from an image using OCR
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

// ---------- Autofill / parsing helpers ----------

//date formats into YYYY-MM-DD
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

// parse text and autofill form fields (skip fields the user already typed)
function autoFillFromText(text) {
  // try to find labeled or fallback full name
  const labeledName =
    text.match(/(?:Applicant['’]s?\s+)?(?:Full|Complete|Name)\s*[:\-]*\s*((?:[A-Z][a-z]+(?:['’][A-Z][a-z]+)?\s+){1,4})(?=\s*(?:[A-Z]|$))/i) || null;
  const fallbackName = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/);

  // address detection (PH-focused)
  const labeledAddress =
    text.match(/(?:(?:Current|Present|Permanent|Residential)\s+)?Address\s*[:\-]*\s*((?:\b(?:Brgy|Sitio)\.?\s+[\w\s]+?,?\s*){1,2}(?:\d{1,4}[A-Z]?\s+)?[\w\s.,#-]+?(?:,\s*(?:City\s+of\s+)?[A-Z][\w\s-]+)?(?:,\s*(?:\d{4}\s+)?[A-Z]{2,})?)/i) || null;

  // phone patterns
  const phoneRx = [
    /\b(?:\+?63[\s-]?|0)?(?:9\d{2}[\s-]?\d{3}[\s-]?\d{4}|2\d{3}[\s-]?\d{4})\b/,
    /\b\(?(?:0\d{2})\)?[\s-]?\d{3}[\s-]?\d{4}\b/,
    /\b\d{4}[\s-]?\d{3}[\s-]?\d{4}\b/
  ];

  // date patterns
  const dateRx = [
    /\b\d{4}[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12][0-9]|3[01])\b/,
    /\b(0[1-9]|[12][0-9]|3[01])[-/](0[1-9]|1[0-2])[-/]\d{4}\b/,
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s,-]+(\d{1,2})(?:th|st|nd|rd)?[\s,-]+(\d{4})\b/i,
    /\b(\d{1,2})[\s-]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s-]+(\d{4})\b/i
  ];

  // pull name string
  const nameStr = (labeledName?.[1] || fallbackName?.[1] || "").trim();
  if (nameStr) {
    const parts = nameStr.split(/\s+/);
    const fn = parts[0] || "";
    const ln = parts.length > 1 ? parts[parts.length - 1] : "";
    const mid = parts.length > 2 ? parts.slice(1, -1).join(" ") : "";
    const firstEl = document.getElementById("first-name");
    const lastEl = document.getElementById("last-name");
    const midEl = document.getElementById("middle-name");
    if (firstEl && firstEl.dataset.userEdited !== 'true') firstEl.value = fn;
    if (lastEl && lastEl.dataset.userEdited !== 'true') lastEl.value = ln;
    if (midEl && midEl.dataset.userEdited !== 'true') midEl.value = mid;
  }

  // phone
  let ph = null;
  for (const rx of phoneRx) { ph = text.match(rx); if (ph) break; }
  if (ph) {
    const phEl = document.getElementById("contact-number");
    if (phEl && phEl.dataset.userEdited !== 'true') phEl.value = ph[0];
  }

  // birthdate
  let bd = null;
  for (const rx of dateRx) { bd = text.match(rx); if (bd) break; }
  if (bd) {
    const bdNorm = birthdate(bd[0]);
    const bdEl = document.getElementById("birthdate");
    if (bdEl && bdEl.dataset.userEdited !== 'true') bdEl.value = bdNorm;
  }

  // address
  const addr = (labeledAddress?.[1] || "").trim();
  if (addr) {
    const aEl = document.getElementById("address");
    if (aEl && aEl.dataset.userEdited !== 'true') aEl.value = addr.replace(/\s{2,}/g, " ");
  }

  // education parsing (institution, major, subjects)
  const inst = text.match(/(?:University|College|School|Institution)\s*[:—-]+?\s*([A-Z][\w\s-]+(?:\s+University|\s+College)?)/i);
  const maj = text.match(/(?:Major|Specialization)\s*[:—-]+?\s*([A-Z][\w\s-]+)/i);
  const subj = text.match(/(?:Subjects? Qualified|Teaching Subjects)\s*[:—-]+?\s*((?:[A-Z][\w\s-]+,?\s*)+)/i);

  if (inst) {
    const el = document.getElementById("institution");
    if (el && el.dataset.userEdited !== 'true') el.value = inst[1];
  }
  if (maj) {
    const el = document.getElementById("major");
    if (el && el.dataset.userEdited !== 'true') el.value = maj[1];
  }
  if (subj) {
    const el = document.getElementById("qualified-subjects");
    if (el && el.dataset.userEdited !== 'true') {
      const vals = subj[1].split(/,\s*/).map(s => s.replace(/\b\w/g, c => c.toUpperCase())).join(", ");
      el.value = vals;
    }
  }
}

// ---------- in-memory upload state ----------
const uploads = {}; // e.g. { resume: { file, name }, license: {...} }

// ---------- DOM & events ----------
document.addEventListener("DOMContentLoaded", () => {
  // DOM references
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

  // mark these fields as user-edited when typing
  [firstIn, lastIn, midIn].forEach(el => {
    if (!el) return;
    el.addEventListener("input", () => { el.dataset.userEdited = 'true'; });
  });

  // shared handler when a file is selected (no upload yet)
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
        const txt = await extractPdfText(file, () => {});
        if (txt && txt.trim().length) autoFillFromText(txt);
      } catch (err) {
        console.warn("PDF extraction failed:", err);
      } finally {
        if (progText) progText.textContent = "Ready to upload on submit!";
      }
    } else if (isImage) {
      try {
        if (progText) progText.textContent = "Running OCR on image...";
        const txt = await extractImageText(file, () => {});
        if (txt && txt.trim().length) autoFillFromText(txt);
      } catch (err) {
        console.warn("Image OCR failed:", err);
      } finally {
        if (progText) progText.textContent = "Ready to upload on submit!";
      }
    } else {
      if (progText) progText.textContent = "File selected (no OCR attempted).";
    }
  }

  // wire change events
  if (licenseIn) licenseIn.addEventListener("change", () => handleFileSelect(licenseIn, "license"));
  if (transcriptIn) transcriptIn.addEventListener("change", () => handleFileSelect(transcriptIn, "transcript"));
  if (cvIn) cvIn.addEventListener("change", () => handleFileSelect(cvIn, "cv"));

  // resume browse click
  if (resumeBtn && resumeIn) resumeBtn.addEventListener("click", () => resumeIn.click());

  // resume selection
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

  // submit handler: create applicant (server) then upload files (supabase)
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

    // payload to server
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

    // debug: show exact payload for inspection
    console.log('Submitting application payload:',
      payload.firstName, payload.lastName, payload, payload.contactNumber);

    try {
      //  create applicant record server-side
      const res = await fetch("http://localhost:3000/api/submit-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        console.error("Server creation error:", result);
        alert("Server error: " + (result.error || "Failed to create applicant"));
        return;
      }
      const newId = result.newId;
      const genEmail = result.generatedEmail || null;

      // upload files to supabase in folder last-newId
      const safeLast = safePart(ln || "unknown");
      const folder = `${safeLast}-${newId}`;
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

      //update Firestore with storage links
      const update = {
        storageFolderId: folder,
        documents: uploadedFiles,
        updatedAt: serverTimestamp()
      };
      await setDoc(doc(db, "teacherApplicants", newId), update, { merge: true });

      // cleanup UI & state
      Object.keys(uploads).forEach(k => delete uploads[k]);
      if (resumeIn) resumeIn.value = "";
      if (licenseIn) licenseIn.value = "";
      if (transcriptIn) transcriptIn.value = "";
      if (cvIn) cvIn.value = "";
      if (resumeLabel) resumeLabel.textContent = "";
      if (progBar) progBar.style.display = "none";

      let okMsg = `Application submitted successfully!`;
      if (genEmail) okMsg += `\n\nGenerated account email: ${genEmail}\nPlease check your email for the password.`;
      else okMsg += `\n\nPlease check your email for account details.`;

      alert(okMsg);
      window.location.reload();

    } catch (err) {
      console.error("Error submitting application:", err);
      alert("Failed to submit application. Please try again later.");
    }
  });
});
