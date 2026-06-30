// State management
let currentUser = null;

// DOM Elements
const mfaQrImage = document.getElementById('mfa-qr-image');
const mfaSetupSection = document.getElementById('mfa-setup-section');
const mfaSetupActiveSection = document.getElementById('mfa-setup-active-section');
const mfaActiveBanner = document.getElementById('mfa-active-banner');
const mfaSetupCode = document.getElementById('mfa-setup-code');

const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// Toast Helper
function showToast(message, type = 'error') {
  if (!toast || !toastMessage) return;
  toastMessage.textContent = message;
  toast.className = 'toast show';
  if (type === 'success') {
    toast.classList.add('success');
  }
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

// API - Setup MFA (Request QR Code)
const setupMfaBtn = document.getElementById('setup-mfa-btn');
if (setupMfaBtn) {
  setupMfaBtn.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/auth/mfa/setup', { method: 'POST' });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to initialize MFA setup');
      }
      
      if (mfaQrImage) mfaQrImage.src = data.qrCodeUrl;
      if (mfaSetupSection) mfaSetupSection.classList.add('hidden');
      if (mfaSetupActiveSection) mfaSetupActiveSection.classList.remove('hidden');
      if (mfaSetupCode) mfaSetupCode.focus();
    } catch (err) {
      showToast(err.message);
    }
  });
}

// API - Verify & Enable MFA (During Setup)
const verifyMfaSetupBtn = document.getElementById('verify-mfa-setup-btn');
if (verifyMfaSetupBtn) {
  verifyMfaSetupBtn.addEventListener('click', async () => {
    if (!mfaSetupCode) return;
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
      if (mfaSetupActiveSection) mfaSetupActiveSection.classList.add('hidden');
      mfaSetupCode.value = '';
      renderDashboard();
    } catch (err) {
      showToast(err.message);
    }
  });
}

// Cancel MFA Setup
const cancelMfaSetupBtn = document.getElementById('cancel-mfa-setup-btn');
if (cancelMfaSetupBtn) {
  cancelMfaSetupBtn.addEventListener('click', () => {
    if (mfaSetupActiveSection) mfaSetupActiveSection.classList.add('hidden');
    if (mfaSetupSection) mfaSetupSection.classList.remove('hidden');
    if (mfaSetupCode) mfaSetupCode.value = '';
  });
}

// API - Logout
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      currentUser = null;
      window.location.href = '/';
    } catch (err) {
      showToast('Error terminating session');
    }
  });
}

// Render Dashboard values
function renderDashboard() {
  if (!currentUser) return;
  
  // Populate Header Profile
  const dashOfficerEmailEl = document.getElementById('dash-officer-email');
  if (dashOfficerEmailEl) dashOfficerEmailEl.textContent = currentUser.email;
  
  // Populate Profile Details Tab
  const profileEmailEl = document.getElementById('profile-email');
  if (profileEmailEl) profileEmailEl.textContent = currentUser.email;

  const profileIdEl = document.getElementById('profile-id');
  if (profileIdEl) profileIdEl.textContent = currentUser.id;

  const profileCreatedEl = document.getElementById('profile-created');
  if (profileCreatedEl) profileCreatedEl.textContent = new Date(currentUser.created_at).toLocaleString();
  
  const mfaStatusEl = document.getElementById('profile-mfa');
  
  if (currentUser.mfa_enabled) {
    if (mfaStatusEl) mfaStatusEl.innerHTML = '<span style="color: #065f46; font-weight: 700;">Active & Protected</span>';
    if (mfaSetupSection) mfaSetupSection.classList.add('hidden');
    if (mfaSetupActiveSection) mfaSetupActiveSection.classList.add('hidden');
    if (mfaActiveBanner) mfaActiveBanner.classList.remove('hidden');
  } else {
    if (mfaStatusEl) mfaStatusEl.innerHTML = '<span style="color: #92400e; font-weight: 700;">Action Required (Unsecured)</span>';
    if (mfaSetupSection) mfaSetupSection.classList.remove('hidden');
    if (mfaSetupActiveSection) mfaSetupActiveSection.classList.add('hidden');
    if (mfaActiveBanner) mfaActiveBanner.classList.add('hidden');
  }
}

// Initial session check on page load
async function checkSession() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      renderDashboard();
      await loadProfile();
    } else {
      // Redirect to login page if unauthorized
      window.location.href = '/';
    }
  } catch (err) {
    window.location.href = '/';
  }
}

// Fetch and load officer profile details
async function loadProfile() {
  try {
    const res = await fetch('/api/profile');
    if (res.ok) {
      const data = await res.json();
      if (data.profile) {
        const badgeEl = document.getElementById('profile-badge-number');
        if (badgeEl) badgeEl.value = data.profile.badge_number || '';

        const rankEl = document.getElementById('profile-rank');
        if (rankEl) rankEl.value = data.profile.rank || '';

        const postEl = document.getElementById('profile-post');
        if (postEl) postEl.value = data.profile.post || '';

        const jurisdictionEl = document.getElementById('profile-jurisdiction');
        if (jurisdictionEl) jurisdictionEl.value = data.profile.jurisdiction || '';

        const areaEl = document.getElementById('profile-area');
        if (areaEl) areaEl.value = data.profile.area || '';

        const stationEl = document.getElementById('profile-station');
        if (stationEl) stationEl.value = data.profile.station || '';
        
        // Update header rank if present
        const headerRankEl = document.querySelector('.officer-rank');
        if (headerRankEl) {
          headerRankEl.textContent = data.profile.rank || 'Authenticated Officer';
        }
      }
    }
  } catch (err) {
    console.error('Error loading profile:', err);
  }
}

// Handle profile form submission
const profileForm = document.getElementById('profile-form');
if (profileForm) {
  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const badge_number = document.getElementById('profile-badge-number')?.value || '';
    const rank = document.getElementById('profile-rank')?.value || '';
    const post = document.getElementById('profile-post')?.value || '';
    const jurisdiction = document.getElementById('profile-jurisdiction')?.value || '';
    const area = document.getElementById('profile-area')?.value || '';
    const station = document.getElementById('profile-station')?.value || '';
    
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ badge_number, rank, post, jurisdiction, area, station })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }
      
      showToast('Profile updated successfully!', 'success');
      
      // Update header rank immediately
      const rankEl = document.querySelector('.officer-rank');
      if (rankEl) {
        rankEl.textContent = rank || 'Authenticated Officer';
      }
    } catch (err) {
      showToast(err.message);
    }
  });
}

// Start
checkSession();
