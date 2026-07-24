/**
 * @file Layout.tsx
 * @description Master Dashboard Layout wrapper with sidebar, topbar header, navigation, and single topbar Auto-Translate to Kannada button.
 * Ensures all system features (Overview, User Management, GIS Command Map, Network Analysis, AI Assistant, Decision Support, Profile, Settings) are ALWAYS visible and accessible in the sidebar.
 */

import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from './LanguageContext';

interface User {
  id: string;
  email: string;
  role?: string;
  mfa_enabled: boolean;
  created_at: string;
}

interface LayoutProps {
  user: User | null;
  onLogout: () => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ user, onLogout, children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, locale, toggleLanguage } = useLanguage();

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/dashboard':
        return t("Overview");
      case '/users':
        return t("User Management");
      case '/map':
        return t("GIS Command Map");
      case '/network':
        return t("Network Analysis");
      case '/chat':
        return t("AI Assistant");
      case '/decision-support':
        return t("Decision Support");
      case '/profile':
        return t("Officer Profile");
      case '/settings':
        return t("Settings");
      default:
        return t("Overview");
    }
  };

  return (
    <div className="dash-page-wrapper">
      <div className="dash-layout">
        {/* Fixed Left Sidebar */}
        <aside className="dash-sidebar">
          {/* Top: Branding */}
          <div className="sidebar-brand" onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>
            <svg className="ksp-logo-header" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="46" height="46">
              <circle cx="100" cy="100" r="95" fill="#0b1e36" stroke="#c5a059" strokeWidth="4" />
              <circle cx="100" cy="100" r="76" fill="none" stroke="#c5a059" strokeWidth="1.5" strokeDasharray="4 2" />
              <circle cx="100" cy="100" r="58" fill="#ffffff" stroke="#c5a059" strokeWidth="3" />
              <path d="M 75,68 C 75,68 88,64 100,58 C 112,64 125,68 125,68 L 125,98 C 125,118 100,132 100,132 C 100,132 75,118 75,98 Z" fill="#a82329" stroke="#c5a059" strokeWidth="2" />
              <g transform="translate(100, 96) scale(0.7)" fill="#ffe082" stroke="#5c4308" strokeWidth="0.5">
                <path d="M -8,-15 L 8,-15 C 10,-8 12,5 0,16 C -12,5 -10,-8 -8,-15 Z" />
                <path d="M -6,-12 C -18,-15 -28,-6 -25,12 C -22,18 -15,14 -10,6 C -7,0 -6,-6 -6,-12 Z" />
                <path d="M 6,-12 C 18,-15 28,-6 25,12 C 22,18 15,14 10,6 C 7,0 6,-6 6,-12 Z" />
              </g>
            </svg>
            <div className="brand-meta">
              <span className="dash-title-main">{t("KARNATAKA STATE POLICE")}</span>
              <span className="dash-title-sub">{t("SECURE COMMAND TERMINAL")}</span>
            </div>
          </div>

          {/* Middle: Sidebar Navigation (ALL FEATURES ALWAYS VISIBLE) */}
          <nav className="sidebar-nav">
            <NavLink to="/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9"></rect>
                <rect x="14" y="3" width="7" height="5"></rect>
                <rect x="14" y="12" width="7" height="9"></rect>
                <rect x="3" y="16" width="7" height="5"></rect>
              </svg>
              <span>{t("Overview")}</span>
            </NavLink>

            <NavLink to="/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              <span>{t("User Management")}</span>
            </NavLink>

            <NavLink to="/map" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon>
                <line x1="9" y1="3" x2="9" y2="18"></line>
                <line x1="15" y1="6" x2="15" y2="21"></line>
              </svg>
              <span>{t("GIS Command Map")}</span>
            </NavLink>

            <NavLink to="/network" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
              <span>{t("Network Analysis")}</span>
            </NavLink>

            <NavLink to="/chat" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <span>{t("AI Assistant")}</span>
            </NavLink>

            <NavLink to="/decision-support" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                <polyline points="2 17 12 22 22 17"></polyline>
                <polyline points="2 12 12 17 22 12"></polyline>
              </svg>
              <span>{t("Decision Support")}</span>
            </NavLink>

            <NavLink to="/profile" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span>{t("Officer Profile")}</span>
            </NavLink>

            <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              <span>{t("Settings")}</span>
            </NavLink>
          </nav>

          {/* Bottom: User Details & Logout */}
          {user && (
            <div className="sidebar-footer">
              <div className="user-badge">
                <div className="user-avatar">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </div>
                <div className="user-details">
                  <span className="officer-email">{user.email}</span>
                  <span className="officer-rank" style={{ textTransform: 'capitalize' }}>{user.role ? user.role : t("Authenticated Officer")}</span>
                </div>
              </div>
              <button id="logout-btn" className="btn-logout" onClick={onLogout}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
                <span>{t("Sign Out")}</span>
              </button>
            </div>
          )}
        </aside>

        {/* Main Content Area */}
        <div className={`main-workspace ${location.pathname === '/chat' ? 'chat-page-active' : ''}`}>
          {/* Top Banners Aligned with Main Workspace */}
          <div className="top-banners" style={{ position: 'sticky', top: 0, zIndex: 95 }}>
            <div className="karnataka-strip"></div>
            <div className="national-strip"></div>
          </div>

          {/* Topbar */}
          <div className="workspace-topbar">
            <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <h2>{getPageTitle()}</h2>
              {user && (
                <span className="topbar-role-badge" style={{
                  background: (user.role || 'officer') === 'admin'
                    ? 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)'
                    : (user.role || 'officer') === 'supervisors'
                    ? 'linear-gradient(135deg, #7c3aed 0%, #581c87 100%)'
                    : (user.role || 'officer') === 'investigators'
                    ? 'linear-gradient(135deg, #0b1e36 0%, #1e3a8a 100%)'
                    : (user.role || 'officer') === 'analysts'
                    ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'
                    : (user.role || 'officer') === 'policymakers'
                    ? 'linear-gradient(135deg, #059669 0%, #047857 100%)'
                    : 'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
                  color: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '20px',
                  padding: '3px 12px',
                  fontSize: '0.72rem',
                  fontWeight: 900,
                  letterSpacing: '0.8px',
                  textTransform: 'uppercase',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span>🛡️</span>
                  <span>{(user.role || 'officer').toUpperCase()}</span>
                </span>
              )}
            </div>

            <div className="topbar-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button className="btn-lang" onClick={() => navigate('/settings')} title={t("Settings")} style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
              </button>

              {/* Master Single Auto Translate to Kannada Toggle Button */}
              <button
                id="lang-toggle"
                className="btn-lang"
                onClick={toggleLanguage}
                style={{
                  background: locale === 'kn' ? 'linear-gradient(135deg, #c5a059 0%, #9a7b3c 100%)' : '#0b1e36',
                  color: locale === 'kn' ? '#070f19' : '#c5a059',
                  border: '1px solid #c5a059',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(197, 160, 89, 0.25)'
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
                <span id="lang-text">{locale === 'kn' ? '🌐 English' : '🌐 ಕನ್ನಡ (Kannada)'}</span>
              </button>
            </div>
          </div>

          {/* Content Workspace */}
          <main className="dash-content">
            {children}
          </main>

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
      </div>
    </div>
  );
};
export default Layout;
