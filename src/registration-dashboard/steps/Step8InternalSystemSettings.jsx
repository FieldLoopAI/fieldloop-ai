// src/components/steps/Step8InternalSystemSettings.jsx
import React from 'react';

export default function Step8InternalSystemSettings({ data, onChange, writeAllowed, errors = {} }) {
  const m = data.meta || {};

  const handleFieldChange = (field, val) => {
    if (!writeAllowed) return;
    onChange('meta', { ...m, [field]: val });
  };

  return (
    <div className="spec-step-card">
      <div className="spec-step-header">
        <div className="spec-step-title-group">
          <div className="step-number-circle">8</div>
          <h2>Internal & system settings (Staff Workspace)</h2>
        </div>
        <span className="spec-pill-badge dark">Internal Staff View</span>
      </div>

      <div className="form-grid">
        <div className="col-6 form-group">
          <label>CONTRACTOR ID</label>
          <input
            type="text"
            className="form-input"
            value={data.contractor?.contractor_id_public ?? '—'}
            readOnly
            disabled
            style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}
          />
        </div>

        <div className="col-6 form-group">
          <label>ONBOARDED BY</label>
          <input
            type="text"
            className="form-input"
            value={m.onboarded_by_name ?? '—'}
            readOnly
            disabled
          />
        </div>

        <div className="col-6 form-group">
          <label>ONBOARDED DATE</label>
          <input
            type="text"
            className="form-input"
            value={m.onboarded_at ? new Date(m.onboarded_at).toLocaleDateString() : '—'}
            readOnly
            disabled
          />
        </div>

        <div className="col-6 form-group">
          <label>CURRENT ACTIVATION STATUS</label>
          <select
            className={errors.status ? "form-select error" : "form-select"}
            value={m.status ?? 'pending'}
            onChange={(e) => handleFieldChange('status', e.target.value)}
            disabled={!writeAllowed}
          >
            <option value="pending">Pending activation</option>
            <option value="active">Active (Live on Platform)</option>
            <option value="suspended">Suspended (Hold Payouts)</option>
            <option value="terminated">Terminated</option>
          </select>
          {errors.status && <span className="field-error">{errors.status}</span>}
        </div>

        <div className="col-6 form-group">
          <label>RISK SCORE (0–100)</label>
          <input
            type="number"
            min={0}
            max={100}
            className={errors.risk_score ? "form-input error" : "form-input"}
            value={m.risk_score ?? ''}
            onChange={(e) => handleFieldChange('risk_score', e.target.value === '' ? '' : parseInt(e.target.value, 10))}
            disabled={!writeAllowed}
            placeholder="12"
          />
          {errors.risk_score && <span className="field-error">{errors.risk_score}</span>}
        </div>

        <div className="col-6 form-group">
          <label>NEXT CREDENTIAL REVIEW</label>
          <input
            type="date"
            className={errors.next_credential_review ? "form-input error" : "form-input"}
            value={m.next_credential_review ? m.next_credential_review.substring(0, 10) : ''}
            onChange={(e) => handleFieldChange('next_credential_review', e.target.value)}
            disabled={!writeAllowed}
          />
          {errors.next_credential_review && <span className="field-error">{errors.next_credential_review}</span>}
        </div>

        <div className="col-12 form-group">
          <label>INTERNAL NOTES (NOT VISIBLE TO CONTRACTOR)</label>
          <textarea
            className={errors.internal_notes ? "form-textarea error" : "form-textarea"}
            rows={4}
            value={m.internal_notes ?? ''}
            onChange={(e) => handleFieldChange('internal_notes', e.target.value)}
            disabled={!writeAllowed}
            placeholder="Document onboarding notes, phone logs, and compliance details..."
          />
          {errors.internal_notes && <span className="field-error">{errors.internal_notes}</span>}
        </div>
      </div>
    </div>
  );
}
