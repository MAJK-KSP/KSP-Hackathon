/**
 * @file DecisionSupport.tsx
 * @description State-of-the-Art Police Command Intelligence Dossier Component for Karnataka State Police.
 * Main title panel remains dark navy/gold hero banner.
 * Dossier cards below use clean white background with crisp typography & contrast accents.
 */

import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { useLanguage } from '../LanguageContext';

interface CaseItem {
  case_id: string;
  case_number: string;
  title: string;
  crime_type: string;
  police_station: string;
  status: string;
  incident_date: string;
  location: string;
  description: string;
  investigating_officer: string;
}

interface AccusedPerson {
  accusedname: string;
  age: number;
}

interface ComplainantPerson {
  complainantname: string;
  age: number;
}

interface VictimPerson {
  victimname: string;
  age: number;
}

interface TimelineItem {
  id: string;
  timestamp: string;
  actor: string;
  log_type: string;
  description: string;
}

interface CaseDetailsResponse {
  case: CaseItem;
  accused: AccusedPerson[];
  complainants: ComplainantPerson[];
  victims: VictimPerson[];
  timeline: TimelineItem[];
}

// React Error Boundary
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: ErrorInfo) {
    console.error("DecisionSupport ErrorBoundary caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', color: '#dc2626', background: '#fef2f2', borderRadius: '12px', border: '1px solid #fca5a5', margin: '2rem' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#dc2626' }}>⚠️ Intelligence Module Recovered</h3>
          <p style={{ color: '#4b5563', fontSize: '0.9rem' }}>An error occurred while rendering case dossier data.</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{ background: '#0b1e36', color: '#c5a059', border: 'none', padding: '0.6rem 1.4rem', borderRadius: '6px', fontWeight: 800, cursor: 'pointer' }}
          >
            Reload Module
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const DecisionSupportContent: React.FC = () => {
  const { t } = useLanguage();

  // State
  const [activeCases, setActiveCases] = useState<CaseItem[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [loadingCases, setLoadingCases] = useState<boolean>(true);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);
  const [caseDetails, setCaseDetails] = useState<CaseDetailsResponse | null>(null);

  // Load Active Cases on Mount
  useEffect(() => {
    fetchActiveCases();
  }, []);

  const fetchActiveCases = async () => {
    setLoadingCases(true);
    try {
      const res = await fetch('/api/decision-support/active-cases');
      if (res.ok) {
        const data = await res.json();
        if (data.cases && Array.isArray(data.cases) && data.cases.length > 0) {
          setActiveCases(data.cases);
          const firstCase = data.cases[0];
          setSelectedCaseId(firstCase.case_id);
          fetchCaseDetails(firstCase.case_id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch active cases:', err);
    } finally {
      setLoadingCases(false);
    }
  };

  const fetchCaseDetails = async (caseId: string) => {
    if (!caseId) return;
    setLoadingDetails(true);
    try {
      const res = await fetch(`/api/decision-support/case-details/${encodeURIComponent(caseId)}`);
      if (res.ok) {
        const data = await res.json();
        setCaseDetails(data);
      }
    } catch (err) {
      console.error('Failed to fetch case details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const currentCase = caseDetails?.case || activeCases.find(c => c.case_id === selectedCaseId);

  const getLogBadgeStyle = (type: string) => {
    switch (type) {
      case 'EVIDENCE_COLLECTED':
        return { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' };
      case 'INTERVIEW_RECORDED':
        return { bg: '#ecfdf5', text: '#047857', border: '#6ee7b7' };
      case 'FIRST_RESPONDER':
        return { bg: '#f5f3ff', text: '#6d28d9', border: '#c4b5fd' };
      default:
        return { bg: '#fefce8', text: '#a16207', border: '#fde047' };
    }
  };

  return (
    <div className="ds-page-container" style={{ padding: '1.5rem', maxWidth: '1600px', margin: '0 auto' }}>

      {/* TOP COMMAND HERO HEADER (KEPT DARK NAVY & GOLD) */}
      <div className="ds-hero-banner" style={{
        background: 'linear-gradient(135deg, #070f19 0%, #0b1e36 60%, #173259 100%)',
        border: '1px solid rgba(197, 160, 89, 0.45)',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '14px',
        padding: '1.75rem 2rem',
        marginBottom: '1.75rem'
      }}>
        <div style={{
          position: 'absolute',
          top: '-40px',
          right: '-40px',
          width: '200px',
          height: '200px',
          background: 'radial-gradient(circle, rgba(197, 160, 89, 0.15) 0%, transparent 70%)',
          pointerEvents: 'none'
        }}></div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.25rem', position: 'relative', zIndex: 2 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
              <span style={{
                background: 'rgba(197, 160, 89, 0.18)',
                color: '#c5a059',
                border: '1px solid rgba(197, 160, 89, 0.4)',
                padding: '0.25rem 0.75rem',
                borderRadius: '20px',
                fontSize: '0.75rem',
                fontWeight: 800,
                letterSpacing: '1px',
                textTransform: 'uppercase'
              }}>
                KARNATAKA STATE POLICE COMMAND
              </span>
              <span style={{
                background: 'rgba(52, 211, 153, 0.15)',
                color: '#34d399',
                border: '1px solid rgba(52, 211, 153, 0.3)',
                padding: '0.25rem 0.65rem',
                borderRadius: '20px',
                fontSize: '0.75rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#34d399', boxShadow: '0 0 6px #34d399' }}></span>
                {activeCases.length} ACTIVE DOSSIERS
              </span>
            </div>

            <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '1.75rem', fontWeight: 900, letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#c5a059" strokeWidth="2.4">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              {t("Investigator Active Case Intelligence")}
            </h2>
            <p style={{ margin: '0.35rem 0 0 0', color: '#94a3b8', fontSize: '0.94rem' }}>
              {t("100% Direct SQL Database Query — Case Summary, Accused Suspects, Complainants & Timeline")}
            </p>
          </div>
        </div>

        {/* MASTER SELECTOR: ALL ACTIVE CASES (FROM DATABASE) */}
        <div style={{ marginTop: '1.5rem', position: 'relative', zIndex: 2 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#c5a059', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.6rem' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            {t("All Active Cases (Only from Database)")}:
          </label>
          <div style={{ position: 'relative' }}>
            <select
              value={selectedCaseId}
              onChange={(e) => {
                setSelectedCaseId(e.target.value);
                fetchCaseDetails(e.target.value);
              }}
              disabled={loadingCases}
              style={{
                width: '100%',
                background: '#040a14',
                border: '1.5px solid #c5a059',
                color: '#f8fafc',
                padding: '0.85rem 1.25rem',
                borderRadius: '10px',
                fontSize: '1.02rem',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                boxShadow: '0 6px 20px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
              }}
            >
              {loadingCases ? (
                <option>Loading Active Cases from Database...</option>
              ) : (
                activeCases.map(c => (
                  <option key={c.case_id} value={c.case_id}>
                    FIR #{c.case_number} — {c.police_station} | {c.crime_type} ({c.title})
                  </option>
                ))
              )}
            </select>
            <div style={{
              position: 'absolute',
              right: '1.25rem',
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              color: '#c5a059'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* ACTIVE CASE DETAILS DOSSIER (WHITE BACKGROUND THEME FOR ALL CARDS BELOW) */}
      {loadingDetails ? (
        <div style={{ textAlign: 'center', padding: '5rem', background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          <div className="spinner" style={{ width: '36px', height: '36px', border: '3px solid #0b1e36', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1.25rem auto' }}></div>
          <p style={{ fontWeight: 800, fontSize: '1.1rem', color: '#0b1e36', letterSpacing: '0.5px' }}>Querying Database for Case #{selectedCaseId}...</p>
        </div>
      ) : currentCase ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>

          {/* CARD 1: EXECUTIVE CASE DOSSIER (WHITE BACKGROUND) */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderTop: '4px solid #c5a059',
            borderRadius: '14px',
            padding: '1.75rem',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <span style={{
                    backgroundColor: '#fef2f2',
                    color: '#dc2626',
                    border: '1px solid #fca5a5',
                    padding: '0.3rem 0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 900,
                    letterSpacing: '0.8px'
                  }}>
                    ● UNDER ACTIVE INVESTIGATION
                  </span>
                  <strong style={{ color: '#0b1e36', fontSize: '1.25rem', fontFamily: 'monospace' }}>FIR #{currentCase.case_number}</strong>
                </div>
                <h3 style={{ margin: 0, color: '#0b1e36', fontSize: '1.55rem', fontWeight: 800 }}>
                  {currentCase.police_station} — {currentCase.crime_type}
                </h3>
              </div>

              <div style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                padding: '0.65rem 1.1rem',
                borderRadius: '8px',
                textAlign: 'right'
              }}>
                <span style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, display: 'block' }}>Investigating Officer</span>
                <strong style={{ color: '#0b1e36', fontSize: '1rem', fontWeight: 800 }}>{currentCase.investigating_officer}</strong>
              </div>
            </div>

            {/* 4 METRICS GRID (LIGHT GREY CARDS) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1.25rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.9rem 1.1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '0.25rem' }}>Police Station</div>
                <div style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0b1e36' }}>{currentCase.police_station}</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.9rem 1.1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '0.25rem' }}>Crime Classification</div>
                <div style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0284c7' }}>{currentCase.crime_type}</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.9rem 1.1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '0.25rem' }}>Incident Landmark</div>
                <div style={{ fontSize: '1.02rem', fontWeight: 800, color: '#059669' }}>{currentCase.location}</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.9rem 1.1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '0.25rem' }}>Registration Timestamp</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#7c3aed', fontFamily: 'monospace' }}>{currentCase.incident_date}</div>
              </div>
            </div>

            {/* FACTUAL CASE RECORD BOX */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              padding: '1.4rem 1.65rem',
              borderRadius: '10px'
            }}>
              <h4 style={{ margin: '0 0 0.6rem 0', color: '#0b1e36', fontSize: '0.98rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c5a059" strokeWidth="2.4">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                </svg>
                Factual Case Summary (SQL Database `brieffacts` Record)
              </h4>
              <p style={{ margin: 0, color: '#1e293b', fontSize: '1rem', lineHeight: '1.65', fontWeight: 500 }}>
                {currentCase.description}
              </p>
            </div>
          </div>

          {/* CARD 2: PERSONS INVOLVED NETWORK GRID (WHITE BACKGROUND) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: '1.5rem'
          }}>
            {/* ACCUSED / SUSPECTS */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderTop: '4px solid #ef4444',
              borderRadius: '14px',
              padding: '1.75rem',
              boxShadow: '0 6px 20px rgba(0, 0, 0, 0.05)'
            }}>
              <h4 style={{ margin: '0 0 1.25rem 0', color: '#dc2626', fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                Tagged Accused / Suspects ({caseDetails?.accused?.length || 0})
              </h4>

              {caseDetails?.accused && caseDetails.accused.length > 0 ? (
                caseDetails.accused.map((a, idx) => (
                  <div key={idx} style={{
                    background: '#fef2f2',
                    border: '1px solid #fca5a5',
                    padding: '1rem 1.2rem',
                    borderRadius: '8px',
                    marginBottom: '0.75rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ color: '#991b1b', fontSize: '1.05rem', fontWeight: 800 }}>👤 {a.accusedname}</strong>
                      <span style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 800 }}>
                        Age: {a.age}
                      </span>
                    </div>
                    <div style={{ color: '#7f1d1d', fontSize: '0.85rem', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontWeight: 700 }}>• Status:</span> Listed in FIR #{currentCase.case_number}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '1.5rem', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                  <p style={{ color: '#64748b', margin: 0, fontStyle: 'italic', fontSize: '0.92rem' }}>No accused persons currently listed in database for this FIR.</p>
                </div>
              )}
            </div>

            {/* COMPLAINANTS & VICTIMS */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderTop: '4px solid #3b82f6',
              borderRadius: '14px',
              padding: '1.75rem',
              boxShadow: '0 6px 20px rgba(0, 0, 0, 0.05)'
            }}>
              <h4 style={{ margin: '0 0 1.25rem 0', color: '#2563eb', fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                Complainants & Victims ({ (caseDetails?.complainants?.length || 0) + (caseDetails?.victims?.length || 0) })
              </h4>

              {caseDetails?.complainants && caseDetails.complainants.length > 0 && (
                <div style={{ marginBottom: '1.1rem' }}>
                  <div style={{ color: '#1d4ed8', fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>Complainant(s):</div>
                  {caseDetails.complainants.map((c, idx) => (
                    <div key={idx} style={{
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      padding: '0.85rem 1.1rem',
                      borderRadius: '8px',
                      marginBottom: '0.5rem'
                    }}>
                      <strong style={{ color: '#1e40af', fontSize: '0.98rem' }}>📜 {c.complainantname}</strong>
                      <span style={{ color: '#3b82f6', fontSize: '0.82rem', marginLeft: '0.6rem', fontWeight: 700 }}>(Age {c.age})</span>
                    </div>
                  ))}
                </div>
              )}

              {caseDetails?.victims && caseDetails.victims.length > 0 && (
                <div>
                  <div style={{ color: '#047857', fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>Victim(s):</div>
                  {caseDetails.victims.map((v, idx) => (
                    <div key={idx} style={{
                      background: '#ecfdf5',
                      border: '1px solid #a7f3d0',
                      padding: '0.85rem 1.1rem',
                      borderRadius: '8px',
                      marginBottom: '0.5rem'
                    }}>
                      <strong style={{ color: '#065f46', fontSize: '0.98rem' }}>🛡️ {v.victimname}</strong>
                      <span style={{ color: '#059669', fontSize: '0.82rem', marginLeft: '0.6rem', fontWeight: 700 }}>(Age {v.age})</span>
                    </div>
                  ))}
                </div>
              )}

              {(!caseDetails?.complainants?.length && !caseDetails?.victims?.length) && (
                <div style={{ padding: '1.5rem', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                  <p style={{ color: '#64748b', margin: 0, fontStyle: 'italic', fontSize: '0.92rem' }}>No complainant or victim records found.</p>
                </div>
              )}
            </div>
          </div>

          {/* CARD 3: CHRONOLOGICAL EVENT TIMELINE (WHITE BACKGROUND) */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderTop: '4px solid #8b5cf6',
            borderRadius: '14px',
            padding: '1.75rem',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.05)'
          }}>
            <h3 style={{ margin: '0 0 1.25rem 0', color: '#6d28d9', fontSize: '1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              Chronological Investigation Timeline (Database Events)
            </h3>

            {caseDetails?.timeline && caseDetails.timeline.length > 0 ? (
              <div style={{ position: 'relative', paddingLeft: '1.75rem', borderLeft: '2px dashed #cbd5e1' }}>
                {caseDetails.timeline.map((log, idx) => {
                  const badgeStyle = getLogBadgeStyle(log.log_type);
                  return (
                    <div key={log.id || idx} style={{ position: 'relative', marginBottom: '1.25rem' }}>
                      <div
                        style={{
                          position: 'absolute',
                          left: '-2.25rem',
                          top: '0.35rem',
                          width: '14px',
                          height: '14px',
                          borderRadius: '50%',
                          backgroundColor: badgeStyle.text,
                          boxShadow: `0 0 8px ${badgeStyle.border}`
                        }}
                      ></div>

                      <div style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        padding: '1rem 1.25rem',
                        borderRadius: '8px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.6rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <span style={{
                              backgroundColor: badgeStyle.bg,
                              color: badgeStyle.text,
                              border: `1px solid ${badgeStyle.border}`,
                              fontSize: '0.74rem',
                              fontWeight: 800,
                              padding: '0.2rem 0.6rem',
                              borderRadius: '4px'
                            }}>
                              {log.log_type}
                            </span>
                            <strong style={{ color: '#0b1e36', fontSize: '1rem', fontWeight: 800 }}>{log.actor}</strong>
                          </div>
                          <span style={{ fontSize: '0.85rem', color: '#64748b', fontFamily: 'monospace', fontWeight: 700 }}>
                            ⏱️ {log.timestamp}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.96rem', color: '#334155', lineHeight: '1.6' }}>
                          {log.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: '#64748b', fontStyle: 'italic' }}>No timeline events recorded.</p>
            )}
          </div>

        </div>
      ) : null}

    </div>
  );
};

export const DecisionSupport: React.FC = () => {
  return (
    <ErrorBoundary>
      <DecisionSupportContent />
    </ErrorBoundary>
  );
};

export default DecisionSupport;
