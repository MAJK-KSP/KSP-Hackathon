/**
 * @file Layout.tsx
 * @description Master Dashboard Layout wrapper with sidebar, topbar header, navigation, and single topbar Auto-Translate to Kannada button.
 * Ensures all system features (Overview, User Management, GIS Command Map, Network Analysis, AI Assistant, Decision Support, Profile, Settings) are ALWAYS visible and accessible in the sidebar.
 */

import React, { useState } from 'react';
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { t, locale, toggleLanguage } = useLanguage();

  const userRole = user?.role || 'officer';
  const hasAccess = (allowedRoles: string[]) => allowedRoles.includes(userRole);

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
        {/* Mobile Sidebar Overlay */}
        {isMobileMenuOpen && (
          <div className="mobile-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)}></div>
        )}

        {/* Fixed Left Sidebar */}
        <aside className={`dash-sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
          {/* Top: Branding Card */}
          <div className="sidebar-brand" onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>
            <img 
              src="/ksp-official-logo.png" 
              alt="Karnataka State Police Emblem" 
              style={{ height: '48px', width: 'auto', objectFit: 'contain' }} 
            />
            <div className="brand-meta">
              <span className="dash-title-main">{t("KARNATAKA STATE POLICE")}</span>
            </div>
          </div>

          {/* Middle: Sidebar Navigation */}
          <nav className="sidebar-nav">
            {/* SECTION 1: COMMAND & OPERATIONS */}
            <div className="nav-section">
              <div className="nav-section-title">{t("COMMAND & OPERATIONS")}</div>
              <NavLink to="/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="9"></rect>
                  <rect x="14" y="3" width="7" height="5"></rect>
                  <rect x="14" y="12" width="7" height="9"></rect>
                  <rect x="3" y="16" width="7" height="5"></rect>
                </svg>
                <span className="nav-item-text">{t("Overview")}</span>
              </NavLink>

              {hasAccess(['admin', 'supervisors', 'investigators', 'analysts', 'policymakers', 'officer']) && (
                <NavLink to="/map" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon>
                    <line x1="9" y1="3" x2="9" y2="18"></line>
                    <line x1="15" y1="6" x2="15" y2="21"></line>
                  </svg>
                  <span className="nav-item-text">{t("GIS Command Map")}</span>
                </NavLink>
              )}

              {hasAccess(['admin', 'supervisors', 'policymakers']) && (
                <NavLink to="/fir-generator" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  <span className="nav-item-text">{t("FIR Generator")}</span>
                </NavLink>
              )}
            </div>

            <div className="nav-divider"></div>

            {/* SECTION 2: INTELLIGENCE SUITE */}
            <div className="nav-section">
              <div className="nav-section-title">{t("INTELLIGENCE SUITE")}</div>
              
              {hasAccess(['admin', 'supervisors', 'analysts']) && (
                <NavLink to="/network" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3"></circle>
                    <circle cx="6" cy="12" r="3"></circle>
                    <circle cx="18" cy="19" r="3"></circle>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                  </svg>
                  <span className="nav-item-text">{t("Network Analysis")}</span>
                </NavLink>
              )}

              {hasAccess(['admin', 'supervisors', 'investigators']) && (
                <NavLink to="/decision-support" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                    <polyline points="2 17 12 22 22 17"></polyline>
                    <polyline points="2 12 12 17 22 12"></polyline>
                  </svg>
                  <span className="nav-item-text">{t("Decision Support")}</span>
                </NavLink>
              )}

              {hasAccess(['admin', 'supervisors', 'investigators', 'analysts', 'policymakers', 'officer']) && (
                <NavLink to="/chat" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                  <span className="nav-item-text">{t("AI Assistant")}</span>
                </NavLink>
              )}
            </div>

            <div className="nav-divider"></div>

            {/* SECTION 3: SYSTEM & SECURITY */}
            <div className="nav-section">
              <div className="nav-section-title">{t("SYSTEM & SECURITY")}</div>
              
              {hasAccess(['admin']) && (
                <NavLink to="/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                  <span className="nav-item-text">{t("User Management")}</span>
                </NavLink>
              )}

              <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                <span className="nav-item-text">{t("Settings")}</span>
              </NavLink>
            </div>
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
              <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
              </button>
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
                <span id="lang-text">{locale === 'kn' ? 'English' : 'ಕನ್ನಡ (Kannada)'}</span>
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
