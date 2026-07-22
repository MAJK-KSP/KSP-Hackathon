import React, { useState } from 'react';
import { Profile } from './Profile';
import { Security } from './Security';
import { useLanguage } from '../LanguageContext';

interface User {
  id: string;
  email: string;
  mfa_enabled: boolean;
  created_at: string;
}

interface SettingsProps {
  user: User;
  onMfaEnabled: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ user, onMfaEnabled }) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');

  return (
    <div className="settings-wrapper" style={{ animation: 'fadeIn 0.3s ease-out' }}>
      {/* Premium Tab Bar Header */}
      <div className="settings-tab-container glass-panel" style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 20px',
        gap: '10px',
        marginBottom: '24px',
        background: '#ffffff',
        boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
        borderRadius: '8px'
      }}>
        <button
          onClick={() => setActiveTab('profile')}
          className={`settings-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
          style={{
            padding: '16px 20px',
            fontSize: '15px',
            fontWeight: 600,
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'profile' ? '3px solid var(--ksp-navy)' : '3px solid transparent',
            color: activeTab === 'profile' ? 'var(--ksp-navy)' : 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            outline: 'none'
          }}
        >
          {t('Officer Profile')}
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`settings-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
          style={{
            padding: '16px 20px',
            fontSize: '15px',
            fontWeight: 600,
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'security' ? '3px solid var(--ksp-navy)' : '3px solid transparent',
            color: activeTab === 'security' ? 'var(--text-secondary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            outline: 'none'
          }}
        >
          {t('MFA Security')}
        </button>
      </div>

      {/* Render selected component */}
      <div className="settings-content-pane">
        {activeTab === 'profile' ? (
          <Profile />
        ) : (
          <Security user={user} onMfaEnabled={onMfaEnabled} />
        )}
      </div>
    </div>
  );
};
export default Settings;
