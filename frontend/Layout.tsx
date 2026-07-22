import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from './LanguageContext';
import { useTheme } from './ThemeContext';

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
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  // Determine the page title dynamically
  const getPageTitle = () => {
    switch (location.pathname) {
      case '/dashboard':
        return t("Overview");
      case '/profile':
        return t("Officer Profile");
      case '/security':
        return t("MFA Security");
      case '/map':
        return t("GIS Command Map");
      case '/network':
        return t("Tactical Network Visualizer");
      default:
        return t("Overview");
    }
  };

  return (
    <div className="dash-page-wrapper">
      <div className="top-banners">
        <div className="karnataka-strip"></div>
        <div className="national-strip"></div>
      </div>
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

          {/* Middle: Navigation */}
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

            <NavLink to="/network" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="6" r="3"></circle>
                <circle cx="18" cy="6" r="3"></circle>
                <circle cx="12" cy="18" r="3"></circle>
                <line x1="8.5" y1="7.5" x2="10.5" y2="15.5"></line>
                <line x1="15.5" y1="7.5" x2="13.5" y2="15.5"></line>
                <line x1="9" y1="6" x2="15" y2="6"></line>
              </svg>
              <span>{t("Network Analysis")}</span>
            </NavLink>

            <NavLink to="/profile" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span>{t("Officer Profile")}</span>
            </NavLink>

            <NavLink to="/security" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <span>{t("MFA Security")}</span>
            </NavLink>

            <NavLink to="/map" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon>
                <line x1="9" y1="3" x2="9" y2="18"></line>
                <line x1="15" y1="6" x2="15" y2="21"></line>
              </svg>
              <span>{t("GIS Command Map")}</span>
            </NavLink>

            <a href="#" className="nav-item" onClick={(e) => { e.preventDefault(); document.getElementById('ai-chat-toggle')?.click(); }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <span>{t("AI Assistant")}</span>
            </a>
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
                  <span className="officer-rank">{t("Authenticated Officer")}</span>
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
        <div className="main-workspace">
          {/* Topbar */}
          <div className="workspace-topbar">
            <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h2>{getPageTitle()}</h2>
              <span style={{ 
                fontSize: '11px', 
                fontFamily: 'monospace', 
                backgroundColor: 'rgba(16, 185, 129, 0.15)', 
                color: '#10b981', 
                border: '1px solid rgba(16, 185, 129, 0.3)', 
                borderRadius: '20px', 
                padding: '3px 10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 600
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 6px #10b981' }}></span>
                COMMAND TERMINAL ONLINE
              </span>
            </div>

            <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
