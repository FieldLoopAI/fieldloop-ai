// backend/functions/get-platform-overview/index.js
// POST /platform/overview — admin-only, platform-wide KPIs across every
// contractor (not scoped to one tenant, unlike every other Lambda in this
// repo). Built for the new Platform Overview panel (HANDOFF.md §24).
//
// Every number here is aggregated in JS over full-table selects rather than
// SQL GROUP BY, matching this repo's existing pattern (list-jobs's
// annotateConflicts does the same) — table sizes here are small (dozens to
// low hundreds of rows), so this is simpler and just as correct as pushing
// the aggregation into Postgres.
const { requireRole } = require('./shared/auth');
const { getSupabaseClient } = require('./shared/supabaseClient');
const { enforceIpAllowlist } = require('./shared/ipAllowlist');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };
const MS_PER_DAY = 24 * 60 * 60 * 1000;

exports.handler = async (event) => {
  try {
    const flUser = await requireRole(event, ['admin']);
    await enforceIpAllowlist(event, flUser);
    const supabase = await getSupabaseClient();

    // ---- Contractors + status breakdown ----
    // contractor_system_meta is not guaranteed to exist for every contractor
    // (a real, live data-quality gap — HANDOFF.md §3 — not hypothetical), so
    // this is a manual left-join in JS rather than trusting an inner join to
    // not silently drop rows.
    const { data: contractors, error: cErr } = await supabase
      .from('contractors').select('id, legal_name, contractor_id_public, is_sandbox, created_at');
    if (cErr) throw new Error(cErr.message);
    const { data: metaRows, error: mErr } = await supabase
      .from('contractor_system_meta').select('contractor_id, status, onboarded_at, activated_at');
    if (mErr) throw new Error(mErr.message);
    const metaByContractor = Object.fromEntries(metaRows.map((m) => [m.contractor_id, m]));

    const statusCounts = { pending: 0, active: 0, suspended: 0, terminated: 0, no_status: 0 };
    const missingStatus = [];
    for (const c of contractors) {
      const meta = metaByContractor[c.id];
      if (!meta) {
        statusCounts.no_status += 1;
        missingStatus.push({ id: c.id, legal_name: c.legal_name });
      } else {
        statusCounts[meta.status] = (statusCounts[meta.status] || 0) + 1;
      }
    }

    // ---- Technicians ----
    const { data: techs, error: tErr } = await supabase.from('technicians').select('id, is_active');
    if (tErr) throw new Error(tErr.message);
    const activeTechs = techs.filter((t) => t.is_active).length;

    // ---- Jobs by status ----
    const { data: jobs, error: jErr } = await supabase.from('jobs').select('status');
    if (jErr) throw new Error(jErr.message);
    const jobStatusCounts = {};
    jobs.forEach((j) => { jobStatusCounts[j.status] = (jobStatusCounts[j.status] || 0) + 1; });

    // ---- Revenue (real invoices table, HANDOFF.md §23) ----
    // Every number here is honestly $0 as of this writing — nothing writes
    // to `invoices` yet outside this dashboard's own (view-only) reads; real
    // invoicing is the technician mobile app's build, not started against
    // this table. This aggregation is correct and ready for the moment that
    // changes, not a placeholder.
    const { data: invoices, error: iErr } = await supabase
      .from('invoices').select('total, platform_fee, paid_ts, invoice_number');
    if (iErr) throw new Error(iErr.message);
    const paidInvoices = invoices.filter((i) => i.paid_ts);
    const sentUnpaid = invoices.filter((i) => i.invoice_number && !i.paid_ts);
    const draftInvoices = invoices.filter((i) => !i.invoice_number);
    const revenue = {
      collected_total: paidInvoices.reduce((s, i) => s + Number(i.total || 0), 0),
      collected_platform_fee: paidInvoices.reduce((s, i) => s + Number(i.platform_fee || 0), 0),
      invoiced_unpaid_total: sentUnpaid.reduce((s, i) => s + Number(i.total || 0), 0),
      paid_count: paidInvoices.length,
      sent_unpaid_count: sentUnpaid.length,
      draft_count: draftInvoices.length,
    };

    // ---- Compliance expirations (license / GL insurance) ----
    const { data: compliance, error: compErr } = await supabase
      .from('contractor_compliance')
      .select('contractor_id, license_expiration_date, gl_expiration, primary_license_number');
    if (compErr) throw new Error(compErr.message);
    const nameById = Object.fromEntries(contractors.map((c) => [c.id, c.legal_name]));
    const now = Date.now();
    const expiring = [];
    for (const row of compliance) {
      for (const [label, dateStr] of [['license', row.license_expiration_date], ['general_liability', row.gl_expiration]]) {
        if (!dateStr) continue;
        const daysUntil = Math.round((new Date(dateStr).getTime() - now) / MS_PER_DAY);
        if (daysUntil <= 60) {
          expiring.push({
            contractor_id: row.contractor_id,
            legal_name: nameById[row.contractor_id] || 'Unknown',
            type: label,
            expires_on: dateStr,
            days_until: daysUntil,
            status: daysUntil < 0 ? 'expired' : 'expiring_soon',
          });
        }
      }
    }
    expiring.sort((a, b) => a.days_until - b.days_until);

    // ---- Knowledge Base stats ----
    const { data: kbTrades, error: kbtErr } = await supabase.from('kb_trades').select('id, name, slug');
    if (kbtErr) throw new Error(kbtErr.message);
    // kb_entries has grown past Supabase/PostgREST's default 1000-row cap
    // per request (2,842 rows as of the second content wave, HANDOFF.md
    // §35) — a plain .select() here silently truncates to the first 1000,
    // and since Postgres scans a partitioned table one partition at a time
    // with no ORDER BY, that 1000-row cap was landing entirely inside the
    // first-created partition (concrete_and_pavers), making every other
    // trade look like it had zero approved facts. Paginate with .range()
    // until a page comes back short, same fix already applied to
    // backend/scripts/generate-review-sample.mjs for the same root cause.
    const kbEntries = [];
    const KB_PAGE_SIZE = 1000;
    for (let from = 0; ; from += KB_PAGE_SIZE) {
      const { data: page, error: kbeErr } = await supabase
        .from('kb_entries')
        .select('status, trade_id, created_by')
        .range(from, from + KB_PAGE_SIZE - 1);
      if (kbeErr) throw new Error(kbeErr.message);
      kbEntries.push(...page);
      if (page.length < KB_PAGE_SIZE) break;
    }
    const kbStatusCounts = {};
    kbEntries.forEach((e) => { kbStatusCounts[e.status] = (kbStatusCounts[e.status] || 0) + 1; });
    const approvedByTrade = {};
    kbEntries.filter((e) => e.status === 'approved').forEach((e) => { approvedByTrade[e.trade_id] = (approvedByTrade[e.trade_id] || 0) + 1; });
    const tradeContentCoverage = kbTrades.map((t) => ({ slug: t.slug, name: t.name, approved_facts: approvedByTrade[t.id] || 0 }));
    // Contractor submissions specifically (created_by is only ever set on a
    // contractor-submitted row — the bulk CSV importer never sets it).
    const contractorSubmissions = kbEntries.filter((e) => e.created_by);
    const pendingSubmissionCount = contractorSubmissions.filter((e) => e.status === 'pending').length;

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        contractors: { total: contractors.length, by_status: statusCounts, missing_status: missingStatus },
        technicians: { total: techs.length, active: activeTechs },
        jobs: { total: jobs.length, by_status: jobStatusCounts },
        revenue,
        compliance_expiring: expiring,
        kb: {
          by_status: kbStatusCounts,
          trade_content_coverage: tradeContentCoverage,
          contractor_submissions_total: contractorSubmissions.length,
          contractor_submissions_pending: pendingSubmissionCount,
        },
      }),
    };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') || err.message.includes('Blocked') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
