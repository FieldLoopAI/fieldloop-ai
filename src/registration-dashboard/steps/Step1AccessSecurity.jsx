// src/components/steps/Step1AccessSecurity.jsx
import React, { useState } from 'react';

const PASSWORD_MIN_LENGTH_FLOOR = 8;
const PASSWORD_MIN_LENGTH_CEILING = 64;

export default function Step1AccessSecurity({ data, activeUser, auditLog, settings, onSettingsChange }) {
  const isAdmin = activeUser.role === 'admin';
  const contractorId = data.contractor?.id;

  const recentLogs = (auditLog || [])
    .filter(log => !contractorId || log.contractor_id === contractorId)
    .slice(0, 8);

  const handlePolicyChange = (key, value) => {
    if (!isAdmin || !settings) return;
    onSettingsChange({ ...settings, [key]: value });
  };

  // Every other policy field here is a <select> (a single discrete choice,
  // safe to save immediately). This one is free-typed, so saving on every
  // keystroke would fire a live, unvalidated write to system_settings for
  // each digit typed — clamp and commit on blur instead, once the admin is
  // done typing a real value.
  const [pendingPasswordMinLength, setPendingPasswordMinLength] = useState(null);

  const commitPasswordMinLength = () => {
    if (pendingPasswordMinLength === null) return;
    const parsed = parseInt(pendingPasswordMinLength, 10);
    const clamped = Math.min(
      PASSWORD_MIN_LENGTH_CEILING,
      Math.max(PASSWORD_MIN_LENGTH_FLOOR, isNaN(parsed) ? PASSWORD_MIN_LENGTH_FLOOR : parsed)
    );
    // Keep showing the clamped value (rather than reverting to the stale
    // `settings` prop) while the save round-trips — clearing this back to
    // null immediately made the field flicker back to the old value until
    // the response came back.
    setPendingPasswordMinLength(String(clamped));
    if (clamped !== settings.password_min_length) {
      handlePolicyChange('password_min_length', clamped);
    }
  };

  return (
    <div className="spec-step-card">
      <div className="spec-step-header">
        <div className="spec-step-title-group">
          <div className="step-number-circle">1</div>
          <h2>Access & security — Role Permissions & Policies</h2>
        </div>
        <span className="spec-pill-badge green">✓ Policy Active</span>
      </div>

      {/* Role-Based Access Matrix */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          ROLE-BASED ACCESS CONTROL (RBAC) MATRIX
        </h4>

        <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)' }}>
          <table className="matrix-table">
            <thead>
              <tr>
                <th>INTERNAL ROLE</th>
                <th>BUSINESS INFO</th>
                <th>OWNER PII (SSN, DOB)</th>
                <th>BANK & ROUTING</th>
                <th>STRIPE KEYS</th>
                <th>EDIT RIGHTS</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 700 }}>Admin</td>
                <td>✓ Full</td>
                <td>✓ Full (Revealable)</td>
                <td>✓ Full (Revealable)</td>
                <td>✓ Full (Revealable)</td>
                <td><span className="badge-write">WRITE</span></td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700 }}>Onboarding Specialist</td>
                <td>✓ Full</td>
                <td>✓ Full (Revealable)</td>
                <td>✓ Full (Revealable)</td>
                <td>✕ No</td>
                <td><span className="badge-write">WRITE</span></td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700 }}>Finance / Reconciliation</td>
                <td>✓ Full</td>
                <td>✕ No</td>
                <td>✓ Full (Revealable)</td>
                <td>✕ No</td>
                <td style={{ color: 'var(--text-muted)' }}>Read-only</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700 }}>Support / Help Desk</td>
                <td>◐ Contact info only</td>
                <td>✕ No</td>
                <td>✕ No</td>
                <td>✕ No</td>
                <td style={{ color: 'var(--text-muted)' }}>Read-only</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700 }}>Jenex Developer (Build)</td>
                <td>◐ Sandbox data only</td>
                <td>✕ Never in prod</td>
                <td>✕ Never in prod</td>
                <td>◐ Test keys</td>
                <td style={{ color: 'var(--text-muted)' }}>Read-only (prod)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Editable Session & Authentication Policies */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '1rem' }}>
        <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          SECURITY & SESSION POLICY CONFIGURATION {isAdmin ? '(Admin Editable)' : '(Read-Only)'}
        </h4>

        {!settings ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading policy settings…</div>
        ) : (
          <div className="form-grid">
            <div className="col-6 form-group">
              <label>PASSWORD MINIMUM LENGTH</label>
              <input
                type="number"
                className="form-input"
                value={pendingPasswordMinLength ?? settings.password_min_length}
                onChange={(e) => setPendingPasswordMinLength(e.target.value)}
                onBlur={commitPasswordMinLength}
                disabled={!isAdmin}
                min={PASSWORD_MIN_LENGTH_FLOOR}
                max={PASSWORD_MIN_LENGTH_CEILING}
              />
            </div>

            <div className="col-6 form-group">
              <label>IDLE SESSION TIMEOUT (MINUTES)</label>
              <select
                className="form-select"
                value={settings.session_timeout_minutes}
                onChange={(e) => handlePolicyChange('session_timeout_minutes', parseInt(e.target.value))}
                disabled={!isAdmin}
              >
                <option value={5}>5 Minutes</option>
                <option value={15}>15 Minutes (Default)</option>
                <option value={30}>30 Minutes</option>
                <option value={60}>60 Minutes</option>
              </select>
            </div>

            <div className="col-6 form-group">
              <label>MULTI-FACTOR AUTH REQUIREMENT</label>
              <input
                type="text"
                className="form-input"
                value={`Required — TOTP for ${(settings.mfa_required_roles || []).join(' & ')}`}
                readOnly
                disabled
              />
            </div>

            <div className="col-6 form-group">
              <label>ADMIN & FINANCE IP ALLOWLIST</label>
              <select
                className="form-select"
                value={settings.ip_allowlist_enabled ? 'enabled' : 'disabled'}
                onChange={(e) => handlePolicyChange('ip_allowlist_enabled', e.target.value === 'enabled')}
                disabled={!isAdmin}
              >
                <option value="enabled">Enforced (Active)</option>
                <option value="disabled">Disabled (Testing Mode)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Real-time Audit Feed (fetched with the contractor record) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '1rem' }}>
        <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          REAL-TIME RECORD AUDIT & ACCESS FEED
        </h4>

        <div className="activity-code-block">
          {recentLogs.length === 0 ? (
            <div>No audit logs recorded for this record yet.</div>
          ) : (
            recentLogs.map((log) => (
              <div key={log.id}>
                {new Date(log.timestamp).toISOString().replace('T', ' ').substring(0, 19)} · User: {log.user_id} · Action: <strong>{log.action}</strong> · Field: {log.field_accessed} (IP: {log.ip_address})
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
