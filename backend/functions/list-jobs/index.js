// backend/functions/list-jobs/index.js
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

// Terminal statuses are mobile-app-owned beats past dispatch — a job in one
// of these can't collide with anything a dispatcher is actively scheduling.
const TERMINAL_STATUSES = ['complete', 'closed', 'invoiced', 'paid'];

// Conflict detection lives here (the read path) rather than duplicated into
// create-job/assign-job's write paths: it's recomputed fresh on every board
// load from whatever's actually in the DB, so it can never drift out of sync
// with reality, and a badge survives a page reload instead of being a
// one-shot toast that disappears the moment the create/assign modal closes.
function annotateConflicts(jobs) {
  const flagged = new Map();
  for (let i = 0; i < jobs.length; i++) {
    for (let j = i + 1; j < jobs.length; j++) {
      const a = jobs[i];
      const b = jobs[j];
      if (!a.lead_technician_id || a.lead_technician_id !== b.lead_technician_id) continue;
      if (!a.scheduled_start || !a.scheduled_end || !b.scheduled_start || !b.scheduled_end) continue;
      if (TERMINAL_STATUSES.includes(a.status) || TERMINAL_STATUSES.includes(b.status)) continue;
      const aStart = new Date(a.scheduled_start).getTime();
      const aEnd = new Date(a.scheduled_end).getTime();
      const bStart = new Date(b.scheduled_start).getTime();
      const bEnd = new Date(b.scheduled_end).getTime();
      if (aStart < bEnd && aEnd > bStart) {
        if (!flagged.has(a.id)) flagged.set(a.id, []);
        if (!flagged.has(b.id)) flagged.set(b.id, []);
        flagged.get(a.id).push(b.job_id_public || b.id);
        flagged.get(b.id).push(a.job_id_public || a.id);
      }
    }
  }
  return jobs.map((j) => ({
    ...j,
    has_conflict: flagged.has(j.id),
    conflict_with: flagged.get(j.id) || [],
  }));
}

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin', 'dispatcher', 'bookkeeper', 'field_lead']);
    const body = event.body ? JSON.parse(event.body) : {};
    const { from, to } = body;

    if ((from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to)))) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid from/to date range.' }) };
    }

    const supabase = await getSupabaseClient();

    let query = supabase
      .from('jobs')
      .select(`
        id, job_id_public, job_type, trade_category, description, service_address,
        scheduled_start, scheduled_end, status, lead_technician_id, total_estimate,
        created_at,
        customers ( id, household_name, primary_contact_name, primary_phone ),
        technicians ( id, full_name )
      `)
      .eq('contractor_id', contractorUser.contractor_id)
      .order('scheduled_start', { ascending: true, nullsFirst: true });

    // Unscheduled (draft) jobs always come back regardless of the date
    // filter — a job with no time set must never silently vanish from the
    // board just because it falls outside "today".
    if (from && to) {
      query = query.or(`scheduled_start.is.null,and(scheduled_start.gte.${from},scheduled_start.lt.${to})`);
    }

    const { data: jobs, error: jobsError } = await query;
    if (jobsError) throw new Error(jobsError.message);

    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('id, household_name, primary_phone, service_address')
      .eq('contractor_id', contractorUser.contractor_id)
      .order('household_name')
      .limit(500);
    if (customersError) throw new Error(customersError.message);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        jobs: annotateConflicts(jobs || []),
        customers: customers || [],
      }),
    };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
