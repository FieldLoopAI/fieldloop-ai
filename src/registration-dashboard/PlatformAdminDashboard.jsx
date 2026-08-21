// Platform Overview — admin-only, cross-contractor view of the whole
// FieldLoop platform. See HANDOFF.md §24/§25. Reuses command-dashboard/
// dashboard.css's sidebar-tab mechanism (the same .page-N .section-N +
// numbered-sidebar-button pattern ContractorCommandDashboard.jsx already
// uses for its 11 sections) rather than inventing a new tab system.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUpDown, Check, LogOut, X } from 'lucide-react';
import { api } from '../shared/services/api';
import '../command-dashboard/dashboard.css';

const Button = ({ children, primary, onClick, disabled, type = 'button' }) => <button type={type} disabled={disabled} onClick={onClick} className={`dash-button ${primary ? 'primary' : ''}`}>{children}</button>;
const Pill = ({ children, tone = 'green' }) => <span className={`pill ${tone}`}>{children}</span>;
// `section` drives visibility (must match the active tab's page-N via
// dashboard.css's .page-N .section-N rule) — no numbered badge shown, since
// several panels legitimately share one tab/section here, unlike
// ContractorCommandDashboard's one-panel-per-numbered-section convention.
const Panel = ({ section, title, actions, children }) => <section className={`dash-panel section-${section}`}><div className="panel-heading"><div className="section-title"><h2>{title}</h2></div><div className="panel-actions">{actions}</div></div>{children}</section>;
const DataTable = ({ headers, children }) => <div className="table-wrap"><table><thead><tr>{headers.map((h) => (typeof h === 'string' ? <th key={h}>{h}</th> : h))}</tr></thead><tbody>{children}</tbody></table></div>;
const KpiCard = ({ label, value, sub, color }) => <article className="kpi"><label>{label}</label><strong className={color || ''}>{value}</strong><small>{sub}</small></article>;

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const shortDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const CONTRACTOR_STATUS_TONE = { active: 'green', pending: 'blue', suspended: 'amber', terminated: 'gray', no_status: 'gray' };

const TABS = ['Overview', 'Contractors', 'Usage', 'Revenue', 'Knowledge Base'];

// ---- Chart color tokens (dataviz skill) ----
// Contractor status is real state, not arbitrary series identity, so it wears
// the fixed status scale (good/warning/critical) rather than the categorical
// theme — active=good, suspended=warning, terminated=critical. 'pending' and
// 'no_status' aren't good/bad, so they stay off the status scale entirely:
// pending takes the categorical slot-1 hue (neutral-informational), no_status
// (a data-quality gap, not a real business state) stays a plain muted gray.
const CONTRACTOR_STATUS_CHART_COLORS = { active: '#0ca30c', suspended: '#fab219', terminated: '#d03b3b', pending: '#2a78d6', no_status: '#c3c2b7' };
const CONTRACTOR_STATUS_LABELS = { active: 'Active', pending: 'Pending', suspended: 'Suspended', terminated: 'Terminated', no_status: 'No status row' };
const CONTRACTOR_STATUS_ORDER = ['active', 'pending', 'suspended', 'terminated', 'no_status'];

// jobs.status has a real lifecycle order (verified live via probe-insert —
// see HANDOFF.md §3/§12), so it's ordinal, not nominal: one hue, monotone
// lightness by stage, per the dataviz skill's ordinal ramp (light-mode floor
// is step 250 — palette.md).
const JOB_LIFECYCLE = ['draft', 'scheduled', 'en_route', 'on_site', 'complete', 'closed', 'invoiced', 'paid'];
const JOB_LIFECYCLE_RAMP = ['#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#184f95', '#0d366b'];
const JOB_STATUS_LABELS = { draft: 'Draft', scheduled: 'Scheduled', en_route: 'En route', on_site: 'On site', complete: 'Complete', closed: 'Closed', invoiced: 'Invoiced', paid: 'Paid' };

// KB trades are nominal (no natural order) with one series (fact count), so
// every bar takes the same categorical slot-1 hue — magnitude is bar length,
// never bar color (coloring nominal bars by value double-encodes and is a
// documented anti-pattern).
const CATEGORICAL_SLOT_1 = '#2a78d6';

function ChartHoverable({ children, tooltip, style, className = '' }) {
  return (
    <div className={`chart-hoverable ${className}`} style={style} tabIndex={0}>
      {children}
      <div className="chart-tooltip">{tooltip}</div>
    </div>
  );
}

// Part-to-whole job → a stacked bar, not a donut (a pie/donut is the wrong
// form here per the dataviz skill's form table; also avoids a 5-slice pie).
function StatusStackedBar({ byStatus }) {
  const present = CONTRACTOR_STATUS_ORDER.filter((k) => byStatus[k] > 0);
  const total = present.reduce((s, k) => s + byStatus[k], 0) || 1;
  if (present.length === 0) return <div className="loading-roster">No contractors yet.</div>;
  return (
    <div>
      <div className="stacked-bar">
        {present.map((k) => (
          <ChartHoverable
            key={k}
            style={{ flexGrow: byStatus[k], flexBasis: 0, minWidth: '3px' }}
            tooltip={<><b>{byStatus[k]} contractor{byStatus[k] === 1 ? '' : 's'}</b><span>{CONTRACTOR_STATUS_LABELS[k]} · {Math.round((byStatus[k] / total) * 100)}%</span></>}
          >
            <div className="stacked-bar-segment" style={{ width: '100%', height: '100%', background: CONTRACTOR_STATUS_CHART_COLORS[k] }} />
          </ChartHoverable>
        ))}
      </div>
      <div className="chart-legend">
        {present.map((k) => (
          <span className="chart-legend-item" key={k}>
            <span className="chart-legend-swatch" style={{ background: CONTRACTOR_STATUS_CHART_COLORS[k] }} />
            {CONTRACTOR_STATUS_LABELS[k]} ({byStatus[k]})
          </span>
        ))}
      </div>
    </div>
  );
}

// Reusable horizontal bar chart — used both for the ordinal job-lifecycle
// chart (colorFor returns a ramp step per stage) and the nominal KB-coverage
// chart (colorFor returns the same slot-1 hue for every bar).
function HorizontalBarChart({ items, colorFor, formatValue }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="hbar-chart">
      {items.map((item) => (
        <div className="chart-hoverable hbar-row" tabIndex={0} key={item.key}>
          <span className="hbar-label">{item.label}</span>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: item.value === 0 ? 0 : `${Math.max(2, (item.value / max) * 100)}%`, background: colorFor(item) }} />
          </div>
          <span className="hbar-value">{formatValue ? formatValue(item.value) : item.value}</span>
          <div className="chart-tooltip"><b>{formatValue ? formatValue(item.value) : item.value}</b><span>{item.label}</span></div>
        </div>
      ))}
    </div>
  );
}

function SkeletonKpiRow() {
  return <div className="skeleton-kpi-row">{[1, 2, 3, 4, 5].map((i) => <div className="skeleton skeleton-kpi" key={i} />)}</div>;
}
function SkeletonLines({ count = 4 }) {
  return <div className="skeleton-lines">{Array.from({ length: count }, (_, i) => <div className="skeleton skeleton-line" key={i} />)}</div>;
}

// Sortable column header — clicking toggles asc/desc/off. Kept local since
// there's only one sortable table on this page today.
function SortableHeader({ label, sortKey, sort, setSort }) {
  const active = sort.key === sortKey;
  return (
    <th
      onClick={() => setSort((s) => ({ key: sortKey, dir: s.key === sortKey && s.dir === 'asc' ? 'desc' : 'asc' }))}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      {label} <ArrowUpDown size={11} style={{ verticalAlign: 'middle', opacity: active ? 1 : 0.35 }} />
    </th>
  );
}

function sortRows(rows, sort) {
  if (!sort.key) return rows;
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[sort.key] ?? '';
    const bv = b[sort.key] ?? '';
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

export default function PlatformAdminDashboard({ staffUser, onLogout }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(1);
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState(null);
  const [contractors, setContractors] = useState(null);
  const [contractorsLoading, setContractorsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'legal_name', dir: 'asc' });
  const [submissions, setSubmissions] = useState(null);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [toast, setToast] = useState('');

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  const loadOverview = useCallback(() => {
    setOverviewLoading(true);
    api.getPlatformOverview().then(setOverview).catch((err) => setOverviewError(err.message)).finally(() => setOverviewLoading(false));
  }, []);
  const loadContractors = useCallback(() => {
    setContractorsLoading(true);
    api.listPlatformContractors().then(setContractors).catch(() => {}).finally(() => setContractorsLoading(false));
  }, []);
  const loadSubmissions = useCallback(() => {
    setSubmissionsLoading(true);
    api.listKbSubmissionsAdmin('pending').then(setSubmissions).catch(() => {}).finally(() => setSubmissionsLoading(false));
  }, []);

  useEffect(() => { loadOverview(); loadContractors(); loadSubmissions(); }, [loadOverview, loadContractors, loadSubmissions]);

  const review = async (entryId, action) => {
    try {
      await api.reviewKbSubmission(entryId, action);
      flash(action === 'approve' ? 'Approved.' : 'Rejected.');
      loadSubmissions();
      loadOverview();
    } catch (err) {
      flash(err.message || 'Review failed.');
    }
  };

  const filteredContractors = sortRows(
    (contractors ?? []).filter((c) =>
      !search || [c.legal_name, c.contractor_id_public, c.primary_trade].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase())
    ),
    sort
  );
  const mostActiveContractors = sortRows(contractors ?? [], { key: 'job_count', dir: 'desc' }).slice(0, 10);

  const alerts = overview ? [
    overview.contractors.by_status.no_status > 0 && { tab: 2, tone: 'amber', text: `${overview.contractors.by_status.no_status} contractor${overview.contractors.by_status.no_status === 1 ? '' : 's'} missing a status row` },
    overview.compliance_expiring.length > 0 && { tab: 2, tone: 'amber', text: `${overview.compliance_expiring.length} license/insurance item${overview.compliance_expiring.length === 1 ? '' : 's'} expiring soon` },
    (submissions?.length ?? 0) > 0 && { tab: 5, tone: 'amber', text: `${submissions.length} Knowledge Base submission${submissions.length === 1 ? '' : 's'} awaiting review` },
  ].filter(Boolean) : [];

  return (
    <div className={`dashboard-shell page-${activeTab}`}>
      <header className="dashboard-topbar">
        <div className="logo">FIELDLOOP</div>
        <span className="divider" />
        <strong>Platform Overview</strong>
        <nav>Cross-contractor · not scoped to one tenant</nav>
        <span className="top-user" style={{ marginLeft: 'auto' }}>{staffUser.email} · {staffUser.role}</span>
        <Link to="/staff/registration"><Button><ArrowLeft size={15} /> Registration Dashboard</Button></Link>
        <Button onClick={onLogout}><LogOut size={15} /> Logout</Button>
      </header>
      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <span className="sidebar-label">PLATFORM OVERVIEW</span>
          {TABS.map((tab, i) => (
            <button key={tab} className={activeTab === i + 1 ? 'active' : ''} onClick={() => setActiveTab(i + 1)}>
              <b>{i + 1}</b>{tab}
            </button>
          ))}
        </aside>
        <main className="dashboard-main">
          {toast && <div className="toast"><Check size={17} />{toast}</div>}
          {overviewError && <div className="tech-error-banner">{overviewError}</div>}

          {/* ---- Tab 1: Overview ---- */}
          {overviewLoading ? <><SkeletonKpiRow /><div className="dash-panel section-1"><SkeletonLines count={3} /></div></> : overview && (
            <>
              <div className="kpi-grid">
                <KpiCard label="TOTAL CONTRACTORS" value={overview.contractors.total} sub={`${overview.contractors.by_status.active} active · ${overview.contractors.by_status.pending} pending`} color="green" />
                <KpiCard label="SUSPENDED / TERMINATED" value={overview.contractors.by_status.suspended + overview.contractors.by_status.terminated} sub={`${overview.contractors.by_status.no_status} missing a status row`} color={overview.contractors.by_status.no_status > 0 ? 'amber' : undefined} />
                <KpiCard label="ACTIVE TECHNICIANS" value={overview.technicians.active} sub={`${overview.technicians.total} total across all contractors`} />
                <KpiCard label="JOBS (ALL TIME)" value={overview.jobs.total} sub={Object.entries(overview.jobs.by_status).map(([s, n]) => `${n} ${s}`).join(' · ') || 'none yet'} />
                <KpiCard label="REVENUE COLLECTED" value={money(overview.revenue.collected_total)} sub={overview.revenue.paid_count === 0 ? 'No billing activity yet' : `${overview.revenue.paid_count} paid invoices`} color={overview.revenue.collected_total > 0 ? 'green' : undefined} />
              </div>

              <Panel section="1" title="Contractor status">
                <StatusStackedBar byStatus={overview.contractors.by_status} />
              </Panel>

              <Panel section="1" title="Needs attention">
                {alerts.length === 0 ? <div className="loading-roster">Nothing flagged right now.</div> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {alerts.map((a, i) => (
                      <button key={i} onClick={() => setActiveTab(a.tab)} className="dash-button" style={{ justifyContent: 'space-between', textAlign: 'left' }}>
                        <span><Pill tone={a.tone}>⚠</Pill> {a.text}</span>
                        <span className="muted">View →</span>
                      </button>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel section="1" title="Knowledge Base content coverage">
                <DataTable headers={['TRADE', 'APPROVED FACTS']}>
                  {overview.kb.trade_content_coverage.map((t) => (
                    <tr key={t.slug}><td>{t.name}</td><td>{t.approved_facts === 0 ? <span className="muted">No content yet</span> : t.approved_facts}</td></tr>
                  ))}
                </DataTable>
              </Panel>

              <Panel section="1" title="Platform health">
                <p className="muted" style={{ fontSize: '12px' }}>
                  No in-app error monitoring exists yet — check CloudWatch Logs Insights directly against the <code>/aws/lambda/fieldloop-*</code> log groups
                  (account 847814614574, us-east-1) for errors across every Lambda. Login-frequency and feature-usage analytics aren't instrumented yet either
                  (HANDOFF.md §24) — the columns exist on <code>fl_users</code>/<code>contractor_users</code> but nothing writes to them.
                </p>
              </Panel>
            </>
          )}

          {/* ---- Tab 2: Contractors ---- */}
          <Panel section="2" title="Contractor roster">
            <div className="search" style={{ marginBottom: '14px' }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, ID, or trade" />
            </div>
            {contractorsLoading ? <SkeletonLines count={6} /> : filteredContractors.length === 0 ? (
              <div className="loading-roster">No contractors match "{search}".</div>
            ) : (
              <DataTable headers={[
                <SortableHeader key="n" label="CONTRACTOR" sortKey="legal_name" sort={sort} setSort={setSort} />,
                'ID',
                <SortableHeader key="s" label="STATUS" sortKey="status" sort={sort} setSort={setSort} />,
                'TRADE',
                <SortableHeader key="j" label="JOBS" sortKey="job_count" sort={sort} setSort={setSort} />,
                <SortableHeader key="t" label="ACTIVE TECHS" sortKey="active_technician_count" sort={sort} setSort={setSort} />,
                <SortableHeader key="o" label="ONBOARDED" sortKey="onboarded_at" sort={sort} setSort={setSort} />,
              ]}>
                {filteredContractors.map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/staff/platform/contractors/${c.id}`)} style={{ cursor: 'pointer' }} className="clickable-row">
                    <td><b>{c.legal_name}</b></td>
                    <td>{c.contractor_id_public || '—'}</td>
                    <td><Pill tone={CONTRACTOR_STATUS_TONE[c.status || 'no_status']}>{c.status || 'no status'}</Pill></td>
                    <td>{c.primary_trade || '—'}</td>
                    <td>{c.job_count}</td>
                    <td>{c.active_technician_count}</td>
                    <td>{shortDate(c.onboarded_at)}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Panel>

          {overview && overview.contractors.by_status.no_status > 0 && (
            <Panel section="2" title="Data health — missing status" actions={<Pill tone="amber">{overview.contractors.by_status.no_status}</Pill>}>
              <p className="muted" style={{ fontSize: '12px', marginBottom: '10px' }}>These contractors have no contractor_system_meta row at all — a known bug pattern (HANDOFF.md §3) where an early insert can silently fail. Not visible in the normal registration flow.</p>
              <DataTable headers={['CONTRACTOR']}>
                {overview.contractors.missing_status.map((c) => <tr key={c.id} onClick={() => navigate(`/staff/platform/contractors/${c.id}`)} style={{ cursor: 'pointer' }} className="clickable-row"><td>{c.legal_name}</td></tr>)}
              </DataTable>
            </Panel>
          )}

          {overview && overview.compliance_expiring.length > 0 && (
            <Panel section="2" title="Compliance expiring soon" actions={<Pill tone="amber">{overview.compliance_expiring.length} flagged</Pill>}>
              <DataTable headers={['CONTRACTOR', 'TYPE', 'EXPIRES', 'STATUS']}>
                {overview.compliance_expiring.map((e, i) => (
                  <tr key={i} onClick={() => navigate(`/staff/platform/contractors/${e.contractor_id}`)} style={{ cursor: 'pointer' }} className="clickable-row">
                    <td>{e.legal_name}</td>
                    <td>{e.type === 'license' ? 'License' : 'General Liability'}</td>
                    <td>{shortDate(e.expires_on)}</td>
                    <td><Pill tone={e.status === 'expired' ? 'gray' : 'amber'}>{e.status === 'expired' ? `Expired ${Math.abs(e.days_until)}d ago` : `${e.days_until}d left`}</Pill></td>
                  </tr>
                ))}
              </DataTable>
            </Panel>
          )}

          {/* ---- Tab 3: Usage ---- */}
          {overviewLoading ? <div className="dash-panel section-3"><SkeletonLines count={5} /></div> : overview && (
            <>
              <Panel section="3" title="Jobs by status (all contractors)" actions={<span className="muted">Ordered by real lifecycle stage</span>}>
                <HorizontalBarChart
                  items={JOB_LIFECYCLE.map((s) => ({ key: s, label: JOB_STATUS_LABELS[s], value: overview.jobs.by_status[s] || 0 }))}
                  colorFor={(item) => JOB_LIFECYCLE_RAMP[JOB_LIFECYCLE.indexOf(item.key)]}
                />
                <DataTable headers={['STATUS', 'COUNT']}>
                  {Object.entries(overview.jobs.by_status).map(([s, n]) => <tr key={s}><td>{s}</td><td>{n}</td></tr>)}
                </DataTable>
              </Panel>
              <Panel section="3" title="Most active contractors (by job count)">
                {contractorsLoading ? <SkeletonLines count={4} /> : (
                  <DataTable headers={['CONTRACTOR', 'JOBS', 'ACTIVE TECHS']}>
                    {mostActiveContractors.map((c) => (
                      <tr key={c.id} onClick={() => navigate(`/staff/platform/contractors/${c.id}`)} style={{ cursor: 'pointer' }} className="clickable-row">
                        <td><b>{c.legal_name}</b></td><td>{c.job_count}</td><td>{c.active_technician_count}</td>
                      </tr>
                    ))}
                  </DataTable>
                )}
              </Panel>
            </>
          )}

          {/* ---- Tab 4: Revenue ---- */}
          {overview && (
            <Panel section="4" title="Revenue detail" actions={<span className="muted">Platform fee: 1.95% (flat, per contractor_financials)</span>}>
              <DataTable headers={['METRIC', 'VALUE']}>
                <tr><td>Collected (paid invoices)</td><td><b>{money(overview.revenue.collected_total)}</b> ({overview.revenue.paid_count})</td></tr>
                <tr><td>Platform fee collected</td><td>{money(overview.revenue.collected_platform_fee)}</td></tr>
                <tr><td>Invoiced, awaiting payment</td><td>{money(overview.revenue.invoiced_unpaid_total)} ({overview.revenue.sent_unpaid_count})</td></tr>
                <tr><td>Draft invoices (not yet sent)</td><td>{overview.revenue.draft_count}</td></tr>
              </DataTable>
              {overview.revenue.collected_total === 0 && <p className="muted" style={{ marginTop: '10px', fontSize: '12px' }}>No real invoicing has happened on the platform yet — this becomes real the moment the technician mobile app starts compiling and collecting on real invoices (HANDOFF.md §23).</p>}
            </Panel>
          )}

          {/* ---- Tab 5: Knowledge Base ---- */}
          {overview && (
            <Panel section="5" title="Knowledge Base content coverage">
              <HorizontalBarChart
                items={overview.kb.trade_content_coverage.map((t) => ({ key: t.slug, label: t.name, value: t.approved_facts }))}
                colorFor={() => CATEGORICAL_SLOT_1}
              />
              <DataTable headers={['TRADE', 'APPROVED FACTS']}>
                {overview.kb.trade_content_coverage.map((t) => (
                  <tr key={t.slug}><td>{t.name}</td><td>{t.approved_facts === 0 ? <span className="muted">No content yet</span> : t.approved_facts}</td></tr>
                ))}
              </DataTable>
            </Panel>
          )}
          <Panel section="5" title="Pending contractor submissions" actions={<Pill tone="amber">{submissions?.length ?? 0} pending</Pill>}>
            {submissionsLoading ? <SkeletonLines count={3} /> : !submissions || submissions.length === 0 ? <div className="loading-roster">Nothing pending review.</div> : (
              <DataTable headers={['FACT', 'TRADE / CATEGORY', 'SUBMITTED BY', 'SUBMITTED', 'ACTIONS']}>
                {submissions.map((s) => (
                  <tr key={s.id}>
                    <td><b>{s.fact_title}</b><br /><small className="muted">{s.fact}</small></td>
                    <td>{s.kb_trades?.name || '—'} / {s.kb_categories?.name || '—'}</td>
                    <td>{s.submitter?.legal_name || 'Unknown'}</td>
                    <td>{new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                    <td>
                      <Button onClick={() => review(s.id, 'reject')}><X size={13} /> Reject</Button>{' '}
                      <Button primary onClick={() => review(s.id, 'approve')}><Check size={13} /> Approve</Button>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Panel>
        </main>
      </div>
    </div>
  );
}
