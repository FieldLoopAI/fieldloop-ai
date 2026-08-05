// src/registration-dashboard/KnowledgeBasePanel.jsx
//
// Staff review panel for the FieldLoop AI estimating assistant's knowledge
// base (backend/sql/010_estimate_knowledge_base.sql) — staff draft entries
// (plain-language facts answering the trade's common-question bank), and
// admin/onboarding staff approve or reject them before they're considered
// live content. Reachable via RegistrationDashboard's top-level view
// toggle, gated to admin/onboarding — canManage is effectively always true
// here since non-managing roles never see the toggle that reaches this
// panel, but it's still checked so write controls degrade gracefully if
// that ever changes.
import React, { useEffect, useState } from 'react';
import { api } from '../shared/services/api';
import { Check, X as XIcon, Plus } from 'lucide-react';

const SOURCE_TYPES = ['code_summary', 'manufacturer_spec', 'field_standard'];
const STATUS_FILTERS = ['pending', 'approved', 'rejected', 'superseded', 'all'];

const EMPTY_FORM = {
  trade: 'gc_interior_remodel',
  category: '',
  topic: '',
  answer: '',
  source_type: 'field_standard',
  jurisdiction_dependent: false,
};

function statusPillClass(status) {
  if (status === 'approved') return 'spec-pill-badge green';
  if (status === 'rejected') return 'spec-pill-badge red';
  if (status === 'superseded') return 'spec-pill-badge dark';
  return 'spec-pill-badge amber'; // pending
}

export default function KnowledgeBasePanel({ canManage, setErrorBanner, setSuccessBanner }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [tradeFilter, setTradeFilter] = useState('gc_interior_remodel');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  const [reviewDrafts, setReviewDrafts] = useState({});
  const [reviewingId, setReviewingId] = useState(null);

  const loadEntries = () => {
    setLoading(true);
    api.listKbEntries({
      trade: tradeFilter || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
    })
      .then(setEntries)
      .catch((e) => setErrorBanner(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, tradeFilter]);

  const handleCreate = (e) => {
    e.preventDefault();
    if (!createForm.trade || !createForm.category || !createForm.topic || !createForm.answer || !createForm.source_type) {
      setErrorBanner('Trade, category, topic, answer, and source type are all required.');
      return;
    }
    setCreating(true);
    api.createKbEntry(createForm)
      .then(() => {
        setSuccessBanner('Knowledge base entry created and awaiting review.');
        setCreateForm(EMPTY_FORM);
        setShowCreateForm(false);
        loadEntries();
      })
      .catch((e) => setErrorBanner(e.message))
      .finally(() => setCreating(false));
  };

  const handleReview = (id, decision) => {
    setReviewingId(id);
    api.reviewKbEntry(id, decision, reviewDrafts[id])
      .then(() => {
        setSuccessBanner(decision === 'approved' ? 'Entry approved.' : 'Entry rejected.');
        setReviewDrafts((prev) => { const next = { ...prev }; delete next[id]; return next; });
        loadEntries();
      })
      .catch((e) => setErrorBanner(e.message))
      .finally(() => setReviewingId(null));
  };

  return (
    <div className="spec-step-card">
      <div className="spec-step-header">
        <div className="spec-step-title-group">
          <h2>Estimating Assistant — Knowledge Base</h2>
        </div>
        <span className="spec-pill-badge dark">GC Interior Remodeling</span>
      </div>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div className="form-group" style={{ minWidth: '220px' }}>
          <label>TRADE</label>
          <input
            type="text"
            className="form-input"
            value={tradeFilter}
            onChange={(e) => setTradeFilter(e.target.value)}
            placeholder="e.g. gc_interior_remodel"
          />
        </div>
        <div className="form-group" style={{ minWidth: '180px' }}>
          <label>STATUS</label>
          <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}
          </select>
        </div>
        {canManage && (
          <button type="button" className="btn-spec-outline" onClick={() => setShowCreateForm((v) => !v)}>
            <Plus size={16} /> {showCreateForm ? 'Cancel' : 'New Entry'}
          </button>
        )}
      </div>

      {showCreateForm && canManage && (
        <form onSubmit={handleCreate} className="form-grid" style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="col-4 form-group">
            <label>TRADE *</label>
            <input type="text" className="form-input" value={createForm.trade}
              onChange={(e) => setCreateForm({ ...createForm, trade: e.target.value })} />
          </div>
          <div className="col-4 form-group">
            <label>CATEGORY / CLUSTER *</label>
            <input type="text" className="form-input" value={createForm.category}
              placeholder="e.g. Structural & Load-Bearing"
              onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })} />
          </div>
          <div className="col-4 form-group">
            <label>SOURCE TYPE *</label>
            <select className="form-select" value={createForm.source_type}
              onChange={(e) => setCreateForm({ ...createForm, source_type: e.target.value })}>
              {SOURCE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-12 form-group">
            <label>TOPIC / QUESTION *</label>
            <input type="text" className="form-input" value={createForm.topic}
              placeholder="e.g. What size header/beam is typically needed to span a given opening?"
              onChange={(e) => setCreateForm({ ...createForm, topic: e.target.value })} />
          </div>
          <div className="col-12 form-group">
            <label>ANSWER *</label>
            <textarea className="form-textarea" rows={4} value={createForm.answer}
              onChange={(e) => setCreateForm({ ...createForm, answer: e.target.value })} />
          </div>
          <div className="col-12 form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
            <input type="checkbox" checked={createForm.jurisdiction_dependent}
              onChange={(e) => setCreateForm({ ...createForm, jurisdiction_dependent: e.target.checked })} />
            <label style={{ margin: 0 }}>Answer varies by jurisdiction</label>
          </div>
          <div className="col-12">
            <button type="submit" className="btn-spec-primary" disabled={creating}>
              {creating ? 'Saving…' : 'Save Entry (submits as pending)'}
            </button>
          </div>
        </form>
      )}

      {loading && <p>Loading entries…</p>}
      {!loading && entries.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No entries match this filter.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {entries.map((entry) => {
          const isPending = entry.status === 'pending';
          return (
            <div key={entry.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '1rem' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                <span className={statusPillClass(entry.status)}>{entry.status}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{entry.trade} · {entry.category} · v{entry.version}</span>
                {entry.jurisdiction_dependent && <span className="pii-tag">Jurisdiction-dependent</span>}
              </div>
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>{entry.topic}</div>

              {isPending && canManage ? (
                <textarea
                  className="form-textarea"
                  rows={3}
                  value={reviewDrafts[entry.id] ?? entry.answer}
                  onChange={(e) => setReviewDrafts((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                />
              ) : (
                <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text-dark)' }}>{entry.answer}</p>
              )}

              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                Source: {entry.source_type}
                {entry.reviewed_at && ` · Reviewed ${new Date(entry.reviewed_at).toLocaleString()}`}
              </div>

              {isPending && canManage && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button type="button" className="btn-spec-primary" disabled={reviewingId === entry.id}
                    onClick={() => handleReview(entry.id, 'approved')}>
                    <Check size={16} /> Approve
                  </button>
                  <button type="button" className="btn-spec-outline" disabled={reviewingId === entry.id}
                    onClick={() => handleReview(entry.id, 'rejected')}>
                    <XIcon size={16} /> Reject
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
