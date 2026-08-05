// src/components/steps/Step7SecureFinancials.jsx
import React from 'react';
import { Lock, Check } from 'lucide-react';

export default function Step7SecureFinancials({ data, onChange, revealedValues, onReveal, writeAllowed }) {
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
    revealedValues[columnName] = val;
    onChange('financials', { ...f });
  };

  const paymentMethods = f.payment_methods_accepted || ["Cash", "Check", "Credit card (via Stripe)", "ACH bank transfer"];

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
              className="form-input" 
              value={f.payout_bank_name ?? ''} 
              onChange={(e) => handleFieldChange('payout_bank_name', e.target.value)}
              disabled={!writeAllowed}
              placeholder="e.g. Bank of America, N.A."
            />
          </div>

          <div className="col-6 form-group">
            <label>ACCOUNT TYPE</label>
            <select
              className="form-select"
              value={f.account_type ?? 'business_checking'}
              onChange={(e) => handleFieldChange('account_type', e.target.value)}
              disabled={!writeAllowed}
            >
              <option value="business_checking">Business Checking</option>
              <option value="business_savings">Business Savings</option>
            </select>
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
                  className="form-input"
                  value={isRoutingEditable ? routingDisplay : "••••••••0277"}
                  onChange={(e) => handleVaultChange('routing_number_ref', e.target.value)}
                  readOnly={!isRoutingEditable}
                  disabled={!writeAllowed}
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
                  className="form-input"
                  value={isAccountEditable ? accountDisplay : "••••••••1212"}
                  onChange={(e) => handleVaultChange('account_number_ref', e.target.value)}
                  readOnly={!isAccountEditable}
                  disabled={!writeAllowed}
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
              <label>STRIPE ACCOUNT ID <span className="enc-tag">ENC</span></label>
            </div>
            <div className="masked-input-group">
              <div className="masked-input-wrapper">
                <Lock className="lock-icon" size={16} />
                <input
                  type="text"
                  className="form-input"
                  value={isStripeEditable ? stripeDisplay : "acct_1P••••••••"}
                  onChange={(e) => handleVaultChange('stripe_account_id_ref', e.target.value)}
                  readOnly={!isStripeEditable}
                  disabled={!writeAllowed}
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
              placeholder="0.01"
            />
          </div>

          <div className="col-12 form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: writeAllowed ? 'pointer' : 'default' }}>
              <input 
                type="checkbox" 
                checked={!!f.ach_authorization_signed}
                onChange={(e) => handleFieldChange('ach_authorization_signed', e.target.checked)}
                disabled={!writeAllowed}
              />
              <strong>ACH Authorization Signed for Cash & Check Fee Collections</strong>
            </label>
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
                  value={isCardEditable ? cardDisplay : "Visa •••• 4444"}
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
              value={f.backup_card_expiration ?? '08/2028'} 
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
