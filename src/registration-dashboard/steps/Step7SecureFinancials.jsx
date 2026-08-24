// src/components/steps/Step7SecureFinancials.jsx
import React from 'react';
import { Lock, Check } from 'lucide-react';

export default function Step7SecureFinancials({ data, onChange, revealedValues, onReveal, onRevealedValueChange, writeAllowed, errors = {} }) {
  const f = data.financials || {};

  const handleFieldChange = (field, val) => {
    if (!writeAllowed) return;
    onChange('financials', { ...f, [field]: val });
  };

  // No ref yet (brand-new contractor before its first financials save)
  // means the field is simply editable from the start — nothing to reveal.
  const hasRoutingRef = Boolean(f.routing_number_ref);
  const isRoutingEditable = !hasRoutingRef || revealedValues['routing_number_ref'] !== undefined;
  const routingDisplay = revealedValues['routing_number_ref'] ?? '';

  const hasAccountRef = Boolean(f.account_number_ref);
  const isAccountEditable = !hasAccountRef || revealedValues['account_number_ref'] !== undefined;
  const accountDisplay = revealedValues['account_number_ref'] ?? '';

  const hasStripeRef = Boolean(f.stripe_account_id_ref);
  const isStripeEditable = !hasStripeRef || revealedValues['stripe_account_id_ref'] !== undefined;
  const stripeDisplay = revealedValues['stripe_account_id_ref'] ?? '';

  const hasCardRef = Boolean(f.backup_card_ref);
  const isCardEditable = !hasCardRef || revealedValues['backup_card_ref'] !== undefined;
  const cardDisplay = revealedValues['backup_card_ref'] ?? '';

  const handleVaultChange = (columnName, val) => {
    if (!writeAllowed) return;
    onRevealedValueChange(columnName, val);
  };

  // Routing number is exactly 9 digits and account number is 4-17 digits —
  // strip anything else so these can't accumulate arbitrary-length/
  // non-numeric input as-you-type.
  const handleRoutingChange = (val) => {
    if (!writeAllowed) return;
    onRevealedValueChange('routing_number_ref', val.replace(/\D/g, '').slice(0, 9));
  };

  const handleAccountChange = (val) => {
    if (!writeAllowed) return;
    onRevealedValueChange('account_number_ref', val.replace(/\D/g, '').slice(0, 17));
  };

  const paymentMethods = f.payment_methods_accepted || [];

  const handleTogglePaymentMethod = (method) => {
    if (!writeAllowed) return;
    let updated;
    if (paymentMethods.includes(method)) {
      updated = paymentMethods.filter(m => m !== method);
    } else {
      updated = [...paymentMethods, method];
    }
    handleFieldChange('payment_methods_accepted', updated);
  };

  return (
    <div className="spec-step-card">
      <div className="spec-step-header">
        <div className="spec-step-title-group">
          <div className="step-number-circle">7</div>
          <h2>Secure financials & Stripe Connect</h2>
        </div>
        <span className="spec-pill-badge amber">🔒 Vault Encrypted</span>
      </div>

      {/* Payout Bank Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          PAYOUT BANK (STRIPE CONNECT DESTINATION)
        </h4>

        <div className="form-grid">
          <div className="col-6 form-group">
            <label>BANK NAME *</label>
            <input 
              type="text" 
              className={`form-input ${errors.payout_bank_name ? 'error' : ''}`} 
              value={f.payout_bank_name ?? ''} 
              onChange={(e) => handleFieldChange('payout_bank_name', e.target.value)}
              disabled={!writeAllowed}
              placeholder="e.g. Bank of America, N.A."
            />
            {errors.payout_bank_name && <span className="field-error">{errors.payout_bank_name}</span>}
          </div>

          <div className="col-6 form-group">
            <label>ACCOUNT TYPE *</label>
            <select
              className={`form-select ${errors.account_type ? 'error' : ''}`}
              value={f.account_type ?? 'business_checking'}
              onChange={(e) => handleFieldChange('account_type', e.target.value)}
              disabled={!writeAllowed}
            >
              <option value="business_checking">Business Checking</option>
              <option value="business_savings">Business Savings</option>
            </select>
            {errors.account_type && <span className="field-error">{errors.account_type}</span>}
          </div>

          {/* Routing Masked / Unmasked Input */}
          <div className="col-6 form-group">
            <div className="form-label-row">
              <label>ROUTING NUMBER * <span className="enc-tag">ENC</span></label>
            </div>
            <div className="masked-input-group">
              <div className="masked-input-wrapper">
                <Lock className="lock-icon" size={16} />
                <input
                  type="text"
                  className={`form-input ${errors.routing_number_val ? 'error' : ''}`}
                  value={isRoutingEditable ? routingDisplay : "••••••••"}
                  onChange={(e) => handleRoutingChange(e.target.value)}
                  readOnly={!isRoutingEditable}
                  disabled={!writeAllowed}
                  inputMode="numeric"
                  maxLength={9}
                  placeholder="Routing Number"
                />
              </div>
              {hasRoutingRef && (
                <button
                  type="button"
                  className={`btn-reveal ${isRoutingEditable ? 'revealed' : ''}`}
                  onClick={() => onReveal('contractor_financials', 'routing_number_ref', f.routing_number_ref)}
                >
                  {isRoutingEditable ? 'HIDE' : 'REVEAL'}
                </button>
              )}
            </div>
            {errors.routing_number_val && <span className="field-error">{errors.routing_number_val}</span>}
          </div>

          {/* Account Masked / Unmasked Input */}
          <div className="col-6 form-group">
            <div className="form-label-row">
              <label>ACCOUNT NUMBER * <span className="enc-tag">ENC</span></label>
            </div>
            <div className="masked-input-group">
              <div className="masked-input-wrapper">
                <Lock className="lock-icon" size={16} />
                <input
                  type="text"
                  className={`form-input ${errors.account_number_val ? 'error' : ''}`}
                  value={isAccountEditable ? accountDisplay : "••••••••"}
                  onChange={(e) => handleAccountChange(e.target.value)}
                  readOnly={!isAccountEditable}
                  disabled={!writeAllowed}
                  inputMode="numeric"
                  maxLength={17}
                  placeholder="Account Number"
                />
              </div>
              {hasAccountRef && (
                <button
                  type="button"
                  className={`btn-reveal ${isAccountEditable ? 'revealed' : ''}`}
                  onClick={() => onReveal('contractor_financials', 'account_number_ref', f.account_number_ref)}
                >
                  {isAccountEditable ? 'HIDE' : 'REVEAL'}
                </button>
              )}
            </div>
            {errors.account_number_val && <span className="field-error">{errors.account_number_val}</span>}
          </div>

          <div className="col-6 form-group">
            <label>ACCOUNT HOLDER NAME</label>
            <input 
              type="text" 
              className="form-input" 
              value={f.account_holder_name ?? ''} 
              onChange={(e) => handleFieldChange('account_holder_name', e.target.value)}
              disabled={!writeAllowed}
              placeholder="Account Holder Name"
            />
          </div>

          <div className="col-6 form-group">
            <label>MICRO-DEPOSIT VERIFICATION STATUS</label>
            <select
              className="form-select"
              value={f.micro_deposit_verified_ts ? 'Verified' : 'Pending'}
              onChange={(e) => handleFieldChange('micro_deposit_verified_ts', e.target.value === 'Verified' ? (f.micro_deposit_verified_ts || new Date().toISOString()) : null)}
              disabled={!writeAllowed}
            >
              <option value="Verified">✓ Micro-Deposits Verified</option>
              <option value="Pending">Pending Deposit Verification</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stripe Connect & Payment Acceptance */}
      <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          STRIPE CONNECT & PAYMENT ACCEPTANCE
        </h4>

        <div className="form-grid">
          {/* Stripe Account ID Masked / Unmasked Input */}
          <div className="col-6 form-group">
            <div className="form-label-row">
              <label>STRIPE CONNECT Account ID * <span className="enc-tag">ENC</span></label>
            </div>
            <div className="masked-input-group">
              <div className="masked-input-wrapper">
                <Lock className="lock-icon" size={16} />
                <input
                  type="text"
                  className={`form-input ${errors.stripe_account_id_val ? 'error' : ''}`}
                  value={isStripeEditable ? stripeDisplay : "acct_••••••••"}
                  onChange={(e) => handleVaultChange('stripe_account_id_ref', e.target.value)}
                  readOnly={!isStripeEditable}
                  disabled={!writeAllowed}
                  maxLength={40}
                  placeholder="acct_1P..."
                />
              </div>
              {hasStripeRef && (
                <button
                  type="button"
                  className={`btn-reveal ${isStripeEditable ? 'revealed' : ''}`}
                  onClick={() => onReveal('contractor_financials', 'stripe_account_id_ref', f.stripe_account_id_ref)}
                >
                  {isStripeEditable ? 'HIDE' : 'REVEAL'}
                </button>
              )}
            </div>
            {errors.stripe_account_id_val && <span className="field-error">{errors.stripe_account_id_val}</span>}
          </div>

          <div className="col-6 form-group">
            <label>CONNECT MODEL</label>
            <input 
              type="text" 
              className="form-input" 
              value={f.stripe_connect_model ?? 'Direct Charges'} 
              onChange={(e) => handleFieldChange('stripe_connect_model', e.target.value)}
              disabled={!writeAllowed}
            />
          </div>

          {/* Interactive Payment Methods Toggles */}
          <div className="col-12 form-group">
            <label>PAYMENT METHODS ACCEPTED</label>
            <div className="pill-tags-cloud">
              {["Cash", "Check", "Credit card (via Stripe)", "ACH bank transfer"].map((method) => {
                const isSelected = paymentMethods.includes(method);
                return (
                  <button
                    type="button"
                    key={method}
                    className="pill-tag"
                    style={{
                      cursor: writeAllowed ? 'pointer' : 'default',
                      background: isSelected ? '#ecfdf5' : '#f8fafc',
                      color: isSelected ? '#047857' : '#64748b',
                      borderColor: isSelected ? '#a7f3d0' : '#cbd5e1'
                    }}
                    onClick={() => handleTogglePaymentMethod(method)}
                  >
                    {isSelected && <Check size={14} />} {method}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Fee Structure & ACH Authorization */}
      <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          FEE STRUCTURE & ACH AUTHORIZATION
        </h4>

        <div className="form-grid">
          <div className="col-6 form-group">
            <label>PLATFORM FEE RATE (PLATFORM CONSTANT)</label>
            <input type="text" className="form-input" value="1.95%" readOnly disabled />
          </div>

          <div className="col-6 form-group">
            <label>MINIMUM MONTHLY FLOOR ($)</label>
            <input 
              type="number" 
              className="form-input" 
              value={f.monthly_floor_amount ?? 49}
              onChange={(e) => handleFieldChange('monthly_floor_amount', e.target.value === '' ? '' : parseFloat(e.target.value))}
              disabled={!writeAllowed}
              min={0}
              placeholder="49"
            />
          </div>

          <div className="col-12 form-group">
            <label>VOLUME DISCOUNT RATE (decimal, e.g. 0.01 = 1%)</label>
            <input
              type="number"
              step="0.0001"
              className="form-input"
              value={f.volume_discount_tier ?? 0.01}
              onChange={(e) => handleFieldChange('volume_discount_tier', e.target.value === '' ? '' : parseFloat(e.target.value))}
              disabled={!writeAllowed}
              min={0}
              max={1}
              placeholder="0.01"
            />
          </div>

          <div className="col-12 form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: writeAllowed ? 'pointer' : 'default' }}>
              <input 
                type="checkbox" 
                className={errors.ach_authorization_signed ? 'error' : ''}
                checked={!!f.ach_authorization_signed}
                onChange={(e) => handleFieldChange('ach_authorization_signed', e.target.checked)}
                disabled={!writeAllowed}
              />
              <strong style={{ color: errors.ach_authorization_signed ? 'var(--badge-red-text)' : 'inherit' }}>
                ACH Authorization Signed for Cash & Check Fee Collections *
              </strong>
            </label>
            {errors.ach_authorization_signed && <div className="field-error">{errors.ach_authorization_signed}</div>}
          </div>
        </div>
      </div>

      {/* Backup Payment Method */}
      <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          BACKUP PAYMENT METHOD
        </h4>

        <div className="form-grid">
          {/* Backup Card Masked / Unmasked Input */}
          <div className="col-6 form-group">
            <div className="form-label-row">
              <label>BACKUP CARD ON FILE <span className="enc-tag">ENC</span></label>
            </div>
            <div className="masked-input-group">
              <div className="masked-input-wrapper">
                <Lock className="lock-icon" size={16} />
                <input
                  type="text"
                  className="form-input"
                  value={isCardEditable ? cardDisplay : "•••• •••• •••• ••••"}
                  onChange={(e) => handleVaultChange('backup_card_ref', e.target.value)}
                  readOnly={!isCardEditable}
                  disabled={!writeAllowed}
                  placeholder="Card Number"
                />
              </div>
              {hasCardRef && (
                <button
                  type="button"
                  className={`btn-reveal ${isCardEditable ? 'revealed' : ''}`}
                  onClick={() => onReveal('contractor_financials', 'backup_card_ref', f.backup_card_ref)}
                >
                  {isCardEditable ? 'HIDE' : 'REVEAL'}
                </button>
              )}
            </div>
          </div>

          <div className="col-6 form-group">
            <label>BACKUP CARD EXPIRATION</label>
            <input 
              type="text" 
              className="form-input" 
              value={f.backup_card_expiration ?? ''}
              onChange={(e) => handleFieldChange('backup_card_expiration', e.target.value)}
              disabled={!writeAllowed}
              placeholder="MM/YYYY"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
