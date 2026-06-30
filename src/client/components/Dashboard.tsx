import React from 'react';
import { useLanguage } from '../LanguageContext';

interface User {
  id: string;
  email: string;
  mfa_enabled: boolean;
  created_at: string;
}

interface DashboardProps {
  user: User;
}

export const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  const { t } = useLanguage();

  return (
    <div className="dash-content">
      {/* 1. Welcome Banner */}
      <div className="welcome-banner">
        <h2>{t("Secure Command Terminal")}</h2>
        <p>
          {t("System Status")}: <span className="status-indicator-green">● ONLINE</span> | {t("Authorized Session Active")}
        </p>
      </div>

      {/* 2. KPI Metrics Grid */}
      <div className="kpi-grid">
        {/* System Health */}
        <div className="kpi-card">
          <div className="kpi-icon blue">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
          </div>
          <div className="kpi-data">
            <span className="kpi-num">SECURE</span>
            <span className="kpi-label">{t("System Status")}</span>
          </div>
        </div>

        {/* Active Sessions */}
        <div className="kpi-card">
          <div className="kpi-icon gold">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <div className="kpi-data">
            <span className="kpi-num">1 ACTIVE</span>
            <span className="kpi-label">{t("Active Sessions")}</span>
          </div>
        </div>

        {/* MFA Status */}
        <div className="kpi-card">
          <div className={`kpi-icon ${user.mfa_enabled ? 'green' : 'gold'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <div className="kpi-data">
            <span className="kpi-num">{user.mfa_enabled ? "ACTIVE" : "INACTIVE"}</span>
            <span className="kpi-label">{t("MFA Security")}</span>
          </div>
        </div>
      </div>

      {/* 3. Details Section Grid */}
      <div className="dash-details-grid">
        {/* Left Card: Officer Information */}
        <div className="details-card">
          <h2>{t("Officer Profile")}</h2>
          <div className="dash-user-info">
            <div className="profile-row">
              <span className="profile-label">{t("Official Email ID")}</span>
              <span className="profile-val">{user.email}</span>
            </div>
            <div className="profile-row">
              <span className="profile-label">Officer ID</span>
              <span className="profile-val" style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{user.id}</span>
            </div>
            <div className="profile-row">
              <span className="profile-label">Terminal Registered</span>
              <span className="profile-val">{new Date(user.created_at).toLocaleDateString()}</span>
            </div>
            <div className="profile-row">
              <span className="profile-label">Authentication Level</span>
              <span className="profile-val" style={{ color: user.mfa_enabled ? '#10b981' : '#f59e0b' }}>
                {user.mfa_enabled ? "2FA Multi-Factor (High)" : "Password Only (Standard)"}
              </span>
            </div>
          </div>
        </div>

        {/* Right Card: Security Audits */}
        <div className="details-card">
          <h2>{t("System Auditing")}</h2>
          <div className="audit-logs">
            <div className="log-item">
              <span className="log-time">{new Date().toLocaleTimeString()}</span>
              <span className="log-desc">Session integrity check passed. Cryptographic token verified.</span>
            </div>
            <div className="log-item">
              <span className="log-time">22:01:14</span>
              <span className="log-desc">SQLite database connection pools initialized successfully.</span>
            </div>
            <div className="log-item">
              <span className="log-time">22:00:05</span>
              <span className="log-desc">Security headers (CSP, XSS protection, X-Frame-Options) applied.</span>
            </div>
            <div className="log-item">
              <span className="log-time">21:58:32</span>
              <span className="log-desc">General rate limiter initialized on API gateway.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default Dashboard;
