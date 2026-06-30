// State management
let currentUser = null;
let mfaToken = null; // Store temp token during login if MFA is required

// DOM Elements - Views
const portalView = document.getElementById('portal-view');
const dashboardView = document.getElementById('dashboard-view');

// DOM Elements - Panels (Inside Portal)
const loginPanel = document.getElementById('login-panel');
const mfaVerifyPanel = document.getElementById('mfa-verify-panel');

// DOM Elements - Forms
const loginForm = document.getElementById('login-form');
const mfaVerifyForm = document.getElementById('mfa-verify-form');

// DOM Elements - MFA Setup (Inside Dashboard)
const mfaQrImage = document.getElementById('mfa-qr-image');
const mfaSetupSection = document.getElementById('mfa-setup-section');
const mfaSetupActiveSection = document.getElementById('mfa-setup-active-section');
const mfaActiveBanner = document.getElementById('mfa-active-banner');
const mfaSetupCode = document.getElementById('mfa-setup-code');

const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// Navigation within Portal (MFA cancel)
document.getElementById('mfa-cancel').addEventListener('click', () => {
  mfaToken = null;
  showPanel(loginPanel);
});

// Tab Switching within Dashboard
const tabButtons = document.querySelectorAll('.nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.getAttribute('data-tab');
    
    // Update active button styling
    tabButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Update active tab pane
    tabPanes.forEach(pane => pane.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
  });
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

// Switch between panels inside the Portal view
function showPanel(panelToShow) {
  [loginPanel, mfaVerifyPanel].forEach(panel => {
    panel.classList.add('hidden');
  });
  panelToShow.classList.remove('hidden');
}

// Toggle between Portal and Dashboard views
function showLoggedOutView() {
  portalView.classList.remove('hidden');
  dashboardView.classList.add('hidden');
  showPanel(loginPanel);
}

function showLoggedInView() {
  portalView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  renderDashboard();
}

// API - Login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  
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
      currentUser = data.user;
      showLoggedInView();
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
    
    currentUser = data.user;
    mfaToken = null;
    mfaVerifyForm.reset();
    showLoggedInView();
  } catch (err) {
    showToast(err.message);
  }
});

// API - Setup MFA (Request QR Code)
document.getElementById('setup-mfa-btn').addEventListener('click', async () => {
  try {
    const res = await fetch('/api/auth/mfa/setup', { method: 'POST' });
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || 'Failed to initialize MFA setup');
    }
    
    mfaQrImage.src = data.qrCodeUrl;
    mfaSetupSection.classList.add('hidden');
    mfaSetupActiveSection.classList.remove('hidden');
    mfaSetupCode.focus();
  } catch (err) {
    showToast(err.message);
  }
});

// API - Verify & Enable MFA (During Setup)
document.getElementById('verify-mfa-setup-btn').addEventListener('click', async () => {
  const code = mfaSetupCode.value;
  
  if (!code || code.length !== 6) {
    showToast('Please enter a valid 6-digit code');
    return;
  }
  
  try {
    const res = await fetch('/api/auth/mfa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, is_setup: true })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || 'MFA verification failed');
    }
    
    showToast('Multi-Factor Authentication enabled successfully!', 'success');
    currentUser = data.user;
    mfaSetupActiveSection.classList.add('hidden');
    mfaSetupCode.value = '';
    renderDashboard();
  } catch (err) {
    showToast(err.message);
  }
});

// Cancel MFA Setup
document.getElementById('cancel-mfa-setup-btn').addEventListener('click', () => {
  mfaSetupActiveSection.classList.add('hidden');
  mfaSetupSection.classList.remove('hidden');
  mfaSetupCode.value = '';
});

// API - Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    currentUser = null;
    showLoggedOutView();
    loginForm.reset();
  } catch (err) {
    showToast('Error terminating session');
  }
});

// Render Dashboard values
function renderDashboard() {
  if (!currentUser) return;
  
  // Populate Header Profile
  document.getElementById('dash-officer-email').textContent = currentUser.email;
  
  // Populate Profile Details Tab
  document.getElementById('profile-email').textContent = currentUser.email;
  document.getElementById('profile-id').textContent = currentUser.id;
  document.getElementById('profile-created').textContent = new Date(currentUser.created_at).toLocaleString();
  
  const mfaStatusEl = document.getElementById('profile-mfa');
  
  if (currentUser.mfa_enabled) {
    mfaStatusEl.innerHTML = '<span style="color: #065f46; font-weight: 700;">Active & Protected</span>';
    mfaSetupSection.classList.add('hidden');
    mfaSetupActiveSection.classList.add('hidden');
    mfaActiveBanner.classList.remove('hidden');
  } else {
    mfaStatusEl.innerHTML = '<span style="color: #92400e; font-weight: 700;">Action Required (Unsecured)</span>';
    mfaSetupSection.classList.remove('hidden');
    mfaSetupActiveSection.classList.add('hidden');
    mfaActiveBanner.classList.add('hidden');
  }
}

// Initial session check on page load
async function checkSession() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      showLoggedInView();
    } else {
      showLoggedOutView();
    }
  } catch (err) {
    showLoggedOutView();
  }
}

// Start
checkSession();
