import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useLanguage } from './LanguageContext';

interface User {
  id: string;
  email: string;
  mfa_enabled: boolean;
  created_at: string;
}

interface LayoutProps {
  user: User | null;
  onLogout: () => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ user, onLogout, children }) => {
  const { t, toggleLanguage, locale } = useLanguage();
  const navigate = useNavigate();

  return (
    <div id="dashboard-view" className="dashboard-layout">
      {/* Dashboard Header */}
      <header className="dash-header">
        <div className="dash-header-container">
          <div className="dash-brand" onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>
            <svg class="ksp-logo-header" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="42" height="42">
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
            <div class="brand-meta">
              <h1 class="dash-title">{t("KARNATAKA STATE POLICE")}</h1>
              <span class="dash-subtitle">{t("SECURE COMMAND TERMINAL")}</span>
            </div>
          </div>

          <div className="dash-user-controls">
            {/* Language Switcher */}
            <div className="lang-switcher" style={{ marginRight: '8px' }}>
              <button id="lang-toggle" className="btn-lang" onClick={toggleLanguage}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
                <span id="lang-text">{locale === 'kn' ? 'English' : 'ಕನ್ನಡ'}</span>
              </button>
            </div>

            {user && (
              <>
                <div className="user-badge">
                  <div className="user-avatar">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                  </div>
                  <div className="user-info">
                    <span className="officer-email" id="dash-officer-email">{user.email}</span>
                    <span className="officer-rank">{t("Authenticated Officer")}</span>
                  </div>
                </div>
                <button id="logout-btn" className="btn-logout" onClick={onLogout}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  <span>{t("Sign Out")}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Layout Body */}
      <div className="dash-container">
        {/* Sidebar Navigation */}
        <aside className="dash-sidebar">
          <nav className="sidebar-nav">
            <NavLink to="/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="7" height="9"></rect>
                <rect x="14" y="3" width="7" height="5"></rect>
                <rect x="14" y="12" width="7" height="9"></rect>
                <rect x="3" y="16" width="7" height="5"></rect>
              </svg>
              <span>{t("Overview")}</span>
            </NavLink>

            <NavLink to="/profile" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span>{t("Officer Profile")}</span>
            </NavLink>

            <NavLink to="/security" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <span>{t("MFA Security")}</span>
            </NavLink>
          </nav>
        </aside>

        {/* Content Workspace */}
        <main className="dash-content">
          {children}
        </main>
      </div>

      {/* Government Footer */}
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
