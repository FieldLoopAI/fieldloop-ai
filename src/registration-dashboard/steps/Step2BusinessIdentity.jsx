// src/components/steps/Step2BusinessIdentity.jsx
import React from 'react';
import { Lock } from 'lucide-react';

export default function Step2BusinessIdentity({ data, onChange, activeUser, revealedValues, onReveal, writeAllowed }) {
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
    : "XX-XXX7842";

  const handleEinChange = (val) => {
    if (!writeAllowed) return;
    revealedValues['ein_ref'] = val;
    handleFieldChange('ein_val', val);
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
            className="form-input"
            value={c.legal_name ?? ''}
            onChange={(e) => handleFieldChange('legal_name', e.target.value)}
            disabled={!writeAllowed}
            placeholder="Legal Name"
          />
        </div>

        <div className="col-6 form-group">
          <label>DBA / TRADE NAME</label>
          <input 
            type="text" 
            className="form-input"
            value={c.dba_name ?? ''}
            onChange={(e) => handleFieldChange('dba_name', e.target.value)}
            disabled={!writeAllowed}
            placeholder="Trade Name / DBA"
          />
        </div>

        <div className="col-6 form-group">
          <label>BUSINESS STRUCTURE *</label>
          <select 
            className="form-select"
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
                className="form-input"
                value={einDisplayValue}
                onChange={(e) => handleEinChange(e.target.value)}
                readOnly={!einEditable}
                disabled={!writeAllowed}
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
        </div>

        <div className="col-6 form-group">
          <label>YEAR ESTABLISHED</label>
          <input 
            type="number" 
            className="form-input"
            value={c.year_established ?? ''}
            onChange={(e) => handleFieldChange('year_established', e.target.value === '' ? '' : parseInt(e.target.value))}
            disabled={!writeAllowed}
            placeholder="e.g. 2018"
          />
        </div>

        <div className="col-6 form-group">
          <label>BUSINESS PHONE (VOICE) *</label>
          <input 
            type="text" 
            className="form-input"
            value={c.business_phone ?? ''}
            onChange={(e) => handleFieldChange('business_phone', e.target.value)}
            disabled={!writeAllowed}
            placeholder="(555) 000-0000"
          />
        </div>

        <div className="col-6 form-group">
          <label>TEXT / SMS NUMBER</label>
          <input 
            type="text" 
            className="form-input"
            value={c.business_sms ?? ''}
            onChange={(e) => handleFieldChange('business_sms', e.target.value)}
            disabled={!writeAllowed}
            placeholder="(555) 000-0000"
          />
        </div>

        <div className="col-12 form-group">
          <label>BUSINESS EMAIL *</label>
          <input 
            type="email" 
            className="form-input"
            value={c.business_email ?? ''}
            onChange={(e) => handleFieldChange('business_email', e.target.value)}
            disabled={!writeAllowed}
            placeholder="onboarding@company.com"
          />
        </div>

        <div className="col-12 form-group">
          <label>WEBSITE</label>
          <input 
            type="url" 
            className="form-input"
            value={c.website ?? ''}
            onChange={(e) => handleFieldChange('website', e.target.value)}
            disabled={!writeAllowed}
            placeholder="https://company.com"
          />
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
              className="form-input"
              value={c.physical_street ?? ''}
              onChange={(e) => handleFieldChange('physical_street', e.target.value)}
              disabled={!writeAllowed}
              placeholder="Street Address"
            />
          </div>

          <div className="col-6 form-group">
            <label>MAILING ADDRESS (IF DIFFERENT)</label>
            <input 
              type="text" 
              className="form-input"
              value={c.mailing_street ?? ''}
              onChange={(e) => handleFieldChange('mailing_street', e.target.value)}
              disabled={!writeAllowed}
              placeholder="P.O. Box or Mailing Address"
            />
          </div>

          <div className="col-6 form-group">
            <label>CITY *</label>
            <input 
              type="text" 
              className="form-input"
              value={c.physical_city ?? ''}
              onChange={(e) => handleFieldChange('physical_city', e.target.value)}
              disabled={!writeAllowed}
              placeholder="City"
            />
          </div>

          <div className="col-6 form-group">
            <label>MAILING CITY</label>
            <input 
              type="text" 
              className="form-input"
              value={c.mailing_city ?? ''}
              onChange={(e) => handleFieldChange('mailing_city', e.target.value)}
              disabled={!writeAllowed}
              placeholder="Mailing City"
            />
          </div>

          <div className="col-6 form-group">
            <label>STATE *</label>
            <input 
              type="text" 
              className="form-input"
              value={c.physical_state ?? ''}
              onChange={(e) => handleFieldChange('physical_state', e.target.value)}
              disabled={!writeAllowed}
              placeholder="State"
            />
          </div>

          <div className="col-6 form-group">
            <label>ZIP *</label>
            <input 
              type="text" 
              className="form-input"
              value={c.physical_zip ?? ''}
              onChange={(e) => handleFieldChange('physical_zip', e.target.value)}
              disabled={!writeAllowed}
              placeholder="ZIP Code"
            />
          </div>

          <div className="col-6 form-group">
            <label>COUNTY</label>
            <input 
              type="text" 
              className="form-input"
              value={c.physical_county ?? ''}
              onChange={(e) => handleFieldChange('physical_county', e.target.value)}
              disabled={!writeAllowed}
              placeholder="County"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
