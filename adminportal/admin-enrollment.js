// admin-enrollment.js - Simple enrollment period management
import { apiFetch } from '../api-fetch.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Dashboard elements
  const jhsStatusBadge = document.getElementById('jhs-status-badge');
  const shsStatusBadge = document.getElementById('shs-status-badge');
  const jhsDaysInfo = document.getElementById('jhs-days-info');
  const shsDaysInfo = document.getElementById('shs-days-info');
  
  // Modal elements
  const manageBtn = document.getElementById('manage-enrollment-btn');
  const enrollmentModal = document.getElementById('enrollment-modal');
  const cancelBtn = document.getElementById('enrollment-cancel-btn');
  const saveBtn = document.getElementById('enrollment-save-btn');
  
  // Date inputs
  const jhsStartInput = document.getElementById('jhs-start-date');
  const jhsEndInput = document.getElementById('jhs-end-date');
  const shsStartInput = document.getElementById('shs-start-date');
  const shsEndInput = document.getElementById('shs-end-date');
  
  // Status previews
  const jhsPreview = document.getElementById('jhs-status-preview');
  const shsPreview = document.getElementById('shs-status-preview');

  // Load enrollment status on page load
  await loadEnrollmentStatus();

  // Open modal
  if (manageBtn) {
    manageBtn.addEventListener('click', openEnrollmentModal);
  }

  // Close modal
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeEnrollmentModal);
  }

  // Close modal on outside click
  if (enrollmentModal) {
    enrollmentModal.addEventListener('click', (e) => {
      if (e.target === enrollmentModal) {
        closeEnrollmentModal();
      }
    });
  }

  // Save changes
  if (saveBtn) {
    saveBtn.addEventListener('click', saveEnrollmentSettings);
  }

  // Date input listeners for live preview
  [jhsStartInput, jhsEndInput].forEach(input => {
    if (input) {
      input.addEventListener('change', () => updatePreview('jhs'));
    }
  });

  [shsStartInput, shsEndInput].forEach(input => {
    if (input) {
      input.addEventListener('change', () => updatePreview('shs'));
    }
  });

  // ===== FUNCTIONS =====

  async function loadEnrollmentStatus() {
    try {
      const response = await fetch('/api/enrollment/status');
      if (!response.ok) throw new Error('Failed to load enrollment status');
      
      const data = await response.json();
      
      // Update JHS status
      updateStatusBadge(jhsStatusBadge, data.jhs.status);
      updateDaysInfo(jhsDaysInfo, data.jhs);
      
      // Update SHS status
      updateStatusBadge(shsStatusBadge, data.shs.status);
      updateDaysInfo(shsDaysInfo, data.shs);
      
    } catch (err) {
      console.error('Error loading enrollment status:', err);
      if (jhsStatusBadge) jhsStatusBadge.textContent = 'Error';
      if (shsStatusBadge) shsStatusBadge.textContent = 'Error';
    }
  }

  function updateStatusBadge(badge, status) {
    if (!badge) return;
    
    // Remove all status classes
    badge.classList.remove('open', 'closed', 'upcoming');
    
    // Add appropriate class and text
    if (status === 'open') {
      badge.classList.add('open');
      badge.textContent = 'Open';
    } else if (status === 'closed') {
      badge.classList.add('closed');
      badge.textContent = 'Closed';
    } else if (status === 'upcoming') {
      badge.classList.add('upcoming');
      badge.textContent = 'Coming Soon';
    } else {
      badge.textContent = 'Not Set';
    }
  }

  function updateDaysInfo(element, data) {
    if (!element) return;
    
    if (data.status === 'open' && data.daysRemaining) {
      const days = data.daysRemaining;
      element.textContent = days === 1 ? '1 day left' : `${days} days left`;
    } else if (data.status === 'upcoming' && data.daysRemaining) {
      const days = data.daysRemaining;
      element.textContent = days === 1 ? 'Opens in 1 day' : `Opens in ${days} days`;
    } else if (data.status === 'closed') {
      element.textContent = 'Period ended';
    } else {
      element.textContent = '';
    }
  }

  async function openEnrollmentModal() {
    try {
      // Load current settings (apiFetch returns parsed JSON directly)
      const data = await apiFetch('/api/enrollment/settings');
      
      // Populate form
      if (jhsStartInput) jhsStartInput.value = data.jhs?.startDate || '';
      if (jhsEndInput) jhsEndInput.value = data.jhs?.endDate || '';
      if (shsStartInput) shsStartInput.value = data.shs?.startDate || '';
      if (shsEndInput) shsEndInput.value = data.shs?.endDate || '';
      
      // Update previews
      updatePreview('jhs');
      updatePreview('shs');
      
      // Show modal
      if (enrollmentModal) {
        enrollmentModal.style.display = 'flex';
        enrollmentModal.setAttribute('aria-hidden', 'false');
      }
      
    } catch (err) {
      console.error('Error opening enrollment modal:', err);
      alert('Failed to load enrollment settings');
    }
  }

  function closeEnrollmentModal() {
    if (enrollmentModal) {
      enrollmentModal.style.display = 'none';
      enrollmentModal.setAttribute('aria-hidden', 'true');
    }
  }

  function updatePreview(level) {
    const startInput = level === 'jhs' ? jhsStartInput : shsStartInput;
    const endInput = level === 'jhs' ? jhsEndInput : shsEndInput;
    const preview = level === 'jhs' ? jhsPreview : shsPreview;
    
    if (!startInput || !endInput || !preview) return;
    
    const startDate = startInput.value;
    const endDate = endInput.value;
    
    if (!startDate || !endDate) {
      preview.textContent = '';
      preview.className = 'status-preview';
      return;
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    
    // Validation
    if (start > end) {
      preview.textContent = '⚠️ Start date must be before end date';
      preview.className = 'status-preview closed';
      return;
    }
    
    // Calculate status
    let statusText = '';
    let statusClass = '';
    
    if (today < start) {
      const daysUntil = Math.ceil((start - today) / (1000 * 60 * 60 * 24));
      statusText = `🔵 Opens in ${daysUntil} ${daysUntil === 1 ? 'day' : 'days'}`;
      statusClass = 'upcoming';
    } else if (today > end) {
      statusText = '🔴 Period has ended';
      statusClass = 'closed';
    } else {
      const daysLeft = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
      statusText = `🟢 Currently open (${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} remaining)`;
      statusClass = 'open';
    }
    
    preview.textContent = statusText;
    preview.className = `status-preview ${statusClass}`;
  }

  async function saveEnrollmentSettings() {
    try {
      // Get values
      const jhsStart = jhsStartInput?.value;
      const jhsEnd = jhsEndInput?.value;
      const shsStart = shsStartInput?.value;
      const shsEnd = shsEndInput?.value;
      
      // Validation
      if (!jhsStart || !jhsEnd || !shsStart || !shsEnd) {
        alert('Please fill in all dates');
        return;
      }
      
      // Validate date order
      if (new Date(jhsStart) > new Date(jhsEnd)) {
        alert('JHS start date must be before end date');
        jhsStartInput?.focus();
        return;
      }
      
      if (new Date(shsStart) > new Date(shsEnd)) {
        alert('SHS start date must be before end date');
        shsStartInput?.focus();
        return;
      }
      
      // Disable button
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }
      
      // Save to server (apiFetch already handles errors and returns parsed JSON)
      await apiFetch('/api/enrollment/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jhs: {
            startDate: jhsStart,
            endDate: jhsEnd
          },
          shs: {
            startDate: shsStart,
            endDate: shsEnd
          }
        })
      });
      
      // Success
      alert('✅ Enrollment periods updated successfully!');
      
      // Reload status on dashboard
      await loadEnrollmentStatus();
      
      // Close modal
      closeEnrollmentModal();
      
    } catch (err) {
      console.error('Error saving enrollment settings:', err);
      alert('Failed to save settings: ' + err.message);
    } finally {
      // Re-enable button
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
      }
    }
  }
});
