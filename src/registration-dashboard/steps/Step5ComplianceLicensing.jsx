// src/components/steps/Step5ComplianceLicensing.jsx
import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

export default function Step5ComplianceLicensing({ data, onChange, _activeUser, writeAllowed, errors = {} }) {
  const comp = data.compliance || {};
  const [newLicenseText, setNewLicenseText] = useState('');

  const handleFieldChange = (field, val) => {
    if (!writeAllowed) return;
    onChange('compliance', { ...comp, [field]: val });
  };

  const additionalLicenses = comp.additional_licenses || [];

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
              className={`form-input ${errors.primary_license_number ? 'error' : ''}`} 
              value={comp.primary_license_number ?? ''} 
              onChange={(e) => handleFieldChange('primary_license_number', e.target.value)}
              disabled={!writeAllowed}
              placeholder="e.g. CGC-1526884"
            />
            {errors.primary_license_number && <span className="field-error">{errors.primary_license_number}</span>}
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
              className={`form-input ${errors.license_issuing_authority ? 'error' : ''}`} 
              value={comp.license_issuing_authority ?? ''} 
              onChange={(e) => handleFieldChange('license_issuing_authority', e.target.value)}
              disabled={!writeAllowed}
              placeholder="e.g. FL Dept. of Business & Professional Regulation"
            />
            {errors.license_issuing_authority && <span className="field-error">{errors.license_issuing_authority}</span>}
          </div>

          <div className="col-6 form-group">
            <label>LICENSE STATE *</label>
            <input 
              type="text" 
              className={`form-input ${errors.license_state ? 'error' : ''}`} 
              value={comp.license_state ?? ''} 
              onChange={(e) => handleFieldChange('license_state', e.target.value)}
              disabled={!writeAllowed}
              placeholder="e.g. Florida"
            />
            {errors.license_state && <span className="field-error">{errors.license_state}</span>}
          </div>

          <div className="col-6 form-group">
            <label>ORIGINAL ISSUE DATE</label>
            <input 
              type="date" 
              className="form-input" 
              value={comp.license_issue_date ?? ''}
              onChange={(e) => handleFieldChange('license_issue_date', e.target.value)}
              disabled={!writeAllowed}
            />
          </div>

          <div className="col-6 form-group">
            <label>EXPIRATION DATE *</label>
            <input 
              type="date" 
              className={`form-input ${errors.license_expiration_date ? 'error' : ''}`} 
              value={comp.license_expiration_date ?? ''}
              onChange={(e) => handleFieldChange('license_expiration_date', e.target.value)}
              disabled={!writeAllowed}
            />
            {errors.license_expiration_date && <span className="field-error">{errors.license_expiration_date}</span>}
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
              className={`form-input ${errors.gl_insurance_provider ? 'error' : ''}`} 
              value={comp.gl_insurance_provider ?? ''} 
              onChange={(e) => handleFieldChange('gl_insurance_provider', e.target.value)}
              disabled={!writeAllowed}
              placeholder="Insurance Carrier Name"
            />
            {errors.gl_insurance_provider && <span className="field-error">{errors.gl_insurance_provider}</span>}
          </div>

          <div className="col-6 form-group">
            <label>POLICY # *</label>
            <input 
              type="text" 
              className={`form-input ${errors.gl_policy_number ? 'error' : ''}`} 
              value={comp.gl_policy_number ?? ''} 
              onChange={(e) => handleFieldChange('gl_policy_number', e.target.value)}
              disabled={!writeAllowed}
              placeholder="Policy Number"
            />
            {errors.gl_policy_number && <span className="field-error">{errors.gl_policy_number}</span>}
          </div>

          <div className="col-6 form-group">
            <label>COVERAGE LIMIT (PER OCCURRENCE)</label>
            <input 
              type="number" 
              className="form-input" 
              value={comp.gl_coverage_amount ?? ''}
              onChange={(e) => handleFieldChange('gl_coverage_amount', parseFloat(e.target.value) || '')}
              disabled={!writeAllowed}
              min={0}
              placeholder="2000000"
            />
          </div>

          <div className="col-6 form-group">
            <label>AGGREGATE LIMIT</label>
            <input 
              type="number" 
              className="form-input" 
              value={comp.gl_aggregate_amount ?? ''}
              onChange={(e) => handleFieldChange('gl_aggregate_amount', parseFloat(e.target.value) || '')}
              disabled={!writeAllowed}
              min={0}
              placeholder="4000000"
            />
          </div>

          <div className="col-6 form-group">
            <label>EXPIRATION DATE *</label>
            <input
              type="date"
              className={`form-input ${errors.gl_expiration ? 'error' : ''}`}
              value={comp.gl_expiration ?? ''}
              onChange={(e) => handleFieldChange('gl_expiration', e.target.value)}
              disabled={!writeAllowed}
            />
            {errors.gl_expiration && <span className="field-error">{errors.gl_expiration}</span>}
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
              className={`form-input ${errors.wc_carrier ? 'error' : ''}`} 
              value={comp.wc_carrier ?? ''} 
              onChange={(e) => handleFieldChange('wc_carrier', e.target.value)}
              disabled={!writeAllowed}
              placeholder="Carrier Name"
            />
            {errors.wc_carrier && <span className="field-error">{errors.wc_carrier}</span>}
          </div>

          <div className="col-6 form-group">
            <label>WC POLICY # *</label>
            <input 
              type="text" 
              className={`form-input ${errors.wc_policy_number ? 'error' : ''}`} 
              value={comp.wc_policy_number ?? ''} 
              onChange={(e) => handleFieldChange('wc_policy_number', e.target.value)}
              disabled={!writeAllowed}
              placeholder="Policy #"
            />
            {errors.wc_policy_number && <span className="field-error">{errors.wc_policy_number}</span>}
          </div>

          <div className="col-6 form-group">
            <label>WC EXPIRATION DATE *</label>
            <input 
              type="date" 
              className={`form-input ${errors.wc_expiration ? 'error' : ''}`} 
              value={comp.wc_expiration ?? ''}
              onChange={(e) => handleFieldChange('wc_expiration', e.target.value)}
              disabled={!writeAllowed}
            />
            {errors.wc_expiration && <span className="field-error">{errors.wc_expiration}</span>}
          </div>

          <div className="col-6 form-group">
            <label>BONDED STATUS *</label>
            <select
              className={`form-select ${errors.is_bonded ? 'error' : ''}`}
              value={comp.is_bonded === undefined || comp.is_bonded === null || comp.is_bonded === '' ? '' : (comp.is_bonded ? 'yes' : 'no')}
              onChange={(e) => handleFieldChange('is_bonded', e.target.value === '' ? null : e.target.value === 'yes')}
              disabled={!writeAllowed}
            >
              <option value="" disabled>Select bond status…</option>
              <option value="yes">Yes (Surety Bonded)</option>
              <option value="no">No Bond Required</option>
            </select>
            {errors.is_bonded && <span className="field-error">{errors.is_bonded}</span>}
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
              value={comp.bond_amount ?? ''}
              onChange={(e) => handleFieldChange('bond_amount', parseFloat(e.target.value) || '')}
              disabled={!writeAllowed}
              min={0}
              placeholder="25000"
            />
          </div>

          <div className="col-6 form-group">
            <label>BOND EXPIRATION</label>
            <input 
              type="date" 
              className="form-input" 
              value={comp.bond_expiration ?? ''}
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
              className={`form-select ${errors.w9_on_file ? 'error' : ''}`}
              value={comp.w9_on_file ? 'signed' : 'pending'}
              onChange={(e) => handleFieldChange('w9_on_file', e.target.value === 'signed')}
              disabled={!writeAllowed}
            >
              <option value="signed">✓ W-9 Signed & On File</option>
              <option value="pending">Pending W-9 Form Signature</option>
            </select>
            {errors.w9_on_file && <span className="field-error">{errors.w9_on_file}</span>}
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
