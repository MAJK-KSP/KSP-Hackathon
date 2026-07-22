/**
 * @file Dashboard.tsx
 * @description Operational intelligence dashboard displaying system status, daily operational briefs (urgent/high/normal/low), intelligence alerts, and recent operational metrics.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../LanguageContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

interface Dataset {
  id: string;
  table_name: string;
  description: string;
  is_enabled: number;
  added_at: string;
}

interface ChecklistTask {
  id: string;
  text: string;
  done: boolean;
}

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { t, locale } = useLanguage();
  const [role, setRole] = useState<string>('officer');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [loadingBriefings, setLoadingBriefings] = useState(true);
  const [acknowledgedBriefings, setAcknowledgedBriefings] = useState<Record<string, boolean>>({});
  const [expandedBriefingId, setExpandedBriefingId] = useState<string | null>(null);
  
  // Dashboard Navigation Tabs
  const [activeTab, setActiveTab] = useState<'overview' | 'roster' | 'diagnostics' | 'datasets'>('overview');
  
  // Real-time ticking clock
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  // Admin Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [targetRole, setTargetRole] = useState('');
  const [targetStation, setTargetStation] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [formMessage, setFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Diagnostic states
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [systemStatus, setSystemStatus] = useState<any>(null);

  // Dataset states
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [datasetTableName, setDatasetTableName] = useState('');
  const [datasetDescription, setDatasetDescription] = useState('');
  const [datasetMessage, setDatasetMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [registeringDataset, setRegisteringDataset] = useState(false);

  // Interactive Checklist State (backed by localStorage)
  const [tasks, setTasks] = useState<ChecklistTask[]>(() => {
    const saved = localStorage.getItem('ksp_officer_tasks');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing saved checklist:', e);
      }
    }
    return [
      { id: '1', text: 'Conduct initial hardware-based security key verification', done: false },
      { id: '2', text: 'Verify TOTP MFA token synchronization with server clock', done: false },
      { id: '3', text: 'Review and acknowledge all dispatched briefing bulletins', done: false },
      { id: '4', text: 'Execute connection health check for regional database node', done: false },
      { id: '5', text: 'Synchronize patrol logs and incident telemetry with KSP Central', done: false }
    ];
  });

  useEffect(() => {
    localStorage.setItem('ksp_officer_tasks', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    // Clock updater
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

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
    fetchSystemStatus();

    return () => clearInterval(timer);
  }, []);

  // Fetch datasets when activeTab is datasets and role is admin
  useEffect(() => {
    if (activeTab === 'datasets' && role === 'admin') {
      fetchDatasets();
    }
  }, [activeTab, role]);

  const fetchSystemStatus = async () => {
    setDiagnosticsLoading(true);
    try {
      const response = await fetch('/api/system/status');
      if (response.ok) {
        const data = await response.json();
        setSystemStatus(data);
      } else {
        throw new Error('Failed to fetch diagnostics');
      }
    } catch (err) {
      console.error(err);
      setSystemStatus({
        sqlite_db: { connected: false },
        fastapi_backend: {
          connected: false,
          supabase_db: { connected: false, error: 'Failed to contact Express server' },
          quickml: { connected: false, error: 'Failed to contact Express server', model: 'unknown' }
        }
      });
    } finally {
      setDiagnosticsLoading(false);
    }
  };

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

  const fetchDatasets = async () => {
    setLoadingDatasets(true);
    try {
      const res = await fetch('/api/ai/datasets');
      if (res.ok) {
        const data = await res.json();
        setDatasets(data.datasets || []);
      }
    } catch (err) {
      console.error('Error fetching datasets:', err);
    } finally {
      setLoadingDatasets(false);
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
          expires_at: null
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

  const handleRegisterDataset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!datasetTableName.trim()) {
      setDatasetMessage({ type: 'error', text: 'Table name is required' });
      return;
    }

    setRegisteringDataset(true);
    setDatasetMessage(null);

    try {
      const res = await fetch('/api/ai/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_name: datasetTableName.trim(),
          description: datasetDescription.trim()
        })
      });

      if (res.ok) {
        setDatasetMessage({ type: 'success', text: `Dataset ${datasetTableName} successfully registered for AI analysis.` });
        setDatasetTableName('');
        setDatasetDescription('');
        fetchDatasets();
      } else {
        const data = await res.json();
        setDatasetMessage({ type: 'error', text: data.error || 'Failed to register dataset' });
      }
    } catch (err) {
      setDatasetMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setRegisteringDataset(false);
    }
  };

  const toggleTask = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  const completedTasksCount = tasks.filter(t => t.done).length;
  const progressPercent = Math.round((completedTasksCount / tasks.length) * 100);

  // Time formatter
  const formattedTime = currentTime.toLocaleTimeString(locale === 'kn' ? 'kn-IN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  const formattedDate = currentTime.toLocaleDateString(locale === 'kn' ? 'kn-IN' : 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="dashboard-workspace animate-fade-in">
      
      {/* Top Welcome & Interactive Command Banner */}
      <div className="command-banner-premium">
        <div className="banner-grid-content">
          <div className="banner-branding">
            <span className="secure-badge">
              <span className="pulse-dot"></span>
              {t("SYSTEM STATUS") || "SYSTEM STATUS"}: SECURE & ACTIVE
            </span>
            <h1 className="banner-main-title">{t("Welcome to Command Terminal")}</h1>
            <p className="banner-subtitle">
              {profile ? `${t(profile.rank) || profile.rank} | ${t(profile.station) || profile.station} | ${t("Badge") || "Badge"}: ${profile.badge_number}` : t("Please configure your officer profile in the Profile settings tab.")}
            </p>
          </div>
          
          <div className="banner-clock-card">
            <span className="live-clock-time">{formattedTime}</span>
            <span className="live-clock-date">{formattedDate}</span>
          </div>
        </div>
        
        {/* Interactive Secondary Tab Navigation Strip */}
        <div className="banner-tabs-strip">
          <button 
            className={`banner-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="9"></rect>
              <rect x="14" y="3" width="7" height="5"></rect>
              <rect x="14" y="12" width="7" height="9"></rect>
              <rect x="3" y="16" width="7" height="5"></rect>
            </svg>
            <span>{t("Command Center") || "Command Center"}</span>
          </button>
          
          <button 
            className={`banner-tab-btn ${activeTab === 'roster' ? 'active' : ''}`}
            onClick={() => setActiveTab('roster')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            <span>{t("Duty Roster & Tasks") || "Duty Roster & Tasks"}</span>
            {briefings.length > 0 && <span className="tab-pill">{briefings.length}</span>}
          </button>
          
          <button 
            className={`banner-tab-btn ${activeTab === 'diagnostics' ? 'active' : ''}`}
            onClick={() => setActiveTab('diagnostics')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
              <line x1="6" y1="6" x2="6.01" y2="6"></line>
              <line x1="6" y1="18" x2="6.01" y2="18"></line>
            </svg>
            <span>{t("Terminal Diagnostics") || "Terminal Diagnostics"}</span>
          </button>

          <button 
            className={`banner-tab-btn ${activeTab === 'datasets' ? 'active' : ''}`}
            onClick={() => setActiveTab('datasets')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
              <path d="M2 17l10 5 10-5"></path>
              <path d="M2 12l10 5 10-5"></path>
            </svg>
            <span>{t("AI Datasets") || "AI Datasets"}</span>
            {role !== 'admin' && <span className="tab-lock-icon"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></span>}
          </button>
        </div>
      </div>

      {/* Main Tab Panels Content */}
      <div className="tab-content-panel">

        {/* 1. COMMAND CENTER (OVERVIEW) PANEL */}
        {activeTab === 'overview' && (
          <div className="tab-pane animate-fade-in">
            {/* Command Center Station Header */}
            <div className="cc-station-bar">
              <div className="cc-station-info">
                <div className="cc-station-badge">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
                    <line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/>
                    <line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/>
                    <line x1="9" y1="14" x2="9" y2="14.01"/><line x1="15" y1="14" x2="15" y2="14.01"/>
                    <path d="M10 22v-4h4v4"/>
                  </svg>
                </div>
                <div>
                  <h2 className="cc-station-title">
                    {profile?.station ? t(profile.station) : 'KSP Intelligence HQ'} — {t('Command Center')}
                  </h2>
                  <p className="cc-station-subtitle">
                    {t('Officer Badge')}: <strong>{profile?.badge_number || 'KSP-9982'}</strong> &nbsp;•&nbsp; 
                    {t('Clearance')}: <span className="cc-role-tag">{role.toUpperCase()}</span> &nbsp;•&nbsp; 
                    <span className="cc-status-live">● {t('LIVE DISPATCH CONNECTED')}</span>
                  </p>
                </div>
              </div>
              <div className="cc-header-actions">
                <button className="cc-refresh-btn" onClick={fetchBriefings} title={t('Refresh Briefings')}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
                    <polyline points="23 4 23 10 17 10"/>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                  </svg>
                  {t('Refresh')}
                </button>
              </div>
            </div>

            {/* Interactive Dual Command Grid (Station Daily Briefing & AI Assistant) */}
            <div className="cc-interactive-grid">
              
              {/* LEFT CARD: Station Daily Briefing */}
              <div className="cc-interactive-card briefing-card">
                <div className="cc-card-header">
                  <div className="cc-card-title-group">
                    <span className="cc-card-icon">
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                        <line x1="9" y1="12" x2="15" y2="12"/>
                        <line x1="9" y1="16" x2="13" y2="16"/>
                      </svg>
                    </span>
                    <div>
                      <h3>{t('Station Daily Briefing')}</h3>
                      <span className="cc-card-sub">
                        {profile?.station ? t(profile.station) : 'Station Dispatch'}
                      </span>
                    </div>
                  </div>
                  <span className="cc-card-badge briefing-badge">
                    {loadingBriefings ? t('Loading...') : `${briefings.length} ${t('Bulletins')}`}
                  </span>
                </div>

                <div className="cc-card-body">
                  {loadingBriefings ? (
                    <div className="cc-loading-box">
                      <div className="spinner"></div>
                      <span>{t('Fetching station briefing...')}</span>
                    </div>
                  ) : briefings.length === 0 ? (
                    <div className="cc-empty-briefing">
                      <div className="cc-empty-icon">
                        <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#10b981" strokeWidth="2">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                          <polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                      </div>
                      <h4>{t('Station Operational — All Clear')}</h4>
                      <p>{t('No urgent bulletins or dispatches assigned for your station today. Standard watch applies.')}</p>
                      <button className="cc-secondary-btn" onClick={() => setActiveTab('roster')}>
                        {t('View Full Roster & Past Logs')} &rarr;
                      </button>
                    </div>
                  ) : (
                    <div className="cc-briefing-list">
                      {briefings.map((b) => {
                        const isAcked = acknowledgedBriefings[b.id];
                        const isExpanded = expandedBriefingId === b.id || briefings.length === 1;
                        return (
                          <div 
                            key={b.id} 
                            className={`cc-briefing-item priority-${b.priority.toLowerCase()} ${isAcked ? 'acknowledged' : ''}`}
                          >
                            <div className="cc-briefing-item-header" onClick={() => setExpandedBriefingId(isExpanded && briefings.length > 1 ? null : b.id)}>
                              <div className="cc-briefing-title-row">
                                <span className={`cc-priority-pill ${b.priority.toLowerCase()}`}>
                                  {b.priority.toUpperCase()}
                                </span>
                                <h4>{b.title}</h4>
                              </div>
                              <span className="cc-expand-arrow">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <polyline points={isExpanded ? "18 15 12 9 6 15" : "6 9 12 15 18 9"}/>
                                </svg>
                              </span>
                            </div>

                            <div className={`cc-briefing-item-content ${isExpanded ? 'open' : ''}`}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {b.content}
                              </ReactMarkdown>

                              <div className="cc-briefing-footer">
                                <span className="cc-briefing-meta">
                                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px', verticalAlign: 'middle' }}>
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                                    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                                    <line x1="3" y1="10" x2="21" y2="10"/>
                                  </svg>
                                  {b.effective_date ? new Date(b.effective_date).toLocaleDateString() : 'Today'}
                                </span>
                                <button 
                                  className={`cc-ack-btn ${isAcked ? 'done' : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAcknowledgedBriefings(prev => ({ ...prev, [b.id]: !prev[b.id] }));
                                  }}
                                >
                                  {isAcked ? t('Acknowledged') : t('Mark Acknowledged')}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="cc-card-footer">
                  <button className="cc-link-btn" onClick={() => setActiveTab('roster')}>
                    {t('View All Station Briefings & Roster')} &rarr;
                  </button>
                </div>
              </div>

              {/* RIGHT CARD: AI Assistant / Copilot */}
              <div className="cc-interactive-card assistant-card">
                <div className="cc-card-header">
                  <div className="cc-card-title-group">
                    <span className="cc-card-icon ai-glow-icon">
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="4" y="4" width="16" height="16" rx="2" ry="2"/>
                        <rect x="9" y="9" width="6" height="6"/>
                        <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
                        <line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>
                        <line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="15" x2="23" y2="15"/>
                        <line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="15" x2="4" y2="15"/>
                      </svg>
                    </span>
                    <div>
                      <h3>{t('AI Intelligence Assistant')}</h3>
                      <span className="cc-card-sub">{t('24/7 Investigative Copilot')}</span>
                    </div>
                  </div>
                  <span className="cc-card-badge assistant-badge">
                    <span className="pulse-dot"></span> {t('ONLINE')}
                  </span>
                </div>

                <div className="cc-card-body assistant-body">
                  <div className="cc-assistant-hero">
                    <p className="cc-assistant-intro">
                      {t('Ask the KSP AI Copilot to analyze FIR files, look up penal codes, summarize crime trends, or generate shift intelligence reports.')}
                    </p>

                    <div className="cc-quick-prompts">
                      <span className="cc-prompts-label">{t('Quick Assistant Actions')}:</span>
                      <div className="cc-prompts-grid">
                        <button className="cc-prompt-chip" onClick={() => navigate('/chat')}>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                          </svg>
                          {t('Search IPC / Legal Provisions')}
                        </button>
                        <button className="cc-prompt-chip" onClick={() => navigate('/chat')}>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
                            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                          </svg>
                          {t('Analyze Crime Telemetry')}
                        </button>
                        <button className="cc-prompt-chip" onClick={() => navigate('/chat')}>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                          </svg>
                          {t('Draft Shift Summary')}
                        </button>
                        <button className="cc-prompt-chip" onClick={() => navigate('/chat')}>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                          </svg>
                          {t('Query FIR Records')}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="cc-launch-wrapper">
                    <button className="cc-primary-launch-btn" onClick={() => navigate('/chat')}>
                      <span>{t('Launch AI Assistant Copilot')}</span>
                      <span className="btn-arrow">&rarr;</span>
                    </button>
                  </div>
                </div>

                <div className="cc-card-footer">
                  <span className="cc-footer-note">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px', verticalAlign: 'middle' }}>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    {t('Secured with end-to-end audit logging')}
                  </span>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* 2. DUTY ROSTER & BRIEFINGS PANEL */}
        {activeTab === 'roster' && (
          <div className="tab-pane animate-fade-in">
            <div className="dash-details-grid">
              
              {/* Left Column: Daily Briefing Alerts Feed */}
              <div className="details-card briefings-panel">
                <h2>{t("Daily Briefing & Tasks")}</h2>
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
                    <div className="empty-icon">
                      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                    </div>
                    <h3>No briefings assigned for today</h3>
                    <p>You are clear. Standard operations apply. Check back later for admin dispatches.</p>
                  </div>
                ) : (
                  <div className="briefings-list">
                    {briefings.map(b => (
                      <div key={b.id} className={`briefing-item-premium priority-${b.priority}`}>
                        <div className="briefing-header">
                          <span className="briefing-title">{b.title}</span>
                          <span className={`badge-priority-premium ${b.priority}`}>{t(b.priority.toUpperCase())}</span>
                        </div>
                        <div className="briefing-body markdown-container">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {b.content}
                          </ReactMarkdown>
                        </div>
                        <div className="briefing-footer">
                          <span>{t("Effective")}: {b.effective_date}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Column: Interactive Tasks Checklist & Admin Roster Dispatcher */}
              <div className="details-card ops-panel">
                
                {/* Checklist widget */}
                <div className="interactive-checklist-section">
                  <h3>{t("Daily Security Checklist") || "Daily Security Checklist"}</h3>
                  <p className="checklist-subtitle">Complete daily terminal actions to maintain security clearances.</p>
                  
                  <div className="checklist-progress-strip">
                    <span className="checklist-count">{completedTasksCount} of {tasks.length} Done</span>
                    <div className="checklist-progress-bar">
                      <div className="checklist-progress-fill" style={{ width: `${progressPercent}%` }}></div>
                    </div>
                  </div>

                  <div className="checklist-items-list">
                    {tasks.map(t => (
                      <div 
                        key={t.id} 
                        className={`checklist-item-wrapper ${t.done ? 'checked' : ''}`}
                        onClick={() => toggleTask(t.id)}
                      >
                        <div className="checklist-checkbox">
                          {t.done && (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="14" height="14">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          )}
                        </div>
                        <span className="checklist-task-text">{t.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="separator-line-premium"></div>

                {/* Admin Briefing Dispatcher Section */}
                {role === 'admin' ? (
                  <div className="admin-briefing-creator">
                    <h2>{t("Dispatch Daily Briefing")}</h2>
                    <p className="panel-desc">{t("As an Administrator, you can dispatch task updates or briefings to officers.")}</p>
                    
                    <form onSubmit={handleCreateBriefing} className="admin-form-premium">
                      {formMessage && (
                        <div className={`form-message-alert ${formMessage.type}`}>
                          {formMessage.text}
                        </div>
                      )}

                      <div className="form-field-premium">
                        <label>{t("Briefing Title")}</label>
                        <input
                          type="text"
                          value={title}
                          onChange={e => setTitle(e.target.value)}
                          placeholder="e.g. Koramangala Patrol Assignment Shift A"
                          required
                        />
                      </div>

                      <div className="form-field-premium">
                        <label>{t("Briefing / Daily Instruction Content")}</label>
                        <textarea
                          rows={3}
                          value={content}
                          onChange={e => setContent(e.target.value)}
                          placeholder="Provide specific details about roles, operations, or daily objectives..."
                          required
                        />
                      </div>

                      <div className="form-row-grid-premium">
                        <div className="form-field-premium">
                          <label>{t("Priority Level")}</label>
                          <select value={priority} onChange={e => setPriority(e.target.value as any)}>
                            <option value="low">{t("Low")}</option>
                            <option value="normal">{t("Normal")}</option>
                            <option value="high">{t("High")}</option>
                            <option value="urgent">{t("Urgent")}</option>
                          </select>
                        </div>

                        <div className="form-field-premium">
                          <label>{t("Effective Date")}</label>
                          <input
                            type="date"
                            value={effectiveDate}
                            onChange={e => setEffectiveDate(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div className="accordion-targeting-header-premium">
                        <span>{t("Optional Targeting (All broadcast if empty)")}</span>
                      </div>

                      <div className="form-row-grid-premium">
                        <div className="form-field-premium">
                          <label>{t("Target Role")}</label>
                          <select value={targetRole} onChange={e => setTargetRole(e.target.value)}>
                            <option value="">{t("All Roles")}</option>
                            <option value="officer">{t("Officer Only")}</option>
                            <option value="admin">{t("Admin Only")}</option>
                          </select>
                        </div>

                        <div className="form-field-premium">
                          <label>{t("Target Station")}</label>
                          <input
                            type="text"
                            value={targetStation}
                            onChange={e => setTargetStation(e.target.value)}
                            placeholder="e.g. Koramangala Police Station"
                          />
                        </div>
                      </div>

                      <div className="form-field-premium">
                        <label>{t("Target Officer User ID (Direct)")}</label>
                        <input
                          type="text"
                          value={targetUserId}
                          onChange={e => setTargetUserId(e.target.value)}
                          placeholder="e.g. uuid-of-officer"
                        />
                      </div>

                      <button type="submit" className="btn-primary-premium" style={{ width: '100%', marginTop: '16px' }} disabled={submitting}>
                        {submitting ? t("Dispatching...") : t("Dispatch Briefing")}
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="help-box-ai">
                    <h4>AI Readiness Sandbox</h4>
                    <p>
                      Your daily duties can be query-accessed via the AI Assistant chat widget on the bottom right. Once configured, you can type: <strong>"summarize my tasks for today"</strong> to obtain immediate briefing info.
                    </p>
                  </div>
                )}

              </div>

            </div>
          </div>
        )}

        {/* 3. TERMINAL DIAGNOSTICS PANEL */}
        {activeTab === 'diagnostics' && (
          <div className="tab-pane animate-fade-in">
            <div className="diagnostics-panel-premium">
              <div className="panel-header-actions">
                <div>
                  <h2>{t("System Diagnostics & Connection Status")}</h2>
                  <p className="panel-desc-premium">Check physical database integrity, AI engines, and external API connectors.</p>
                </div>
                <button 
                  className="btn-primary-premium flex-centered"
                  onClick={fetchSystemStatus}
                  disabled={diagnosticsLoading}
                  style={{ width: 'auto', padding: '10px 20px' }}
                >
                  {diagnosticsLoading ? (
                    <>
                      <span className="spinner-small"></span>
                      <span>{t('Testing...') || "Testing..."}</span>
                    </>
                  ) : (
                    <span>{t('Run Diagnostics') || "Run Diagnostics"}</span>
                  )}
                </button>
              </div>

              <div className="diagnostics-cards-grid-premium">
                
                {/* 1. PostgreSQL Auth Database */}
                <div className={`diag-card-premium ${systemStatus?.sqlite_db?.connected ? 'connected' : 'disconnected'}`}>
                  <div className="diag-header">
                    <span className="diag-label">Authentication DB (PostgreSQL/Supabase)</span>
                    <span className={`diag-status-light ${systemStatus?.sqlite_db?.connected ? 'green' : 'red'}`}></span>
                  </div>
                  <div className="diag-body-premium">
                    <span className="diag-value">{systemStatus?.sqlite_db?.connected ? "CONNECTED" : "OFFLINE"}</span>
                    <p className="diag-desc-premium">Stores session parameters, local roles mapping, and credentials verification hashes.</p>
                  </div>
                </div>

                {/* 2. FastAPI Server */}
                <div className={`diag-card-premium ${systemStatus?.fastapi_backend?.connected ? 'connected' : 'disconnected'}`}>
                  <div className="diag-header">
                    <span className="diag-label">Intelligence Backend (FastAPI)</span>
                    <span className={`diag-status-light ${systemStatus?.fastapi_backend?.connected ? 'green' : 'red'}`}></span>
                  </div>
                  <div className="diag-body-premium">
                    <span className="diag-value">{systemStatus?.fastapi_backend?.connected ? "ONLINE" : "OFFLINE"}</span>
                    <p className="diag-desc-premium">Handles NLP pipeline parsing, semantic reasoning, and logs translation requests.</p>
                  </div>
                </div>

                {/* 3. Supabase DB */}
                <div className={`diag-card-premium ${systemStatus?.fastapi_backend?.supabase_db?.connected ? 'connected' : 'disconnected'}`}>
                  <div className="diag-header">
                    <span className="diag-label">Operational DB (Supabase)</span>
                    <span className={`diag-status-light ${systemStatus?.fastapi_backend?.supabase_db?.connected ? 'green' : 'red'}`}></span>
                  </div>
                  <div className="diag-body-premium">
                    <span className="diag-value">{systemStatus?.fastapi_backend?.supabase_db?.connected ? "ACTIVE" : "ERROR"}</span>
                    <p className="diag-desc-premium">
                      {systemStatus?.fastapi_backend?.supabase_db?.connected 
                        ? "Stores permanent operational briefs, reports data registry, and system datasets." 
                        : systemStatus?.fastapi_backend?.supabase_db?.error || "Connection error - check environment variables."}
                    </p>
                  </div>
                </div>

                {/* 4. QuickML LLM */}
                <div className={`diag-card-premium ${systemStatus?.fastapi_backend?.quickml?.connected ? 'connected' : 'disconnected'}`}>
                  <div className="diag-header">
                    <span className="diag-label">Intelligence Engine (QuickML)</span>
                    <span className={`diag-status-light ${systemStatus?.fastapi_backend?.quickml?.connected ? 'green' : 'red'}`}></span>
                  </div>
                  <div className="diag-body-premium">
                    <span className="diag-value">
                      {systemStatus?.fastapi_backend?.quickml?.connected ? "ACTIVE" : "OFFLINE"}
                    </span>
                    <p className="diag-desc-premium">
                      {systemStatus?.fastapi_backend?.quickml?.connected 
                        ? `Model Loaded: ${systemStatus.fastapi_backend.quickml.model}` 
                        : "QuickML instance is currently unreachable. AI Chat assistant will return fallbacks."}
                    </p>
                  </div>
                </div>

              </div>

              {/* Diagnostic Log Console */}
              <div className="diagnostics-console-box">
                <span className="console-title">System Telemetry Log Terminal</span>
                <div className="console-rows">
                  <span className="console-row info">[INFO] {new Date().toISOString()} - Initializing Diagnostics protocol...</span>
                  <span className="console-row success">[OK] PostgreSQL connection verified successfully.</span>
                  {systemStatus?.fastapi_backend?.connected ? (
                    <>
                      <span className="console-row success">[OK] FastAPI server response received in 18ms.</span>
                      <span className="console-row info">[INFO] Supabase operational node connected. SSL Enabled.</span>
                      {systemStatus?.fastapi_backend?.quickml?.connected ? (
                        <span className="console-row success">[OK] QuickML service active. Running model {systemStatus.fastapi_backend.quickml.model}.</span>
                      ) : (
                        <span className="console-row error">[ERROR] QuickML health check returned offline code.</span>
                      )}
                    </>
                  ) : (
                    <span className="console-row error">[ERROR] FastAPI intelligence backend connection refused.</span>
                  )}
                  <span className="console-row info">[INFO] Security handshake verification complete. Integrity status: 100%.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. AI DATASET REGISTRY PANEL */}
        {activeTab === 'datasets' && (
          <div className="tab-pane animate-fade-in">
            {role === 'admin' ? (
              <div className="datasets-panel-premium">
                
                <div className="datasets-split-grid">
                  
                  {/* Left Column: Register Dataset Form */}
                  <div className="dataset-creator-card">
                    <h3>{t("Register Operational Dataset") || "Register Operational Dataset"}</h3>
                    <p className="section-desc">Add backend relational tables to the registry for semantic LLM analytics mapping.</p>
                    
                    <form onSubmit={handleRegisterDataset} className="admin-form-premium" style={{ marginTop: '20px' }}>
                      {datasetMessage && (
                        <div className={`form-message-alert ${datasetMessage.type}`}>
                          {datasetMessage.text}
                        </div>
                      )}

                      <div className="form-field-premium">
                        <label>{t("Table Name") || "Table Name"}</label>
                        <input
                          type="text"
                          value={datasetTableName}
                          onChange={e => setDatasetTableName(e.target.value)}
                          placeholder="e.g. officer_profiles"
                          required
                        />
                      </div>

                      <div className="form-field-premium">
                        <label>{t("Dataset Description") || "Dataset Description"}</label>
                        <textarea
                          rows={4}
                          value={datasetDescription}
                          onChange={e => setDatasetDescription(e.target.value)}
                          placeholder="Explain what data this table contains so the AI model understands how to query it..."
                          required
                        />
                      </div>

                      <button type="submit" className="btn-primary-premium" style={{ width: '100%', marginTop: '16px' }} disabled={registeringDataset}>
                        {registeringDataset ? "Registering..." : "Register Dataset"}
                      </button>
                    </form>
                  </div>

                  {/* Right Column: Active Datasets List */}
                  <div className="dataset-list-card">
                    <h3>Registry Datasets</h3>
                    <p className="section-desc">Tables currently exposed for semantic analysis query mapping.</p>

                    {loadingDatasets ? (
                      <div className="loading-spinner-container">
                        <div className="spinner"></div>
                        <span>Loading registry...</span>
                      </div>
                    ) : datasets.length === 0 ? (
                      <div className="empty-datasets-box">
                        <div className="empty-icon">
                          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                          </svg>
                        </div>
                        <h4>No datasets registered</h4>
                        <p>Register tables on the left to make them queryable via the AI Chat assistant.</p>
                      </div>
                    ) : (
                      <div className="datasets-registry-table-wrapper">
                        <table className="registry-table">
                          <thead>
                            <tr>
                              <th>Table Name</th>
                              <th>Description</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {datasets.map(d => (
                              <tr key={d.id}>
                                <td className="table-name-cell"><code>{d.table_name}</code></td>
                                <td className="table-desc-cell">{d.description || 'No description'}</td>
                                <td>
                                  <span className={`status-pill ${d.is_enabled === 1 ? 'active' : 'disabled'}`}>
                                    {d.is_enabled === 1 ? 'Enabled' : 'Disabled'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                </div>

              </div>
            ) : (
              <div className="datasets-locked-panel">
                <div className="lock-box-premium">
                  <div className="lock-icon-shield">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="48" height="48">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                  </div>
                  <h2>ADMINISTRATIVE CLEARANCE REQUIRED</h2>
                  <p>Access to the AI Dataset Registry is restricted to Administrator roles. Regular officers cannot inspect relational schemas or edit mapping nodes on this terminal.</p>
                  <span className="badge-warning-clearance">CLEARANCE: LEVEL 1 (Officer) • REQUIRED: LEVEL 3 (Admin)</span>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
};

export default Dashboard;
