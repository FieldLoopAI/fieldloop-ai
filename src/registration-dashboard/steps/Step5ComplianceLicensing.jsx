// src/components/steps/Step5ComplianceLicensing.jsx
import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

export default function Step5ComplianceLicensing({ data, onChange, activeUser, writeAllowed }) {
  const comp = data.compliance || {};
  const [newLicenseText, setNewLicenseText] = useState('');

  const handleFieldChange = (field, val) => {
    if (!writeAllowed) return;
    onChange('compliance', { ...comp, [field]: val });
  };

  const additionalLicenses = comp.additional_licenses || [
    { license_no: "RC-88214", type: "Roofing", state: "FL" },
    { license_no: "PL-33921", type: "Plumbing sub-contract endorsement", state: "FL" },
    { license_no: "CAPS-901", type: "Certified Aging-in-Place Specialist (CAPS)", state: "FL" }
  ];

  const handleAddAdditionalLicense = () => {
    if (!newLicenseText.trim() || !writeAllowed) return;
    const updated = [
      ...additionalLicenses,
      { license_no: newLicenseText.trim(), type: "Custom Certification", state: comp.license_state || "FL" }
    ];
    handleFieldChange('additional_licenses', updated);
    setNewLicenseText('');
  };

  const handleRemoveAdditionalLicense = (index) => {
    if (!writeAllowed) return;
    const updated = additionalLicenses.filter((_, i) => i !== index);
    handleFieldChange('additional_licenses', updated);
  };

  return (
    <div className="spec-step-card">
      <div className="spec-step-header">
        <div className="spec-step-title-group">
          <div className="step-number-circle">5</div>
          <h2>Compliance & licensing</h2>
        </div>
        <span className="spec-pill-badge green">✓ Verification Active</span>
      </div>

      {/* State License & Certifications */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          STATE LICENSE & CERTIFICATIONS
        </h4>

        <div className="form-grid">
          <div className="col-6 form-group">
            <label>PRIMARY LICENSE # *</label>
            <input 
              type="text" 
              className="form-input" 
              value={comp.primary_license_number ?? ''} 
              onChange={(e) => handleFieldChange('primary_license_number', e.target.value)}
              disabled={!writeAllowed}
              placeholder="e.g. CGC-1526884"
            />
          </div>

          <div className="col-6 form-group">
            <label>LICENSE TYPE</label>
            <input 
              type="text" 
              className="form-input" 
              value={comp.license_type ?? ''} 
              onChange={(e) => handleFieldChange('license_type', e.target.value)}
              disabled={!writeAllowed}
              placeholder="e.g. Certified General Contractor"
            />
          </div>

          <div className="col-6 form-group">
            <label>ISSUING AUTHORITY *</label>
            <input 
              type="text" 
              className="form-input" 
              value={comp.license_issuing_authority ?? ''} 
              onChange={(e) => handleFieldChange('license_issuing_authority', e.target.value)}
              disabled={!writeAllowed}
              placeholder="e.g. FL Dept. of Business & Professional Regulation"
            />
          </div>

          <div className="col-6 form-group">
            <label>LICENSE STATE *</label>
            <input 
              type="text" 
              className="form-input" 
              value={comp.license_state ?? ''} 
              onChange={(e) => handleFieldChange('license_state', e.target.value)}
              disabled={!writeAllowed}
              placeholder="e.g. Florida"
            />
          </div>

          <div className="col-6 form-group">
            <label>ORIGINAL ISSUE DATE</label>
            <input 
              type="date" 
              className="form-input" 
              value={comp.license_issue_date ?? '2018-05-12'} 
              onChange={(e) => handleFieldChange('license_issue_date', e.target.value)}
              disabled={!writeAllowed}
            />
          </div>

          <div className="col-6 form-group">
            <label>EXPIRATION DATE *</label>
            <input 
              type="date" 
              className="form-input" 
              value={comp.license_expiration_date ?? '2026-09-04'} 
              onChange={(e) => handleFieldChange('license_expiration_date', e.target.value)}
              disabled={!writeAllowed}
            />
          </div>

          {/* Dynamic Additional Trade Licenses Tag Editor */}
          <div className="col-12 form-group">
            <label>ADDITIONAL TRADE LICENSES & ENDORSEMENTS</label>
            <div className="pill-tags-cloud" style={{ marginBottom: '8px' }}>
              {additionalLicenses.map((lic, i) => (
                <span key={i} className="pill-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  ✓ {lic.type ? `${lic.type} (${lic.license_no})` : lic.license_no}
                  {writeAllowed && (
                    <button 
                      type="button" 
                      onClick={() => handleRemoveAdditionalLicense(i)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#047857', padding: 0 }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </span>
              ))}
            </div>

            {writeAllowed && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  className="form-input"
                  style={{ flex: 1 }}
                  placeholder="Type new license or certification..."
                  value={newLicenseText}
                  onChange={(e) => setNewLicenseText(e.target.value)}
                />
                <button 
                  type="button" 
                  className="btn-spec-outline"
                  style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                  onClick={handleAddAdditionalLicense}
                >
                  <Plus size={14} /> Add License
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* General Liability Insurance */}
      <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          GENERAL LIABILITY INSURANCE
        </h4>

        <div className="form-grid">
          <div className="col-6 form-group">
            <label>PROVIDER / CARRIER *</label>
            <input 
              type="text" 
              className="form-input" 
              value={comp.gl_insurance_provider ?? ''} 
              onChange={(e) => handleFieldChange('gl_insurance_provider', e.target.value)}
              disabled={!writeAllowed}
              placeholder="Insurance Carrier Name"
            />
          </div>

          <div className="col-6 form-group">
            <label>POLICY # *</label>
            <input 
              type="text" 
              className="form-input" 
              value={comp.gl_policy_number ?? ''} 
              onChange={(e) => handleFieldChange('gl_policy_number', e.target.value)}
              disabled={!writeAllowed}
              placeholder="Policy Number"
            />
          </div>

          <div className="col-6 form-group">
            <label>COVERAGE LIMIT (PER OCCURRENCE)</label>
            <input 
              type="number" 
              className="form-input" 
              value={comp.gl_coverage_amount ?? 2000000} 
              onChange={(e) => handleFieldChange('gl_coverage_amount', parseFloat(e.target.value) || '')}
              disabled={!writeAllowed}
              placeholder="2000000"
            />
          </div>

          <div className="col-6 form-group">
            <label>AGGREGATE LIMIT</label>
            <input 
              type="number" 
              className="form-input" 
              value={comp.gl_aggregate_amount ?? 4000000} 
              onChange={(e) => handleFieldChange('gl_aggregate_amount', parseFloat(e.target.value) || '')}
              disabled={!writeAllowed}
              placeholder="4000000"
            />
          </div>

          <div className="col-6 form-group">
            <label>EXPIRATION DATE *</label>
            <input
              type="date"
              className="form-input"
              value={comp.gl_expiration ?? '2027-01-15'}
              onChange={(e) => handleFieldChange('gl_expiration', e.target.value)}
              disabled={!writeAllowed}
            />
          </div>

          <div className="col-6 form-group">
            <label>COI DOCUMENT STATUS</label>
            <select
              className="form-select"
              value={comp.gl_coi_uploaded_ts ? 'Uploaded' : 'Pending'}
              onChange={(e) => handleFieldChange('gl_coi_uploaded_ts', e.target.value === 'Uploaded' ? new Date().toISOString() : null)}
              disabled={!writeAllowed}
            >
              <option value="Uploaded">✓ COI On File (Verified)</option>
              <option value="Pending">Pending COI Upload</option>
            </select>
          </div>
        </div>
      </div>

      {/* Workers' Comp & Surety Bond */}
      <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          WORKERS' COMPENSATION & SURETY BOND
        </h4>

        <div className="form-grid">
          <div className="col-6 form-group">
            <label>WORKERS' COMP CARRIER *</label>
            <input 
              type="text" 
              className="form-input" 
              value={comp.wc_carrier ?? ''} 
              onChange={(e) => handleFieldChange('wc_carrier', e.target.value)}
              disabled={!writeAllowed}
              placeholder="Carrier Name"
            />
          </div>

          <div className="col-6 form-group">
            <label>WC POLICY # *</label>
            <input 
              type="text" 
              className="form-input" 
              value={comp.wc_policy_number ?? ''} 
              onChange={(e) => handleFieldChange('wc_policy_number', e.target.value)}
              disabled={!writeAllowed}
              placeholder="Policy #"
            />
          </div>

          <div className="col-6 form-group">
            <label>WC EXPIRATION DATE *</label>
            <input 
              type="date" 
              className="form-input" 
              value={comp.wc_expiration ?? '2027-03-31'} 
              onChange={(e) => handleFieldChange('wc_expiration', e.target.value)}
              disabled={!writeAllowed}
            />
          </div>

          <div className="col-6 form-group">
            <label>BONDED STATUS *</label>
            <select 
              className="form-select"
              value={comp.is_bonded ? 'yes' : 'no'}
              onChange={(e) => handleFieldChange('is_bonded', e.target.value === 'yes')}
              disabled={!writeAllowed}
            >
              <option value="yes">Yes (Surety Bonded)</option>
              <option value="no">No Bond Required</option>
            </select>
          </div>

          <div className="col-6 form-group">
            <label>BOND PROVIDER</label>
            <input 
              type="text" 
              className="form-input" 
              value={comp.bond_provider ?? ''} 
              onChange={(e) => handleFieldChange('bond_provider', e.target.value)}
              disabled={!writeAllowed}
              placeholder="Surety Provider"
            />
          </div>

          <div className="col-6 form-group">
            <label>BOND NUMBER</label>
            <input 
              type="text" 
              className="form-input" 
              value={comp.bond_number ?? ''} 
              onChange={(e) => handleFieldChange('bond_number', e.target.value)}
              disabled={!writeAllowed}
              placeholder="Bond #"
            />
          </div>

          <div className="col-6 form-group">
            <label>BOND AMOUNT</label>
            <input 
              type="number" 
              className="form-input" 
              value={comp.bond_amount ?? 25000} 
              onChange={(e) => handleFieldChange('bond_amount', parseFloat(e.target.value) || '')}
              disabled={!writeAllowed}
              placeholder="25000"
            />
          </div>

          <div className="col-6 form-group">
            <label>BOND EXPIRATION</label>
            <input 
              type="date" 
              className="form-input" 
              value={comp.bond_expiration ?? '2027-06-30'} 
              onChange={(e) => handleFieldChange('bond_expiration', e.target.value)}
              disabled={!writeAllowed}
            />
          </div>
        </div>
      </div>

      {/* Tax Documentation */}
      <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          TAX DOCUMENTATION (W-9)
        </h4>

        <div className="form-grid">
          <div className="col-6 form-group">
            <label>W-9 ON FILE STATUS *</label>
            <select 
              className="form-select"
              value={comp.w9_on_file ? 'signed' : 'pending'}
              onChange={(e) => handleFieldChange('w9_on_file', e.target.value === 'signed')}
              disabled={!writeAllowed}
            >
              <option value="signed">✓ W-9 Signed & On File</option>
              <option value="pending">Pending W-9 Form Signature</option>
            </select>
          </div>

          <div className="col-6 form-group">
            <label>SIGNED BY AUTHORIZED OFFICER</label>
            <input 
              type="text" 
              className="form-input" 
              value={comp.w9_signed_by ?? ''} 
              onChange={(e) => handleFieldChange('w9_signed_by', e.target.value)}
              disabled={!writeAllowed}
              placeholder="Officer Name"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
