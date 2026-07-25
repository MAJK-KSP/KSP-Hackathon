/**
 * @file FirGenerator.tsx
 * @description Official Karnataka State Police FIR Generator Component.
 * Supports complete 14-section statutory entry under Section 173 BNSS / 154 CrPC and generates an authentic, full-page 2-page printable court document.
 */

import React, { useState } from 'react';
import { useLanguage } from '../LanguageContext';

export interface FirFormData {
  court_name: string;
  district: string;
  circle_sub_division: string;
  police_station: string;
  crime_no: string;
  fir_date: string;
  act_section: string;
  occurrence_day: string;
  from_date: string;
  to_date: string;
  from_time: string;
  to_time: string;
  received_date_time: string;
  written_oral: string;
  delay_reasons: string;
  gd_entry_no_time: string;
  place_of_occurrence: string;
  distance_direction_ps: string;
  village: string;
  beat_name: string;
  other_jurisdiction_ps: string;
  other_jurisdiction_district: string;
  complainant_name: string;
  complainant_father_husband: string;
  complainant_age: string;
  complainant_occupation: string;
  complainant_religion: string;
  complainant_caste: string;
  complainant_fax: string;
  complainant_email: string;
  complainant_phone: string;
  complainant_nationality: string;
  complainant_passport: string;
  complainant_address: string;
  complainant_sex: string;
  complainant_seen_heard: string;
  accused_details: string;
  victim_details: string;
  property_details: string;
  inquest_ud_case: string;
  fir_contents: string;
  action_taken: string;
  copy_given_free: string;
  declined_reasons: string;
  complainant_signature_label: string;
  dispatch_date_time: string;
  carrying_officer: string;
}

const DEFAULT_SAMPLE_FIR: FirFormData = {
  court_name: "Honourable Court of JMFC 2nd Court, Shivamogga District, Balraj Urs Road, Shivamogga",
  district: "Shivamogga",
  circle_sub_division: "Shimoga Sub-Division",
  police_station: "Doddapete PS",
  crime_no: "0077/2026",
  fir_date: "2026-02-21",
  act_section: "The Bharatiya Nyaya Sanhita (BNS), 2023 (Section 305, Section 331(4), Section 3(5))",
  occurrence_day: "Sunday",
  from_date: "2026-02-20",
  to_date: "2026-02-20",
  from_time: "20:45:00",
  to_time: "21:15:00",
  received_date_time: "2026-02-21 04:30:00",
  written_oral: "Written",
  delay_reasons: "Complainant was undergoing medical examination & trauma care at District Hospital Shivamogga.",
  gd_entry_no_time: "General Diary Entry No. 1, 04:30:00 HRS",
  place_of_occurrence: "Opposite Kamath Petrol Bunk, Bharathi Colony Cross, NT Road, Shivamogga, Karnataka - 577201",
  distance_direction_ps: "Towards South & 01 km from Doddapete Police Station",
  village: "BHARATHI COLONY",
  beat_name: "BEAT NO. 02",
  other_jurisdiction_ps: "N/A",
  other_jurisdiction_district: "N/A",
  complainant_name: "Smt Padma",
  complainant_father_husband: "Nagaraja",
  complainant_age: "52 Years",
  complainant_occupation: "Housewife",
  complainant_religion: "Hindu",
  complainant_caste: "KSHATRIYA",
  complainant_fax: "N/A",
  complainant_email: "padma.nagaraj@gmail.com",
  complainant_phone: "+91 98451 22104",
  complainant_nationality: "Indian",
  complainant_passport: "N/A",
  complainant_address: "Door #44, 2nd Cross, Bharathi Colony, NT Road, Shivamogga - 577201",
  complainant_sex: "Female",
  complainant_seen_heard: "Seen the occurrence directly",
  accused_details: "1. Ramesh @ Blackie, S/o Late Kumar, Age 34, Male, Residing at NT Road Slum, Shivamogga (Known Habitual Burglar)\n2. Unknown accomplice, Male, Age approx 25-30 years, wearing dark jacket, blue jeans and black helmet",
  victim_details: "Smt Padma, W/o Nagaraja, Age 52, Housewife, Residing at Bharathi Colony, Shivamogga (Injury: Deep laceration on right forearm caused by sharp weapon during resistance)",
  property_details: "1. Gold Chain (22 Karat, 40 Grams) - Valued at Rs. 2,60,000/-\n2. Cash Rs. 45,000/- stolen from bedroom safe\n3. Titan Gold Watch - Valued at Rs. 15,000/-",
  inquest_ud_case: "N/A",
  fir_contents: "On 20/02/2026 at around 20:45 hours, while complainant Smt Padma was alone at her residence (Door #44, Bharathi Colony), two unknown individuals forcibly broke through the rear balcony door. Accused Ramesh @ Blackie threatened complainant with a sharp knife and forcibly snatched her 40-gram gold chain. Co-accused ransacked the bedroom safe and looted Rs. 45,000/- cash. Complainant sustained right arm injury while resisting. Accused fled on a black Hero Splendor motorcycle.",
  action_taken: "Registered case under BNS 305 & 331(4) and took up investigation. HC-1042 deputed to secure crime scene, preserve physical evidence/fingerprints, and collect nearby CCTV footage.",
  copy_given_free: "Yes - Read over and explained in Kannada to the complainant and copy given free of cost.",
  declined_reasons: "N/A",
  complainant_signature_label: "Smt Padma (Signed in Written Complaint)",
  dispatch_date_time: "2026-02-21 06:00:00",
  carrying_officer: "HC Ramesh Chandra (Badge #HC-1042), Doddapete PS"
};

export const FirGenerator: React.FC = () => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState<FirFormData>(DEFAULT_SAMPLE_FIR);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('preview');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const handleInputChange = (field: keyof FirFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveFir = async () => {
    setSaving(true);
    setSaveSuccess(null);
    try {
      const res = await fetch('/api/fir/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        const data = await res.json();
        setSaveSuccess(`FIR #${data.fir.crime_no} successfully saved and logged to Court Dispatch Registry!`);
      }
    } catch (err) {
      console.error('Error saving FIR:', err);
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fir-page-wrapper" style={{ padding: '1.25rem', maxWidth: '1200px', margin: '0 auto', fontFamily: "'Outfit', sans-serif" }}>
      {/* Top Controls Bar */}
      <div className="no-print" style={{
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: '12px',
        padding: '1rem 1.25rem',
        marginBottom: '1.25rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
            <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.15rem 0.55rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800 }}>
              2-PAGE OFFICIAL COURT FILING
            </span>
          </div>
          <h2 style={{ margin: 0, color: '#0b1e36', fontSize: '1.35rem', fontWeight: 800 }}>
            {t("Karnataka State Police FIR Generator")}
          </h2>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
            <button
              onClick={() => setActiveTab('edit')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'edit' ? '#0b1e36' : 'transparent',
                color: activeTab === 'edit' ? '#ffffff' : '#475569',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              ✏️ {t("Form Editor")}
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'preview' ? '#0b1e36' : 'transparent',
                color: activeTab === 'preview' ? '#ffffff' : '#475569',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              📄 {t("2-Page Document Preview")}
            </button>
          </div>

          <button
            onClick={handleSaveFir}
            disabled={saving}
            style={{
              background: '#16a34a',
              color: '#ffffff',
              border: 'none',
              padding: '7px 14px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
          >
            💾 {saving ? t('Saving...') : t('Save FIR Record')}
          </button>

          <button
            onClick={handlePrint}
            style={{
              background: '#0b1e36',
              color: '#ffffff',
              border: 'none',
              padding: '7px 14px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            🖨️ {t("Print / Download 2-Page PDF")}
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="no-print" style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '10px 16px', borderRadius: '8px', marginBottom: '1rem', fontWeight: 600, fontSize: '0.85rem' }}>
          ✓ {saveSuccess}
        </div>
      )}

      {/* RENDER FORM EDITOR VS 2-PAGE DOCUMENT PREVIEW */}
      {activeTab === 'edit' ? (
        /* FORM INPUT EDITOR */
        <div className="no-print" style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <h3 style={{ margin: '0 0 1.25rem 0', color: '#0b1e36', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem' }}>
            Section 173 BNSS Statutory FIR Data Entry
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
            {/* Section 1 */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', color: '#1e293b' }}>1. Jurisdiction &amp; Court Header</h4>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Honourable Court Name</label>
              <textarea rows={2} value={formData.court_name} onChange={e => handleInputChange('court_name', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem', marginBottom: '8px' }} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>District</label>
                  <input type="text" value={formData.district} onChange={e => handleInputChange('district', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Police Station (PS)</label>
                  <input type="text" value={formData.police_station} onChange={e => handleInputChange('police_station', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Crime No</label>
                  <input type="text" value={formData.crime_no} onChange={e => handleInputChange('crime_no', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>FIR Date</label>
                  <input type="date" value={formData.fir_date} onChange={e => handleInputChange('fir_date', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} />
                </div>
              </div>
            </div>

            {/* Section 2 */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', color: '#1e293b' }}>2. Act &amp; Section</h4>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Acts &amp; Penal Provisions Invoked</label>
              <textarea rows={3} value={formData.act_section} onChange={e => handleInputChange('act_section', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} />
            </div>

            {/* Section 3 */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', color: '#1e293b' }}>3. Timing &amp; Reception</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Occurrence Day</label>
                  <input type="text" value={formData.occurrence_day} onChange={e => handleInputChange('occurrence_day', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Information Type</label>
                  <select value={formData.written_oral} onChange={e => handleInputChange('written_oral', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}>
                    <option value="Written">Written</option>
                    <option value="Oral">Oral</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>From Date &amp; Time</label>
                  <input type="text" value={`${formData.from_date} ${formData.from_time}`} onChange={e => {
                    const parts = e.target.value.split(' ');
                    handleInputChange('from_date', parts[0] || '');
                    handleInputChange('from_time', parts[1] || '');
                  }} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Received at PS Date &amp; Time</label>
                  <input type="text" value={formData.received_date_time} onChange={e => handleInputChange('received_date_time', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} />
                </div>
              </div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginTop: '6px' }}>GD Entry No &amp; Time</label>
              <input type="text" value={formData.gd_entry_no_time} onChange={e => handleInputChange('gd_entry_no_time', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} />
            </div>

            {/* Section 4 */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', color: '#1e293b' }}>4. Location of Crime</h4>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Place of Occurrence Address</label>
              <textarea rows={2} value={formData.place_of_occurrence} onChange={e => handleInputChange('place_of_occurrence', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem', marginBottom: '6px' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Distance &amp; Direction</label>
                  <input type="text" value={formData.distance_direction_ps} onChange={e => handleInputChange('distance_direction_ps', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Beat Name</label>
                  <input type="text" value={formData.beat_name} onChange={e => handleInputChange('beat_name', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} />
                </div>
              </div>
            </div>

            {/* Section 5 */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', color: '#1e293b' }}>5. Complainant / Informant</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Name</label>
                  <input type="text" value={formData.complainant_name} onChange={e => handleInputChange('complainant_name', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Father / Husband Name</label>
                  <input type="text" value={formData.complainant_father_husband} onChange={e => handleInputChange('complainant_father_husband', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Phone No</label>
                  <input type="text" value={formData.complainant_phone} onChange={e => handleInputChange('complainant_phone', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Age / Sex</label>
                  <input type="text" value={`${formData.complainant_age} / ${formData.complainant_sex}`} onChange={e => {
                    const parts = e.target.value.split('/');
                    handleInputChange('complainant_age', parts[0]?.trim() || '');
                    handleInputChange('complainant_sex', parts[1]?.trim() || '');
                  }} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} />
                </div>
              </div>
            </div>

            {/* Section 6 & 7 */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', color: '#1e293b' }}>6 &amp; 7. Accused &amp; Victims</h4>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Accused Particulars</label>
              <textarea rows={2} value={formData.accused_details} onChange={e => handleInputChange('accused_details', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem', marginBottom: '6px' }} />
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Victim Particulars</label>
              <textarea rows={2} value={formData.victim_details} onChange={e => handleInputChange('victim_details', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} />
            </div>

            {/* Section 8 & 10 */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', gridColumn: 'span 2' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', color: '#1e293b' }}>8 &amp; 10. Stolen Property &amp; FIR Narrative Complaint</h4>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Itemized Stolen Property Details</label>
              <textarea rows={2} value={formData.property_details} onChange={e => handleInputChange('property_details', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem', marginBottom: '8px' }} />
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>F.I.R Complaint Narrative Contents</label>
              <textarea rows={4} value={formData.fir_contents} onChange={e => handleInputChange('fir_contents', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} />
            </div>
          </div>
        </div>
      ) : (
        /* OFFICIAL 2-PAGE COURT FORMAT DOCUMENT RENDERER (CLEAN FULL-PAGE PROPORTIONS) */
        <div className="fir-print-document">
          {/* ==================== PAGE 1 (SECTIONS 1 - 7) ==================== */}
          <div className="fir-doc-page">
            <div>
              {/* Document Banner Header */}
              <div style={{ textAlign: 'center', marginBottom: '1.25rem', textTransform: 'uppercase' }}>
                <h3 style={{ margin: 0, fontSize: '13pt', fontWeight: 'bold', letterSpacing: '0.5px' }}>KARNATAKA STATE POLICE</h3>
                <h2 style={{ margin: '4px 0 2px 0', fontSize: '15pt', fontWeight: 'bold', letterSpacing: '1px' }}>FIRST INFORMATION REPORT</h2>
                <div style={{ fontSize: '10pt', fontStyle: 'italic', fontWeight: 'normal' }}>(Under Section 173 Bharatiya Nagarik Suraksha Sanhita / Section 154 Cr.P.C)</div>
                <div style={{ fontSize: '10pt', marginTop: '6px', fontWeight: 'bold' }}>
                  Before the Honourable Court of {formData.court_name}
                </div>
              </div>

              {/* Section 1 */}
              <div style={{ borderTop: '2px solid #000', borderBottom: '1.5px solid #000', padding: '10px 0', marginBottom: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr', gap: '8px', marginBottom: '6px' }}>
                  <div><strong>1. District :</strong> {formData.district}</div>
                  <div><strong>Circle/Sub Division :</strong> {formData.circle_sub_division}</div>
                  <div><strong>PS :</strong> {formData.police_station}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr', gap: '8px' }}>
                  <div><strong>Crime No :</strong> {formData.crime_no}</div>
                  <div><strong>FIR Date :</strong> {formData.fir_date}</div>
                </div>
              </div>

              {/* Section 2 */}
              <div style={{ marginBottom: '1.25rem' }}>
                <strong>2. Act &amp; Section :</strong> {formData.act_section}
              </div>

              {/* Section 3 */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div><strong>3. (a) Occurrence of Offence Day :</strong> {formData.occurrence_day} &nbsp;&nbsp;&nbsp;&nbsp; <strong>From Date :</strong> {formData.from_date} &nbsp;&nbsp;&nbsp;&nbsp; <strong>To Date :</strong> {formData.to_date}</div>
                <div style={{ paddingLeft: '170px', marginTop: '3px' }}><strong>From Time :</strong> {formData.from_time} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <strong>To Time :</strong> {formData.to_time}</div>
                
                <div style={{ marginTop: '6px' }}>
                  <strong>(b) Information received at the PS :</strong> {formData.received_date_time} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <strong>Written/Oral :</strong> {formData.written_oral}
                </div>
                
                <div style={{ marginTop: '6px' }}>
                  <strong>(c) Reasons for Delay in reporting by Complainant / Informant :</strong><br />
                  <span style={{ paddingLeft: '20px' }}>{formData.delay_reasons || "N/A"}</span>
                </div>

                <div style={{ marginTop: '6px' }}>
                  <strong>(d) General Diary reference Entry No. &amp; Time :</strong> {formData.gd_entry_no_time}
                </div>
              </div>

              {/* Section 4 */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div><strong>4. (a) Place of occurrence with full address :</strong></div>
                <div style={{ paddingLeft: '20px', margin: '4px 0 6px 0' }}>{formData.place_of_occurrence}</div>
                
                <div style={{ marginBottom: '4px' }}><strong>(b) Distance from PS :</strong> {formData.distance_direction_ps}</div>
                <div style={{ marginBottom: '4px' }}><strong>(c) Village :</strong> {formData.village} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <strong>Beat Name :</strong> {formData.beat_name}</div>
                <div><strong>(d) If the place belongs to another jurisdiction, PS Name :</strong> {formData.other_jurisdiction_ps} &nbsp;&nbsp;&nbsp;&nbsp; <strong>District :</strong> {formData.other_jurisdiction_district}</div>
              </div>

              {/* Section 5 */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div><strong>5. Complainant / Informant Details :</strong></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px', paddingLeft: '20px', marginTop: '4px' }}>
                  <div><strong>(a) Name :</strong> {formData.complainant_name}</div>
                  <div><strong>Father's/Husband's Name :</strong> {formData.complainant_father_husband}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', paddingLeft: '20px', marginTop: '3px' }}>
                  <div><strong>(b) Age :</strong> {formData.complainant_age} &nbsp;|&nbsp; <strong>(l) Sex :</strong> {formData.complainant_sex}</div>
                  <div><strong>(c) Occupation :</strong> {formData.complainant_occupation}</div>
                  <div><strong>(i) Nationality :</strong> {formData.complainant_nationality}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', paddingLeft: '20px', marginTop: '3px' }}>
                  <div><strong>(d) Religion :</strong> {formData.complainant_religion}</div>
                  <div><strong>(e) Caste :</strong> {formData.complainant_caste}</div>
                  <div><strong>(h) Phone No :</strong> {formData.complainant_phone}</div>
                </div>
                <div style={{ paddingLeft: '20px', marginTop: '3px' }}>
                  <div><strong>(g) Email :</strong> {formData.complainant_email} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <strong>(k) Address :</strong> {formData.complainant_address}</div>
                  <div><strong>(m) Occurrence Perception :</strong> {formData.complainant_seen_heard}</div>
                </div>
              </div>

              {/* Section 6 */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div><strong>6. Details of Known / Suspected / Unknown Accused with Full Particulars :</strong></div>
                <div style={{ paddingLeft: '20px', marginTop: '4px', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{formData.accused_details}</div>
              </div>

              {/* Section 7 */}
              <div style={{ marginBottom: '1rem' }}>
                <div><strong>7. Details of Victims with Full Particulars :</strong></div>
                <div style={{ paddingLeft: '20px', marginTop: '4px', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{formData.victim_details}</div>
              </div>
            </div>

            {/* Page 1 Footer */}
            <div style={{ borderTop: '1.5px solid #000', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '9.5pt', color: '#222222' }}>
              <span>Karnataka State Police — Official FIR Record</span>
              <span>Page 1 of 2</span>
            </div>
          </div>

          {/* ==================== PAGE 2 (SECTIONS 8 - 14 & SIGNATURES) ==================== */}
          <div className="fir-doc-page">
            <div>
              {/* Page 2 Continuation Header */}
              <div style={{ borderBottom: '2.5px solid #000', paddingBottom: '6px', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '11.5pt' }}>KARNATAKA STATE POLICE — FIRST INFORMATION REPORT</strong>
                <span style={{ fontSize: '10.5pt', fontWeight: 'bold' }}>Crime No: {formData.crime_no} &nbsp;|&nbsp; Page 2 of 2 (Final)</span>
              </div>

              {/* Section 8 */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div><strong>8. Particulars of Property Stolen / Involved with Estimated Value in Rupees :</strong></div>
                <div style={{ paddingLeft: '20px', marginTop: '6px', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{formData.property_details}</div>
              </div>

              {/* Section 9 */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div><strong>9. Inquest Report / U.D. Case No. if any :</strong> {formData.inquest_ud_case}</div>
              </div>

              {/* Section 10 */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div><strong>10. F.I.R Contents (Exact Narrative Statement / Written Complaint Transcribed) :</strong></div>
                <div style={{
                  padding: '14px 16px',
                  border: '1.5px solid #000000',
                  marginTop: '8px',
                  textAlign: 'justify',
                  whiteSpace: 'pre-wrap',
                  minHeight: '200px',
                  lineHeight: '1.65'
                }}>
                  {formData.fir_contents}
                </div>
              </div>

              {/* Section 11 */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div><strong>11. Action Taken :</strong></div>
                <div style={{ paddingLeft: '20px', marginTop: '6px' }}>
                  <div style={{ marginBottom: '4px' }}><strong>(a) Action Taken :</strong> {formData.action_taken}</div>
                  <div style={{ marginBottom: '4px' }}><strong>(b) Read over and explained in complainant's language and copy given free of cost :</strong> {formData.copy_given_free}</div>
                  <div><strong>(c) If Police Officer does not proceed to spot or declines investigation (reasons) :</strong> {formData.declined_reasons}</div>
                </div>
              </div>

              {/* Section 12, 13, 14 Signatures & Station Seals */}
              <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1.5px dashed #000', paddingTop: '1.5rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ marginBottom: '3rem', fontStyle: 'italic', color: '#222' }}>({formData.complainant_signature_label})</div>
                  <div>_____________________________________</div>
                  <strong style={{ fontSize: '10.5pt' }}>12. Signature / Thumb Impression of Complainant</strong>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10pt', marginBottom: '14px', textAlign: 'left', lineHeight: '1.45' }}>
                    <strong>13. Date &amp; Time of Court Dispatch :</strong> {formData.dispatch_date_time}<br />
                    <strong>14. Carrying Officer Name &amp; Badge :</strong> {formData.carrying_officer}
                  </div>
                  <div style={{ marginTop: '2rem' }}>_____________________________________</div>
                  <strong style={{ fontSize: '10.5pt' }}>Signature of Police Officer i/c of Police Station</strong><br />
                  <span style={{ fontSize: '9.5pt' }}>Rank: Inspector of Police &nbsp;|&nbsp; PS: {formData.police_station}</span>
                </div>
              </div>
            </div>

            {/* Page 2 Footer */}
            <div style={{ borderTop: '1.5px solid #000', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '9.5pt', color: '#222222' }}>
              <span>Karnataka State Police — Official Court Dispatch Filing</span>
              <span>Page 2 of 2 (Final Court Copy)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FirGenerator;
