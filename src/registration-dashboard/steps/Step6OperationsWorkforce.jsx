// src/components/steps/Step6OperationsWorkforce.jsx
import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { US_TIME_ZONES } from '../../shared/utils/usTimeZones';

// Business Hours/Saturday Hours used to be a single free-text field (e.g.
// "Mon-Fri 7:00 AM – 5:00 PM" or "By appointment only") with nothing
// stopping arbitrary text. Replaced with a real status choice plus actual
// time pickers when open — stored as { status, open, close } inside the
// existing business_hours jsonb column, confirmed via probe-insert to
// accept this shape with no schema changes needed.
function DayHoursEditor({ label, value, onChange, writeAllowed, error }) {
  const status = value?.status ?? '';
  return (
    <div className="col-6 form-group">
      <label>{label}</label>
      <select
        className={`form-select ${error ? 'error' : ''}`}
        value={status}
        onChange={(e) => onChange({ ...value, status: e.target.value })}
        disabled={!writeAllowed}
      >
        <option value="">Select status…</option>
        <option value="open">Open (set hours below)</option>
        <option value="closed">Closed</option>
        <option value="appointment_only">By Appointment Only</option>
      </select>
      {status === 'open' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
          <input
            type="time"
            className={`form-input ${error ? 'error' : ''}`}
            value={value?.open ?? ''}
            onChange={(e) => onChange({ ...value, open: e.target.value })}
            disabled={!writeAllowed}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>to</span>
          <input
            type="time"
            className={`form-input ${error ? 'error' : ''}`}
            value={value?.close ?? ''}
            onChange={(e) => onChange({ ...value, close: e.target.value })}
            disabled={!writeAllowed}
          />
        </div>
      )}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export default function Step6OperationsWorkforce({ data, onChange, writeAllowed, errors = {} }) {
  const ops = data.operations || {};
  const [newServiceText, setNewServiceText] = useState('');

  const handleFieldChange = (field, val) => {
    if (!writeAllowed) return;
    onChange('operations', { ...ops, [field]: val });
  };

  const services = ops.services_offered || [];

  const handleAddService = () => {
    if (!newServiceText.trim() || !writeAllowed) return;
    const updated = [...services, newServiceText.trim()];
    handleFieldChange('services_offered', updated);
    setNewServiceText('');
  };

  const handleRemoveService = (index) => {
    if (!writeAllowed) return;
    const updated = services.filter((_, i) => i !== index);
    handleFieldChange('services_offered', updated);
  };

  return (
    <div className="spec-step-card">
      <div className="spec-step-header">
        <div className="spec-step-title-group">
          <div className="step-number-circle">6</div>
          <h2>Operations & workforce</h2>
        </div>
        <span className="spec-pill-badge green">✓ Complete</span>
      </div>

      <div className="form-grid">
        <div className="col-6 form-group">
          <label>PRIMARY TRADE *</label>
          <input 
            type="text" 
            className={`form-input ${errors.primary_trade ? 'error' : ''}`} 
            value={ops.primary_trade ?? ''} 
            onChange={(e) => handleFieldChange('primary_trade', e.target.value)}
            disabled={!writeAllowed}
            placeholder="Primary Trade"
          />
          {errors.primary_trade && <span className="field-error">{errors.primary_trade}</span>}
        </div>

        {/* Dynamic Services Offered Tag Editor */}
        <div className="col-12 form-group">
          <label>SERVICES OFFERED *</label>
          <div className="pill-tags-cloud" style={{ marginBottom: '8px' }}>
            {services.map((svc, i) => (
              <span key={i} className="pill-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                ✓ {svc}
                {writeAllowed && (
                  <button 
                    type="button" 
                    onClick={() => handleRemoveService(i)}
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
                placeholder="Type a new trade service..."
                value={newServiceText}
                onChange={(e) => setNewServiceText(e.target.value)}
              />
              <button 
                type="button" 
                className="btn-spec-outline"
                style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                onClick={handleAddService}
              >
                <Plus size={14} /> Add Service
              </button>
            </div>
          )}
          {errors.services_offered && <span className="field-error">{errors.services_offered}</span>}
        </div>
      </div>

      {/* Service Area & Hours */}
      <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          SERVICE AREA & HOURS
        </h4>

        <div className="form-grid">
          <div className="col-6 form-group">
            <label>SERVICE RADIUS (MILES)</label>
            <input
              type="number"
              className={`form-input ${errors.service_radius_miles ? 'error' : ''}`}
              value={ops.service_radius_miles ?? ''}
              onChange={(e) => handleFieldChange('service_radius_miles', e.target.value === '' ? '' : parseInt(e.target.value))}
              disabled={!writeAllowed}
              min={1}
              placeholder="45"
            />
            {errors.service_radius_miles && <span className="field-error">{errors.service_radius_miles}</span>}
          </div>

          <div className="col-6 form-group">
            <label>COUNTIES SERVED</label>
            <input 
              type="text" 
              className="form-input" 
              value={Array.isArray(ops.counties_served) ? ops.counties_served.join(', ') : (ops.counties_served ?? '')} 
              onChange={(e) => handleFieldChange('counties_served', e.target.value.split(',').map(s => s.trim()))}
              disabled={!writeAllowed}
              placeholder="Sarasota, Manatee, Charlotte"
            />
          </div>

          <div className="col-6 form-group">
            <label>EMERGENCY SERVICE</label>
            <select 
              className="form-select"
              value={ops.emergency_service_available ? 'yes' : 'no'}
              onChange={(e) => handleFieldChange('emergency_service_available', e.target.value === 'yes')}
              disabled={!writeAllowed}
            >
              <option value="no">No — Scheduled Work Only</option>
              <option value="yes">Yes — 24/7 Emergency Response</option>
            </select>
          </div>

          <DayHoursEditor
            label="BUSINESS HOURS (WEEKDAY)"
            value={ops.business_hours?.weekday}
            onChange={(next) => handleFieldChange('business_hours', { ...ops.business_hours, weekday: next })}
            writeAllowed={writeAllowed}
            error={errors.business_hours_weekday}
          />

          <DayHoursEditor
            label="SATURDAY HOURS"
            value={ops.business_hours?.saturday}
            onChange={(next) => handleFieldChange('business_hours', { ...ops.business_hours, saturday: next })}
            writeAllowed={writeAllowed}
            error={errors.business_hours_saturday}
          />

          <div className="col-6 form-group">
            <label>TIME ZONE</label>
            <select
              className={`form-select ${errors.time_zone ? 'error' : ''}`}
              value={ops.time_zone ?? ''}
              onChange={(e) => handleFieldChange('time_zone', e.target.value)}
              disabled={!writeAllowed}
            >
              <option value="">Select time zone…</option>
              {US_TIME_ZONES.map(([tz, label]) => (
                <option key={tz} value={tz}>{label}</option>
              ))}
            </select>
            {errors.time_zone && <span className="field-error">{errors.time_zone}</span>}
          </div>
        </div>
      </div>

      {/* Workforce & Fleet */}
      <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          WORKFORCE & FLEET
        </h4>

        <div className="form-grid">
          <div className="col-6 form-group">
            <label>ACTIVE TECHNICIAN COUNT *</label>
            <input 
              type="number" 
              className={`form-input ${errors.technician_count ? 'error' : ''}`} 
              value={ops.technician_count ?? ''}
              onChange={(e) => handleFieldChange('technician_count', e.target.value === '' ? '' : parseInt(e.target.value))}
              disabled={!writeAllowed}
              min={1}
              placeholder="9"
            />
            {errors.technician_count && <span className="field-error">{errors.technician_count}</span>}
          </div>

          <div className="col-6 form-group">
            <label>SERVICE VEHICLES COUNT</label>
            <input 
              type="number" 
              className="form-input" 
              value={ops.vehicle_count ?? ''}
              onChange={(e) => handleFieldChange('vehicle_count', e.target.value === '' ? '' : parseInt(e.target.value))}
              disabled={!writeAllowed}
              min={0}
              placeholder="3"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
