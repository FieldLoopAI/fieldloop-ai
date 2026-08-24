// src/components/steps/Step3OwnershipPrincipal.jsx
import React from 'react';
import { Lock } from 'lucide-react';

export default function Step3OwnershipPrincipal({ data, onChange, _activeUser, revealedValues, onReveal, onRevealedValueChange, writeAllowed, errors = {} }) {
  const p = data.principal || {};

  const handleFieldChange = (field, val) => {
    if (!writeAllowed) return;
    onChange('principal', { ...p, [field]: val });
  };

  // No ref yet (brand-new principal before its first save) means the
  // field is simply editable from the start — there's nothing to reveal.
  const hasDobRef = Boolean(p.dob_ref);
  const isDobEditable = !hasDobRef || revealedValues['dob_ref'] !== undefined;
  const dobDisplay = revealedValues['dob_ref'] ?? '';

  const hasSsnRef = Boolean(p.ssn_last4_ref);
  const isSsnEditable = !hasSsnRef || revealedValues['ssn_last4_ref'] !== undefined;
  const ssnDisplay = revealedValues['ssn_last4_ref'] ?? '';

  const hasAddressRef = Boolean(p.home_address_ref);
  const isAddressEditable = !hasAddressRef || revealedValues['home_address_ref'] !== undefined;
  const addressDisplay = revealedValues['home_address_ref'] ?? '';

  const handlePiiChange = (columnName, val) => {
    if (!writeAllowed) return;
    onRevealedValueChange(columnName, val);
  };

  // SSN last 4 is exactly 4 digits — strip anything else so the field
  // can't accumulate arbitrary-length/non-numeric input as-you-type.
  const handleSsnChange = (val) => {
    if (!writeAllowed) return;
    onRevealedValueChange('ssn_last4_ref', val.replace(/\D/g, '').slice(0, 4));
  };

  return (
    <div className="spec-step-card">
      <div className="spec-step-header">
        <div className="spec-step-title-group">
          <div className="step-number-circle">3</div>
          <h2>Ownership & principal (KYC Verification)</h2>
        </div>
        <span className="spec-pill-badge green">✓ KYC Verified</span>
      </div>

      <div className="form-grid">
        <div className="col-12 form-group">
          <label>OWNER / PRINCIPAL NAME *</label>
          <input 
            type="text" 
            className={`form-input ${errors.full_name ? 'error' : ''}`}
            value={p.full_name ?? ''}
            onChange={(e) => handleFieldChange('full_name', e.target.value)}
            disabled={!writeAllowed}
            placeholder="Full Name"
          />
          {errors.full_name && <span className="field-error">{errors.full_name}</span>}
        </div>

        <div className="col-6 form-group">
          <label>TITLE *</label>
          <input 
            type="text" 
            className={`form-input ${errors.title ? 'error' : ''}`}
            value={p.title ?? ''}
            onChange={(e) => handleFieldChange('title', e.target.value)}
            disabled={!writeAllowed}
            placeholder="e.g. Owner / Managing Member"
          />
          {errors.title && <span className="field-error">{errors.title}</span>}
        </div>

        <div className="col-6 form-group">
          <label>OWNERSHIP %</label>
          <input 
            type="number" 
            className={`form-input ${errors.ownership_pct ? 'error' : ''}`}
            value={p.ownership_pct ?? ''}
            onChange={(e) => handleFieldChange('ownership_pct', e.target.value === '' ? '' : parseFloat(e.target.value))}
            disabled={!writeAllowed}
            min={0}
            max={100}
            step="0.01"
            placeholder="100"
          />
          {errors.ownership_pct && <span className="field-error">{errors.ownership_pct}</span>}
        </div>

        {/* DOB Masked / Unmasked Input */}
        <div className="col-6 form-group">
          <div className="form-label-row">
            <label>DATE OF BIRTH * <span className="pii-tag">PII</span></label>
          </div>
          <div className="masked-input-group">
            <div className="masked-input-wrapper">
              <Lock className="lock-icon" size={16} />
              <input
                type={isDobEditable ? "date" : "text"}
                className={`form-input ${errors.dob_val ? 'error' : ''}`}
                value={isDobEditable ? dobDisplay : "••••-••-••"}
                onChange={(e) => handlePiiChange('dob_ref', e.target.value)}
                readOnly={!isDobEditable}
                disabled={!writeAllowed}
              />
            </div>
            {hasDobRef && (
              <button
                type="button"
                className={`btn-reveal ${isDobEditable ? 'revealed' : ''}`}
                onClick={() => onReveal('contractor_principals', 'dob_ref', p.dob_ref)}
              >
                {isDobEditable ? 'HIDE' : 'REVEAL'}
              </button>
            )}
          </div>
          {errors.dob_val && <span className="field-error">{errors.dob_val}</span>}
        </div>

        {/* SSN Last 4 Masked / Unmasked Input */}
        <div className="col-6 form-group">
          <div className="form-label-row">
            <label>SSN — LAST 4 * <span className="pii-tag">PII</span></label>
          </div>
          <div className="masked-input-group">
            <div className="masked-input-wrapper">
              <Lock className="lock-icon" size={16} />
              <input
                type="text"
                className={`form-input ${errors.ssn_last4_val ? 'error' : ''}`}
                value={isSsnEditable ? ssnDisplay : "XXX-XX-••••"}
                onChange={(e) => handleSsnChange(e.target.value)}
                readOnly={!isSsnEditable}
                disabled={!writeAllowed}
                inputMode="numeric"
                maxLength={4}
              />
            </div>
            {hasSsnRef && (
              <button
                type="button"
                className={`btn-reveal ${isSsnEditable ? 'revealed' : ''}`}
                onClick={() => onReveal('contractor_principals', 'ssn_last4_ref', p.ssn_last4_ref)}
              >
                {isSsnEditable ? 'HIDE' : 'REVEAL'}
              </button>
            )}
          </div>
          {errors.ssn_last4_val && <span className="field-error">{errors.ssn_last4_val}</span>}
        </div>

        <div className="col-6 form-group">
          <label>PERSONAL MOBILE *</label>
          <input 
            type="text" 
            className={`form-input ${errors.personal_mobile ? 'error' : ''}`}
            value={p.personal_mobile ?? ''}
            onChange={(e) => handleFieldChange('personal_mobile', e.target.value)}
            disabled={!writeAllowed}
            inputMode="tel"
            maxLength={20}
            placeholder="(555) 000-0000"
          />
          {errors.personal_mobile && <span className="field-error">{errors.personal_mobile}</span>}
        </div>

        <div className="col-6 form-group">
          <label>PERSONAL EMAIL *</label>
          <input 
            type="email" 
            className={`form-input ${errors.personal_email ? 'error' : ''}`}
            value={p.personal_email ?? ''}
            onChange={(e) => handleFieldChange('personal_email', e.target.value)}
            disabled={!writeAllowed}
            placeholder="owner@personal.com"
          />
          {errors.personal_email && <span className="field-error">{errors.personal_email}</span>}
        </div>

        {/* Home Address Masked / Unmasked Input */}
        <div className="col-12 form-group">
          <div className="form-label-row">
            <label>HOME ADDRESS (KYC) * <span className="pii-tag">PII</span></label>
          </div>
          <div className="masked-input-group">
            <div className="masked-input-wrapper">
              <Lock className="lock-icon" size={16} />
              <input
                type="text"
                className={`form-input ${errors.home_address_val ? 'error' : ''}`}
                value={isAddressEditable ? addressDisplay : "••••••••••••, ••••••••, •• •••••"}
                onChange={(e) => handlePiiChange('home_address_ref', e.target.value)}
                readOnly={!isAddressEditable}
                disabled={!writeAllowed}
              />
            </div>
            {hasAddressRef && (
              <button
                type="button"
                className={`btn-reveal ${isAddressEditable ? 'revealed' : ''}`}
                onClick={() => onReveal('contractor_principals', 'home_address_ref', p.home_address_ref)}
              >
                {isAddressEditable ? 'HIDE' : 'REVEAL'}
              </button>
            )}
          </div>
          {errors.home_address_val && <span className="field-error">{errors.home_address_val}</span>}
        </div>

        {/* Editable ID Verification Dropdown */}
        <div className="col-6 form-group">
          <label>ID VERIFICATION STATUS</label>
          <select
            className={`form-select ${errors.id_verification_status ? 'error' : ''}`}
            value={p.id_verification_status ?? 'pending'}
            onChange={(e) => handleFieldChange('id_verification_status', e.target.value)}
            disabled={!writeAllowed}
          >
            <option value="verified">Verified via Stripe Identity</option>
            <option value="pending">Pending Document Upload / Review</option>
            <option value="failed">Verification Failed</option>
          </select>
          {errors.id_verification_status && <span className="field-error">{errors.id_verification_status}</span>}
        </div>

        {/* Editable PEP Dropdown */}
        <div className="col-6 form-group">
          <label>POLITICALLY EXPOSED PERSON (PEP)</label>
          <select 
            className={`form-select ${errors.pep_flag ? 'error' : ''}`}
            value={p.pep_flag ? 'Yes' : 'No'}
            onChange={(e) => handleFieldChange('pep_flag', e.target.value === 'Yes')}
            disabled={!writeAllowed}
          >
            <option value="No">No (Cleared)</option>
            <option value="Yes">Yes (Requires Risk Assessment)</option>
          </select>
          {errors.pep_flag && <span className="field-error">{errors.pep_flag}</span>}
        </div>

        {/* Editable Sanctions Screening Dropdown */}
        <div className="col-6 form-group">
          <label>SANCTIONS SCREENING</label>
          <select
            className={`form-select ${errors.sanctions_check_ts ? 'error' : ''}`}
            value={p.sanctions_check_ts ? 'Cleared' : 'Pending'}
            onChange={(e) => handleFieldChange('sanctions_check_ts', e.target.value === 'Cleared' ? (p.sanctions_check_ts || new Date().toISOString()) : null)}
            disabled={!writeAllowed}
          >
            <option value="Cleared">Cleared (OFAC · Active)</option>
            <option value="Pending">Screening Pending</option>
          </select>
          {errors.sanctions_check_ts && <span className="field-error">{errors.sanctions_check_ts}</span>}
        </div>
      </div>
    </div>
  );
}
