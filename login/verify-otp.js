// /login/verify-otp.js


const DEFAULT_COOLDOWN = 180; // seconds

document.addEventListener('DOMContentLoaded', () => {
  const verifyEmailSpan = document.getElementById('verify-email');
  const resendLink = document.querySelector('.resend-link');
  const countdownSpan = document.getElementById('countdown');

  const otpForm = document.getElementById('otp-form');
  const otpInput = document.getElementById('otp');
  const otpError = document.getElementById('otp-error');
  const verifyBtn = document.getElementById('verify-btn');

  // read stored session info
  const idToken = sessionStorage.getItem('idToken');
  const verifyEmail = sessionStorage.getItem('verifyEmail');

  // show email in UI
  if (verifyEmail && verifyEmailSpan) {
    verifyEmailSpan.textContent = verifyEmail;
  }

  if (!idToken && !verifyEmail) {
    // no context -> redirect to login
    window.location.replace('/login/login.html');
    return;
  }

  // countdown management
  let countdownTimer = null;
  function startCountdown(seconds) {
    let remaining = Math.max(Math.floor(seconds), 0);
    if (countdownSpan) {
      countdownSpan.style.display = 'inline';
      countdownSpan.textContent = `You can resend the code in ${formatSeconds(remaining)}`
    }
    if (resendLink) resendLink.classList.add('disabled');
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      remaining -= 1;
      if (countdownSpan) {
        if (remaining > 0) countdownSpan.textContent = `You can resend the code in ${formatSeconds(remaining)}`;
        else {
          clearInterval(countdownTimer);
          countdownTimer = null;
          if (countdownSpan) countdownSpan.style.display = 'none';
          if (resendLink) resendLink.classList.remove('disabled');
        }
      }
    }, 1000);
  }

  function formatSeconds(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // Kick off: hide countdown by default (it will appear if server tells there's cooldown)
  if (countdownSpan) countdownSpan.style.display = 'none';

  // Resend handler
  async function handleResend(e) {
    e && e.preventDefault();
    if (!resendLink || resendLink.classList.contains('disabled')) return;
    // disable UI immediately
    if (resendLink) resendLink.classList.add('disabled');
    if (countdownSpan) {
      countdownSpan.style.display = 'inline';
      countdownSpan.textContent = 'Sending...';
    }

    try {
      const body = idToken ? { idToken } : { email: verifyEmail };
      const resp = await fetch('/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (resp.status === 429) {
        const json = await resp.json().catch(() => ({}));
        const retryAfter = json && json.retryAfter ? Number(json.retryAfter) : DEFAULT_COOLDOWN;
        // show message
        if (countdownSpan) countdownSpan.textContent = `Please wait ${formatSeconds(retryAfter)} before resending.`;
        startCountdown(retryAfter);
        return;
      }

      const data = await resp.json().catch(() => ({}));
      const nextAllowed = data && (data.nextAllowedIn || DEFAULT_COOLDOWN);

      if (!resp.ok && !data.ok) {
        // show error message (400 or 500)
        const msg = (data && (data.error || data.message)) || 'Failed to resend OTP.';
        if (countdownSpan) {
          countdownSpan.textContent = msg;
        }
        // still start cooldown to avoid spamming
        startCountdown(nextAllowed);
        return;
      }

      // resp.ok
      if (data && data.ok && data.emailed) {
        // success
        if (countdownSpan) countdownSpan.textContent = data.message || 'OTP resent. Check your email.';
        startCountdown(nextAllowed);
      } else {
        // emailed:false (send failed) — per your instruction, instruct user to retry login again
        const msg = (data && data.message) || 'Failed to send OTP. Please try logging in again.';
        if (countdownSpan) countdownSpan.textContent = msg;
        startCountdown(nextAllowed);
      }

    } catch (err) {
      console.error('resend error', err);
      if (countdownSpan) countdownSpan.textContent = 'Network error. Try again later.';
      startCountdown(DEFAULT_COOLDOWN);
    }
  }

  // Attach click listener to the anchor .resend-link
  if (resendLink) {
    resendLink.addEventListener('click', handleResend);
  }

  // OTP verify form submit
  if (otpForm) {
    otpForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!otpInput) return;
      const code = otpInput.value.trim();
      otpError.textContent = '';
      if (!code) {
        otpError.textContent = 'Please enter the 6-digit code.';
        return;
      }
      // disable verify button while calling
      verifyBtn.disabled = true;
      verifyBtn.textContent = 'Verifying...';
      try {
        const resp = await fetch('/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otp: code, idToken, email: verifyEmail })
        });
        const body = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          otpError.textContent = body && body.error ? body.error : 'Verification failed.';
          // if expired, the message will be e.g. "OTP expired. Please resend code."
          verifyBtn.disabled = false;
          verifyBtn.textContent = 'Verify';
          return;
        }
        // success: receive token & role
        if (body && body.token) {
          localStorage.setItem('token', body.token);
          // Redirect by role
          if (body.role === 'admin') window.location.replace('/adminportal/admin.html');
          else window.location.replace('/teacher-application/teacher.html');
        } else {
          otpError.textContent = 'Unexpected server response.';
          verifyBtn.disabled = false;
          verifyBtn.textContent = 'Verify';
        }
      } catch (err) {
        console.error('verify-otp network error', err);
        otpError.textContent = 'Network error. Try again later.';
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify';
      }
    });
  }
});
