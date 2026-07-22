/**
 * @file Profile.tsx
 * @description Officer Profile editor component. Allows viewing and editing specific metadata details including badge number, rank, post, jurisdiction, and station assignment.
 */

import React, { useState, useEffect, FormEvent } from 'react';
import { useLanguage } from '../LanguageContext';

export const Profile: React.FC = () => {
  const { t } = useLanguage();
  const [badgeNumber, setBadgeNumber] = useState('');
  const [rank, setRank] = useState('');
  const [post, setPost] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const [area, setArea] = useState('');
  const [station, setStation] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/profile');
        if (res.ok) {
          const data = await res.json();
          if (data.profile) {
            setBadgeNumber(data.profile.badge_number || '');
            setRank(data.profile.rank || '');
            setPost(data.profile.post || '');
            setJurisdiction(data.profile.jurisdiction || '');
            setArea(data.profile.area || '');
            setStation(data.profile.station || '');
          }
        } else {
          showToast('Failed to load profile details');
        }
      } catch (err) {
        showToast('Error loading profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          badge_number: badgeNumber,
          rank,
          post,
          jurisdiction,
          area,
          station,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        showToast(t('Save Profile Details') === 'Save Profile Details' ? 'Profile updated successfully' : 'ಪ್ರೊಫೈಲ್ ಯಶಸ್ವಿಯಾಗಿ ನವೀಕರಿಸಲಾಗಿದೆ', 'success');
      } else {
        throw new Error(data.error || 'Failed to update profile');
      }
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{t('Loading...')}</span>
      </div>
    );
  }

  return (
    <section id="tab-profile" className="tab-pane active" style={{ animation: 'fadeIn 0.3s ease-out' }}>
      {/* Toast Notification */}
      {toast && (
        <div className={`toast show ${toast.type === 'success' ? 'success' : ''}`} style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 1100 }}>
          <span>{toast.message}</span>
        </div>
      )}

      <div className="profile-container">
        <div className="profile-header">
          <h2>{t('Officer Profile Details')}</h2>
          <p>{t('Keep your official information up-to-date. This data is used for official logging, jurisdiction verification, and audit purposes.')}</p>
        </div>

        <form id="profile-form" className="profile-grid-form" onSubmit={handleSubmit}>
          {/* Badge Number */}
          <div className="form-field">
            <label htmlFor="profile-badge-number">{t('Badge / ID Number')}</label>
            <input 
              type="text" 
              id="profile-badge-number" 
              required 
              placeholder="e.g. KSP-94827" 
              value={badgeNumber}
              onChange={(e) => setBadgeNumber(e.target.value)}
            />
          </div>

          {/* Rank Selector */}
          <div className="form-field">
            <label htmlFor="profile-rank">{t('Rank')}</label>
            <select 
              id="profile-rank" 
              required 
              value={rank}
              onChange={(e) => setRank(e.target.value)}
            >
              <option value="">{t('Select Rank...')}</option>
              <option value="Superintendent of Police (SP)">{t('Superintendent of Police (SP)')}</option>
              <option value="Deputy Superintendent of Police (DySP)">{t('Deputy Superintendent of Police (DySP)')}</option>
              <option value="Inspector of Police">{t('Inspector of Police')}</option>
              <option value="Sub-Inspector of Police (PSI)">{t('Sub-Inspector of Police (PSI)')}</option>
              <option value="Assistant Sub-Inspector (ASI)">{t('Assistant Sub-Inspector (ASI)')}</option>
              <option value="Head Constable">{t('Head Constable')}</option>
              <option value="Constable">{t('Constable')}</option>
            </select>
          </div>

          {/* Designation/Post Selector */}
          <div className="form-field">
            <label htmlFor="profile-post">{t('Designation / Post')}</label>
            <select 
              id="profile-post" 
              required 
              value={post}
              onChange={(e) => setPost(e.target.value)}
            >
              <option value="">{t('Select Designation...')}</option>
              <option value="Station House Officer (SHO)">{t('Station House Officer (SHO)')}</option>
              <option value="Investigating Officer (IO)">{t('Investigating Officer (IO)')}</option>
              <option value="Duty Officer">{t('Duty Officer')}</option>
              <option value="Crime Branch Head">{t('Crime Branch Head')}</option>
              <option value="Traffic In-charge">{t('Traffic In-charge')}</option>
              <option value="Patrol Officer">{t('Patrol Officer')}</option>
            </select>
          </div>

          {/* Jurisdiction Selector */}
          <div className="form-field">
            <label htmlFor="profile-jurisdiction">{t('Jurisdiction')}</label>
            <select 
              id="profile-jurisdiction" 
              required 
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
            >
              <option value="">{t('Select Jurisdiction...')}</option>
              <option value="Bengaluru City Police">{t('Bengaluru City Police')}</option>
              <option value="Mysuru City Police">{t('Mysuru City Police')}</option>
              <option value="Mangaluru City Police">{t('Mangaluru City Police')}</option>
              <option value="Hubballi-Dharwad City Police">{t('Hubballi-Dharwad City Police')}</option>
              <option value="Belagavi City Police">{t('Belagavi City Police')}</option>
              <option value="Kalaburagi City Police">{t('Kalaburagi City Police')}</option>
            </select>
          </div>

          {/* Assigned Area Selector */}
          <div className="form-field">
            <label htmlFor="profile-area">{t('Assigned Area')}</label>
            <select 
              id="profile-area" 
              required 
              value={area}
              onChange={(e) => setArea(e.target.value)}
            >
              <option value="">{t('Select Assigned Area...')}</option>
              <option value="Koramangala">{t('Koramangala')}</option>
              <option value="Indiranagar">{t('Indiranagar')}</option>
              <option value="Whitefield">{t('Whitefield')}</option>
              <option value="Jayanagar">{t('Jayanagar')}</option>
              <option value="Ulsoor">{t('Ulsoor')}</option>
              <option value="M.G. Road">{t('M.G. Road')}</option>
              <option value="Hebbal">{t('Hebbal')}</option>
              <option value="Malleshwaram">{t('Malleshwaram')}</option>
            </select>
          </div>

          {/* Police Station Selector */}
          <div className="form-field">
            <label htmlFor="profile-station">{t('Police Station')}</label>
            <select 
              id="profile-station" 
              required 
              value={station}
              onChange={(e) => setStation(e.target.value)}
            >
              <option value="">{t('Select Police Station...')}</option>
              <option value="Koramangala Police Station">{t('Koramangala Police Station')}</option>
              <option value="Indiranagar Police Station">{t('Indiranagar Police Station')}</option>
              <option value="Whitefield Police Station">{t('Whitefield Police Station')}</option>
              <option value="Jayanagar Police Station">{t('Jayanagar Police Station')}</option>
              <option value="Ulsoor Police Station">{t('Ulsoor Police Station')}</option>
              <option value="Malleshwaram Police Station">{t('Malleshwaram Police Station')}</option>
              <option value="Cubbon Park Police Station">{t('Cubbon Park Police Station')}</option>
            </select>
          </div>

          {/* Submit Button */}
          <div className="form-actions span-two">
            <button type="submit" id="save-profile-btn" className="btn-primary fit-content" disabled={saving}>
              {saving ? t('Loading...') : t('Save Profile Details')}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};
