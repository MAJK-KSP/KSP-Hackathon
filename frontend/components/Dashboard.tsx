import React, { useState, useEffect } from 'react';
import { useLanguage } from '../LanguageContext';

interface Briefing {
  id: string;
  title: string;
  content: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  effective_date: string;
  created_at: string;
}

interface Profile {
  badge_number: string;
  rank: string;
  station: string;
  jurisdiction: string;
}

export const Dashboard: React.FC = () => {
  const { t } = useLanguage();
  const [role, setRole] = useState<'admin' | 'officer'>('officer');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [loadingBriefings, setLoadingBriefings] = useState(true);
  
  // Admin Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [targetRole, setTargetRole] = useState('');
  const [targetStation, setTargetStation] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [expiresAt, setExpiresAt] = useState('');
  const [formMessage, setFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Fetch user role
    const fetchRole = async () => {
      try {
        const res = await fetch('/api/ai/role');
        if (res.ok) {
          const data = await res.json();
          setRole(data.role);
        }
      } catch (err) {
        console.error('Error fetching role:', err);
      }
    };

    // Fetch officer profile
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/profile');
        if (res.ok) {
          const data = await res.json();
          setProfile(data.profile);
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
      }
    };

    fetchRole();
    fetchProfile();
    fetchBriefings();
  }, []);

  const fetchBriefings = async () => {
    setLoadingBriefings(true);
    try {
      const res = await fetch('/api/ai/briefing');
      if (res.ok) {
        const data = await res.json();
        setBriefings(data.briefings || []);
      }
    } catch (err) {
      console.error('Error fetching briefings:', err);
    } finally {
      setLoadingBriefings(false);
    }
  };

  const handleCreateBriefing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setFormMessage({ type: 'error', text: 'Title and content are required' });
      return;
    }

    setSubmitting(true);
    setFormMessage(null);

    try {
      const res = await fetch('/api/ai/briefings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          priority,
          target_role: targetRole || null,
          target_station: targetStation || null,
          target_user_id: targetUserId || null,
          effective_date: effectiveDate,
          expires_at: expiresAt || null
        })
      });

      if (res.ok) {
        setFormMessage({ type: 'success', text: 'Daily briefing instruction dispatched successfully!' });
        setTitle('');
        setContent('');
        setPriority('normal');
        setTargetRole('');
        setTargetStation('');
        setTargetUserId('');
        // Refresh local briefings
        fetchBriefings();
      } else {
        const data = await res.json();
        setFormMessage({ type: 'error', text: data.error || 'Failed to dispatch briefing' });
      }
    } catch (err) {
      setFormMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dashboard-view-container animate-fade-in">
      {/* Welcome & Command Status */}
      <div className="welcome-banner">
        <div>
          <h2>{t("Welcome to Command Terminal")}</h2>
          <p>
            {t("System Status")}: <span className="status-indicator-green">● SECURE & ACTIVE</span>
          </p>
        </div>
        <div className="ai-ready-badge">
          <svg className="rotating-gear" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          <span>AI-Ready</span>
        </div>
      </div>

      {/* KPI Stats grid */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon blue">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <line x1="10" y1="9" x2="8" y2="9"></line>
            </svg>
          </div>
          <div className="kpi-data">
            <span className="kpi-num">14</span>
            <span className="kpi-label">{t("Active Cases")}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon gold">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
          </div>
          <div className="kpi-data">
            <span className="kpi-num">{briefings.length}</span>
            <span className="kpi-label">{t("Briefing Alerts")}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon green">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <div className="kpi-data">
            <span className="kpi-num">100%</span>
            <span className="kpi-label">{t("Security Status")}</span>
          </div>
        </div>
      </div>

      {/* Main Details Grid */}
      <div className="dash-details-grid">
        {/* Left Hand: Today's Briefings (AI Generated summaries / Admin tasks) */}
        <div className="details-card briefings-panel">
          <h2>📋 {t("Daily Briefing & Tasks")}</h2>
          <p className="panel-desc">
            {t("Below are the current tasks, role summaries, and orders dispatched for you today.")}
          </p>

          {loadingBriefings ? (
            <div className="loading-spinner-container">
              <div className="spinner"></div>
              <span>Loading instructions...</span>
            </div>
          ) : briefings.length === 0 ? (
            <div className="empty-briefings">
              <div className="empty-icon">📂</div>
              <h3>No briefings assigned for today</h3>
              <p>You are clear. Standard operations apply. Check back later for admin dispatches.</p>
            </div>
          ) : (
            <div className="briefings-list">
              {briefings.map(b => (
                <div key={b.id} className={`briefing-item priority-${b.priority}`}>
                  <div className="briefing-header">
                    <span className="briefing-title">{b.title}</span>
                    <span className={`badge-priority ${b.priority}`}>{t(b.priority.toUpperCase())}</span>
                  </div>
                  <p className="briefing-body">{b.content}</p>
                  <div className="briefing-footer">
                    <span>📅 {t("Effective")}: {b.effective_date}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Hand: Admin Dashboard Control or Officer Details */}
        <div className="details-card ops-panel">
          {role === 'admin' ? (
            <div className="admin-briefing-creator">
              <h2>🛠️ {t("Dispatch Daily Briefing")}</h2>
              <p className="panel-desc">{t("As an Administrator, you can dispatch task updates or briefings to officers.")}</p>
              
              <form onSubmit={handleCreateBriefing} className="admin-form">
                {formMessage && (
                  <div className={`form-message-alert ${formMessage.type}`}>
                    {formMessage.text}
                  </div>
                )}

                <div className="form-field">
                  <label>{t("Briefing Title")}</label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Koramangala Patrol Assignment Shift A"
                    required
                  />
                </div>

                <div className="form-field">
                  <label>{t("Briefing / Daily Instruction Content")}</label>
                  <textarea
                    rows={4}
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder="Provide specific details about roles, operations, or daily objectives..."
                    required
                  />
                </div>

                <div className="form-row-grid">
                  <div className="form-field">
                    <label>{t("Priority Level")}</label>
                    <select value={priority} onChange={e => setPriority(e.target.value as any)}>
                      <option value="low">{t("Low")}</option>
                      <option value="normal">{t("Normal")}</option>
                      <option value="high">{t("High")}</option>
                      <option value="urgent">{t("Urgent")}</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label>{t("Effective Date")}</label>
                    <input
                      type="date"
                      value={effectiveDate}
                      onChange={e => setEffectiveDate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="accordion-targeting-header">
                  <span>🎯 {t("Optional Targeting (All broadcast if empty)")}</span>
                </div>

                <div className="form-row-grid">
                  <div className="form-field">
                    <label>{t("Target Role")}</label>
                    <select value={targetRole} onChange={e => setTargetRole(e.target.value)}>
                      <option value="">{t("All Roles")}</option>
                      <option value="officer">{t("Officer Only")}</option>
                      <option value="admin">{t("Admin Only")}</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label>{t("Target Station")}</label>
                    <input
                      type="text"
                      value={targetStation}
                      onChange={e => setTargetStation(e.target.value)}
                      placeholder="e.g. Koramangala Police Station"
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label>{t("Target Officer User ID (Direct)")}</label>
                  <input
                    type="text"
                    value={targetUserId}
                    onChange={e => setTargetUserId(e.target.value)}
                    placeholder="e.g. uuid-of-officer"
                  />
                </div>

                <button type="submit" className="btn-save-profile" style={{ width: '100%', marginTop: '16px' }} disabled={submitting}>
                  {submitting ? t("Dispatching...") : t("Dispatch Briefing")}
                </button>
              </form>
            </div>
          ) : (
            <div className="officer-overview-details">
              <h2>👮 {t("Officer Assignment Information")}</h2>
              <p className="panel-desc">{t("Your currently logged-in officer profile details.")}</p>
              
              {profile ? (
                <div className="dash-user-info" style={{ marginTop: '20px' }}>
                  <div className="profile-row">
                    <span className="profile-label">{t("Badge Number")}</span>
                    <span className="profile-val">{profile.badge_number || 'Not Set'}</span>
                  </div>
                  <div className="profile-row">
                    <span className="profile-label">{t("Rank")}</span>
                    <span className="profile-val">{profile.rank || 'Not Set'}</span>
                  </div>
                  <div className="profile-row">
                    <span className="profile-label">{t("Police Station")}</span>
                    <span className="profile-val">{profile.station || 'Not Set'}</span>
                  </div>
                  <div className="profile-row">
                    <span className="profile-label">{t("Jurisdiction")}</span>
                    <span className="profile-val">{profile.jurisdiction || 'Not Set'}</span>
                  </div>
                  <div className="help-box-ai">
                    <h4>💡 AI Readiness Sandbox</h4>
                    <p>
                      Your daily duties can be query-accessed via the AI Assistant chat widget on the bottom right. Once configured, you can type: <strong>"summarize my tasks for today"</strong> to obtain immediate briefing info.
                    </p>
                  </div>
                </div>
              ) : (
                <p>{t("Please configure your officer profile in the Profile settings tab.")}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
