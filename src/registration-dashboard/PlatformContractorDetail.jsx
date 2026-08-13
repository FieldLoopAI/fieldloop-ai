// Contractor drill-down for the Platform Overview (HANDOFF.md §25) — a real
// route (/staff/platform/contractors/:id), not a modal: this much data
// (profile + compliance + financials + audit log + operational usage)
// deserves a full page, matching this codebase's existing convention of
// full-page record views (the Registration Dashboard itself) rather than
// modals for anything beyond a quick action.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../shared/services/api';
import '../command-dashboard/dashboard.css';

const Pill = ({ children, tone = 'green' }) => <span className={`pill ${tone}`}>{children}</span>;
const Panel = ({ title, actions, children }) => <section className="dash-panel section-1"><div className="panel-heading"><div className="section-title"><h2>{title}</h2></div><div className="panel-actions">{actions}</div></div>{children}</section>;
const DataTable = ({ headers, children }) => <div className="table-wrap"><table><thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
const Field = ({ label, value }) => <div><label style={{ display: 'block', fontSize: '10px', letterSpacing: '.08em', color: '#64748b', fontWeight: 700 }}>{label}</label><span>{value ?? <span className="muted">—</span>}</span></div>;

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const shortDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const shortDateTime = (d) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

const STATUS_TONE = { active: 'green', pending: 'blue', suspended: 'amber', terminated: 'gray' };
const KB_STATUS_TONE = { pending: 'amber', approved: 'green', rejected: 'gray', superseded: 'gray' };

export default function PlatformContractorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([api.getContractor(id), api.getPlatformContractorUsage(id)])
      .then(([contractorRes, usageRes]) => { setRecord(contractorRes); setUsage(usageRes); })
      .catch((err) => setError(err.message || 'Failed to load contractor.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="dashboard-shell page-1"><main className="dashboard-main"><div className="loading-roster">Loading contractor…</div></main></div>;
  if (error || !record) {
    return (
      <div className="dashboard-shell page-1">
        <main className="dashboard-main">
          <div className="tech-error-banner">{error || 'Not found.'}</div>
          <button className="dash-button" onClick={() => navigate('/staff/platform')}><ArrowLeft size={15} /> Back to Platform Overview</button>
        </main>
      </div>
    );
  }

  const { contractor, compliance, operations, financials, meta, auditLog } = record;
  const { jobs, technicians, invoices, estimates, kb_submissions: kbSubmissions } = usage;

  return (
    <div className="dashboard-shell page-1">
      <header className="dashboard-topbar">
        <div className="logo">FIELDLOOP</div>
        <span className="divider" />
        <strong>{contractor.legal_name}</strong>
        <nav>{contractor.contractor_id_public || 'Contractor detail'}</nav>
        <Link to="/staff/platform" style={{ marginLeft: 'auto' }}><button className="dash-button"><ArrowLeft size={15} /> Platform Overview</button></Link>
      </header>
      <main className="dashboard-main">
        <div className="kpi-grid">
          <article className="kpi"><label>STATUS</label><strong><Pill tone={STATUS_TONE[meta?.status] || 'gray'}>{meta?.status || 'no status'}</Pill></strong><small>{meta?.onboarded_by_name ? `Onboarded by ${meta.onboarded_by_name}` : ''}</small></article>
          <article className="kpi"><label>TRADE</label><strong style={{ fontSize: '18px' }}>{operations?.primary_trade || '—'}</strong><small>{operations?.service_radius_miles ? `${operations.service_radius_miles} mi radius` : ''}</small></article>
          <article className="kpi"><label>TECHNICIANS</label><strong className="green">{technicians.filter((t) => t.is_active).length}</strong><small>{technicians.length} total</small></article>
          <article className="kpi"><label>JOBS</label><strong>{jobs.length}</strong><small>{jobs.filter((j) => j.status === 'on_site').length} on site now</small></article>
          <article className="kpi"><label>REVENUE COLLECTED</label><strong className={invoices.some((i) => i.paid_ts) ? 'green' : ''}>{money(invoices.filter((i) => i.paid_ts).reduce((s, i) => s + Number(i.total || 0), 0))}</strong><small>{invoices.length} invoice{invoices.length === 1 ? '' : 's'} total</small></article>
        </div>

        <Panel title="Profile">
          <div className="tech-form-grid">
            <Field label="Legal name" value={contractor.legal_name} />
            <Field label="DBA" value={contractor.dba_name} />
            <Field label="Business structure" value={contractor.business_structure} />
            <Field label="Year established" value={contractor.year_established} />
            <Field label="Website" value={contractor.website} />
            <Field label="Business phone" value={contractor.business_phone} />
            <Field label="Business email" value={contractor.business_email} />
            <Field label="Address" value={[contractor.physical_street, contractor.physical_city, contractor.physical_state, contractor.physical_zip].filter(Boolean).join(', ')} />
          </div>
        </Panel>

        <Panel title="Compliance">
          <div className="tech-form-grid">
            <Field label="License #" value={compliance?.primary_license_number} />
            <Field label="License expires" value={shortDate(compliance?.license_expiration_date)} />
            <Field label="GL insurance provider" value={compliance?.gl_insurance_provider} />
            <Field label="GL expires" value={shortDate(compliance?.gl_expiration)} />
            <Field label="Bonded" value={compliance?.is_bonded ? 'Yes' : 'No'} />
            <Field label="W-9 on file" value={compliance?.w9_on_file ? 'Yes' : 'No'} />
          </div>
        </Panel>

        <Panel title="Financials">
          <div className="tech-form-grid">
            <Field label="Payout bank" value={financials?.payout_bank_name} />
            <Field label="Account type" value={financials?.account_type} />
            <Field label="Platform fee rate" value={financials?.platform_fee_rate != null ? `${(financials.platform_fee_rate * 100).toFixed(2)}%` : null} />
            <Field label="Stripe Connect model" value={financials?.stripe_connect_model} />
            <Field label="ACH authorization signed" value={financials?.ach_authorization_signed ? 'Yes' : 'No'} />
          </div>
        </Panel>

        <Panel title="Technicians" actions={<span className="muted">{technicians.length} total</span>}>
          {technicians.length === 0 ? <div className="loading-roster">No technicians added yet.</div> : (
            <DataTable headers={['NAME', 'ROLE', 'PHONE', 'STATUS', 'ADDED']}>
              {technicians.map((t) => (
                <tr key={t.id}>
                  <td><b>{t.full_name}</b></td>
                  <td>{t.role || '—'}</td>
                  <td>{t.mobile_phone}</td>
                  <td><Pill tone={t.is_active ? 'green' : 'gray'}>{t.is_active ? 'active' : 'deactivated'}</Pill></td>
                  <td>{shortDate(t.created_at)}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </Panel>

        <Panel title="Jobs" actions={<span className="muted">Most recent 100</span>}>
          {jobs.length === 0 ? <div className="loading-roster">No jobs created yet.</div> : (
            <DataTable headers={['JOB', 'CUSTOMER', 'STATUS', 'SCHEDULED', 'CREATED']}>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td><b>{j.job_id_public}</b> · {j.trade_category || j.job_type}</td>
                  <td>{j.customers?.household_name || '—'}</td>
                  <td><Pill tone="blue">{j.status}</Pill></td>
                  <td>{shortDateTime(j.scheduled_start)}</td>
                  <td>{shortDate(j.created_at)}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </Panel>

        <Panel title="Invoices & estimates">
          {invoices.length === 0 && estimates.length === 0 ? <div className="loading-roster">No invoices or estimates yet.</div> : (
            <>
              {invoices.length > 0 && (
                <DataTable headers={['INVOICE #', 'AMOUNT', 'PLATFORM FEE', 'STATUS']}>
                  {invoices.map((i) => (
                    <tr key={i.id}><td>{i.invoice_number || '—'}</td><td>{money(i.total)}</td><td>{money(i.platform_fee)}</td><td><Pill tone={i.paid_ts ? 'green' : i.invoice_number ? 'blue' : 'gray'}>{i.paid_ts ? 'paid' : i.invoice_number ? 'invoiced' : 'draft'}</Pill></td></tr>
                  ))}
                </DataTable>
              )}
              {estimates.length > 0 && (
                <DataTable headers={['TYPE', 'GOOD/BETTER/BEST', 'STATUS']}>
                  {estimates.map((e) => (
                    <tr key={e.id}><td>{e.doc_type}</td><td>{[e.tier_good, e.tier_better, e.tier_best].filter((v) => v != null).map(money).join(' / ') || '—'}</td><td><Pill tone={e.status === 'approved' ? 'green' : e.status === 'rejected' ? 'gray' : 'amber'}>{e.status}</Pill></td></tr>
                  ))}
                </DataTable>
              )}
            </>
          )}
        </Panel>

        <Panel title="Knowledge Base submissions">
          {kbSubmissions.length === 0 ? <div className="loading-roster">No KB submissions from this contractor.</div> : (
            <DataTable headers={['FACT', 'TRADE', 'STATUS', 'SUBMITTED']}>
              {kbSubmissions.map((s) => (
                <tr key={s.id}><td>{s.fact_title}</td><td>{s.kb_trades?.name || '—'}</td><td><Pill tone={KB_STATUS_TONE[s.status] || 'gray'}>{s.status}</Pill></td><td>{shortDate(s.created_at)}</td></tr>
              ))}
            </DataTable>
          )}
        </Panel>

        <Panel title="Recent staff activity (access_audit_log)" actions={<span className="muted">Last 8</span>}>
          {auditLog.length === 0 ? <div className="loading-roster">No recorded access yet.</div> : (
            <DataTable headers={['WHEN', 'ACTION', 'FIELD']}>
              {auditLog.map((a) => (
                <tr key={a.id}><td>{shortDateTime(a.timestamp)}</td><td>{a.action}</td><td>{a.field_accessed || '—'}</td></tr>
              ))}
            </DataTable>
          )}
        </Panel>

        {meta?.internal_notes && (
          <Panel title="Internal notes"><p style={{ fontSize: '13px' }}>{meta.internal_notes}</p></Panel>
        )}
      </main>
    </div>
  );
}
