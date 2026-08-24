// backend/functions/list-estimates/index.js
// POST /estimates/list — real data for Panel 2 "Approvals queue".
// estimates_and_change_orders has no contractor_id of its own (same shape as
// invoices) — tenant isolation flows through job_id -> jobs.contractor_id.
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin', 'dispatcher', 'bookkeeper', 'field_lead']);
    const supabase = await getSupabaseClient();

    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('id, job_id_public, description, job_type, trade_category, customers ( household_name, primary_phone )')
      .eq('contractor_id', contractorUser.contractor_id);
    if (jobsError) throw new Error(jobsError.message);

    const jobsById = Object.fromEntries((jobs || []).map((j) => [j.id, j]));
    const jobIds = Object.keys(jobsById);
    if (jobIds.length === 0) {
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ estimates: [] }) };
    }

    const { data: estimates, error: estError } = await supabase
      .from('estimates_and_change_orders')
      .select('*')
      .in('job_id', jobIds)
      .order('created_at', { ascending: false });
    if (estError) throw new Error(estError.message);

    const enriched = (estimates || []).map((e) => ({ ...e, job: jobsById[e.job_id] || null }));

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ estimates: enriched }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
