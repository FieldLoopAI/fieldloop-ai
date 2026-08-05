// src/components/steps/Step8InternalSystemSettings.jsx
import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function Step8InternalSystemSettings({ data, onChange, writeAllowed, activeUser, onTerminate }) {
  const m = data.meta || {};
  const isTerminated = m.status === 'terminated';
  const canTerminate = activeUser?.role === 'admin' && !isTerminated;

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
            value={data.contractor?.contractor_id_public ?? 'LUXE-SRQ-001'} 
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
            value={m.onboarded_by_name ?? 'S. Martinez (onboarding specialist)'} 
            readOnly 
            disabled 
          />
        </div>

        <div className="col-6 form-group">
          <label>ONBOARDED DATE</label>
          <input 
            type="text" 
            className="form-input" 
            value={m.onboarded_at ? new Date(m.onboarded_at).toLocaleDateString() : '07/20/2026'} 
            readOnly 
            disabled 
          />
        </div>

        <div className="col-6 form-group">
          <label>CURRENT ACTIVATION STATUS</label>
          <select
            className="form-select"
            value={m.status ?? 'pending'}
            onChange={(e) => handleFieldChange('status', e.target.value)}
            disabled={!writeAllowed}
          >
            <option value="pending">Pending activation</option>
            <option value="active">Active (Live on Platform)</option>
            <option value="suspended">Suspended (Hold Payouts)</option>
            <option value="terminated">Terminated</option>
          </select>
        </div>

        <div className="col-6 form-group">
          <label>RISK SCORE (0–100)</label>
          <input
            type="number"
            min={0}
            max={100}
            className="form-input"
            value={m.risk_score ?? ''}
            onChange={(e) => handleFieldChange('risk_score', e.target.value === '' ? '' : parseInt(e.target.value, 10))}
            disabled={!writeAllowed}
            placeholder="12"
          />
        </div>

        <div className="col-6 form-group">
          <label>NEXT CREDENTIAL REVIEW</label>
          <input 
            type="date" 
            className="form-input" 
            value={m.next_credential_review ? m.next_credential_review.substring(0, 10) : '2026-09-04'} 
            onChange={(e) => handleFieldChange('next_credential_review', e.target.value)}
            disabled={!writeAllowed}
          />
        </div>

        <div className="col-12 form-group">
          <label>INTERNAL NOTES (NOT VISIBLE TO CONTRACTOR)</label>
          <textarea 
            className="form-textarea" 
            rows={4}
            value={m.internal_notes ?? ''} 
            onChange={(e) => handleFieldChange('internal_notes', e.target.value)}
            disabled={!writeAllowed}
            placeholder="Document onboarding notes, phone logs, and compliance details..."
          />
        </div>
      </div>

      {activeUser?.role === 'admin' && (
        <div
          className="form-grid"
          style={{
            marginTop: 24,
            padding: 16,
            border: '1px solid var(--color-danger, #d33)',
            borderRadius: 8,
          }}
        >
          <div className="col-12" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <AlertTriangle size={16} color="var(--color-danger, #d33)" />
            <strong>Danger zone</strong>
          </div>
          <div className="col-12" style={{ fontSize: '0.85em', opacity: 0.8, marginBottom: 12 }}>
            {isTerminated
              ? 'This contractor is terminated. Their AWS Secrets Manager secrets have been purged.'
              : 'Terminating a contractor sets their status to "terminated" and permanently deletes their encrypted secrets (EIN, SSN, DOB, home address, bank/Stripe details) from AWS Secrets Manager. The contractor record and audit history are kept. This cannot be undone.'}
          </div>
          <div className="col-12">
            <button
              type="button"
              className="btn-spec-outline"
              style={{ borderColor: 'var(--color-danger, #d33)', color: 'var(--color-danger, #d33)' }}
              onClick={onTerminate}
              disabled={!canTerminate}
            >
              Terminate Contractor & Purge Secrets
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
