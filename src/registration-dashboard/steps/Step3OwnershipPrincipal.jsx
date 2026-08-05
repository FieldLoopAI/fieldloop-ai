// src/components/steps/Step3OwnershipPrincipal.jsx
import React from 'react';
import { Lock } from 'lucide-react';

export default function Step3OwnershipPrincipal({ data, onChange, activeUser, revealedValues, onReveal, writeAllowed }) {
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
    revealedValues[columnName] = val;
    onChange('principal', { ...p });
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
            className="form-input"
            value={p.full_name ?? ''}
            onChange={(e) => handleFieldChange('full_name', e.target.value)}
            disabled={!writeAllowed}
            placeholder="Full Name"
          />
        </div>

        <div className="col-6 form-group">
          <label>TITLE *</label>
          <input 
            type="text" 
            className="form-input"
            value={p.title ?? ''}
            onChange={(e) => handleFieldChange('title', e.target.value)}
            disabled={!writeAllowed}
            placeholder="e.g. Owner / Managing Member"
          />
        </div>

        <div className="col-6 form-group">
          <label>OWNERSHIP %</label>
          <input 
            type="number" 
            className="form-input"
            value={p.ownership_pct ?? ''}
            onChange={(e) => handleFieldChange('ownership_pct', e.target.value === '' ? '' : parseFloat(e.target.value))}
            disabled={!writeAllowed}
            placeholder="100"
          />
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
                className="form-input"
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
                className="form-input"
                value={isSsnEditable ? ssnDisplay : "XXX-XX-••••"}
                onChange={(e) => handlePiiChange('ssn_last4_ref', e.target.value)}
                readOnly={!isSsnEditable}
                disabled={!writeAllowed}
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
        </div>

        <div className="col-6 form-group">
          <label>PERSONAL MOBILE *</label>
          <input 
            type="text" 
            className="form-input"
            value={p.personal_mobile ?? ''}
            onChange={(e) => handleFieldChange('personal_mobile', e.target.value)}
            disabled={!writeAllowed}
            placeholder="(555) 000-0000"
          />
        </div>

        <div className="col-6 form-group">
          <label>PERSONAL EMAIL *</label>
          <input 
            type="email" 
            className="form-input"
            value={p.personal_email ?? ''}
            onChange={(e) => handleFieldChange('personal_email', e.target.value)}
            disabled={!writeAllowed}
            placeholder="owner@personal.com"
          />
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
                className="form-input"
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
        </div>

        {/* Editable ID Verification Dropdown */}
        <div className="col-6 form-group">
          <label>ID VERIFICATION STATUS</label>
          <select
            className="form-select"
            value={p.id_verification_status ?? 'pending'}
            onChange={(e) => handleFieldChange('id_verification_status', e.target.value)}
            disabled={!writeAllowed}
          >
            <option value="verified">Verified via Stripe Identity</option>
            <option value="pending">Pending Document Upload / Review</option>
            <option value="failed">Verification Failed</option>
          </select>
        </div>

        {/* Editable PEP Dropdown */}
        <div className="col-6 form-group">
          <label>POLITICALLY EXPOSED PERSON (PEP)</label>
          <select 
            className="form-select"
            value={p.pep_flag ? 'Yes' : 'No'}
            onChange={(e) => handleFieldChange('pep_flag', e.target.value === 'Yes')}
            disabled={!writeAllowed}
          >
            <option value="No">No (Cleared)</option>
            <option value="Yes">Yes (Requires Risk Assessment)</option>
          </select>
        </div>

        {/* Editable Sanctions Screening Dropdown */}
        <div className="col-6 form-group">
          <label>SANCTIONS SCREENING</label>
          <select
            className="form-select"
            value={p.sanctions_check_ts ? 'Cleared' : 'Pending'}
            onChange={(e) => handleFieldChange('sanctions_check_ts', e.target.value === 'Cleared' ? (p.sanctions_check_ts || new Date().toISOString()) : null)}
            disabled={!writeAllowed}
          >
            <option value="Cleared">Cleared (OFAC · Active)</option>
            <option value="Pending">Screening Pending</option>
          </select>
        </div>
      </div>
    </div>
  );
}
