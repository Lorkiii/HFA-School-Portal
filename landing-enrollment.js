// landing-enrollment.js - Enrollment status display for landing page
// Simple implementation matching admin-enrollment.js pattern

document.addEventListener('DOMContentLoaded', async () => {
  // Get DOM elements
  const jhsButton = document.getElementById('enroll-jhs');
  const shsButton = document.getElementById('enroll-shs');
  const jhsBadge = document.getElementById('jhs-status-badge');
  const shsBadge = document.getElementById('shs-status-badge');

  // Load enrollment status on page load
  await loadEnrollmentStatus();

  // ===== MAIN FUNCTION =====
  async function loadEnrollmentStatus() {
    try {
      // Fetch public enrollment status (no authentication needed)
      const response = await fetch('/api/enrollment/status');
      
      if (!response.ok) {
        throw new Error('Failed to load enrollment status');
      }
      
      const data = await response.json();
      
      // Update JHS enrollment button and badge
      updateEnrollmentButton('jhs', data.jhs, jhsButton, jhsBadge);
      
      // Update SHS enrollment button and badge
      updateEnrollmentButton('shs', data.shs, shsButton, shsBadge);
      
    } catch (err) {
      console.error('Error loading enrollment status:', err);
      
      // Show error state on badges
      if (jhsBadge) {
        jhsBadge.innerHTML = '<i class="fas fa-exclamation-circle"></i> Status unavailable';
        jhsBadge.className = 'enrollment-status-badge error';
      }
      if (shsBadge) {
        shsBadge.innerHTML = '<i class="fas fa-exclamation-circle"></i> Status unavailable';
        shsBadge.className = 'enrollment-status-badge error';
      }
    }
  }

  // ===== UPDATE BUTTON & BADGE =====
  function updateEnrollmentButton(level, statusData, button, badge) {
    if (!button || !badge) return;
    
    const status = statusData.status;
    const daysRemaining = statusData.daysRemaining;
    
    // Remove loading class
    badge.classList.remove('loading');
    
    if (status === 'open') {
      // ✅ OPEN - Show "Enroll Now" button going to form
      button.textContent = 'Enroll Now';
      button.href = level === 'jhs' ? 'applicationform/jhsform.html' : 'applicationform/shsform.html';
      button.classList.remove('disabled');
      button.style.pointerEvents = 'auto';
      button.style.opacity = '1';
      button.style.cursor = 'pointer';
      
      // Update badge - Green
      badge.className = 'enrollment-status-badge open';
      const daysText = daysRemaining === 1 ? '1 day left' : `${daysRemaining} days left`;
      badge.innerHTML = `<i class="fas fa-check-circle"></i> Open · ${daysText}`;
      
    } else {
      // ❌ CLOSED (covers 'closed' and 'upcoming') - Show "Learn More" button going to info page
      button.textContent = 'Learn More';
      button.href = level === 'jhs' ? 'applicationform/jhs-info.html' : 'applicationform/shs-info.html';
      button.classList.remove('disabled');
      button.style.pointerEvents = 'auto';
      button.style.opacity = '1';
      button.style.cursor = 'pointer';
      
      // Update badge - Red
      badge.className = 'enrollment-status-badge closed';
      badge.innerHTML = '<i class="fas fa-times-circle"></i> Closed';
    }
  }
});
