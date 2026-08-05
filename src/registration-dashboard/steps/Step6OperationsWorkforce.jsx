// src/components/steps/Step6OperationsWorkforce.jsx
import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

export default function Step6OperationsWorkforce({ data, onChange, writeAllowed }) {
  const ops = data.operations || {};
  const [newServiceText, setNewServiceText] = useState('');

  const handleFieldChange = (field, val) => {
    if (!writeAllowed) return;
    onChange('operations', { ...ops, [field]: val });
  };

  const services = ops.services_offered || [
    "Tile work", "Bathroom remodeling", "Kitchen remodeling", 
    "Wood flooring", "Tile flooring", "Interior painting", 
    "Exterior painting", "Room additions", "New construction"
  ];

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
            className="form-input" 
            value={ops.primary_trade ?? ''} 
            onChange={(e) => handleFieldChange('primary_trade', e.target.value)}
            disabled={!writeAllowed}
            placeholder="Primary Trade"
          />
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
              className="form-input"
              value={ops.service_radius_miles ?? ''}
              onChange={(e) => handleFieldChange('service_radius_miles', e.target.value === '' ? '' : parseInt(e.target.value))}
              disabled={!writeAllowed}
              placeholder="45"
            />
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

          <div className="col-6 form-group">
            <label>BUSINESS HOURS</label>
            <input
              type="text"
              className="form-input"
              value={ops.business_hours?.weekday ?? ''}
              onChange={(e) => handleFieldChange('business_hours', { ...ops.business_hours, weekday: e.target.value })}
              disabled={!writeAllowed}
              placeholder="Mon-Fri 7:00 AM – 5:00 PM"
            />
          </div>

          <div className="col-6 form-group">
            <label>SATURDAY HOURS</label>
            <input
              type="text"
              className="form-input"
              value={ops.business_hours?.saturday ?? ''}
              onChange={(e) => handleFieldChange('business_hours', { ...ops.business_hours, saturday: e.target.value })}
              disabled={!writeAllowed}
              placeholder="By appointment only"
            />
          </div>

          <div className="col-6 form-group">
            <label>TIME ZONE</label>
            <input 
              type="text" 
              className="form-input" 
              value={ops.time_zone ?? ''} 
              onChange={(e) => handleFieldChange('time_zone', e.target.value)}
              disabled={!writeAllowed}
              placeholder="America/New_York (ET)"
            />
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
              className="form-input" 
              value={ops.technician_count ?? ''} 
              onChange={(e) => handleFieldChange('technician_count', e.target.value === '' ? '' : parseInt(e.target.value))}
              disabled={!writeAllowed}
              placeholder="9"
            />
          </div>

          <div className="col-6 form-group">
            <label>SERVICE VEHICLES COUNT</label>
            <input 
              type="number" 
              className="form-input" 
              value={ops.vehicle_count ?? ''} 
              onChange={(e) => handleFieldChange('vehicle_count', e.target.value === '' ? '' : parseInt(e.target.value))}
              disabled={!writeAllowed}
              placeholder="3"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
