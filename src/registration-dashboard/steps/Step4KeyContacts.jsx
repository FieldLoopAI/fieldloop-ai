// src/components/steps/Step4KeyContacts.jsx
import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { formatPhoneInput } from '../../shared/utils/formatters';

export default function Step4KeyContacts({ data, onChange, _activeUser, writeAllowed, errors = {} }) {
  const contacts = data.contacts || [];

  const getAvatarInitials = (name) => {
    if (!name) return 'FL';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const handleContactChange = (index, field, value) => {
    if (!writeAllowed) return;
    const updated = [...contacts];
    updated[index] = { ...updated[index], [field]: value };
    onChange('contacts', updated);
  };

  const handleAddContact = () => {
    if (!writeAllowed) return;
    const newContact = {
      id: `cont-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      contractor_id: data.contractor?.id,
      contact_type: "secondary",
      full_name: "",
      title: "New Team Contact",
      direct_phone: "",
      sms_phone: "",
      email: "",
      preferred_channel: "email",
      relationship: ""
    };
    onChange('contacts', [...contacts, newContact]);
  };

  const handleRemoveContact = (index) => {
    if (!writeAllowed) return;
    if (contacts.length <= 1) {
      alert("At least one contact must remain on file.");
      return;
    }
    const updated = contacts.filter((_, i) => i !== index);
    onChange('contacts', updated);
  };

  const getContactBadge = (type) => {
    switch (type) {
      case 'primary':
        return <span className="spec-pill-badge green">PRIMARY CONTACT</span>;
      case 'secondary':
        return <span className="spec-pill-badge dark">SECONDARY</span>;
      case 'billing':
        return <span className="spec-pill-badge dark">BILLING / AP</span>;
      case 'field_ops':
        return <span className="spec-pill-badge dark">FIELD OPS</span>;
      case 'emergency':
        return <span className="spec-pill-badge amber">EMERGENCY</span>;
      default:
        return <span className="spec-pill-badge dark">{type.toUpperCase()}</span>;
    }
  };

  return (
    <div className="spec-step-card">
      <div className="spec-step-header">
        <div className="spec-step-title-group">
          <div className="step-number-circle">4</div>
          <h2>Key contacts</h2>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="spec-pill-badge green">✓ {contacts.length} contacts on file</span>
          {writeAllowed && (
            <button 
              type="button" 
              className="btn-spec-primary"
              style={{ fontSize: '0.78rem', padding: '6px 14px' }}
              onClick={handleAddContact}
            >
              <Plus size={14} /> Add Contact
            </button>
          )}
        </div>
      </div>

      {errors.contacts && (
        <div className="spec-callout pink" style={{ margin: '0 0 1rem 0' }}>
          <p>{errors.contacts}</p>
        </div>
      )}

      <div className="contacts-grid">
        {contacts.map((c, i) => (
          <div className="contact-card" key={c.id || i}>
            <div className="contact-card-header">
              <div className="contact-profile-info">
                <div className="avatar-circle">
                  {getAvatarInitials(c.full_name || 'Contact')}
                </div>
                <div className="contact-name-title">
                  <div className="name">{c.full_name || 'Unnamed Contact'}</div>
                  <div className="title">{c.title || 'Staff / Manager'}</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {getContactBadge(c.contact_type)}
                {writeAllowed && (
                  <button 
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '4px' }}
                    title="Remove Contact"
                    onClick={() => handleRemoveContact(i)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="form-grid">
              <div className="col-6 form-group">
                <label>FULL NAME *</label>
                <input 
                  type="text" 
                  className={`form-input ${errors[`contact_${i}_full_name`] ? 'error' : ''}`} 
                  value={c.full_name || ''} 
                  onChange={(e) => handleContactChange(i, 'full_name', e.target.value)}
                  disabled={!writeAllowed}
                  placeholder="e.g. Jane Doe"
                />
                {errors[`contact_${i}_full_name`] && <span className="field-error">{errors[`contact_${i}_full_name`]}</span>}
              </div>

              <div className="col-6 form-group">
                <label>TITLE / JOB ROLE</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={c.title || ''} 
                  onChange={(e) => handleContactChange(i, 'title', e.target.value)}
                  disabled={!writeAllowed}
                  placeholder="e.g. Operations Manager"
                />
              </div>

              <div className="col-6 form-group">
                <label>CONTACT CATEGORY</label>
                <select 
                  className="form-select"
                  value={c.contact_type || 'secondary'}
                  onChange={(e) => handleContactChange(i, 'contact_type', e.target.value)}
                  disabled={!writeAllowed}
                >
                  <option value="primary">Primary Contact</option>
                  <option value="secondary">Secondary Contact</option>
                  <option value="billing">Billing / Accounts Payable</option>
                  <option value="field_ops">Field Operations Lead</option>
                  <option value="emergency">Emergency Contact</option>
                </select>
              </div>

              <div className="col-6 form-group">
                <label>DIRECT LINE</label>
                <input 
                  type="text" 
                  className={`form-input ${errors[`contact_${i}_direct_phone`] ? 'error' : ''}`} 
                  value={c.direct_phone || ''}
                  onChange={(e) => handleContactChange(i, 'direct_phone', formatPhoneInput(e.target.value))}
                  disabled={!writeAllowed}
                  inputMode="tel"
                  maxLength={14}
                  placeholder="(555) 000-0000"
                />
                {errors[`contact_${i}_direct_phone`] && <span className="field-error">{errors[`contact_${i}_direct_phone`]}</span>}
              </div>

              <div className="col-6 form-group">
                <label>TEXT / SMS NUMBER</label>
                <input 
                  type="text" 
                  className={`form-input ${errors[`contact_${i}_sms_phone`] ? 'error' : ''}`} 
                  value={c.sms_phone || ''}
                  onChange={(e) => handleContactChange(i, 'sms_phone', formatPhoneInput(e.target.value))}
                  disabled={!writeAllowed}
                  inputMode="tel"
                  maxLength={14}
                  placeholder="(555) 000-0000"
                />
                {errors[`contact_${i}_sms_phone`] && <span className="field-error">{errors[`contact_${i}_sms_phone`]}</span>}
              </div>

              <div className="col-6 form-group">
                <label>EMAIL ADDRESS</label>
                <input 
                  type="email" 
                  className={`form-input ${errors[`contact_${i}_email`] ? 'error' : ''}`} 
                  value={c.email || ''} 
                  onChange={(e) => handleContactChange(i, 'email', e.target.value)}
                  disabled={!writeAllowed}
                  placeholder="name@company.com"
                />
                {errors[`contact_${i}_email`] && <span className="field-error">{errors[`contact_${i}_email`]}</span>}
              </div>

              <div className="col-6 form-group">
                <label>PREFERRED CHANNEL</label>
                <select
                  className="form-select"
                  value={c.preferred_channel || 'email'}
                  onChange={(e) => handleContactChange(i, 'preferred_channel', e.target.value)}
                  disabled={!writeAllowed}
                >
                  <option value="voice">Voice / Phone Call</option>
                  <option value="sms">Text / SMS</option>
                  <option value="email">Email</option>
                </select>
              </div>

              {c.contact_type === 'emergency' && (
                <div className="col-6 form-group">
                  <label>RELATIONSHIP</label>
                  <input
                    type="text"
                    className="form-input"
                    value={c.relationship || ''}
                    onChange={(e) => handleContactChange(i, 'relationship', e.target.value)}
                    disabled={!writeAllowed}
                    placeholder="e.g. Spouse / Co-owner"
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
