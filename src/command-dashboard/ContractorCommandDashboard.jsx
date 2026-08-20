import { useEffect, useState, useCallback, useRef } from 'react';
import { Activity, Archive, CalendarDays, Check, ChevronRight, Download, FileText, Lock, LogOut, Mic, Plus, Search, Square, Truck, UserPlus } from 'lucide-react';
import { technicians as mockTechnicians } from './dashboardData';
import { api } from '../shared/services/api';
import './dashboard.css';

const initials = name => name.split(' ').map(word => word[0]).join('').slice(0, 2);
// YYYY-MM-DD in the browser's *local* timezone (Date#toISOString is UTC and
// would silently roll over to the wrong calendar day near midnight) — used
// both as the <input type="date"> value and as the key for "is this today".
const localDateString = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const TODAY_STR = localDateString(new Date());
const jobStatusColor = (status) => status === 'on_site' ? 'green' : status === 'en_route' ? 'amber' : ['complete', 'closed', 'invoiced', 'paid'].includes(status) ? 'gray' : 'gray';
// vehicles.current_dtc_codes/oil_life_pct/next_service_mileage are real
// columns but nothing populates them yet — no OBD-II integration exists.
// 'No telemetry connected' is the honest state for a real vehicle with none
// of these set, rather than defaulting to a fabricated 'Healthy'.
const vehicleHealth = (v) => (v.current_dtc_codes && v.current_dtc_codes.length > 0)
  ? { color: 'red', text: `Diagnose — ${v.current_dtc_codes.join(', ')}`, label: 'DIAGNOSE' }
  : (v.oil_life_pct != null && v.oil_life_pct < 20)
  ? { color: 'amber', text: `Oil life low (${v.oil_life_pct}%)`, label: 'SERVICE SOON' }
  : (v.current_dtc_codes == null && v.oil_life_pct == null && v.next_service_mileage == null)
  ? { color: 'gray', text: 'No telemetry connected', label: 'NO TELEMETRY' }
  : { color: 'green', text: 'Healthy', label: 'HEALTHY' };
// Voice capture needs mic access, MediaRecorder, and WebSocket — a stable
// per-session check, never re-evaluated at runtime, so a plain module-level
// constant is fine (no browser gains/loses these mid-session).
const VOICE_CAPTURE_SUPPORTED = typeof window !== 'undefined'
  && Boolean(window.navigator?.mediaDevices?.getUserMedia)
  && typeof window.MediaRecorder !== 'undefined'
  && typeof window.WebSocket !== 'undefined';
const Button = ({ children, primary, onClick, disabled, title, type = 'button' }) => <button type={type} title={title} disabled={disabled} onClick={onClick} className={`dash-button ${primary ? 'primary' : ''}`}>{children}</button>;
const Pill = ({ children, tone = 'green' }) => <span className={`pill ${tone}`}>{children}</span>;
const Status = ({ color = 'green', children }) => <span className="status"><i className={color} />{children}</span>;
const Panel = ({ num, title, actions, children, className = '' }) => <section className={`dash-panel section-${num} ${className}`}><div className="panel-heading"><div className="section-title">{num && <b className="section-number">{num}</b>}<h2>{title}</h2></div><div className="panel-actions">{actions}</div></div>{children}</section>;

// Persists which screen the user is on and any in-progress modal form data
// to sessionStorage, so a browser tab discard/reload — e.g. Chrome/Edge's
// "memory saver" unloading a backgrounded tab, or an OS-level app switch on
// mobile fully destroying and reloading the page — can restore the user
// close to where they were instead of resetting to a blank dashboard. This
// mirrors the pattern already used in RegistrationDashboard.jsx. Deliberately
// never persists secrets: a technician's auto-generated password is only
// ever shown once, post-creation, in `modalNotice`, which is never written
// here — only the *inputs* being typed before submission, none of which are
// sensitive on this dashboard (unlike the registration wizard's SSN/bank
// fields).
const NAV_STORAGE_KEY = 'fieldloop_contractor_nav';
const ADD_TECH_DRAFT_KEY = 'fieldloop_add_tech_draft';
const EDIT_TECH_DRAFT_KEY = 'fieldloop_edit_tech_draft';
const CREATE_JOB_DRAFT_KEY = 'fieldloop_create_job_draft';

function readPersistedNav() {
  try {
    return JSON.parse(sessionStorage.getItem(NAV_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function readDraft(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key));
  } catch {
    return null;
  }
}

function clearAllPersistedDashboardState() {
  sessionStorage.removeItem(NAV_STORAGE_KEY);
  sessionStorage.removeItem(ADD_TECH_DRAFT_KEY);
  sessionStorage.removeItem(EDIT_TECH_DRAFT_KEY);
  sessionStorage.removeItem(CREATE_JOB_DRAFT_KEY);
}

export default function ContractorCommandDashboard({ tenant, onLogout }) {
  const persistedNav = readPersistedNav();
  const [now, setNow] = useState(new Date()); const [activePage, setActivePage] = useState(persistedNav.activePage || 1); const [search, setSearch] = useState(''); const [include, setInclude] = useState(['Job records', 'Customer records', 'Estimates & change orders', 'Invoices & payments', 'Site photos', 'Voice notes / transcripts', 'GPS timelines']); const [toast, setToast] = useState('');
  const [realTechs, setRealTechs] = useState(null);
  const [techLoading, setTechLoading] = useState(false);
  // Reopen a write modal automatically if a draft survived a tab
  // discard/reload — the modal itself restores its field values from the
  // same sessionStorage key on mount (see AddTechnicianModal/CreateJobModal).
  const [showAddTechModal, setShowAddTechModal] = useState(() => Boolean(sessionStorage.getItem(ADD_TECH_DRAFT_KEY)));
  // Holds the technician_id being edited, not the row itself — the row is
  // looked up fresh from displayTechs on every render so the modal always
  // reflects the latest loaded data. Recovered from a surviving draft the
  // same way showAddTechModal is, in case a tab discard/reload hit mid-edit.
  const [editingTechId, setEditingTechId] = useState(() => readDraft(EDIT_TECH_DRAFT_KEY)?.technician_id || null);
  const [deactivatingTech, setDeactivatingTech] = useState(null);
  const [resendingTechId, setResendingTechId] = useState(null);
  const [modalNotice, setModalNotice] = useState(null);
  const [realJobs, setRealJobs] = useState(null);
  const [jobCustomers, setJobCustomers] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState(null);
  const [showCreateJobModal, setShowCreateJobModal] = useState(() => Boolean(sessionStorage.getItem(CREATE_JOB_DRAFT_KEY)));
  const [showVoiceCapture, setShowVoiceCapture] = useState(false);
  // Seed data for the next CreateJobModal open, produced by voice extraction
  // (see VoiceCaptureModal + buildInitialDataFromExtraction). Not persisted
  // to sessionStorage — a tab discard mid-voice-capture just loses the
  // in-progress recording, same as it would lose any other in-progress
  // browser mic session; the contractor re-taps the mic button.
  const [voiceJobSeed, setVoiceJobSeed] = useState(null);
  const [reassignBusyId, setReassignBusyId] = useState(null);
  // Which day the dispatch board is filtered to — `null` means "All jobs"
  // (the default, so nothing is ever hidden by surprise), a `YYYY-MM-DD`
  // string narrows to that one day. See HANDOFF.md §14/§15.
  const [selectedDate, setSelectedDate] = useState(null);
  // Guards against a slower earlier request (e.g. the initial "today" load,
  // still in flight during a Lambda cold start) landing *after* a newer one
  // (the user having since picked a different date) and silently clobbering
  // it with stale data — the same race already found and fixed once in
  // RegistrationDashboard.jsx's loadContractor (see HANDOFF.md §9 Round 2).
  const loadJobsRequestIdRef = useRef(0);
  // Invoices/estimates are lifted here (not local to their panels) so the
  // KPI grid and greeting line can reflect real numbers too, same reason
  // jobs/technicians are lifted rather than fetched inside Panel 1/3.
  const [realInvoices, setRealInvoices] = useState(null);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [realEstimates, setRealEstimates] = useState(null);
  const [estimatesLoading, setEstimatesLoading] = useState(false);
  const [viewingJobFileId, setViewingJobFileId] = useState(null);
  const [realVehicles, setRealVehicles] = useState(null);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState(null);
  const [realCustomers, setRealCustomers] = useState(null);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState(null);
  // Reports (Panel 8) needs the *complete* job set regardless of whatever
  // date filter Panel 1's dispatch board currently has selected — fetched
  // independently rather than reusing realJobs, which is date-scoped.
  const [reportJobs, setReportJobs] = useState(null);
  const [reportJobsLoading, setReportJobsLoading] = useState(false);
  const [retentionQueue, setRetentionQueue] = useState(null);
  const [retentionLoading, setRetentionLoading] = useState(false);
  const [retentionBusyId, setRetentionBusyId] = useState(null);
  const [realTeam, setRealTeam] = useState(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [auditLog, setAuditLog] = useState(null);
  const [auditLogLoading, setAuditLogLoading] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [exportRequests, setExportRequests] = useState(null);
  const [exportRequestsLoading, setExportRequestsLoading] = useState(false);
  const [exportSubmitting, setExportSubmitting] = useState(false);
  // Panel 6's real live feed — every en_route/on_site job with its own
  // recent field_events, grouped server-side (list-live-feed). Polled while
  // this panel is active; see the interval effect below.
  const [liveFeed, setLiveFeed] = useState(null);
  const [liveFeedLoading, setLiveFeedLoading] = useState(false);
  const [liveFeedError, setLiveFeedError] = useState(null);
  const [exportType, setExportType] = useState('full');
  const [exportFormat, setExportFormat] = useState('zip');

  // Keep sessionStorage in sync with which screen is active so a tab
  // discard/reload restores it instead of resetting to Section 1.
  useEffect(() => {
    sessionStorage.setItem(NAV_STORAGE_KEY, JSON.stringify({ activePage }));
  }, [activePage]);

  const loadTechs = useCallback(async () => {
    setTechLoading(true);
    try {
      const list = await api.listTechnicians();
      setRealTechs(list);
    } catch (err) {
      console.warn('Failed to load live technicians:', err.message);
    } finally {
      setTechLoading(false);
    }
  }, []);

  const resendSetupLink = async (tech) => {
    setResendingTechId(tech.id);
    try {
      const res = await api.resendTechnicianSetup(tech.id);
      if (res.credential_delivery?.delivered) {
        flash(`Setup link resent to ${tech.full_name || tech.name}.`);
      } else if (res.credential_delivery?.setup_link) {
        setModalNotice({
          name: tech.full_name || tech.name,
          login: tech.mobile_phone || tech.phone,
          link: res.credential_delivery.setup_link,
          warning: res.credential_delivery.warning,
        });
      }
    } catch (err) {
      flash(err.message || 'Failed to resend setup link.');
    } finally {
      setResendingTechId(null);
    }
  };

  const loadJobs = useCallback(async (dateStr) => {
    const requestId = ++loadJobsRequestIdRef.current;
    setJobsLoading(true);
    setJobsError(null);
    try {
      // dateStr === null means "All jobs" — list-jobs only applies a date
      // filter when both from/to are present, so omitting them entirely
      // returns everything, no backend change needed for that mode.
      let range = {};
      if (dateStr) {
        // Parse the YYYY-MM-DD as local midnight (new Date('YYYY-MM-DD')
        // would parse as UTC midnight instead, landing on the wrong local day).
        const [y, m, d] = dateStr.split('-').map(Number);
        const start = new Date(y, m - 1, d);
        const end = new Date(y, m - 1, d + 1);
        range = { from: start.toISOString(), to: end.toISOString() };
      }
      const res = await api.listJobs(range);
      if (loadJobsRequestIdRef.current !== requestId) return; // superseded by a newer date change
      setRealJobs(res.jobs);
      setJobCustomers(res.customers || []);
    } catch (err) {
      if (loadJobsRequestIdRef.current !== requestId) return;
      setJobsError(err.message || 'Failed to load the dispatch board.');
    } finally {
      // No early return here (unsafe-finally) — just skip the state update
      // for a superseded request instead of unconditionally clearing it.
      if (loadJobsRequestIdRef.current === requestId) setJobsLoading(false);
    }
  }, []);

  const loadInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try {
      const list = await api.listInvoices();
      setRealInvoices(list);
    } catch (err) {
      console.warn('Failed to load live invoices:', err.message);
    } finally {
      setInvoicesLoading(false);
    }
  }, []);

  const loadEstimates = useCallback(async () => {
    setEstimatesLoading(true);
    try {
      const list = await api.listEstimates();
      setRealEstimates(list);
    } catch (err) {
      console.warn('Failed to load live estimates:', err.message);
    } finally {
      setEstimatesLoading(false);
    }
  }, []);

  const loadVehicles = useCallback(async () => {
    setVehiclesLoading(true);
    try {
      const list = await api.listVehicles();
      setRealVehicles(list);
    } catch (err) {
      console.warn('Failed to load live vehicles:', err.message);
    } finally {
      setVehiclesLoading(false);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true);
    try {
      const list = await api.listCustomers();
      setRealCustomers(list);
    } catch (err) {
      console.warn('Failed to load live customers:', err.message);
    } finally {
      setCustomersLoading(false);
    }
  }, []);

  const loadReportJobs = useCallback(async () => {
    setReportJobsLoading(true);
    try {
      const res = await api.listJobs({});
      setReportJobs(res.jobs);
    } catch (err) {
      console.warn('Failed to load report data:', err.message);
    } finally {
      setReportJobsLoading(false);
    }
  }, []);

  const loadRetentionQueue = useCallback(async () => {
    setRetentionLoading(true);
    try {
      const list = await api.listRetentionQueue();
      setRetentionQueue(list);
    } catch (err) {
      console.warn('Failed to load retention queue:', err.message);
    } finally {
      setRetentionLoading(false);
    }
  }, []);

  const loadTeam = useCallback(async () => {
    setTeamLoading(true);
    try {
      const list = await api.listTeam();
      setRealTeam(list);
    } catch (err) {
      console.warn('Failed to load team:', err.message);
    } finally {
      setTeamLoading(false);
    }
  }, []);

  const loadAuditLog = useCallback(async () => {
    setAuditLogLoading(true);
    try {
      const list = await api.listAuditLog();
      setAuditLog(list);
    } catch (err) {
      console.warn('Failed to load audit log:', err.message);
    } finally {
      setAuditLogLoading(false);
    }
  }, []);

  const loadExportRequests = useCallback(async () => {
    setExportRequestsLoading(true);
    try {
      const list = await api.listExportRequests();
      setExportRequests(list);
    } catch (err) {
      console.warn('Failed to load export requests:', err.message);
    } finally {
      setExportRequestsLoading(false);
    }
  }, []);

  const loadLiveFeed = useCallback(async () => {
    setLiveFeedError(null);
    try {
      const jobs = await api.getLiveFeed();
      setLiveFeed(jobs);
    } catch (err) {
      setLiveFeedError(err.message || 'Failed to load the live feed.');
    } finally {
      setLiveFeedLoading(false);
    }
  }, []);

  // Polls only while Panel 6 is actually the active page — no background
  // refresh when the dispatcher isn't looking at it, matching every other
  // panel's "load on activePage" convention rather than a permanent
  // connection. No live/real-time precedent exists anywhere else in this
  // app (confirmed: no postgres_changes/.channel()/WebSocket-to-Supabase
  // usage), so a plain interval is the consistent choice here too.
  useEffect(() => {
    if (activePage !== 6) return;
    setLiveFeedLoading(true);
    loadLiveFeed();
    const id = setInterval(loadLiveFeed, 20000);
    return () => clearInterval(id);
  }, [activePage, loadLiveFeed]);

  useEffect(() => {
    if (activePage === 1) {
      loadJobs(selectedDate);
      loadTechs();
    }
    if (activePage === 3) {
      loadTechs();
    }
    if (activePage === 2) loadEstimates();
    if (activePage === 7) loadInvoices();
    if (activePage === 4) { loadVehicles(); loadTechs(); }
    if (activePage === 5) loadCustomers();
    if (activePage === 8) { loadReportJobs(); loadTechs(); loadVehicles(); loadRetentionQueue(); }
    if (activePage === 9) loadExportRequests();
    if (activePage === 10) loadTeam();
  }, [activePage, selectedDate, loadJobs, loadTechs, loadEstimates, loadInvoices, loadVehicles, loadCustomers, loadReportJobs, loadRetentionQueue, loadTeam, loadExportRequests]);

  // Loaded once on mount (regardless of active page) so the KPI grid and
  // greeting line reflect real numbers from the moment the dashboard opens,
  // not just after the contractor happens to visit Panel 2/7.
  useEffect(() => { loadInvoices(); loadEstimates(); }, [loadInvoices, loadEstimates]);

  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  // Real jobs come back as { customers: {...}, technicians: {...}, status: 'draft'|'scheduled'|... }
  // from list-jobs (a PostgREST FK embed) — adapted here onto the field names
  // the existing mock-era JSX/CSS below already expect, so the markup itself
  // doesn't need to change shape.
  const formatBoardTime = (iso) => !iso ? '— —' : new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const toBoardJob = (row) => {
    const customer = row.customers;
    const technician = row.technicians;
    return {
      id: row.job_id_public || row.id,
      rawId: row.id,
      time: formatBoardTime(row.scheduled_start),
      trade: (row.trade_category || row.job_type || '').toUpperCase(),
      title: `${customer?.household_name || 'Unknown customer'} — ${row.description || row.job_type}`,
      address: row.service_address,
      phone: customer?.primary_phone || '',
      techs: technician ? [technician.full_name] : [],
      techId: row.lead_technician_id || '',
      vehicle: null,
      warning: row.has_conflict ? `Schedule conflict with ${(row.conflict_with || []).join(', ')}` : null,
      estimate: row.total_estimate ? `Est. $${Number(row.total_estimate).toLocaleString()}` : null,
      status: row.status,
      statusColor: jobStatusColor(row.status),
      detail: (row.status || '').replace('_', ' '),
      reassignable: ['draft', 'scheduled'].includes(row.status),
    };
  };
  const activeJobs = (realJobs ?? []).map(toBoardJob);
  const canManageJobs = tenant.role === 'owner_admin';
  // Drives the panel title, KPI label, and empty-state copy consistently
  // across the three view modes: All (default), Today, or a specific day.
  const boardDateLabel = selectedDate === null ? 'All jobs'
    : selectedDate === TODAY_STR ? 'today'
    : new Date(`${selectedDate}T00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const reassignJob = async (rawJobId, technicianId) => {
    if (!technicianId) return;
    setReassignBusyId(rawJobId);
    try {
      await api.assignJob(rawJobId, technicianId);
      flash('Technician reassigned.');
      await loadJobs(selectedDate);
    } catch (err) {
      flash(err.message || 'Failed to reassign technician.');
    } finally {
      setReassignBusyId(null);
    }
  };

  // Real aggregates from realEstimates/realInvoices (lifted state above) —
  // null while still loading, so these default to empty arrays rather than
  // showing a misleading zero mid-fetch.
  // 'signed' = the customer has already e-signed on the technician's mobile
  // app — this is the one point where the estimate is genuinely awaiting
  // the contractor's own decision (approve/reject), matching update-estimate.
  const pendingEstimates = (realEstimates ?? []).filter(e => e.status === 'signed');
  const unpaidInvoices = (realInvoices ?? []).filter(i => i.status === 'invoiced');
  const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + Number(i.total || 0), 0);
  const thisMonthPaid = (realInvoices ?? []).filter(i => i.paid_ts && new Date(i.paid_ts).getMonth() === now.getMonth() && new Date(i.paid_ts).getFullYear() === now.getFullYear());
  const platformFeeMtd = thisMonthPaid.reduce((sum, i) => sum + Number(i.platform_fee || 0), 0);
  const processedMtd = thisMonthPaid.reduce((sum, i) => sum + Number(i.total || 0), 0);
  const money = (n) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const flash = message => { setToast(message); setTimeout(() => setToast(''), 2800); };
  const displayTechs = realTechs !== null ? realTechs : mockTechnicians;

  const kpis = [
    { label: selectedDate === null ? 'ALL JOBS' : selectedDate === TODAY_STR ? "TODAY'S JOBS" : 'JOBS THIS DAY', value: activeJobs.length, sub: `${activeJobs.filter(j => j.status === 'on_site').length} on site · ${activeJobs.filter(j => j.status === 'en_route').length} en route`, color: 'green' },
    // No clock-in/out event exists in the schema (HANDOFF.md §28), so "on
    // clock" can't be computed for real — a real, if less specific, active-
    // roster count instead of a fabricated on-clock split.
    { label: 'ACTIVE TECHNICIANS', value: String(displayTechs.length), sub: `${displayTechs.filter(t => t.password_changed !== false).length} finished setup` },
    { label: 'AWAITING APPROVAL', value: String(pendingEstimates.length), sub: `${pendingEstimates.filter(e => e.doc_type === 'estimate').length} estimates · ${pendingEstimates.filter(e => e.doc_type === 'change_order').length} change orders`, color: 'amber' },
    { label: 'UNPAID INVOICES', value: money(unpaidTotal), sub: `${unpaidInvoices.length} invoice${unpaidInvoices.length === 1 ? '' : 's'} outstanding` },
    { label: 'PLATFORM FEE (MTD)', value: money(platformFeeMtd), sub: `1.95% · ${money(processedMtd)} processed` },
  ];
  const displayVehicles = realVehicles ?? [];
  const displayCustomers = realCustomers ?? [];
  const filteredCustomers = displayCustomers.filter(c => [c.household_name, c.primary_contact_name, c.primary_phone, c.email, c.service_address].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase()));

  const requestExport = async () => {
    setExportSubmitting(true);
    try {
      await api.createExportRequest({ export_type: exportType, output_format: exportFormat, include_categories: include });
      flash('Export request submitted — queued for processing.');
      await loadExportRequests();
    } catch (err) {
      flash(err.message || 'Failed to submit export request.');
    } finally {
      setExportSubmitting(false);
    }
  };

  const toggleRetentionPause = async (row) => {
    setRetentionBusyId(row.customer_id);
    try {
      await api.updateRetentionFlag(row.customer_id, !row.paused);
      await loadRetentionQueue();
    } catch (err) {
      flash(err.message || 'Failed to update retention queue.');
    } finally {
      setRetentionBusyId(null);
    }
  };

  const pages = ['Live dispatch', 'Approvals queue', 'Technicians', 'Fleet & vehicles', 'Customer database', 'Live field data', 'Invoices & payments', 'Reports & analytics', 'Data archive & export', 'Team & access', 'Knowledge Base'];
  // add-technician/list-technicians are owner_admin-only server-side
  // (backend/sql/006_technicians_fix_identity.sql) — hide the write action
  // for other roles instead of letting them hit a 403 on submit.
  const canManageTechnicians = tenant.role === 'owner_admin';
  const editingTech = editingTechId ? displayTechs.find(t => t.id === editingTechId) || null : null;
  const editingVehicle = editingVehicleId ? displayVehicles.find(v => v.id === editingVehicleId) || null : null;
  const editingCustomer = editingCustomerId ? displayCustomers.find(c => c.id === editingCustomerId) || null : null;

  return <div className={`dashboard-shell page-${activePage}`}>
    <header className="dashboard-topbar"><div className="logo">FIELDLOOP</div><span className="divider" /><strong>{tenant.name}</strong><nav>Command Center</nav><Pill><i className="green" /> MFA verified · session 07:42</Pill><span className="top-user">{tenant.user} · {tenant.role}</span><Button onClick={() => { clearAllPersistedDashboardState(); onLogout(); }}><LogOut size={15} /> Logout</Button></header>
    <div className="dashboard-layout"><aside className="dashboard-sidebar"><span className="sidebar-label">COMMAND DASHBOARD</span>{pages.map((page, index) => <button key={page} className={activePage === index + 1 ? 'active' : ''} onClick={() => { setActivePage(index + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><b>{index + 1}</b>{page}</button>)}</aside>
    <main className="dashboard-main">
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
      {modalNotice && <div className="tech-notice-banner" style={{ margin: '0 0 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <strong>⚠ Setup Link for {modalNotice.name}</strong> (login: {modalNotice.login})<br />
          {modalNotice.warning}<br />
          <span style={{ fontSize: '13px', marginTop: '6px', display: 'inline-block' }}>Setup link: <code>{modalNotice.link}</code></span>
        </div>
        <button onClick={() => setModalNotice(null)} style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit', fontWeight: 'bold' }}>✕</button>
      </div>}
      <div className="security-banner"><div className="security-icon"><Lock size={20} /></div><div><label>SIGNED IN AS</label><strong>{tenant.user} · {tenant.role}</strong><small>MFA <em>Verified (TOTP)</em></small></div><div className="security-side"><label>AUTH LEVEL</label><strong>Full read/write · billing</strong><label>IDLE TIMEOUT</label><span>20 minutes</span></div></div>
      <div className="breadcrumb">Command Center <ChevronRight size={14} /> Dashboard</div><div className="greeting"><div><h1>{greeting}, {tenant.user} <Pill>{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Pill></h1><p><b>{activeJobs.length} jobs{selectedDate === null ? ' total' : selectedDate === TODAY_STR ? ' scheduled today' : ` on ${boardDateLabel}`}</b> · <b>{pendingEstimates.length} estimate{pendingEstimates.length === 1 ? '' : 's'} need{pendingEstimates.length === 1 ? 's' : ''} your approval</b> · <b>{money(unpaidTotal)} in unpaid invoices</b></p></div></div>
      <div className="kpi-grid">{kpis.map(k => <article className="kpi" key={k.label}><label>{k.label}</label><strong className={k.color || ''}>{k.value}</strong><small>{k.sub}</small></article>)}</div>
      <Panel num="1" title={`Live dispatch board — ${boardDateLabel}`} actions={<><div className="date-nav"><CalendarDays size={15} /><input type="date" value={selectedDate || ''} onChange={e => setSelectedDate(e.target.value || null)} /></div>{selectedDate !== null && <Button onClick={() => setSelectedDate(null)}>All</Button>}{selectedDate !== TODAY_STR && <Button onClick={() => setSelectedDate(TODAY_STR)}>Today</Button>}{canManageJobs && VOICE_CAPTURE_SUPPORTED && <Button onClick={() => setShowVoiceCapture(true)} title="Schedule a job by speaking the details"><Mic size={15} /> Voice schedule</Button>}{canManageJobs && !VOICE_CAPTURE_SUPPORTED && <Button disabled title="Voice capture needs a Chromium-based browser (Chrome or Edge)"><Mic size={15} /> Voice schedule</Button>}{canManageJobs && <Button primary onClick={() => setShowCreateJobModal(true)}><Plus size={15} /> Schedule new job</Button>}</>}>
        {jobsError && <div className="tech-error-banner">{jobsError}</div>}
        {jobsLoading ? <div className="loading-roster">Loading dispatch board…</div> : activeJobs.length === 0 ? <div className="loading-roster">{selectedDate === null ? 'No jobs found.' : `No jobs scheduled for ${boardDateLabel}.`}</div> : <div className="dispatch">{activeJobs.map(job => <div className="dispatch-row" key={job.id}><div className="time-slot">{job.time.split(' ')[0]}<small>{job.time.split(' ')[1]}</small></div><article className="job-card"><label>{job.id} · {job.trade}</label><h3>{job.title}</h3><p>{job.address} · {job.phone}</p><div className="chips">{job.techs.map(t => <Pill key={t} tone="gray">👤 {t}</Pill>)}{job.vehicle && <Pill tone="gray">🚐 {job.vehicle}</Pill>}{job.warning && <Pill tone="amber">⚠ {job.warning}</Pill>}{job.estimate && <Pill>{job.estimate}</Pill>}</div><div className="job-footer"><div>{job.reassignable ? <select value={job.techId} disabled={reassignBusyId === job.rawId} onChange={e => reassignJob(job.rawId, e.target.value)}><option value="">Reassign tech…</option>{displayTechs.map(t => <option key={t.id || t.name} value={t.id || ''}>{t.full_name || t.name}</option>)}</select> : <Button disabled title="This job has moved past the dispatch stage">Reassign tech</Button>}<Button onClick={() => flash('Vehicle swap is a mock action.')}>Swap vehicle</Button><Button onClick={() => flash('Customer text is queued as a mock action.')}>Text customer</Button><Button onClick={() => setViewingJobFileId(job.rawId)}>View job file</Button></div><Status color={job.statusColor}>{job.detail}</Status></div></article></div>)}</div>}
      </Panel>
      <Panel num="2" title="Approvals queue — needs your decision" actions={<Pill tone="amber">◷ {pendingEstimates.length} pending</Pill>}>
        {estimatesLoading ? <div className="loading-roster">Loading approvals…</div> : (realEstimates ?? []).length === 0 ? <div className="loading-roster">No estimates or change orders yet — these are created and sent by the technician from the field, not from this dashboard.</div> : <>
          {[...(realEstimates ?? [])].sort((a, b) => (a.status === 'signed' ? -1 : 0) - (b.status === 'signed' ? -1 : 0)).map(e => <EstimateCard key={e.id} estimate={e} flash={flash}
            onApprove={async (id) => { await api.updateEstimate(id, { status: 'approved' }); flash('Approved and added to billing.'); await loadEstimates(); }}
            onReject={async (id) => { await api.updateEstimate(id, { status: 'rejected' }); flash('Rejected.'); await loadEstimates(); }}
          />)}
        </>}
      </Panel>
      <Panel num="3" title={`Technicians (${displayTechs.length})`} actions={<><Button onClick={() => flash('Invite link action.')}><UserPlus size={15} /> Send invite link</Button><Button onClick={() => flash('Export roster action.')}>↓ Export roster</Button>{canManageTechnicians && <Button primary onClick={() => setShowAddTechModal(true)}><Plus size={15} /> Add technician</Button>}</>}>
        {techLoading ? <div className="loading-roster">Loading roster from database…</div> : <DataTable headers={['NAME', 'ROLE & SPECIALTY', 'CONTACT', 'CERTIFICATIONS', 'INVITE STATUS', 'ACTIONS']}>{displayTechs.map(t => {
          const name = t.full_name || t.name;
          const roleText = t.role || t.specialty || 'Technician';
          const phoneText = t.mobile_phone || t.phone || '';
          const emailText = t.email || '';
          const certsText = Array.isArray(t.certifications) ? t.certifications.join(', ') : (t.certifications || 'General');
          const statusText = t.invite_status || t.status || 'Active';
          const statusTone = statusText === 'active' || t.color === 'green' ? 'green' : 'amber';
          return <tr key={t.id || t.name}>
            <td><Avatar name={name} /> <b>{name}</b></td>
            <td>{roleText}</td>
            <td>{phoneText}{emailText && <><br /><small style={{ color: '#64748b' }}>{emailText}</small></>}</td>
            <td><Pill>{certsText}</Pill></td>
            <td><Status color={statusTone}>{statusText}</Status></td>
            <td>{canManageTechnicians ? <>
              <Button onClick={() => setEditingTechId(t.id)}>Edit</Button>{' '}
              {t.password_changed !== true && <Button onClick={() => resendSetupLink(t)} disabled={resendingTechId === t.id}>{resendingTechId === t.id ? 'Sending…' : 'Resend setup link'}</Button>}{' '}
              <Button onClick={() => setDeactivatingTech(t)}>Deactivate</Button>
            </> : <span className="muted">—</span>}</td>
          </tr>;
        })}</DataTable>}
      </Panel>
      <Panel num="4" title={`Fleet & vehicles (${displayVehicles.filter(v => v.is_active).length})`} actions={<>{canManageJobs && <Button primary onClick={() => setShowAddVehicleModal(true)}><Plus size={15} /> Add vehicle</Button>}</>}>
        {vehiclesLoading ? <div className="loading-roster">Loading fleet…</div> : displayVehicles.length === 0 ? <div className="loading-roster">No vehicles added yet.</div> : (
          <DataTable headers={['UNIT', 'VEHICLE', 'ASSIGNED DRIVER', 'STATUS', 'HEALTH', 'ACTIONS']}>
            {displayVehicles.map(v => {
              const health = vehicleHealth(v);
              return <tr key={v.id}>
                <td><Truck size={16} /> {v.unit_number}</td>
                <td>{[v.year, v.make, v.model].filter(Boolean).join(' ') || '—'}</td>
                <td>{v.driver_name || '—'}</td>
                <td><Pill tone={v.is_active ? 'green' : 'gray'}>{v.is_active ? 'active' : 'retired'}</Pill></td>
                <td><Status color={health.color}>{health.text}</Status></td>
                <td>{canManageJobs ? <>
                  <Button onClick={() => setEditingVehicleId(v.id)}>Edit</Button>{' '}
                  {v.is_active && <Button onClick={async () => { await api.updateVehicle(v.id, { is_active: false }); flash(`${v.unit_number} retired.`); loadVehicles(); }}>Retire</Button>}
                </> : <span className="muted">—</span>}</td>
              </tr>;
            })}
          </DataTable>
        )}
      </Panel>
      <Panel num="5" title="Customer database" actions={<><div className="search"><Search size={15} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customers" /></div>{canManageJobs && <Button primary onClick={() => setShowAddCustomerModal(true)}><Plus size={15} /> Add customer</Button>}</>}>
        {customersLoading ? <div className="loading-roster">Loading customers…</div> : filteredCustomers.length === 0 ? <div className="loading-roster">{displayCustomers.length === 0 ? 'No customers yet.' : `No customers match "${search}".`}</div> : (
          <DataTable headers={['CUSTOMER', 'PHONE', 'EMAIL', 'ADDRESS', 'JOBS', 'LIFETIME VALUE', 'ACTIONS']}>
            {filteredCustomers.map(c => <tr key={c.id}>
              <td>{c.household_name}</td>
              <td>{c.primary_phone}</td>
              <td>{c.email || '—'}</td>
              <td>{c.service_address}</td>
              <td>{c.job_count}{c.active_job_count > 0 ? ` (${c.active_job_count} active)` : ''}</td>
              <td><b>${Number(c.lifetime_value || 0).toLocaleString()}</b></td>
              <td>{canManageJobs ? <Button onClick={() => setEditingCustomerId(c.id)}>Edit</Button> : <span className="muted">—</span>}</td>
            </tr>)}
          </DataTable>
        )}
      </Panel>
      <Panel num="6" title={liveFeed === null ? 'Live field data stream' : `Live field data stream — ${liveFeed.length} job${liveFeed.length === 1 ? '' : 's'} in progress`} actions={<span className="muted">Auto-refreshes every 20s while this panel is open</span>}>
        {liveFeedError && <div className="tech-error-banner">{liveFeedError}</div>}
        {liveFeedLoading ? <div className="loading-roster">Loading live feed…</div> : !liveFeed || liveFeed.length === 0 ? <div className="loading-roster">No jobs are en route or on site right now.</div> : (
          <div className="live-feed-jobs">
            {liveFeed.map(job => <LiveFeedJobCard key={job.id} job={job} onViewFile={() => setViewingJobFileId(job.id)} />)}
          </div>
        )}
      </Panel>
      <Panel num="7" title="Invoices & payments" actions={<Button>↓ Export CSV</Button>}>
        <Invoices invoices={realInvoices} loading={invoicesLoading} />
        <div className="reconciliation"><b>Reconciliation summary — month to date</b><p><strong>{money(processedMtd)} processed</strong> · {money(platformFeeMtd)} platform fee withheld · <strong>{money(processedMtd - platformFeeMtd)} net</strong> to your account.</p></div>
      </Panel>
      <Panel num="8" title="Reports & analytics" actions={<span className="muted">Technician stats are all-time · Retention queue below is real, computed from real job/customer data</span>}>
        <div className="reports">
          <TechnicianJobReport jobs={reportJobs} technicians={displayTechs} loading={reportJobsLoading} />
          <FleetHealthReport vehicles={displayVehicles} />
        </div>
        <RetentionQueue queue={retentionQueue} loading={retentionLoading} busyId={retentionBusyId} onTogglePause={toggleRetentionPause} />
      </Panel>
      <Panel num="9" title="Data archive & export" actions={<span className="muted">Request tracking is real · file delivery is still being built</span>}>
        <div className="ownership"><Archive size={21} /><div><b>You own your data. FieldLoop retains it for you.</b><p>Every request below is tracked for real. Automatic delivery — watermarked files via a secure 72-hour download link — isn't built yet; a FieldLoop team member can fulfill a request manually in the meantime.</p></div></div>
        <div className="export-form">
          <h3>Request a new data export</h3>
          <div className="form-grid">
            <select value={exportType} onChange={e => setExportType(e.target.value)}>
              <option value="full">All records (full company archive)</option>
              <option value="jobs">Jobs only</option>
              <option value="invoices">Invoices only</option>
              <option value="single_job">Single job</option>
              <option value="media_only">Media only</option>
            </select>
            <select value={exportFormat} onChange={e => setExportFormat(e.target.value)}>
              <option value="zip">ZIP (CSV + PDF + JPEG)</option>
              <option value="csv">CSV-only</option>
              <option value="pdf">PDF-only</option>
            </select>
          </div>
          <div className="include-chips">{['Job records', 'Customer records', 'Estimates & change orders', 'Invoices & payments', 'Site photos', 'Voice notes / transcripts', 'GPS timelines'].map(item => <button key={item} className={include.includes(item) ? 'selected' : ''} onClick={() => setInclude(x => x.includes(item) ? x.filter(y => y !== item) : [...x, item])}>{include.includes(item) ? '✓ ' : ''}{item}</button>)}</div>
          <div className="export-submit"><span>Delivered to {tenant.email} once ready</span><Button primary onClick={requestExport} disabled={exportSubmitting}><Download size={15} /> {exportSubmitting ? 'Submitting…' : 'Request export'}</Button></div>
        </div>
        {exportRequestsLoading ? <div className="loading-roster">Loading export history…</div> : (exportRequests ?? []).length === 0 ? <div className="loading-roster">No export requests yet.</div> : (
          <DataTable headers={['REQUESTED', 'TYPE', 'FORMAT', 'INCLUDES', 'STATUS']}>
            {exportRequests.map(r => <tr key={r.id}>
              <td>{new Date(r.requested_at).toLocaleString('sv-SE').slice(0, 16)}</td>
              <td>{r.export_type.replace('_', ' ')}</td>
              <td>{r.output_format.toUpperCase()}</td>
              <td>{(r.include_categories || []).join(', ') || '—'}</td>
              <td><Pill tone={r.status === 'ready' ? 'green' : r.status === 'failed' || r.status === 'expired' ? 'gray' : 'blue'}>{r.status}</Pill></td>
            </tr>)}
          </DataTable>
        )}
      </Panel>
      <Panel num="10" title="Team & access" actions={<Button onClick={() => { const next = !showAuditLog; setShowAuditLog(next); if (next && auditLog === null) loadAuditLog(); }}><FileText size={15} /> {showAuditLog ? 'Hide' : 'View'} audit log</Button>}>
        <div className="owner-warning">⚠ <div><b>One role today</b><p>contractor_users currently only supports Owner/Admin — a full multi-role team system (dispatcher, bookkeeper, field lead, with real permission gating across the dashboard) is planned but not built yet. See HANDOFF.md §28.</p></div></div>
        {teamLoading ? <div className="loading-roster">Loading team…</div> : (
          <DataTable headers={['TEAM MEMBER', 'ROLE', 'MFA', 'LAST LOGIN']}>
            {(realTeam ?? []).map(t => <tr key={t.id}>
              <td><Avatar name={t.email} /> {t.email}</td>
              <td><Pill tone={t.is_designated_admin ? 'green' : 'blue'}>{t.role}{t.is_designated_admin ? ' · designated admin' : ''}</Pill></td>
              <td><Status color={t.mfa_enabled ? 'green' : 'gray'}>{t.mfa_enabled ? '✓ Enabled' : 'Not enabled'}</Status></td>
              <td>{t.last_login_at ? new Date(t.last_login_at).toLocaleString() : 'Not tracked yet'}</td>
            </tr>)}
          </DataTable>
        )}
        {showAuditLog && <div className="audit-log">
          <h3>Recent account activity</h3>
          <p className="muted" style={{ fontSize: '12px' }}>Logged by FieldLoop for security/compliance — mostly staff-side actions on your account (onboarding, support), not a full team-activity feed.</p>
          {auditLogLoading ? <div className="loading-roster">Loading activity…</div> : (auditLog ?? []).length === 0 ? <div className="loading-roster">No recorded activity yet.</div> : (
            <DataTable headers={['WHEN', 'ACTION', 'DETAIL', 'BY']}>
              {auditLog.map(e => <tr key={e.id}><td>{new Date(e.timestamp).toLocaleString()}</td><td>{e.action}</td><td>{e.field_accessed || '—'}</td><td>{e.actor}</td></tr>)}
            </DataTable>
          )}
        </div>}
      </Panel>
      <Panel num="11" title="Knowledge Base — submit a fact" actions={<span className="muted">Reviewed by FieldLoop before it's searchable</span>}><KnowledgeBaseSubmission flash={flash} /></Panel>
      <footer><Button><Download size={15} /> Export dashboard view</Button><Button>? Contact support</Button><Button primary disabled>✓ All caught up</Button></footer>
    </main></div>
    {showAddTechModal && <AddTechnicianModal onClose={() => setShowAddTechModal(false)} onSuccess={(msg, notice) => { flash(msg); if (notice) setModalNotice(notice); loadTechs(); }} />}
    {editingTech && <EditTechnicianModal technician={editingTech} onClose={() => setEditingTechId(null)} onSuccess={(msg) => { flash(msg); setEditingTechId(null); loadTechs(); }} />}
    {deactivatingTech && <ConfirmModal
      title="Deactivate technician?"
      message={`This will revoke ${deactivatingTech.full_name || deactivatingTech.name}'s mobile app login and unassign them from any upcoming jobs. Completed job history is kept.`}
      confirmLabel="Deactivate"
      onCancel={() => setDeactivatingTech(null)}
      onConfirm={async () => {
        try {
          await api.deactivateTechnician(deactivatingTech.id);
          flash(`${deactivatingTech.full_name || deactivatingTech.name} deactivated.`);
          setDeactivatingTech(null);
          loadTechs();
        } catch (err) {
          flash(err.message || 'Failed to deactivate technician.');
        }
      }}
    />}
    {showVoiceCapture && <VoiceCaptureModal
      onClose={() => setShowVoiceCapture(false)}
      onFillManually={() => { setShowVoiceCapture(false); setShowCreateJobModal(true); }}
      onExtracted={(extracted, flaggedFieldsRaw) => {
        setVoiceJobSeed(buildInitialDataFromExtraction(extracted, flaggedFieldsRaw, jobCustomers));
        setShowVoiceCapture(false);
        setShowCreateJobModal(true);
      }}
    />}
    {showCreateJobModal && <CreateJobModal
      customers={jobCustomers}
      technicians={displayTechs}
      initialData={voiceJobSeed?.initialData}
      flaggedFields={voiceJobSeed?.flaggedFields}
      onClose={() => { setShowCreateJobModal(false); setVoiceJobSeed(null); }}
      onSuccess={(msg) => { flash(msg); loadJobs(selectedDate); setVoiceJobSeed(null); }}
    />}
    {viewingJobFileId && <JobFileModal jobId={viewingJobFileId} onClose={() => setViewingJobFileId(null)} />}
    {showAddVehicleModal && <VehicleModal
      technicians={displayTechs}
      onClose={() => setShowAddVehicleModal(false)}
      onSuccess={(msg) => { flash(msg); setShowAddVehicleModal(false); loadVehicles(); }}
    />}
    {editingVehicle && <VehicleModal
      vehicle={editingVehicle}
      technicians={displayTechs}
      onClose={() => setEditingVehicleId(null)}
      onSuccess={(msg) => { flash(msg); setEditingVehicleId(null); loadVehicles(); }}
    />}
    {showAddCustomerModal && <CustomerModal
      onClose={() => setShowAddCustomerModal(false)}
      onSuccess={(msg) => { flash(msg); setShowAddCustomerModal(false); loadCustomers(); }}
    />}
    {editingCustomer && <CustomerModal
      customer={editingCustomer}
      onClose={() => setEditingCustomerId(null)}
      onSuccess={(msg) => { flash(msg); setEditingCustomerId(null); loadCustomers(); }}
    />}
  </div>;
}

function formatDisplayPhone(val) {
  if (!val) return '';
  if (val.startsWith('+')) {
    const digits = val.replace(/\D/g, '');
    return '+' + digits;
  }
  const digits = val.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function toE164Phone(val) {
  const digits = val.replace(/\D/g, '');
  if (!digits) return '';
  if (val.trim().startsWith('+')) return '+' + digits;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return '+' + digits;
}

// ISO 8601 (from voice-extract) -> the local "YYYY-MM-DDTHH:mm" shape
// <input type="datetime-local"> expects, in the browser's own timezone —
// mirrors the reverse conversion CreateJobModal already does on submit.
function isoToDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function normalizeForMatch(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Resolving "which real customer did they mean" is done here, client-side,
// against the already-loaded customer list — deliberately not left to the
// LLM. Keeps the real customer list out of a third-party prompt entirely,
// and a deterministic match/no-match is easier to reason about than trusting
// an LLM's fuzzy judgement on data it was never shown to begin with.
function findMatchingCustomer(extracted, jobCustomers) {
  if (!extracted) return null;
  const extractedPhone = extracted.primary_phone ? toE164Phone(extracted.primary_phone) : '';
  if (extractedPhone) {
    const phoneMatch = jobCustomers.find(c => c.primary_phone === extractedPhone);
    if (phoneMatch) return phoneMatch;
  }
  const extractedName = normalizeForMatch(extracted.household_name);
  if (extractedName) {
    const nameMatch = jobCustomers.find(c => normalizeForMatch(c.household_name) === extractedName);
    if (nameMatch) return nameMatch;
  }
  return null;
}

// Maps voice-extract's field names onto CreateJobModal's actual formData
// keys, which differ depending on whether a matching customer was found.
const VOICE_FIELD_MAP_NEW = {
  household_name: 'new_household_name',
  primary_contact_name: 'new_primary_contact_name',
  primary_phone: 'new_primary_phone',
  email: 'new_email',
  service_address: 'new_service_address',
  trade_category: 'trade_category',
  description: 'description',
  scheduled_start: 'scheduled_start',
  scheduled_end: 'scheduled_end',
  total_estimate: 'total_estimate',
};
const VOICE_FIELD_MAP_EXISTING = {
  ...VOICE_FIELD_MAP_NEW,
  household_name: 'existing_customer_id',
  primary_contact_name: null,
  primary_phone: 'existing_customer_id',
  email: null,
};

// Turns voice-extract's response into CreateJobModal's `initialData` +
// `flaggedFields` props. Every flagged field name is translated through the
// same map used for the customer-mode fields above, so "please double-check
// this" survives the field-name rename intact instead of silently getting
// dropped.
function buildInitialDataFromExtraction(extracted, flaggedFieldsRaw, jobCustomers) {
  const match = findMatchingCustomer(extracted, jobCustomers);
  const flaggedFields = new Set();
  const initialData = {};

  if (match) {
    initialData.customerMode = 'existing';
    initialData.existing_customer_id = match.id;
    // A guessed match always gets flagged for confirmation, independent of
    // whatever the model itself reported confidence on.
    flaggedFields.add('existing_customer_id');
    initialData.service_address = extracted.service_address || match.service_address || '';
  } else {
    initialData.customerMode = 'new';
    if (extracted.household_name) initialData.new_household_name = extracted.household_name;
    if (extracted.primary_contact_name) initialData.new_primary_contact_name = extracted.primary_contact_name;
    if (extracted.primary_phone) {
      // formatDisplayPhone only re-formats a bare 10-digit run into
      // (XXX) XXX-XXXX — a leading "+1" from the extracted E.164 value would
      // otherwise print as the un-punctuated "+19995551234" instead, same
      // fix already applied to EditTechnicianModal's phone prefill.
      const digitsNoCountry = extracted.primary_phone.replace(/^\+?1/, '');
      initialData.new_primary_phone = formatDisplayPhone(digitsNoCountry);
    }
    if (extracted.email) initialData.new_email = extracted.email;
    if (extracted.service_address) {
      initialData.new_service_address = extracted.service_address;
      initialData.service_address = extracted.service_address;
    }
  }

  if (extracted.job_type) initialData.job_type = extracted.job_type;
  if (extracted.trade_category) initialData.trade_category = extracted.trade_category;
  if (extracted.description) initialData.description = extracted.description;
  if (extracted.scheduled_start) initialData.scheduled_start = isoToDatetimeLocal(extracted.scheduled_start);
  if (extracted.scheduled_end) initialData.scheduled_end = isoToDatetimeLocal(extracted.scheduled_end);
  if (extracted.total_estimate != null) initialData.total_estimate = String(extracted.total_estimate);

  // Only actually flag a field if the model filled in a value for it — seen
  // live against the real model: it sometimes names a field in
  // flagged_fields even when that field came back null (nothing to
  // double-check on a blank input; the amber "please verify" affordance
  // only makes sense once there's a value sitting in the field).
  const fieldMap = match ? VOICE_FIELD_MAP_EXISTING : VOICE_FIELD_MAP_NEW;
  (flaggedFieldsRaw || []).forEach(f => {
    const mapped = fieldMap[f];
    const hasValue = f === 'total_estimate' ? extracted[f] != null : Boolean(extracted[f]);
    if (mapped && hasValue) flaggedFields.add(mapped);
  });

  return { initialData, flaggedFields };
}

function getFieldError(name, value) {
  if (name === 'full_name') {
    if (!value.trim()) return 'Full name is required.';
    if (value.trim().length < 2) return 'Full name must be at least 2 characters.';
  }
  if (name === 'email') {
    if (value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Enter a valid email address (e.g. alex@company.com).';
  }
  if (name === 'mobile_phone') {
    const digits = value.replace(/\D/g, '');
    if (!digits) return 'Mobile phone is required — this is the technician\'s login.';
    if (digits.length < 10) return `Phone number is incomplete (${digits.length}/10 digits required).`;
  }
  if (name === 'hourly_rate') {
    if (value !== '' && (isNaN(value) || parseFloat(value) < 0)) return 'Rate cannot be negative.';
  }
  if (name === 'billable_rate') {
    if (value !== '' && (isNaN(value) || parseFloat(value) < 0)) return 'Rate cannot be negative.';
  }
  return '';
}

const ADD_TECH_DEFAULTS = {
  full_name: '',
  email: '',
  mobile_phone: '',
  role: '',
  certifications: '',
  hourly_rate: '',
  billable_rate: '',
  delivery_channel: 'sms',
};

function AddTechnicianModal({ onClose, onSuccess }) {
  const [formData, setFormData] = useState(() => ({ ...ADD_TECH_DEFAULTS, ...readDraft(ADD_TECH_DRAFT_KEY) }));
  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  // Survive a tab discard/reload mid-fill — see the module-level comment
  // near NAV_STORAGE_KEY. Cleared on explicit close (handleClose) and on
  // successful submission, never left around after either.
  useEffect(() => {
    sessionStorage.setItem(ADD_TECH_DRAFT_KEY, JSON.stringify(formData));
  }, [formData]);

  const handleClose = () => {
    sessionStorage.removeItem(ADD_TECH_DRAFT_KEY);
    onClose();
  };

  const handleBlur = (fieldName) => {
    setTouched(prev => ({ ...prev, [fieldName]: true }));
    const err = getFieldError(fieldName, formData[fieldName]);
    setErrors(prev => ({ ...prev, [fieldName]: err }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let newValue = value;

    if (name === 'mobile_phone') {
      newValue = formatDisplayPhone(value);
    }

    setFormData(prev => ({ ...prev, [name]: newValue }));

    if (touched[name] || newValue.trim() !== '') {
      const err = getFieldError(name, newValue);
      setErrors(prev => ({ ...prev, [name]: err }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    const allFields = ['full_name', 'email', 'mobile_phone', 'hourly_rate', 'billable_rate'];
    const newTouched = {};
    const newErrors = {};
    let hasErr = false;

    allFields.forEach(f => {
      newTouched[f] = true;
      const err = getFieldError(f, formData[f]);
      newErrors[f] = err;
      if (err) hasErr = true;
    });

    // Email is optional contact info, but required when it's the chosen
    // delivery channel for the generated password (mirrors the Lambda's
    // own validation — this is a cross-field rule getFieldError can't see).
    if (formData.delivery_channel === 'email' && !formData.email.trim()) {
      newTouched.email = true;
      newErrors.email = 'Email is required when delivery channel is set to email.';
      hasErr = true;
    }

    setTouched(newTouched);
    setErrors(newErrors);

    if (hasErr) return;

    const payload = {
      ...formData,
      mobile_phone: toE164Phone(formData.mobile_phone),
    };

    setSubmitting(true);
    try {
      const res = await api.addTechnician(payload);
      setSubmitting(false);
      let notice = null;
      let msg = `Technician ${res.technician.full_name} added!`;
      if (res.credential_delivery?.delivered) {
        msg += ` Setup link sent via ${formData.delivery_channel.toUpperCase()}.`;
      } else if (res.credential_delivery?.setup_link) {
        notice = {
          name: res.technician.full_name,
          login: res.technician.mobile_phone,
          link: res.credential_delivery.setup_link,
          warning: res.credential_delivery.warning,
          reason: res.credential_delivery.reason,
        };
      }
      sessionStorage.removeItem(ADD_TECH_DRAFT_KEY);
      onSuccess(msg, notice);
      onClose();
    } catch (err) {
      setSubmitting(false);
      setServerError(err.message || 'Failed to add technician.');
    }
  };

  const getInputClass = (fieldName) => {
    if (!touched[fieldName] && !formData[fieldName]) return '';
    return errors[fieldName] ? 'input-invalid' : 'input-valid';
  };

  const e164Preview = toE164Phone(formData.mobile_phone);

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3><UserPlus size={18} /> Add New Technician</h3>
          <button className="modal-close" type="button" onClick={handleClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            {serverError && <div className="tech-error-banner">{serverError}</div>}
            <div className="tech-form-grid">
              <div className="tech-form-group full-width">
                <label>FULL NAME *</label>
                <input
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleChange}
                  onBlur={() => handleBlur('full_name')}
                  className={getInputClass('full_name')}
                  placeholder="e.g. Alex Johnson"
                  required
                />
                {touched.full_name && errors.full_name && <span className="tech-inline-error">⚠ {errors.full_name}</span>}
              </div>

              <div className="tech-form-group">
                <label>EMAIL ADDRESS {formData.delivery_channel === 'email' ? '*' : '(optional)'}</label>
                <input
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={() => handleBlur('email')}
                  className={getInputClass('email')}
                  placeholder="alex@example.com"
                  required={formData.delivery_channel === 'email'}
                />
                {touched.email && errors.email && <span className="tech-inline-error">⚠ {errors.email}</span>}
              </div>

              <div className="tech-form-group">
                <label>MOBILE PHONE * <small style={{ fontWeight: 400, color: '#64748b' }}>(this is their login)</small></label>
                <input
                  name="mobile_phone"
                  type="tel"
                  value={formData.mobile_phone}
                  onChange={handleChange}
                  onBlur={() => handleBlur('mobile_phone')}
                  className={getInputClass('mobile_phone')}
                  placeholder="(941) 555-0199"
                  required
                />
                {touched.mobile_phone && errors.mobile_phone && <span className="tech-inline-error">⚠ {errors.mobile_phone}</span>}
                {e164Preview && !errors.mobile_phone && <span className="tech-e164-badge">E.164 Storage: {e164Preview}</span>}
              </div>

              <div className="tech-form-group">
                <label>ROLE / SPECIALTY</label>
                <input
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  placeholder="e.g. Master Tile Lead"
                />
              </div>

              <div className="tech-form-group">
                <label>CERTIFICATIONS</label>
                <input
                  name="certifications"
                  value={formData.certifications}
                  onChange={handleChange}
                  placeholder="e.g. OSHA-30, EPA RRP"
                />
              </div>

              <div className="tech-form-group">
                <label>HOURLY COST RATE ($)</label>
                <input
                  name="hourly_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.hourly_rate}
                  onChange={handleChange}
                  onBlur={() => handleBlur('hourly_rate')}
                  className={getInputClass('hourly_rate')}
                  placeholder="45.00"
                />
                {touched.hourly_rate && errors.hourly_rate && <span className="tech-inline-error">⚠ {errors.hourly_rate}</span>}
              </div>

              <div className="tech-form-group">
                <label>BILLABLE RATE ($)</label>
                <input
                  name="billable_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.billable_rate}
                  onChange={handleChange}
                  onBlur={() => handleBlur('billable_rate')}
                  className={getInputClass('billable_rate')}
                  placeholder="95.00"
                />
                {touched.billable_rate && errors.billable_rate && <span className="tech-inline-error">⚠ {errors.billable_rate}</span>}
              </div>

              <div className="tech-form-group full-width">
                <label>CREDENTIAL DELIVERY CHANNEL *</label>
                <div className="channel-selector">
                  <label className={`channel-option ${formData.delivery_channel === 'sms' ? 'selected' : ''}`}>
                    <input type="radio" name="delivery_channel" value="sms" checked={formData.delivery_channel === 'sms'} onChange={handleChange} />
                    📱 Send via SMS
                  </label>
                  <label className={`channel-option ${formData.delivery_channel === 'email' ? 'selected' : ''}`}>
                    <input type="radio" name="delivery_channel" value="email" checked={formData.delivery_channel === 'email'} onChange={handleChange} />
                    ✉ Send via Email
                  </label>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <Button type="button" onClick={handleClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" primary disabled={submitting}>{submitting ? 'Creating account…' : 'Add Technician & Deliver Credentials'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditTechnicianModal({ technician, onClose, onSuccess }) {
  const [formData, setFormData] = useState(() => {
    const draft = readDraft(EDIT_TECH_DRAFT_KEY);
    if (draft && draft.technician_id === technician.id) return draft;
    // technician.mobile_phone comes back from the API as E.164 (+1XXXXXXXXXX);
    // strip the country code before handing it to formatDisplayPhone so the
    // field prefills as (XXX) XXX-XXXX instead of a bare +1XXXXXXXXXX string.
    const digitsNoCountry = (technician.mobile_phone || '').replace(/^\+?1/, '');
    return {
      technician_id: technician.id,
      full_name: technician.full_name || '',
      email: technician.email || '',
      mobile_phone: formatDisplayPhone(digitsNoCountry),
      role: technician.role || '',
      certifications: Array.isArray(technician.certifications) ? technician.certifications.join(', ') : (technician.certifications || ''),
      hourly_rate: technician.hourly_rate != null ? String(technician.hourly_rate) : '',
      billable_rate: technician.billable_rate != null ? String(technician.billable_rate) : '',
    };
  });
  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    sessionStorage.setItem(EDIT_TECH_DRAFT_KEY, JSON.stringify(formData));
  }, [formData]);

  const handleClose = () => {
    sessionStorage.removeItem(EDIT_TECH_DRAFT_KEY);
    onClose();
  };

  const handleBlur = (fieldName) => {
    setTouched(prev => ({ ...prev, [fieldName]: true }));
    const err = getFieldError(fieldName, formData[fieldName]);
    setErrors(prev => ({ ...prev, [fieldName]: err }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let newValue = value;

    if (name === 'mobile_phone') {
      newValue = formatDisplayPhone(value);
    }

    setFormData(prev => ({ ...prev, [name]: newValue }));

    if (touched[name] || newValue.trim() !== '') {
      const err = getFieldError(name, newValue);
      setErrors(prev => ({ ...prev, [name]: err }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    const allFields = ['full_name', 'email', 'mobile_phone', 'hourly_rate', 'billable_rate'];
    const newTouched = {};
    const newErrors = {};
    let hasErr = false;

    allFields.forEach(f => {
      newTouched[f] = true;
      const err = getFieldError(f, formData[f]);
      newErrors[f] = err;
      if (err) hasErr = true;
    });

    setTouched(newTouched);
    setErrors(newErrors);

    if (hasErr) return;

    const payload = {
      full_name: formData.full_name,
      email: formData.email,
      mobile_phone: toE164Phone(formData.mobile_phone),
      role: formData.role,
      certifications: formData.certifications,
      hourly_rate: formData.hourly_rate,
      billable_rate: formData.billable_rate,
    };

    setSubmitting(true);
    try {
      const res = await api.updateTechnician(technician.id, payload);
      setSubmitting(false);
      sessionStorage.removeItem(EDIT_TECH_DRAFT_KEY);
      let msg = `Technician ${res.technician.full_name} updated.`;
      if (res.warning) msg += ` ${res.warning}`;
      onSuccess(msg);
    } catch (err) {
      setSubmitting(false);
      setServerError(err.message || 'Failed to update technician.');
    }
  };

  const getInputClass = (fieldName) => {
    if (!touched[fieldName] && !formData[fieldName]) return '';
    return errors[fieldName] ? 'input-invalid' : 'input-valid';
  };

  const e164Preview = toE164Phone(formData.mobile_phone);

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Technician</h3>
          <button className="modal-close" type="button" onClick={handleClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            {serverError && <div className="tech-error-banner">{serverError}</div>}
            <div className="tech-form-grid">
              <div className="tech-form-group full-width">
                <label>FULL NAME *</label>
                <input
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleChange}
                  onBlur={() => handleBlur('full_name')}
                  className={getInputClass('full_name')}
                  placeholder="e.g. Alex Johnson"
                  required
                />
                {touched.full_name && errors.full_name && <span className="tech-inline-error">⚠ {errors.full_name}</span>}
              </div>

              <div className="tech-form-group">
                <label>EMAIL ADDRESS (optional)</label>
                <input
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={() => handleBlur('email')}
                  className={getInputClass('email')}
                  placeholder="alex@example.com"
                />
                {touched.email && errors.email && <span className="tech-inline-error">⚠ {errors.email}</span>}
              </div>

              <div className="tech-form-group">
                <label>MOBILE PHONE * <small style={{ fontWeight: 400, color: '#64748b' }}>(this is their login)</small></label>
                <input
                  name="mobile_phone"
                  type="tel"
                  value={formData.mobile_phone}
                  onChange={handleChange}
                  onBlur={() => handleBlur('mobile_phone')}
                  className={getInputClass('mobile_phone')}
                  placeholder="(941) 555-0199"
                  required
                />
                {touched.mobile_phone && errors.mobile_phone && <span className="tech-inline-error">⚠ {errors.mobile_phone}</span>}
                {e164Preview && !errors.mobile_phone && <span className="tech-e164-badge">E.164 Storage: {e164Preview}</span>}
                {e164Preview && e164Preview !== technician.mobile_phone && !errors.mobile_phone && <span className="tech-inline-error" style={{ color: '#b45309' }}>⚠ Changing this updates the technician's mobile app login.</span>}
              </div>

              <div className="tech-form-group">
                <label>ROLE / SPECIALTY</label>
                <input
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  placeholder="e.g. Master Tile Lead"
                />
              </div>

              <div className="tech-form-group">
                <label>CERTIFICATIONS</label>
                <input
                  name="certifications"
                  value={formData.certifications}
                  onChange={handleChange}
                  placeholder="e.g. OSHA-30, EPA RRP"
                />
              </div>

              <div className="tech-form-group">
                <label>HOURLY COST RATE ($)</label>
                <input
                  name="hourly_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.hourly_rate}
                  onChange={handleChange}
                  onBlur={() => handleBlur('hourly_rate')}
                  className={getInputClass('hourly_rate')}
                  placeholder="45.00"
                />
                {touched.hourly_rate && errors.hourly_rate && <span className="tech-inline-error">⚠ {errors.hourly_rate}</span>}
              </div>

              <div className="tech-form-group">
                <label>BILLABLE RATE ($)</label>
                <input
                  name="billable_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.billable_rate}
                  onChange={handleChange}
                  onBlur={() => handleBlur('billable_rate')}
                  className={getInputClass('billable_rate')}
                  placeholder="95.00"
                />
                {touched.billable_rate && errors.billable_rate && <span className="tech-inline-error">⚠ {errors.billable_rate}</span>}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <Button type="button" onClick={handleClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" primary disabled={submitting}>{submitting ? 'Saving…' : 'Save Changes'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel = 'Confirm', onCancel, onConfirm }) {
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card confirm-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" type="button" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body"><p>{message}</p></div>
        <div className="modal-footer">
          <Button type="button" onClick={onCancel} disabled={submitting}>Cancel</Button>
          <Button type="button" primary onClick={handleConfirm} disabled={submitting}>{submitting ? 'Working…' : confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

// Human-readable labels for field_events.event_type values actually
// produced by the technician mobile app (see get-job-file/index.js) —
// 'gps_arrive' and 'photo' are the two in real use as of this writing, the
// others are the mobile team's own documented vocabulary (MOBILE_TEAM_
// HANDOFF.md) for events not yet observed live.
const FIELD_EVENT_LABELS = {
  gps_arrive: 'GPS · Geofence arrival',
  gps_depart: 'GPS · Geofence departure',
  manual_arrive: 'Manual "I\'ve arrived" (geofence failsafe)',
  photo: 'Photo captured',
  voice_note: 'Voice note',
  status_change: 'Job status change',
  job_timer_start: 'Labor clock started',
  job_timer_stop: 'Labor clock stopped',
};

function JobFileModal({ jobId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getJobFile(jobId)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load job file.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [jobId]);

  const job = data?.job;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <h3>Job file{job ? ` — ${job.job_id_public}` : ''}</h3>
          <button className="modal-close" type="button" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading && <div className="loading-roster">Loading job file…</div>}
          {error && <div className="tech-error-banner">{error}</div>}
          {job && <>
            <p style={{ margin: '0 0 4px', fontWeight: 700 }}>{job.customers?.household_name || 'Unknown customer'}</p>
            <p style={{ margin: '0 0 4px', color: '#64748b', fontSize: '13px' }}>{job.service_address}</p>
            <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '13px' }}>
              {(job.trade_category || job.job_type || '').toUpperCase()} · <Status color={jobStatusColor(job.status)}>{(job.status || '').replace('_', ' ')}</Status>
              {job.technicians?.full_name ? ` · ${job.technicians.full_name}` : ''}
            </p>
            {data.events.length === 0 ? (
              <div className="loading-roster">
                No field events recorded for this job yet. Events (arrival, photos, status changes) are logged by the technician's mobile app while they're on the job.
              </div>
            ) : (
              <div className="field-event-list">
                {data.events.map((e) => (
                  <div className="field-event" key={e.id}>
                    <time>{new Date(e.event_ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
                    <Activity size={17} />
                    <div>
                      <label>{FIELD_EVENT_LABELS[e.event_type] || e.event_type}{e.technician_name ? ` · ${e.technician_name}` : ''}</label>
                      {e.transcript && <p>{e.transcript}</p>}
                      {e.s3_object_key && <p>{e.s3_object_key.split('/').pop()}</p>}
                    </div>
                    <span />
                  </div>
                ))}
              </div>
            )}
          </>}
        </div>
        <div className="modal-footer">
          <Button type="button" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

// Read-only card for every estimate/change order — the contractor's only
// real action is approving or rejecting one the customer has already
// signed (see update-estimate/index.js). Drafting, editing, and sending to
// the customer all happen on the technician's mobile app, not here.
function EstimateCard({ estimate, flash, onApprove, onReject }) {
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (err) { flash(err.message || 'Action failed.'); } finally { setBusy(false); }
  };

  const customerName = estimate.job?.customers?.household_name || 'Unknown customer';
  const jobLabel = estimate.job ? `${estimate.job.job_id_public} · ${estimate.job.description || estimate.job.job_type}` : 'Job no longer exists';
  const isChangeOrder = estimate.doc_type === 'change_order';
  const awaitingDecision = estimate.status === 'signed';
  const statusTone = estimate.status === 'approved' ? 'green' : estimate.status === 'rejected' ? 'gray' : awaitingDecision ? 'amber' : 'blue';

  const tierValues = [
    estimate.tier_good != null ? `GOOD|$${Number(estimate.tier_good).toLocaleString()}` : null,
    estimate.tier_better != null ? `BETTER|$${Number(estimate.tier_better).toLocaleString()}` : null,
    estimate.tier_best != null ? `BEST|$${Number(estimate.tier_best).toLocaleString()}` : null,
  ].filter(Boolean);

  return (
    <article className={`approval-card ${awaitingDecision ? 'warning' : 'draft'}`}>
      <div>
        <h3>{isChangeOrder ? '⚠' : '✎'} {isChangeOrder ? 'Change order' : 'Estimate'} — {jobLabel} <Pill tone={statusTone}>{estimate.status.toUpperCase()}</Pill></h3>
        <p>{customerName}{estimate.created_at ? ` · ${new Date(estimate.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}</p>
        {tierValues.length > 0 ? <Stats values={tierValues} /> : <p style={{ color: '#94a3b8' }}>No price entered yet.</p>}
        {awaitingDecision && <div className="right-actions">
          <Button disabled={busy} onClick={() => run(() => onReject(estimate.id))}>Reject</Button>
          <Button primary disabled={busy} onClick={() => run(() => onApprove(estimate.id))}><Check size={15} /> Approve & bill</Button>
        </div>}
      </div>
    </article>
  );
}

// jobs.job_type CHECK constraint — verified live via probe-insert against
// the real DB this session; 'service_call' is the only value currently
// valid (see backend/functions/create-job/index.js for the full list of
// rejected candidates). Keep this in sync with the Lambda's own allowlist.
const VALID_JOB_TYPES = [{ value: 'service_call', label: 'Service Call' }];

function getJobFieldError(name, value, formData) {
  if (name === 'customerMode') return '';
  if (formData.customerMode === 'new') {
    if (name === 'new_household_name' && !value.trim()) return 'Customer name is required.';
    if (name === 'new_primary_phone') {
      const digits = value.replace(/\D/g, '');
      if (!digits) return 'Customer phone is required.';
      if (digits.length < 10) return `Phone number is incomplete (${digits.length}/10 digits required).`;
    }
    if (name === 'new_service_address' && !value.trim()) return 'Service address is required.';
  } else if (name === 'existing_customer_id' && !value) {
    return 'Select an existing customer.';
  }
  if (name === 'job_type' && !value) return 'Job type is required.';
  if (name === 'service_address' && !value.trim()) return 'Service address is required.';
  if (name === 'scheduled_end' && formData.scheduled_start && value && new Date(value) <= new Date(formData.scheduled_start)) {
    return 'End time must be after the start time.';
  }
  if (name === 'total_estimate' && value !== '' && (isNaN(value) || parseFloat(value) < 0)) return 'Estimate cannot be negative.';
  return '';
}

const DEEPGRAM_LISTEN_PARAMS = { model: 'nova-2', smart_format: 'true', interim_results: 'true', punctuate: 'true', language: 'en-US' };

// Sends Deepgram's documented CloseStream message, then waits for the
// server to close the socket itself (it flushes any final in-flight
// transcript first) — falls back to a short timeout so a slow/dropped
// close never leaves the contractor stuck on "Extracting…" forever.
function closeDeepgramStream(ws) {
  return new Promise((resolve) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return resolve();
    const done = () => { ws.removeEventListener('close', done); resolve(); };
    ws.addEventListener('close', done);
    ws.send(JSON.stringify({ type: 'CloseStream' }));
    setTimeout(done, 1200);
  });
}

// Handles both "Add vehicle" (vehicle=null) and "Edit vehicle" (vehicle set)
// in one component, matching CreateJobModal's own dual-purpose shape rather
// than a separate Add/Edit pair — the field set barely differs.
function VehicleModal({ vehicle, technicians, onClose, onSuccess }) {
  const isEdit = Boolean(vehicle);
  const [unitNumber, setUnitNumber] = useState(vehicle?.unit_number || '');
  const [make, setMake] = useState(vehicle?.make || '');
  const [model, setModel] = useState(vehicle?.model || '');
  const [year, setYear] = useState(vehicle?.year || '');
  const [driverId, setDriverId] = useState(vehicle?.default_driver_id || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!unitNumber.trim()) { setError('Unit number is required.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const payload = { unit_number: unitNumber.trim(), make, model, year, default_driver_id: driverId || null };
      if (isEdit) await api.updateVehicle(vehicle.id, payload);
      else await api.addVehicle(payload);
      onSuccess(isEdit ? 'Vehicle updated.' : 'Vehicle added.');
    } catch (err) {
      setError(err.message || 'Failed to save vehicle.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h3>{isEdit ? 'Edit vehicle' : 'Add vehicle'}</h3>
            <button className="modal-close" type="button" onClick={onClose}>✕</button>
          </div>
          <div className="modal-body">
            {error && <div className="tech-error-banner">{error}</div>}
            <div className="tech-form-group full-width">
              <label>Unit number</label>
              <input value={unitNumber} onChange={e => setUnitNumber(e.target.value)} placeholder="e.g. Van 01" required />
            </div>
            <div className="tech-form-grid">
              <div className="tech-form-group"><label>Make</label><input value={make} onChange={e => setMake(e.target.value)} placeholder="e.g. Ford" /></div>
              <div className="tech-form-group"><label>Model</label><input value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. Transit 250" /></div>
            </div>
            <div className="tech-form-grid">
              <div className="tech-form-group"><label>Year</label><input type="number" value={year} onChange={e => setYear(e.target.value)} placeholder="2024" /></div>
              <div className="tech-form-group">
                <label>Assigned driver</label>
                <select value={driverId} onChange={e => setDriverId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name || t.name}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <Button type="button" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" primary disabled={submitting}>{submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add vehicle'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

const CUSTOMER_PREFERRED_CONTACT = [{ value: '', label: 'No preference' }, { value: 'call', label: 'Call' }, { value: 'email', label: 'Email' }, { value: 'text', label: 'Text' }];

// Handles both "Add customer" (customer=null) and "Edit customer".
function CustomerModal({ customer, onClose, onSuccess }) {
  const isEdit = Boolean(customer);
  const [householdName, setHouseholdName] = useState(customer?.household_name || '');
  const [contactName, setContactName] = useState(customer?.primary_contact_name || '');
  const [primaryPhone, setPrimaryPhone] = useState(customer?.primary_phone || '');
  const [email, setEmail] = useState(customer?.email || '');
  const [serviceAddress, setServiceAddress] = useState(customer?.service_address || '');
  const [preferredContact, setPreferredContact] = useState(customer?.preferred_contact || '');
  const [notes, setNotes] = useState(customer?.notes || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!householdName.trim()) { setError('Customer name is required.'); return; }
    if (!primaryPhone.trim()) { setError('Primary phone is required.'); return; }
    if (!serviceAddress.trim()) { setError('Service address is required.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const payload = { household_name: householdName.trim(), primary_contact_name: contactName, primary_phone: primaryPhone, email, service_address: serviceAddress, preferred_contact: preferredContact, notes };
      if (isEdit) await api.updateCustomer(customer.id, payload);
      else await api.addCustomer(payload);
      onSuccess(isEdit ? 'Customer updated.' : 'Customer added.');
    } catch (err) {
      setError(err.message || 'Failed to save customer.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h3>{isEdit ? 'Edit customer' : 'Add customer'}</h3>
            <button className="modal-close" type="button" onClick={onClose}>✕</button>
          </div>
          <div className="modal-body">
            {error && <div className="tech-error-banner">{error}</div>}
            <div className="tech-form-group full-width">
              <label>Household / business name</label>
              <input value={householdName} onChange={e => setHouseholdName(e.target.value)} placeholder="e.g. Anderson, Sarah & Todd" required />
            </div>
            <div className="tech-form-grid">
              <div className="tech-form-group"><label>Contact name</label><input value={contactName} onChange={e => setContactName(e.target.value)} /></div>
              <div className="tech-form-group"><label>Primary phone</label><input value={primaryPhone} onChange={e => setPrimaryPhone(e.target.value)} placeholder="(941) 555-0812" required /></div>
            </div>
            <div className="tech-form-grid">
              <div className="tech-form-group"><label>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
              <div className="tech-form-group">
                <label>Preferred contact</label>
                <select value={preferredContact} onChange={e => setPreferredContact(e.target.value)}>
                  {CUSTOMER_PREFERRED_CONTACT.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="tech-form-group full-width">
              <label>Service address</label>
              <input value={serviceAddress} onChange={e => setServiceAddress(e.target.value)} placeholder="Street, City, State" required />
            </div>
            <div className="tech-form-group full-width">
              <label>Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="modal-footer">
            <Button type="button" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" primary disabled={submitting}>{submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add customer'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function VoiceCaptureModal({ onClose, onExtracted, onFillManually }) {
  // idle -> connecting -> listening -> extracting -> error (any state can
  // fall back to error; error always leaves a path back to manual entry).
  const [state, setState] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [finalText, setFinalText] = useState('');
  const [interimText, setInterimText] = useState('');
  const wsRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const mountedRef = useRef(true);
  // Distinguishes "we closed the socket on purpose via Stop" from a real
  // connection failure — both fire the WebSocket close event identically,
  // and only the latter should surface as an error.
  const intentionalCloseRef = useRef(false);

  // Shared by unmount cleanup, handleClose, and handleFillManually — every
  // path off this modal needs to release the mic and socket the same way.
  const releaseMediaResources = () => {
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    wsRef.current?.close();
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Tab closed / navigated away mid-recording — release the mic and
      // socket immediately rather than leaving them dangling.
      releaseMediaResources();
    };
  }, []);

  const startRecording = async () => {
    setErrorMsg('');
    setState('connecting');
    intentionalCloseRef.current = false;
    try {
      const { token } = await api.getVoiceToken();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // The short-lived JWT from /v1/auth/grant authenticates via the
      // Sec-WebSocket-Protocol subprotocol — ['bearer', jwt], matching the
      // Bearer auth scheme JWTs actually require. This is NOT the same
      // mechanism a long-lived API key uses (['token', apiKey]), and it is
      // NOT a query parameter either — an access_token= query param was
      // tried first (a pattern seen in third-party discussion, not
      // Deepgram's own docs) and empirically confirmed to fail with 401
      // "Invalid credentials" against the real API before landing on this.
      const params = new URLSearchParams(DEEPGRAM_LISTEN_PARAMS);
      const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, ['bearer', token]);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setState('listening');
        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
        recorderRef.current = recorder;
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data);
        };
        recorder.start(250);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        const alt = msg.channel?.alternatives?.[0];
        if (!alt) return;
        if (msg.is_final) {
          if (alt.transcript) setFinalText(prev => (prev ? prev + ' ' : '') + alt.transcript);
          setInterimText('');
        } else {
          setInterimText(alt.transcript || '');
        }
      };

      ws.onerror = () => {
        if (!mountedRef.current || intentionalCloseRef.current) return;
        setState('error');
        setErrorMsg('Lost connection to the transcription service. You can try again, or fill in the job manually.');
      };

      // The generic browser `error` event carries no diagnostic detail by
      // design; the close code/reason (when Deepgram sends one) is the only
      // way to actually see why a handshake was rejected — this is what
      // surfaced the real "Invalid credentials" cause during development,
      // where `onerror` alone gave zero signal.
      ws.onclose = (event) => {
        if (!mountedRef.current || intentionalCloseRef.current) return;
        if (event.code === 1000) return; // normal closure, nothing to report
        setState('error');
        setErrorMsg(`Lost connection to the transcription service (code ${event.code}${event.reason ? `: ${event.reason}` : ''}). You can try again, or fill in the job manually.`);
      };
    } catch (err) {
      if (!mountedRef.current) return;
      setState('error');
      setErrorMsg(
        ['NotAllowedError', 'NotFoundError', 'NotSupportedError', 'NotReadableError'].includes(err.name)
          ? 'Microphone access was denied or unavailable. Allow microphone access, or fill in the job manually.'
          : (err.message || 'Could not start voice capture. You can fill in the job manually.')
      );
    }
  };

  const stopRecording = async () => {
    intentionalCloseRef.current = true;
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    await closeDeepgramStream(wsRef.current);
    if (!mountedRef.current) return;

    const transcript = `${finalText} ${interimText}`.trim();
    if (!transcript) {
      setState('error');
      setErrorMsg("Didn't catch anything — try again, or fill in the job manually.");
      return;
    }

    setState('extracting');
    try {
      const res = await api.extractJobFromVoice(transcript);
      if (!mountedRef.current) return;
      onExtracted(res.extracted, res.flagged_fields || []);
    } catch (err) {
      if (!mountedRef.current) return;
      setState('error');
      setErrorMsg(err.message || 'Failed to pull job details from that transcript. You can fill in the job manually.');
    }
  };

  const handleClose = () => {
    intentionalCloseRef.current = true;
    releaseMediaResources();
    onClose();
  };

  // Distinct from handleClose: this leaves voice capture behind and hands
  // off to the exact same CreateJobModal "Schedule Job" opens, blank, so
  // the contractor never loses the option to finish scheduling manually
  // after voice fails or is abandoned.
  const handleFillManually = () => {
    intentionalCloseRef.current = true;
    releaseMediaResources();
    onFillManually();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card voice-capture-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3><Mic size={18} /> Schedule a Job by Voice</h3>
          <button className="modal-close" type="button" onClick={handleClose}>✕</button>
        </div>
        <div className="modal-body">
          {state === 'idle' && (
            <div className="voice-capture-panel">
              <p>Tap Start, then speak the customer, address, phone number, problem, and when you need it done. Stop when you're finished — you'll get a chance to review everything before it's saved.</p>
              <Button primary onClick={startRecording}><Mic size={15} /> Start Recording</Button>
            </div>
          )}
          {state === 'connecting' && (
            <div className="voice-capture-panel">
              <span className="voice-state-badge">Connecting…</span>
            </div>
          )}
          {(state === 'listening' || state === 'extracting') && (
            <div className="voice-capture-panel">
              <span className={`voice-state-badge ${state === 'listening' ? 'recording' : ''}`}>
                {state === 'listening' ? '● Listening…' : 'Extracting job details…'}
              </span>
              <div className="voice-transcript">
                <span>{finalText}</span>
                {interimText && <span className="voice-transcript-interim"> {interimText}</span>}
                {!finalText && !interimText && state === 'listening' && <span className="voice-transcript-placeholder">Start speaking…</span>}
              </div>
              {state === 'listening' && <Button primary onClick={stopRecording}><Square size={14} /> Stop</Button>}
            </div>
          )}
          {state === 'error' && (
            <div className="voice-capture-panel">
              <div className="tech-error-banner">{errorMsg}</div>
              <div className="voice-error-actions">
                <Button primary onClick={startRecording}><Mic size={15} /> Try Again</Button>
                <Button onClick={handleFillManually}>Fill In Manually Instead</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const CREATE_JOB_DEFAULTS = {
  customerMode: 'existing',
  existing_customer_id: '',
  new_household_name: '', new_primary_contact_name: '', new_primary_phone: '', new_email: '',
  new_service_address: '',
  job_type: 'service_call', trade_category: '', description: '', service_address: '',
  scheduled_start: '', scheduled_end: '', technician_id: '', total_estimate: '',
};

function CreateJobModal({ customers, technicians, initialData, flaggedFields, onClose, onSuccess }) {
  // initialData (from voice extraction) applies after any surviving draft —
  // a fresh voice capture always starts a new session, so it should never
  // be silently overridden by leftover state from some earlier interrupted
  // manual fill.
  const [formData, setFormData] = useState(() => ({ ...CREATE_JOB_DEFAULTS, ...readDraft(CREATE_JOB_DRAFT_KEY), ...(initialData || {}) }));
  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  // Fields voice extraction filled in but flagged as not fully confident
  // about (plus any guessed existing-customer match) — rendered amber until
  // the contractor actually looks at and edits/confirms them, at which
  // point they're removed here and treated as any normal field again.
  const [reviewFields, setReviewFields] = useState(() => new Set(flaggedFields || []));
  const clearReview = (fieldName) => {
    setReviewFields(prev => {
      if (!prev.has(fieldName)) return prev;
      const next = new Set(prev);
      next.delete(fieldName);
      return next;
    });
  };

  // Survive a tab discard/reload mid-fill — see the module-level comment
  // near NAV_STORAGE_KEY. Cleared on explicit close (handleClose) and on
  // successful submission, never left around after either.
  useEffect(() => {
    sessionStorage.setItem(CREATE_JOB_DRAFT_KEY, JSON.stringify(formData));
  }, [formData]);

  const handleClose = () => {
    sessionStorage.removeItem(CREATE_JOB_DRAFT_KEY);
    onClose();
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let newValue = value;
    if (name === 'new_primary_phone') newValue = formatDisplayPhone(value);
    setFormData(prev => {
      const next = { ...prev, [name]: newValue };
      // Prefill the job's own service address from whichever customer path
      // is active, but never overwrite something the dispatcher already typed.
      if (name === 'new_service_address' && !prev.service_address) next.service_address = newValue;
      return next;
    });
    clearReview(name);
    if (touched[name] || newValue.trim?.() !== '') {
      setErrors(prev => ({ ...prev, [name]: getJobFieldError(name, newValue, { ...formData, [name]: newValue }) }));
    }
  };

  const handleExistingCustomerSelect = (e) => {
    const id = e.target.value;
    const picked = customers.find(c => c.id === id);
    setFormData(prev => ({
      ...prev,
      existing_customer_id: id,
      service_address: prev.service_address || picked?.service_address || '',
    }));
    setTouched(prev => ({ ...prev, existing_customer_id: true }));
    setErrors(prev => ({ ...prev, existing_customer_id: id ? '' : 'Select an existing customer.' }));
    clearReview('existing_customer_id');
  };

  const handleBlur = (fieldName) => {
    setTouched(prev => ({ ...prev, [fieldName]: true }));
    setErrors(prev => ({ ...prev, [fieldName]: getJobFieldError(fieldName, formData[fieldName], formData) }));
  };

  const willBeScheduled = Boolean(formData.technician_id && formData.scheduled_start);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    const fieldsToCheck = formData.customerMode === 'new'
      ? ['new_household_name', 'new_primary_phone', 'new_service_address', 'job_type', 'service_address', 'scheduled_end', 'total_estimate']
      : ['existing_customer_id', 'job_type', 'service_address', 'scheduled_end', 'total_estimate'];

    const newTouched = {}; const newErrors = {}; let hasErr = false;
    fieldsToCheck.forEach(f => {
      newTouched[f] = true;
      const err = getJobFieldError(f, formData[f], formData);
      newErrors[f] = err;
      if (err) hasErr = true;
    });
    setTouched(prev => ({ ...prev, ...newTouched }));
    setErrors(prev => ({ ...prev, ...newErrors }));
    if (hasErr) return;

    const payload = {
      job_type: formData.job_type,
      trade_category: formData.trade_category || undefined,
      description: formData.description || undefined,
      service_address: formData.service_address,
      // datetime-local has no timezone offset — Postgres would otherwise
      // treat it as UTC. Converting through `new Date(...)` first resolves
      // it in the browser's local timezone before sending an ISO instant.
      scheduled_start: formData.scheduled_start ? new Date(formData.scheduled_start).toISOString() : undefined,
      scheduled_end: formData.scheduled_end ? new Date(formData.scheduled_end).toISOString() : undefined,
      technician_id: formData.technician_id || undefined,
      total_estimate: formData.total_estimate || undefined,
    };
    if (formData.customerMode === 'new') {
      payload.new_customer = {
        household_name: formData.new_household_name,
        primary_contact_name: formData.new_primary_contact_name || undefined,
        primary_phone: toE164Phone(formData.new_primary_phone),
        email: formData.new_email || undefined,
        service_address: formData.new_service_address,
      };
    } else {
      payload.customer_id = formData.existing_customer_id;
    }

    setSubmitting(true);
    try {
      const res = await api.createJob(payload);
      setSubmitting(false);
      let msg = `Job ${res.job.job_id_public} created (${res.job.status}).`;
      if (res.note) msg += ` ${res.note}`;
      if (res.warning) msg += ` ${res.warning}`;
      sessionStorage.removeItem(CREATE_JOB_DRAFT_KEY);
      onSuccess(msg);
      onClose();
    } catch (err) {
      setSubmitting(false);
      setServerError(err.message || 'Failed to create job.');
    }
  };

  const getInputClass = (fieldName) => {
    if (touched[fieldName] && errors[fieldName]) return 'input-invalid';
    if (reviewFields.has(fieldName)) return 'input-needs-review';
    if (!touched[fieldName] && !formData[fieldName]) return '';
    return errors[fieldName] ? 'input-invalid' : 'input-valid';
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3><Plus size={18} /> Schedule New Job</h3>
          <button className="modal-close" type="button" onClick={handleClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            {serverError && <div className="tech-error-banner">{serverError}</div>}
            {reviewFields.size > 0 && <div className="voice-review-banner">🎤 Filled in from voice — please double-check the highlighted field{reviewFields.size > 1 ? 's' : ''} below before saving.</div>}
            <div className="tech-form-grid">
              <div className="tech-form-group full-width">
                <label>CUSTOMER</label>
                <div className="channel-selector">
                  <label className={`channel-option ${formData.customerMode === 'existing' ? 'selected' : ''}`}>
                    <input type="radio" name="customerMode" value="existing" checked={formData.customerMode === 'existing'} onChange={handleChange} />
                    Existing customer
                  </label>
                  <label className={`channel-option ${formData.customerMode === 'new' ? 'selected' : ''}`}>
                    <input type="radio" name="customerMode" value="new" checked={formData.customerMode === 'new'} onChange={handleChange} />
                    + New customer
                  </label>
                </div>
              </div>

              {formData.customerMode === 'existing' ? (
                <div className="tech-form-group full-width">
                  <label>SELECT CUSTOMER *</label>
                  <select name="existing_customer_id" value={formData.existing_customer_id} onChange={handleExistingCustomerSelect} className={getInputClass('existing_customer_id')}>
                    <option value="">— Choose a customer —</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.household_name} · {c.primary_phone}</option>)}
                  </select>
                  {touched.existing_customer_id && errors.existing_customer_id && <span className="tech-inline-error">⚠ {errors.existing_customer_id}</span>}
                </div>
              ) : (
                <>
                  <div className="tech-form-group full-width">
                    <label>CUSTOMER / HOUSEHOLD NAME *</label>
                    <input name="new_household_name" value={formData.new_household_name} onChange={handleChange} onBlur={() => handleBlur('new_household_name')} className={getInputClass('new_household_name')} placeholder="e.g. Anderson, Sarah & Todd" />
                    {touched.new_household_name && errors.new_household_name && <span className="tech-inline-error">⚠ {errors.new_household_name}</span>}
                  </div>
                  <div className="tech-form-group">
                    <label>CONTACT NAME</label>
                    <input name="new_primary_contact_name" value={formData.new_primary_contact_name} onChange={handleChange} className={getInputClass('new_primary_contact_name')} placeholder="e.g. Sarah Anderson" />
                  </div>
                  <div className="tech-form-group">
                    <label>PHONE *</label>
                    <input name="new_primary_phone" type="tel" value={formData.new_primary_phone} onChange={handleChange} onBlur={() => handleBlur('new_primary_phone')} className={getInputClass('new_primary_phone')} placeholder="(941) 555-0812" />
                    {touched.new_primary_phone && errors.new_primary_phone && <span className="tech-inline-error">⚠ {errors.new_primary_phone}</span>}
                  </div>
                  <div className="tech-form-group full-width">
                    <label>EMAIL (OPTIONAL)</label>
                    <input name="new_email" type="email" value={formData.new_email} onChange={handleChange} className={getInputClass('new_email')} placeholder="sarah@example.com" />
                  </div>
                  <div className="tech-form-group full-width">
                    <label>CUSTOMER SERVICE ADDRESS *</label>
                    <input name="new_service_address" value={formData.new_service_address} onChange={handleChange} onBlur={() => handleBlur('new_service_address')} className={getInputClass('new_service_address')} placeholder="1402 Palmetto Avenue, Sarasota, FL" />
                    {touched.new_service_address && errors.new_service_address && <span className="tech-inline-error">⚠ {errors.new_service_address}</span>}
                  </div>
                </>
              )}

              <div className="tech-form-group">
                <label>JOB TYPE *</label>
                <select name="job_type" value={formData.job_type} onChange={handleChange}>
                  {VALID_JOB_TYPES.map(jt => <option key={jt.value} value={jt.value}>{jt.label}</option>)}
                </select>
              </div>
              <div className="tech-form-group">
                <label>TRADE CATEGORY</label>
                <input name="trade_category" value={formData.trade_category} onChange={handleChange} className={getInputClass('trade_category')} placeholder="e.g. HVAC, Plumbing" />
              </div>

              <div className="tech-form-group full-width">
                <label>PROBLEM / SCOPE DESCRIPTION</label>
                <textarea name="description" value={formData.description} onChange={handleChange} className={getInputClass('description')} placeholder="e.g. Upstairs blowing warm, unit runs" rows={3} />
              </div>

              <div className="tech-form-group full-width">
                <label>JOB SERVICE ADDRESS *</label>
                <input name="service_address" value={formData.service_address} onChange={handleChange} onBlur={() => handleBlur('service_address')} className={getInputClass('service_address')} placeholder="Defaults to the customer's address" />
                {touched.service_address && errors.service_address && <span className="tech-inline-error">⚠ {errors.service_address}</span>}
              </div>

              <div className="tech-form-group">
                <label>SCHEDULED START</label>
                <input name="scheduled_start" type="datetime-local" value={formData.scheduled_start} onChange={handleChange} className={getInputClass('scheduled_start')} />
              </div>
              <div className="tech-form-group">
                <label>SCHEDULED END</label>
                <input name="scheduled_end" type="datetime-local" value={formData.scheduled_end} onChange={handleChange} onBlur={() => handleBlur('scheduled_end')} className={getInputClass('scheduled_end')} />
                {touched.scheduled_end && errors.scheduled_end && <span className="tech-inline-error">⚠ {errors.scheduled_end}</span>}
              </div>

              <div className="tech-form-group">
                <label>ASSIGN TECHNICIAN</label>
                <select name="technician_id" value={formData.technician_id} onChange={handleChange}>
                  <option value="">Unassigned</option>
                  {technicians.map(t => <option key={t.id || t.name} value={t.id || ''}>{t.full_name || t.name}</option>)}
                </select>
              </div>
              <div className="tech-form-group">
                <label>ESTIMATE ($)</label>
                <input name="total_estimate" type="number" step="0.01" min="0" value={formData.total_estimate} onChange={handleChange} onBlur={() => handleBlur('total_estimate')} className={getInputClass('total_estimate')} placeholder="268.00" />
                {touched.total_estimate && errors.total_estimate && <span className="tech-inline-error">⚠ {errors.total_estimate}</span>}
              </div>

              <div className="tech-form-group full-width">
                <span className="tech-e164-badge">This will be saved as {willBeScheduled ? 'Scheduled' : 'Draft'} — {willBeScheduled ? 'a technician and start time are both set.' : 'assign a technician and a start time to move it to Scheduled.'}</span>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <Button onClick={handleClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" primary disabled={submitting}>{submitting ? 'Creating job…' : 'Schedule Job'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Stats({ values }) { return <div className="stats">{values.map(value => { const [label, item] = value.split('|'); return <div key={label}><label>{label}</label><b>{item}</b></div>; })}</div>; }
function Avatar({ name }) { return <span className="avatar">{initials(name)}</span>; }
function DataTable({ headers, children }) { return <div className="table-wrap"><table><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
const INVOICE_PAYMENT_METHODS = [{ value: 'stripe_cc', label: 'Stripe (Card)' }, { value: 'ach', label: 'ACH' }, { value: 'check', label: 'Check' }, { value: 'cash', label: 'Cash' }];

// Purely read-only — invoices are compiled and collected on by the
// technician's mobile app + Stripe Connect (HANDOFF.md §11.3, Beat 7), not
// created, edited, or sent from this dashboard.
function InvoiceRow({ invoice }) {
  const customerName = invoice.job?.customers?.household_name || 'Unknown customer';
  const jobLabel = invoice.job ? `${invoice.job.job_id_public} ${invoice.job.description || invoice.job.job_type || ''}`.trim() : 'Job no longer exists';

  return (
    <tr>
      <td>{invoice.invoice_number || '—'}</td>
      <td>{customerName}</td>
      <td>{jobLabel}</td>
      <td><b>${Number(invoice.total).toLocaleString()}</b></td>
      <td>{invoice.payment_method ? INVOICE_PAYMENT_METHODS.find(m => m.value === invoice.payment_method)?.label || invoice.payment_method : invoice.status === 'draft' ? 'Not yet sent' : 'Awaiting payment'}</td>
      <td>${Number(invoice.platform_fee).toFixed(2)}</td>
      <td><Pill tone={invoice.status === 'paid' ? 'green' : invoice.status === 'invoiced' ? 'blue' : 'gray'}>{invoice.status === 'paid' ? '✓ Paid' : invoice.status === 'invoiced' ? '◐ Invoiced' : 'Draft'}</Pill></td>
    </tr>
  );
}

function Invoices({ invoices, loading }) {
  if (loading) return <div className="loading-roster">Loading invoices…</div>;
  if (!invoices || invoices.length === 0) return <div className="loading-roster">No invoices yet — these are compiled and sent by the technician from the field, not from this dashboard.</div>;
  return <DataTable headers={['INVOICE #', 'CUSTOMER', 'JOB', 'AMOUNT', 'PAYMENT METHOD', 'PLATFORM FEE', 'STATUS']}>
    {invoices.map(inv => <InvoiceRow key={inv.id} invoice={inv} />)}
  </DataTable>;
}
// Real "jobs completed & billed per technician", replacing the old mock's
// fabricated "billed vs. GPS-clocked %" — there is no clock-in/out event
// anywhere in the schema (jobs.scheduled_end is null on every real job,
// confirmed live) so that percentage had no real signal to compute, not
// just "not much data yet". This metric is honestly different but genuinely
// real. See HANDOFF.md §28.
const COMPLETED_JOB_STATUSES = ['complete', 'closed', 'invoiced', 'paid'];
function TechnicianJobReport({ jobs, technicians, loading }) {
  if (loading) return <article><h3>Jobs completed & billed <small>per technician, all-time</small></h3><div className="loading-roster">Loading…</div></article>;
  const completed = (jobs ?? []).filter(j => COMPLETED_JOB_STATUSES.includes(j.status));
  const rows = technicians.filter(t => t.is_active !== false).map(t => {
    const techJobs = completed.filter(j => j.lead_technician_id === t.id);
    const billed = techJobs.reduce((sum, j) => sum + Number(j.total_invoiced || 0), 0);
    return { id: t.id || t.name, name: t.full_name || t.name, count: techJobs.length, billed };
  }).sort((a, b) => b.count - a.count);
  return <article><h3>Jobs completed & billed <small>per technician, all-time</small></h3>{rows.length === 0 ? <p className="muted" style={{ fontSize: '12px' }}>No active technicians yet.</p> : rows.map(r => <div className="simple-row" key={r.id}><span>{r.name}</span><b>{r.count} job{r.count === 1 ? '' : 's'} · ${r.billed.toLocaleString()} billed</b></div>)}</article>;
}
function FleetHealthReport({ vehicles }) {
  return <article><h3>Fleet Health — OBD-II Monitoring</h3>{vehicles.length === 0 ? <p className="muted" style={{ fontSize: '12px' }}>No vehicles added yet.</p> : vehicles.map(v => { const health = vehicleHealth(v); return <div className="simple-row" key={v.id}><Status color={health.color}>{v.unit_number}{v.make || v.model ? ` · ${[v.make, v.model].filter(Boolean).join(' ')}` : ''}</Status><b className={health.color}>{health.label}</b></div>; })}</article>;
}
// Real due/paused state, computed from real jobs + customers.retention_flags
// (see backend/functions/list-retention-queue/index.js's header for the
// documented anchor-date approximation and the 3-vs-4-checkpoint schema
// gap). Nothing here ever sends anything — no automated dispatch exists yet.
function RetentionQueue({ queue, loading, busyId, onTogglePause }) {
  if (loading) return <article className="retention"><h3>Retention queue — automated customer follow-ups</h3><div className="loading-roster">Loading…</div></article>;
  const rows = queue ?? [];
  return <article className="retention">
    <h3>Retention queue — automated customer follow-ups</h3>
    {rows.length === 0 ? <p className="muted" style={{ fontSize: '12px' }}>No follow-ups due — nothing here until a job is marked complete.</p> : rows.map(r => <div key={r.customer_id}>
      <Pill tone={r.paused ? 'gray' : r.due_now ? 'amber' : 'blue'}>{r.due_now ? 'DUE NOW' : new Date(r.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Pill>
      <span>{r.customer_name} — {r.checkpoint_label}{r.job_id_public ? ` · ${r.job_id_public}` : ''}</span>
      <small>{r.paused ? 'Paused' : r.due_now ? 'Due now' : `Due ${new Date(r.due_at).toLocaleDateString()}`}</small>
      <Button onClick={() => onTogglePause(r)} disabled={busyId === r.customer_id}>{busyId === r.customer_id ? '…' : r.paused ? 'Resume' : 'Pause'}</Button>
    </div>)}
  </article>;
}

// One card per en_route/on_site job, backing the real Panel 6 (Live field
// data stream — HANDOFF.md §30). Reuses JobFileModal's exact event-row
// shape/labels (FIELD_EVENT_LABELS) and jobStatusColor — this card shows
// only the most recent few events (already capped server-side by
// list-live-feed); "View job file" reuses the existing modal for the
// complete history instead of this component duplicating that view.
function LiveFeedJobCard({ job, onViewFile }) {
  const customer = job.customers;
  const technician = job.technicians;
  return <article className="live-feed-job">
    <div className="live-feed-job-header">
      <div>
        <label>{job.job_id_public}</label>
        <h3>{customer?.household_name || 'Unknown customer'}</h3>
        <p>{job.service_address}</p>
      </div>
      <div className="live-feed-job-meta">
        <Status color={jobStatusColor(job.status)}>{(job.status || '').replace('_', ' ')}</Status>
        {technician?.full_name && <Pill tone="gray">👤 {technician.full_name}</Pill>}
        <Button onClick={onViewFile}>View job file</Button>
      </div>
    </div>
    {job.events.length === 0 ? <p className="muted" style={{ fontSize: '12px' }}>No events logged yet.</p> : (
      <div className="field-event-list">
        {job.events.map(e => <div className="field-event" key={e.id}>
          <time>{new Date(e.event_ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
          <Activity size={17} />
          <div>
            <label>{FIELD_EVENT_LABELS[e.event_type] || e.event_type}{e.technician_name ? ` · ${e.technician_name}` : ''}</label>
            {e.transcript && <p>{e.transcript}</p>}
            {!e.transcript && e.s3_object_key && <p>{e.s3_object_key.split('/').pop()}</p>}
          </div>
          <span />
        </div>)}
      </div>
    )}
  </article>;
}

const KB_SUBMISSION_STATUS_TONE = { pending: 'amber', approved: 'green', rejected: 'gray', superseded: 'gray' };

function KnowledgeBaseSubmission({ flash }) {
  const [trades, setTrades] = useState([]);
  const [tradesLoading, setTradesLoading] = useState(true);
  const [submissions, setSubmissions] = useState(null);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [tradeSlug, setTradeSlug] = useState('');
  const [subcategoryName, setSubcategoryName] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [factTitle, setFactTitle] = useState('');
  const [fact, setFact] = useState('');
  const [topicTags, setTopicTags] = useState('');
  const [verifyLocally, setVerifyLocally] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const loadSubmissions = useCallback(() => {
    setSubmissionsLoading(true);
    api.listMyKbSubmissions().then(setSubmissions).catch(() => {}).finally(() => setSubmissionsLoading(false));
  }, []);

  useEffect(() => {
    api.listKbTrades().then(setTrades).catch(() => {}).finally(() => setTradesLoading(false));
    loadSubmissions();
  }, [loadSubmissions]);

  const selectedTrade = trades.find(t => t.slug === tradeSlug);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!tradeSlug) { setError('Choose a trade.'); return; }
    if (!subcategoryName.trim() || !categoryName.trim()) { setError('Subcategory and category are both required.'); return; }
    if (!factTitle.trim() || !fact.trim()) { setError('Fact title and the fact itself are both required.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.submitKbEntry({
        trade_slug: tradeSlug,
        subcategory_name: subcategoryName.trim(),
        category_name: categoryName.trim(),
        fact_title: factTitle.trim(),
        fact: fact.trim(),
        topic_tags: topicTags,
        verify_locally: verifyLocally,
      });
      flash(res.message || 'Submitted for review.');
      setSubcategoryName(''); setCategoryName(''); setFactTitle(''); setFact(''); setTopicTags(''); setVerifyLocally(false);
      loadSubmissions();
    } catch (err) {
      setError(err.message || 'Failed to submit.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 16px' }}>
        Know something every technician on a job like this should know? Submit it here — a FieldLoop reviewer approves it before it shows up in Knowledge Base search results for your team.
      </p>
      <form onSubmit={handleSubmit}>
        {error && <div className="tech-error-banner">{error}</div>}
        <div className="tech-form-grid">
          <div className="tech-form-group">
            <label>Trade</label>
            <select value={tradeSlug} onChange={e => setTradeSlug(e.target.value)} disabled={tradesLoading}>
              <option value="">{tradesLoading ? 'Loading trades…' : 'Select a trade…'}</option>
              {trades.map(t => <option key={t.slug} value={t.slug}>{t.name}</option>)}
            </select>
          </div>
          <div className="tech-form-group">
            <label>Subcategory</label>
            <input list="kb-subcat-options" value={subcategoryName} onChange={e => setSubcategoryName(e.target.value)} placeholder="e.g. Driveway Concrete" />
            <datalist id="kb-subcat-options">{(selectedTrade?.subcategories || []).map(s => <option key={s.slug} value={s.name} />)}</datalist>
          </div>
        </div>
        <div className="tech-form-group full-width">
          <label>Category</label>
          <input value={categoryName} onChange={e => setCategoryName(e.target.value)} placeholder="e.g. Subgrade & Base Prep" />
        </div>
        <div className="tech-form-group full-width">
          <label>Fact title</label>
          <input value={factTitle} onChange={e => setFactTitle(e.target.value)} placeholder="Short, specific title" />
        </div>
        <div className="tech-form-group full-width">
          <label>Fact</label>
          <textarea value={fact} onChange={e => setFact(e.target.value)} placeholder="The fact itself, written plainly — this is what gets shown to a technician who asks about it." />
        </div>
        <div className="tech-form-grid">
          <div className="tech-form-group">
            <label>Topic tags (comma-separated, optional)</label>
            <input value={topicTags} onChange={e => setTopicTags(e.target.value)} placeholder="e.g. subgrade, compaction" />
          </div>
          <div className="tech-form-group">
            <label>Varies by local jurisdiction?</label>
            <select value={verifyLocally ? 'yes' : 'no'} onChange={e => setVerifyLocally(e.target.value === 'yes')}>
              <option value="no">No</option>
              <option value="yes">Yes — flag for local verification</option>
            </select>
          </div>
        </div>
        <div className="right-actions">
          <Button type="submit" primary disabled={submitting}>{submitting ? 'Submitting…' : 'Submit for review'}</Button>
        </div>
      </form>

      <h3 style={{ marginTop: '28px' }}>Your submissions</h3>
      {submissionsLoading ? <div className="loading-roster">Loading…</div> : !submissions || submissions.length === 0 ? <div className="loading-roster">Nothing submitted yet.</div> : (
        <DataTable headers={['FACT', 'TRADE', 'CATEGORY', 'STATUS', 'SUBMITTED']}>
          {submissions.map(s => (
            <tr key={s.id}>
              <td>{s.fact_title}</td>
              <td>{s.kb_trades?.name || '—'}</td>
              <td>{s.kb_categories?.name || '—'}</td>
              <td><Pill tone={KB_SUBMISSION_STATUS_TONE[s.status] || 'gray'}>{s.status}</Pill></td>
              <td>{new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}

