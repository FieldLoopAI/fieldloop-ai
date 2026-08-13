// backend/functions/list-invoices/index.js
// POST /invoices/list — real data for Panel 7 "Invoices & payments".
// invoices has no contractor_id column of its own (verified live via
// probe-insert) — tenant isolation flows through job_id -> jobs.contractor_id,
// same two-query pattern list-jobs/index.js already uses for customers.
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin']);
    const supabase = await getSupabaseClient();

    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('id, job_id_public, description, job_type, trade_category, customers ( household_name, primary_phone )')
      .eq('contractor_id', contractorUser.contractor_id);
    if (jobsError) throw new Error(jobsError.message);

    const jobsById = Object.fromEntries((jobs || []).map((j) => [j.id, j]));
    const jobIds = Object.keys(jobsById);
    if (jobIds.length === 0) {
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ invoices: [] }) };
    }

    const { data: invoices, error: invError } = await supabase
      .from('invoices')
      .select('*')
      .in('job_id', jobIds)
      .order('created_at', { ascending: false });
    if (invError) throw new Error(invError.message);

    // invoices has no status column (verified live) — same recurring pattern
    // as the timestamp-backed "status" columns documented in HANDOFF.md §3:
    // derive it from invoice_number / paid_ts instead of trusting an enum.
    const enriched = (invoices || []).map((inv) => ({
      ...inv,
      job: jobsById[inv.job_id] || null,
      status: inv.paid_ts ? 'paid' : inv.invoice_number ? 'invoiced' : 'draft',
    }));

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ invoices: enriched }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
