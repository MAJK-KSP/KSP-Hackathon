// State management
let mfaToken = null; // Store temp token during login if MFA is required

// DOM Elements
const loginPanel = document.getElementById('login-panel');
const mfaVerifyPanel = document.getElementById('mfa-verify-panel');
const loginForm = document.getElementById('login-form');
const mfaVerifyForm = document.getElementById('mfa-verify-form');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// Navigation within Portal
document.getElementById('mfa-cancel').addEventListener('click', () => {
  mfaToken = null;
  showPanel(loginPanel);
});

// Toast Helper
function showToast(message, type = 'error') {
  toastMessage.textContent = message;
  toast.className = 'toast show';
  if (type === 'success') {
    toast.classList.add('success');
  }
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

// Switch between panels
function showPanel(panelToShow) {
  [loginPanel, mfaVerifyPanel].forEach(panel => {
    panel.classList.add('hidden');
  });
  panelToShow.classList.remove('hidden');
}

// API - Login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  
  const email = emailInput.value;
  const password = passwordInput.value;
  
  // Immediately clear the password from the DOM to prevent credential leakage
  passwordInput.value = '';
  
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }
    
    if (data.mfa_required) {
      mfaToken = data.mfa_token;
      showPanel(mfaVerifyPanel);
      document.getElementById('mfa-code').focus();
    } else {
      // Successful login -> Redirect to dashboard page
      window.location.href = '/dashboard';
    }
  } catch (err) {
    showToast(err.message);
  }
});

// API - Verify MFA (During Login)
mfaVerifyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const code = document.getElementById('mfa-code').value;
  
  try {
    const res = await fetch('/api/auth/mfa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, mfa_token: mfaToken, is_setup: false })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || 'MFA verification failed');
    }
    
    mfaToken = null;
    mfaVerifyForm.reset();
    // Successful MFA -> Redirect to dashboard page
    window.location.href = '/dashboard';
  } catch (err) {
    showToast(err.message);
  }
});

// Check if already logged in -> Redirect to dashboard
async function checkSession() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      window.location.href = '/dashboard';
    } else {
      showPanel(loginPanel);
    }
  } catch (err) {
    showPanel(loginPanel);
  }
}

// Start
// Clear any browser-cached inputs on page load
loginForm.reset();
checkSession();
