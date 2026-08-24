// backend/functions/list-customers/index.js
// POST /customers/list — real data for Panel 5 "Customer database". Unlike
// list-jobs's customers array (which only returns customers referenced by a
// job, in the same round trip as the dispatch board), this returns every
// customer for the contractor, including ones with zero jobs yet — the
// mock UI's own sample data showed exactly that case ("0, est. pending").
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };
// Beats past dispatch (§12) — a job in one of these is done, not "active".
const ACTIVE_JOB_STATUSES = ['draft', 'scheduled', 'en_route', 'on_site'];

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin', 'dispatcher', 'bookkeeper', 'field_lead']);
    const supabase = await getSupabaseClient();

    const { data: customers, error } = await supabase
      .from('customers')
      .select('id, household_name, primary_contact_name, primary_phone, secondary_phone, email, service_address, billing_address, preferred_contact, lifetime_value, notes, created_at')
      .eq('contractor_id', contractorUser.contractor_id)
      .order('household_name');
    if (error) throw new Error(error.message);

    const { data: jobs, error: jErr } = await supabase
      .from('jobs').select('customer_id, status').eq('contractor_id', contractorUser.contractor_id);
    if (jErr) throw new Error(jErr.message);

    const jobCountByCustomer = {};
    const activeJobCountByCustomer = {};
    jobs.forEach((j) => {
      jobCountByCustomer[j.customer_id] = (jobCountByCustomer[j.customer_id] || 0) + 1;
      if (ACTIVE_JOB_STATUSES.includes(j.status)) {
        activeJobCountByCustomer[j.customer_id] = (activeJobCountByCustomer[j.customer_id] || 0) + 1;
      }
    });

    const enriched = customers.map((c) => ({
      ...c,
      job_count: jobCountByCustomer[c.id] || 0,
      active_job_count: activeJobCountByCustomer[c.id] || 0,
    }));

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ customers: enriched }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
