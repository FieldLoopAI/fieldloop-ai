// src/components/steps/Step2BusinessIdentity.jsx
import React from 'react';
import { Lock } from 'lucide-react';
import { formatEinInput, formatPhoneInput } from '../../shared/utils/formatters';

export default function Step2BusinessIdentity({ data, onChange, _activeUser, revealedValues, onReveal, onRevealedValueChange, writeAllowed, errors = {} }) {
  const c = data.contractor || {};

  const handleFieldChange = (field, val) => {
    if (!writeAllowed) return;
    onChange('contractor', { ...c, [field]: val });
  };

  // No ref yet (brand-new contractor before its first save) means the
  // field is simply editable from the start — there's nothing to reveal.
  const hasEinRef = Boolean(c.ein_ref);
  const isEinRevealed = revealedValues['ein_ref'] !== undefined;
  const einEditable = !hasEinRef || isEinRevealed;
  const einDisplayValue = einEditable
    ? (revealedValues['ein_ref'] ?? '')
    : "XX-XXXXXXX";

  // Auto-formats to XX-XXXXXXX as the user types (dash inserted after the
  // 2nd digit), capped at 9 digits — matches validateStep's EIN regex
  // exactly, so a fully-typed field is always already valid.
  const handleEinChange = (val) => {
    if (!writeAllowed) return;
    const formatted = formatEinInput(val);
    onRevealedValueChange('ein_ref', formatted);
    handleFieldChange('ein_val', formatted);
  };

  return (
    <div className="spec-step-card">
      <div className="spec-step-header">
        <div className="spec-step-title-group">
          <div className="step-number-circle">2</div>
          <h2>Business identity</h2>
        </div>
        <span className="spec-pill-badge green">✓ Complete</span>
      </div>

      <div className="form-grid">
        <div className="col-12 form-group">
          <label>LEGAL BUSINESS NAME *</label>
          <input 
            type="text" 
            className={`form-input ${errors.legal_name ? 'error' : ''}`}
            value={c.legal_name ?? ''}
            onChange={(e) => handleFieldChange('legal_name', e.target.value)}
            disabled={!writeAllowed}
            placeholder="Legal Name"
          />
          {errors.legal_name && <span className="field-error">{errors.legal_name}</span>}
        </div>

        <div className="col-6 form-group">
          <label>DBA / TRADE NAME</label>
          <input 
            type="text" 
            className={`form-input ${errors.dba_name ? 'error' : ''}`}
            value={c.dba_name ?? ''}
            onChange={(e) => handleFieldChange('dba_name', e.target.value)}
            disabled={!writeAllowed}
            placeholder="Trade Name / DBA"
          />
          {errors.dba_name && <span className="field-error">{errors.dba_name}</span>}
        </div>

        <div className="col-6 form-group">
          <label>BUSINESS STRUCTURE *</label>
          <select 
            className={`form-select ${errors.business_structure ? 'error' : ''}`}
            value={c.business_structure ?? 'llc'}
            onChange={(e) => handleFieldChange('business_structure', e.target.value)}
            disabled={!writeAllowed}
          >
            <option value="llc">Limited Liability Company (LLC)</option>
            <option value="s_corp">S-Corporation (S-Corp)</option>
            <option value="c_corp">C-Corporation (C-Corp)</option>
            <option value="sole_prop">Sole Proprietorship</option>
            <option value="partnership">Partnership</option>
          </select>
          {errors.business_structure && <span className="field-error">{errors.business_structure}</span>}
        </div>

        {/* EIN / TAX ID Input with Reveal & Edit */}
        <div className="col-6 form-group">
          <div className="form-label-row">
            <label>EIN / TAX ID * <span className="pii-tag">PII</span></label>
          </div>
          <div className="masked-input-group">
            <div className="masked-input-wrapper">
              <Lock className="lock-icon" size={16} />
              <input
                type="text"
                className={`form-input ${errors.ein_val ? 'error' : ''}`}
                value={einDisplayValue}
                onChange={(e) => handleEinChange(e.target.value)}
                readOnly={!einEditable}
                disabled={!writeAllowed}
                maxLength={10}
                placeholder="12-3456789"
              />
            </div>
            {hasEinRef && (
              <button
                type="button"
                className={`btn-reveal ${isEinRevealed ? 'revealed' : ''}`}
                onClick={() => onReveal('contractors', 'ein_ref', c.ein_ref)}
              >
                {isEinRevealed ? 'HIDE' : 'REVEAL'}
              </button>
            )}
          </div>
          {errors.ein_val && <span className="field-error">{errors.ein_val}</span>}
        </div>

        <div className="col-6 form-group">
          <label>YEAR ESTABLISHED</label>
          <input 
            type="number" 
            className={`form-input ${errors.year_established ? 'error' : ''}`}
            value={c.year_established ?? ''}
            onChange={(e) => handleFieldChange('year_established', e.target.value === '' ? '' : parseInt(e.target.value))}
            disabled={!writeAllowed}
            min={1900}
            max={new Date().getFullYear()}
            placeholder="e.g. 2018"
          />
          {errors.year_established && <span className="field-error">{errors.year_established}</span>}
        </div>

        <div className="col-6 form-group">
          <label>BUSINESS PHONE (VOICE) *</label>
          <input 
            type="text" 
            className={`form-input ${errors.business_phone ? 'error' : ''}`}
            value={c.business_phone ?? ''}
            onChange={(e) => handleFieldChange('business_phone', formatPhoneInput(e.target.value))}
            disabled={!writeAllowed}
            inputMode="tel"
            maxLength={14}
            placeholder="(555) 000-0000"
          />
          {errors.business_phone && <span className="field-error">{errors.business_phone}</span>}
        </div>

        <div className="col-6 form-group">
          <label>TEXT / SMS NUMBER</label>
          <input 
            type="text" 
            className={`form-input ${errors.business_sms ? 'error' : ''}`}
            value={c.business_sms ?? ''}
            onChange={(e) => handleFieldChange('business_sms', formatPhoneInput(e.target.value))}
            disabled={!writeAllowed}
            inputMode="tel"
            maxLength={14}
            placeholder="(555) 000-0000"
          />
          {errors.business_sms && <span className="field-error">{errors.business_sms}</span>}
        </div>

        <div className="col-12 form-group">
          <label>BUSINESS EMAIL *</label>
          <input 
            type="email" 
            className={`form-input ${errors.business_email ? 'error' : ''}`}
            value={c.business_email ?? ''}
            onChange={(e) => handleFieldChange('business_email', e.target.value)}
            disabled={!writeAllowed}
            placeholder="onboarding@company.com"
          />
          {errors.business_email && <span className="field-error">{errors.business_email}</span>}
        </div>

        <div className="col-12 form-group">
          <label>WEBSITE</label>
          <input 
            type="url" 
            className={`form-input ${errors.website ? 'error' : ''}`}
            value={c.website ?? ''}
            onChange={(e) => handleFieldChange('website', e.target.value)}
            disabled={!writeAllowed}
            placeholder="https://company.com"
          />
          {errors.website && <span className="field-error">{errors.website}</span>}
        </div>

      </div>

      {/* Address Sub-Section */}
      <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          PHYSICAL & MAILING ADDRESSES
        </h4>

        <div className="form-grid">
          <div className="col-6 form-group">
            <label>PHYSICAL STREET ADDRESS *</label>
            <input 
              type="text" 
              className={`form-input ${errors.physical_street ? 'error' : ''}`}
              value={c.physical_street ?? ''}
              onChange={(e) => handleFieldChange('physical_street', e.target.value)}
              disabled={!writeAllowed}
              placeholder="Street Address"
            />
            {errors.physical_street && <span className="field-error">{errors.physical_street}</span>}
          </div>

          <div className="col-6 form-group">
            <label>MAILING ADDRESS (IF DIFFERENT)</label>
            <input 
              type="text" 
              className={`form-input ${errors.mailing_street ? 'error' : ''}`}
              value={c.mailing_street ?? ''}
              onChange={(e) => handleFieldChange('mailing_street', e.target.value)}
              disabled={!writeAllowed}
              placeholder="P.O. Box or Mailing Address"
            />
            {errors.mailing_street && <span className="field-error">{errors.mailing_street}</span>}
          </div>

          <div className="col-6 form-group">
            <label>CITY *</label>
            <input 
              type="text" 
              className={`form-input ${errors.physical_city ? 'error' : ''}`}
              value={c.physical_city ?? ''}
              onChange={(e) => handleFieldChange('physical_city', e.target.value)}
              disabled={!writeAllowed}
              placeholder="City"
            />
            {errors.physical_city && <span className="field-error">{errors.physical_city}</span>}
          </div>

          <div className="col-6 form-group">
            <label>MAILING CITY</label>
            <input 
              type="text" 
              className={`form-input ${errors.mailing_city ? 'error' : ''}`}
              value={c.mailing_city ?? ''}
              onChange={(e) => handleFieldChange('mailing_city', e.target.value)}
              disabled={!writeAllowed}
              placeholder="Mailing City"
            />
            {errors.mailing_city && <span className="field-error">{errors.mailing_city}</span>}
          </div>

          <div className="col-6 form-group">
            <label>STATE *</label>
            <input 
              type="text" 
              className={`form-input ${errors.physical_state ? 'error' : ''}`}
              value={c.physical_state ?? ''}
              onChange={(e) => handleFieldChange('physical_state', e.target.value)}
              disabled={!writeAllowed}
              placeholder="State"
            />
            {errors.physical_state && <span className="field-error">{errors.physical_state}</span>}
          </div>

          <div className="col-6 form-group">
            <label>MAILING STATE</label>
            <input 
              type="text" 
              className={`form-input ${errors.mailing_state ? 'error' : ''}`}
              value={c.mailing_state ?? ''}
              onChange={(e) => handleFieldChange('mailing_state', e.target.value)}
              disabled={!writeAllowed}
              placeholder="Mailing State"
            />
            {errors.mailing_state && <span className="field-error">{errors.mailing_state}</span>}
          </div>

          <div className="col-6 form-group">
            <label>ZIP *</label>
            <input 
              type="text" 
              className={`form-input ${errors.physical_zip ? 'error' : ''}`}
              value={c.physical_zip ?? ''}
              onChange={(e) => handleFieldChange('physical_zip', e.target.value)}
              disabled={!writeAllowed}
              inputMode="numeric"
              maxLength={10}
              placeholder="ZIP Code"
            />
            {errors.physical_zip && <span className="field-error">{errors.physical_zip}</span>}
          </div>

          <div className="col-6 form-group">
            <label>MAILING ZIP</label>
            <input 
              type="text" 
              className={`form-input ${errors.mailing_zip ? 'error' : ''}`}
              value={c.mailing_zip ?? ''}
              onChange={(e) => handleFieldChange('mailing_zip', e.target.value)}
              disabled={!writeAllowed}
              inputMode="numeric"
              maxLength={10}
              placeholder="Mailing ZIP Code"
            />
            {errors.mailing_zip && <span className="field-error">{errors.mailing_zip}</span>}
          </div>

          <div className="col-6 form-group">
            <label>COUNTY</label>
            <input 
              type="text" 
              className={`form-input ${errors.physical_county ? 'error' : ''}`}
              value={c.physical_county ?? ''}
              onChange={(e) => handleFieldChange('physical_county', e.target.value)}
              disabled={!writeAllowed}
              placeholder="County"
            />
            {errors.physical_county && <span className="field-error">{errors.physical_county}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
