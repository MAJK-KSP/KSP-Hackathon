/**
 * @file UserManagement.tsx
 * @description Admin User Creation & Role-Based Access Control (RBAC) Management Page.
 * Enables administrators to create new user accounts, set passwords, assign roles (investigators, analysts, supervisors, policymakers), and inspect cryptographic audit trails.
 */

import React, { useState, useEffect } from 'react';
import { useLanguage } from '../LanguageContext';

export interface ManagedUser {
  id: string;
  email: string;
  mfa_enabled: boolean | number;
  created_at: string;
  role: string;
  badge_number: string | null;
  rank: string | null;
  station: string | null;
}

export interface RbacAuditLog {
  id: string;
  performed_by: string;
  performed_by_email?: string;
  action: string;
  target_user_id: string;
  target_email: string;
  assigned_role: string;
  created_at: string;
  cryptographic_signature: string;
}

export const UserManagement: React.FC = () => {
  const { t } = useLanguage();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<RbacAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New User Form State
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('investigators');
  const [newBadge, setNewBadge] = useState('');
  const [newStation, setNewStation] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('/api/admin/rbac-audit-logs');
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchUsers(), fetchAuditLogs()]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setCreating(true);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          role: newRole,
          badge_number: newBadge,
          station: newStation,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || t('Failed to create user account.'));
      } else {
        setFormSuccess(data.message || t('User account created successfully!'));
        setNewEmail('');
        setNewPassword('');
        setNewBadge('');
        setNewStation('');
        setTimeout(() => {
          setShowCreateModal(false);
          setFormSuccess(null);
        }, 1500);
        await loadData();
      }
    } catch (err: any) {
      setFormError(t('Network error creating user account.'));
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (userId: string, targetRole: string) => {
    setUpdatingRoleId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: targetRole }),
      });

      if (res.ok) {
        setUsers(prev =>
          prev.map(u => (u.id === userId ? { ...u, role: targetRole } : u))
        );
        await fetchAuditLogs();
      } else {
        const data = await res.json();
        alert(data.error || t('Failed to update user role.'));
      }
    } catch (err) {
      alert(t('Network error updating user role.'));
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const getRoleBadgeStyle = (role: string) => {
    switch (role.toLowerCase()) {
      case 'investigators':
        return { bg: '#dbeafe', color: '#1e40af', label: 'Investigator' };
      case 'analysts':
        return { bg: '#e0e7ff', color: '#3730a3', label: 'Intelligence Analyst' };
      case 'supervisors':
        return { bg: '#fef3c7', color: '#92400e', label: 'Supervisor' };
      case 'policymakers':
        return { bg: '#f3e8ff', color: '#6b21a8', label: 'Policy Maker' };
      case 'admin':
        return { bg: '#fee2e2', color: '#991b1b', label: 'Administrator' };
      default:
        return { bg: '#f1f5f9', color: '#334155', label: 'Officer' };
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="dash-container" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
            {t('Role-Based Access Control & User Administration')}
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '4px' }}>
            {t('Manage investigator, analyst, supervisor, and policymaker access credentials with cryptographic audit logging.')}
          </p>
        </div>

        <button
          className="ai-btn-primary"
          onClick={() => { setShowCreateModal(true); setFormError(null); setFormSuccess(null); }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '8px' }}
        >
          <span>➕</span>
          <span>{t('Create New User')}</span>
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '12px', borderBottom: '2px solid #e2e8f0', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('users')}
          style={{
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'users' ? '3px solid #2563eb' : '3px solid transparent',
            fontWeight: activeTab === 'users' ? 700 : 500,
            color: activeTab === 'users' ? '#2563eb' : '#64748b',
            cursor: 'pointer',
            fontSize: '0.95rem'
          }}
        >
          👥 {t('User Directory & Roles')} ({users.length})
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          style={{
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'audit' ? '3px solid #2563eb' : '3px solid transparent',
            fontWeight: activeTab === 'audit' ? 700 : 500,
            color: activeTab === 'audit' ? '#2563eb' : '#64748b',
            cursor: 'pointer',
            fontSize: '0.95rem'
          }}
        >
          🔐 {t('Cryptographic Audit Trail')} ({auditLogs.length})
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
          <h3>{t('Loading user credentials...')}</h3>
        </div>
      ) : activeTab === 'users' ? (
        /* Users Directory Table */
        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                <th style={{ padding: '14px 16px' }}>{t('User Email')}</th>
                <th style={{ padding: '14px 16px' }}>{t('Assigned RBAC Role')}</th>
                <th style={{ padding: '14px 16px' }}>{t('Station / Badge')}</th>
                <th style={{ padding: '14px 16px' }}>{t('MFA Status')}</th>
                <th style={{ padding: '14px 16px' }}>{t('Created Date')}</th>
                <th style={{ padding: '14px 16px' }}>{t('Change Role')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const badge = getRoleBadgeStyle(u.role);
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0f172a' }}>
                      {u.email}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        backgroundColor: badge.bg,
                        color: badge.color,
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontWeight: 600,
                        fontSize: '0.775rem'
                      }}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#475569' }}>
                      {u.station || 'KSP HQ'} {u.badge_number ? `(#${u.badge_number})` : ''}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {u.mfa_enabled ? (
                        <span style={{ color: '#16a34a', fontWeight: 600 }}>{t('Enabled')}</span>
                      ) : (
                        <span style={{ color: '#dc2626' }}>{t('Disabled')}</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#64748b' }}>
                      {formatDate(u.created_at)}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <select
                        value={u.role}
                        onChange={e => handleRoleChange(u.id, e.target.value)}
                        disabled={updatingRoleId === u.id}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#ffffff',
                          fontSize: '0.8rem',
                          fontWeight: 500
                        }}
                      >
                        <option value="investigators">Investigator</option>
                        <option value="analysts">Analyst</option>
                        <option value="supervisors">Supervisor</option>
                        <option value="policymakers">Policymaker</option>
                        <option value="admin">Admin</option>
                        <option value="officer">Officer</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Cryptographic Audit Trail Table */
        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.825rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                <th style={{ padding: '14px 16px' }}>{t('Action')}</th>
                <th style={{ padding: '14px 16px' }}>{t('Admin')}</th>
                <th style={{ padding: '14px 16px' }}>{t('Target User')}</th>
                <th style={{ padding: '14px 16px' }}>{t('Role')}</th>
                <th style={{ padding: '14px 16px' }}>{t('Timestamp')}</th>
                <th style={{ padding: '14px 16px' }}>{t('HMAC SHA-256 Signature')}</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                    {t('No RBAC audit logs recorded yet.')}
                  </td>
                </tr>
              ) : (
                auditLogs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#1e293b' }}>
                      {log.action}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>
                      {log.performed_by_email || log.performed_by}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#0f172a', fontWeight: 500 }}>
                      {log.target_email}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ backgroundColor: '#e2e8f0', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                        {log.assigned_role}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#64748b' }}>
                      {formatDate(log.created_at)}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.75rem', color: '#0284c7' }}>
                      {log.cryptographic_signature.substring(0, 20)}...
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="ai-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="ai-preview-modal" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="ai-modal-header">
              <h3>{t('Create User & Assign RBAC Role')}</h3>
              <button className="ai-modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>

            <form onSubmit={handleCreateUser}>
              <div className="ai-modal-body" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {formError && (
                  <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '8px 12px', borderRadius: '6px', fontSize: '0.825rem' }}>
                    {formError}
                  </div>
                )}
                {formSuccess && (
                  <div style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '8px 12px', borderRadius: '6px', fontSize: '0.825rem' }}>
                    {formSuccess}
                  </div>
                )}

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    {t('User Email Address')} *
                  </label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="e.g. investigator.ravi@ksp.gov.in"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    {t('Password')} * (Min 12 chars, Upper, Lower, Number, Special)
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    {t('Assign RBAC Role')} *
                  </label>
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 600 }}
                  >
                    <option value="investigators">Investigator (Crime Investigation)</option>
                    <option value="analysts">Intelligence Analyst (Data & Trends)</option>
                    <option value="supervisors">Supervisor (Station Supervision)</option>
                    <option value="policymakers">Policymaker (Governance & Policy)</option>
                    <option value="admin">Administrator (System Admin)</option>
                    <option value="officer">Officer (General Duty)</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                      {t('Badge Number')}
                    </label>
                    <input
                      type="text"
                      value={newBadge}
                      onChange={e => setNewBadge(e.target.value)}
                      placeholder="e.g. KSP-9041"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                      {t('Station / Post')}
                    </label>
                    <input
                      type="text"
                      value={newStation}
                      onChange={e => setNewStation(e.target.value)}
                      placeholder="e.g. Central Command"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                </div>
              </div>

              <div className="ai-modal-footer">
                <button type="button" className="ai-btn-secondary" onClick={() => setShowCreateModal(false)}>
                  {t('Cancel')}
                </button>
                <button type="submit" className="ai-btn-primary" disabled={creating}>
                  {creating ? t('Creating User...') : t('Create Account & Assign Role')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
