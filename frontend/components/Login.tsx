import React, { useState, FormEvent } from 'react';
import { useLanguage } from '../LanguageContext';
import { useTheme } from '../ThemeContext';

interface User {
  id: string;
  email: string;
  mfa_enabled: boolean;
  created_at: string;
}

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const { t, locale, toggleLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

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
        setMfaToken(data.mfa_token);
      } else {
        onLoginSuccess(data.user);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setPassword(''); // Clear password field
    }
  };

  const handleMfaSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: mfaCode, mfa_token: mfaToken, is_setup: false })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'MFA verification failed');
      }
      
      onLoginSuccess(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="portal-view">
      {/* Top Banner Strips */}
      <div className="top-banners">
        <div className="karnataka-strip"></div>
        <div className="national-strip"></div>
      </div>

      {/* Official Government Header */}
      <header className="gov-header">
        <div className="header-container">
          <div className="header-brand left-brand">
            <svg className="gov-emblem" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220" width="55" height="60">
              <path d="M 75,78 C 75,78 88,74 100,68 C 112,74 125,78 125,78 L 125,108 C 125,128 100,142 100,142 C 100,142 75,118 75,108 Z" fill="#a82329" stroke="#c5a059" stroke-width="2.5"/>
              <circle cx="100" cy="110" r="85" fill="none" stroke="#c5a059" stroke-width="2"/>
              <path d="M 96,95 C 94,93 91,93 89,95 C 87,97 87,100 89,102 M 104,95 C 106,93 109,93 111,95 C 113,97 113,100 111,102 M 92,102 L 108,102 C 110,109 112,120 100,130 C 88,120 90,109 92,102 Z" fill="#c5a059"/>
              <path d="M 85,68 L 115,68 L 110,75 L 90,75 Z" fill="#c5a059"/>
              <path d="M 93,68 C 93,58 88,53 90,43 C 92,38 98,33 100,33 C 102,33 108,38 110,43 C 112,53 107,58 107,68 Z" fill="#c5a059"/>
            </svg>
            <div className="brand-text">
              <span className="gov-title">ಕರ್ನಾಟಕ ಸರ್ಕಾರ</span>
              <span className="gov-title-en">GOVERNMENT OF KARNATAKA</span>
            </div>
          </div>
          
          {/* Actions: Language & Theme Switcher */}
          <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="lang-switcher">
              <button id="lang-toggle" className="btn-lang" onClick={toggleLanguage}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
                <span id="lang-text">{locale === 'kn' ? 'English' : 'ಕನ್ನಡ'}</span>
              </button>
            </div>

            <div className="theme-switcher">
              <button id="theme-toggle" className="btn-lang btn-theme" onClick={toggleTheme} title="Toggle Dark/Light Mode">
                {theme === 'dark' ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="var(--ksp-gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="4"></circle>
                      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path>
                    </svg>
                    <span id="theme-text">{t("Light Mode")}</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3a6.8 6.8 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
                    </svg>
                    <span id="theme-text">{t("Dark Mode")}</span>
                  </>
                )}
              </button>
            </div>
          </div>
          
          <div className="header-brand right-brand">
            <div className="brand-text text-right">
              <span className="ksp-title">ಕರ್ನಾಟಕ ರಾಜ್ಯ ಪೊಲೀಸ್</span>
              <span className="ksp-title-en">KARNATAKA STATE POLICE</span>
            </div>
            <svg className="ksp-logo-header" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="55" height="55">
              <circle cx="100" cy="100" r="95" fill="#0b1e36" stroke="#c5a059" stroke-width="4" />
              <circle cx="100" cy="100" r="76" fill="none" stroke="#c5a059" stroke-width="1.5" stroke-dasharray="4 2" />
              <circle cx="100" cy="100" r="58" fill="#ffffff" stroke="#c5a059" stroke-width="3" />
              <path d="M 75,68 C 75,68 88,64 100,58 C 112,64 125,68 125,68 L 125,98 C 125,118 100,132 100,132 C 100,132 75,118 75,98 Z" fill="#a82329" stroke="#c5a059" stroke-width="2" />
              <g transform="translate(100, 96) scale(0.7)" fill="#ffe082" stroke="#5c4308" stroke-width="0.5">
                <path d="M -8,-15 L 8,-15 C 10,-8 12,5 0,16 C -12,5 -10,-8 -8,-15 Z" />
                <path d="M -6,-12 C -18,-15 -28,-6 -25,12 C -22,18 -15,14 -10,6 C -7,0 -6,-6 -6,-12 Z" />
                <path d="M 6,-12 C 18,-15 28,-6 25,12 C 22,18 15,14 10,6 C 7,0 6,-6 6,-12 Z" />
              </g>
            </svg>
          </div>
        </div>
      </header>

      {/* Main Portal Content */}
      <main className="portal-main">
        <div className="portal-container">
          {/* Left Column: Information Panel */}
          <section className="info-panel">
            <div className="info-card">
              <span className="tag">{t("OFFICIAL INSTRUCTIONS")}</span>
              <h2>{t("Secure Login Portal")}</h2>
              <p className="motto-kannada">{t("\"ಸೇವಾ ಧರ್ಮ\" • SERVICE IS DUTY")}</p>
              
              <div className="info-list">
                <div className="info-item">
                  <div className="info-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  </div>
                  <div className="info-details">
                    <h3>{t("Multi-Factor Authentication (MFA / 2FA)")}</h3>
                    <p>{t("MFA adds an extra layer of security to your account. In addition to your password, you will need a verification code from your authenticator app.")}</p>
                  </div>
                </div>
                
                <div className="info-item">
                  <div className="info-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                  </div>
                  <div className="info-details">
                    <h3>{t("System Auditing")}</h3>
                    <p>{t("All login attempts, successful or failed, are logged with IP addresses, timestamps, and device fingerprints for security audit trails.")}</p>
                  </div>
                </div>

                <div className="info-item">
                  <div className="info-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                  </div>
                  <div className="info-details">
                    <h3>{t("Emergency Contact")}</h3>
                    <p>{t("For technical support or account lockouts, contact the KSP IT Cell or call the emergency helpline at 112.")}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
          
          {/* Right Column: Authentication Cards */}
          <section className="auth-panel">
            {/* Error Notification Toast (embedded inside the card for React) */}
            {error && (
              <div className="toast show" style={{ position: 'relative', marginBottom: '16px', top: '0', right: '0', width: '100%' }}>
                <span>{error}</span>
              </div>
            )}

            {/* 1. LOGIN CARD */}
            {!mfaToken ? (
              <div id="login-panel" className="auth-card">
                <div className="card-header">
                  <h2>{t("Authorized Sign In")}</h2>
                  <div className="accent-bar"></div>
                </div>
                <p className="card-desc">{t("Access is restricted to verified police personnel only.")}</p>
                
                <form id="login-form" onSubmit={handleLoginSubmit} autoComplete="off">
                  <div className="input-group">
                    <label htmlFor="login-email">{t("Official Email ID")}</label>
                    <input 
                      type="email" 
                      id="login-email" 
                      required 
                      placeholder="username@ksp.gov.in" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  
                  <div className="input-group">
                    <label htmlFor="login-password">{t("Security Password")}</label>
                    <input 
                      type="password" 
                      id="login-password" 
                      required 
                      placeholder="••••••••••••" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  
                  <button type="submit" id="login-submit-btn" className="btn-primary" disabled={loading}>
                    <span>{loading ? t("Loading...") : t("Verify & Continue")}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="btn-arrow">
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                      <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                  </button>
                </form>
                
                <div className="card-footer-notice">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="notice-icon">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                  <span><strong>{t("WARNING:")}</strong> {t("WARNING: Unauthorized access to this system is a crime under the IT Act, 2000 and Indian Penal Code.")}</span>
                </div>
              </div>
            ) : (
              /* 2. MFA CHALLENGE CARD */
              <div id="mfa-verify-panel" className="auth-card">
                <div className="card-header">
                  <h2>{t("Two-Factor Challenge")}</h2>
                  <div className="accent-bar"></div>
                </div>
                <p className="card-desc">{t("Enter the 6-digit verification code from your authenticator app.")}</p>
                
                <form id="mfa-verify-form" onSubmit={handleMfaSubmit}>
                  <div className="input-group code-input-group">
                    <label htmlFor="mfa-code">{t("Verification Code")}</label>
                    <input 
                      type="text" 
                      id="mfa-code" 
                      inputMode="numeric" 
                      pattern="[0-9]*" 
                      maxLength={6} 
                      autoComplete="one-time-code" 
                      placeholder="000000" 
                      required
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                      autoFocus
                    />
                  </div>
                  
                  <button type="submit" id="mfa-verify-btn" className="btn-primary" disabled={loading}>
                    <span>{loading ? t("Loading...") : t("Verify & Access")}</span>
                  </button>
                </form>
                
                <div className="card-footer">
                  <button type="button" id="mfa-cancel" className="btn-link" onClick={() => { setMfaToken(null); setError(null); }}>
                    {t("Cancel & Go Back")}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Official Government Footer */}
      <footer className="gov-footer">
        <div className="footer-container">
          <div className="footer-links">
            <a href="#">{t("Home")}</a>
            <a href="#">{t("Privacy Policy")}</a>
            <a href="#">{t("Terms & Conditions")}</a>
            <a href="#">{t("Hyperlinking Policy")}</a>
            <a href="#">{t("Disclaimer")}</a>
            <a href="#">{t("Help")}</a>
          </div>
          <div className="footer-credits">
            <p>{t("Copyright © 2026 Karnataka State Police. All Rights Reserved.")}</p>
            <p className="nic-branding">{t("Designed & Developed by KSP IT Cell / National Informatics Centre (NIC).")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
};
