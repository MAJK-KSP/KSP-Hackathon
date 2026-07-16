/**
 * @file Security.tsx
 * @description MFA Management dashboard. Allows users to configure TOTP authenticator setups (QR code, manual key validation) and toggle two-factor status.
 */

import React, { useState, FormEvent } from 'react';
import { useLanguage } from '../LanguageContext';

interface User {
  id: string;
  email: string;
  mfa_enabled: boolean;
  created_at: string;
}

interface SecurityProps {
  user: User;
  onMfaEnabled: () => void;
}

export const Security: React.FC<SecurityProps> = ({ user, onMfaEnabled }) => {
  const { t } = useLanguage();
  const [setupMode, setSetupMode] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleStartSetup = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/mfa/setup', { method: 'POST' });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to initialize MFA setup');
      }
      
      setQrCodeUrl(data.qrCodeUrl);
      setSetupMode(true);
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySetup = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: mfaCode, is_setup: true })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'MFA verification failed');
      }
      
      showToast('Multi-Factor Authentication enabled successfully', 'success');
      setSetupMode(false);
      setQrCodeUrl(null);
      setMfaCode('');
      onMfaEnabled(); // Notify parent to update user state
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="tab-security" className="tab-pane active" style={{ animation: 'fadeIn 0.3s ease-out' }}>
      {/* Toast Notification */}
      {toast && (
        <div className={`toast show ${toast.type === 'success' ? 'success' : ''}`} style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 1100 }}>
          <span>{toast.message}</span>
        </div>
      )}

      <div className="security-container">
        <div className="security-header">
          <h2>{t('Multi-Factor Authentication (MFA / 2FA)')}</h2>
          <p>{t('MFA adds an extra layer of security to your account. In addition to your password, you will need a verification code from your authenticator app.')}</p>
        </div>

        {/* 1. MFA DISABLED STATE */}
        {!user.mfa_enabled && !setupMode && (
          <div id="mfa-setup-section" className="mfa-status-card disabled-card">
            <div className="status-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <div className="status-info">
              <h3>{t('MFA is currently disabled')}</h3>
              <p>{t('It is highly recommended to enable MFA immediately to secure your KSP account.')}</p>
              <button 
                id="setup-mfa-btn" 
                className="btn-primary fit-content" 
                onClick={handleStartSetup}
                disabled={loading}
              >
                {loading ? t('Loading...') : t('Configure 2FA Token')}
              </button>
            </div>
          </div>
        )}

        {/* 2. MFA SETUP ACTIVE STATE */}
        {!user.mfa_enabled && setupMode && (
          <div id="mfa-setup-active-section" className="mfa-setup-flow">
            <div className="setup-steps">
              {error && (
                <div className="toast show" style={{ position: 'relative', top: '0', right: '0', width: '100%', marginBottom: '16px' }}>
                  <span>{error}</span>
                </div>
              )}

              <div className="step-card">
                <div className="step-number">1</div>
                <div className="step-content">
                  <h4>{t('Scan this QR code with Google Authenticator, Authy, or Microsoft Authenticator.')}</h4>
                  <div className="qr-container">
                    {qrCodeUrl ? (
                      <img id="mfa-qr-image" src={qrCodeUrl} alt="MFA QR Code" />
                    ) : (
                      <div className="qr-placeholder">{t('Loading...')}</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="step-card">
                <div className="step-number">2</div>
                <div className="step-content">
                  <h4>{t('Enter the 6-digit verification code generated by your app below.')}</h4>
                  <form id="mfa-setup-form" onSubmit={handleVerifySetup}>
                    <div className="input-group">
                      <input 
                        type="text" 
                        id="mfa-setup-code" 
                        inputMode="numeric" 
                        pattern="[0-9]*" 
                        maxLength={6} 
                        placeholder="000000" 
                        required
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="setup-actions">
                      <button type="submit" id="verify-mfa-setup-btn" className="btn-primary fit-content" disabled={loading}>
                        {loading ? t('Loading...') : t('Verify & Enable')}
                      </button>
                      <button 
                        type="button" 
                        className="btn-link" 
                        onClick={() => { setSetupMode(false); setQrCodeUrl(null); setError(null); }}
                      >
                        {t('Cancel Setup')}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. MFA ENABLED STATE */}
        {user.mfa_enabled && (
          <div id="mfa-active-banner" className="mfa-status-card enabled-card">
            <div className="status-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
            </div>
            <div className="status-info">
              <h3>{t('MFA is Active & Protecting Your Account')}</h3>
              <p>{t('Your session is protected by standard hardware-based TOTP encryption.')}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
