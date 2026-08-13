// backend/functions/get-platform-contractor-usage/index.js
// POST /platform/contractors/usage — admin-only. Real operational data for
// ONE contractor (jobs, technicians, invoices, estimates, KB submissions) —
// the piece get-contractor doesn't cover (that Lambda returns profile/
// compliance/financials/meta/audit-log only). Powers the "Usage" section of
// the Platform Overview's contractor drill-down (HANDOFF.md §25).
const { requireRole } = require('./shared/auth');
const { getSupabaseClient } = require('./shared/supabaseClient');
const { enforceIpAllowlist } = require('./shared/ipAllowlist');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  try {
    const flUser = await requireRole(event, ['admin']);
    await enforceIpAllowlist(event, flUser);
    const { contractorId } = JSON.parse(event.body || '{}');
    if (!contractorId) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'contractorId is required.' }) };
    }

    const supabase = await getSupabaseClient();

    const { data: contractor } = await supabase.from('contractors').select('id').eq('id', contractorId).maybeSingle();
    if (!contractor) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Contractor not found.' }) };
    }

    const { data: jobs, error: jErr } = await supabase
      .from('jobs')
      .select('id, job_id_public, job_type, trade_category, description, status, scheduled_start, created_at, customers ( household_name )')
      .eq('contractor_id', contractorId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (jErr) throw new Error(jErr.message);

    const { data: technicians, error: tErr } = await supabase
      .from('technicians')
      .select('id, full_name, role, mobile_phone, is_active, invite_status, created_at')
      .eq('contractor_id', contractorId)
      .order('full_name');
    if (tErr) throw new Error(tErr.message);

    const jobIds = jobs.map((j) => j.id);
    let invoices = [];
    let estimates = [];
    if (jobIds.length) {
      const { data: invRows, error: iErr } = await supabase
        .from('invoices').select('id, invoice_number, job_id, total, platform_fee, paid_ts, created_at').in('job_id', jobIds);
      if (iErr) throw new Error(iErr.message);
      invoices = invRows;

      const { data: estRows, error: eErr } = await supabase
        .from('estimates_and_change_orders').select('id, job_id, doc_type, tier_good, tier_better, tier_best, status, created_at').in('job_id', jobIds);
      if (eErr) throw new Error(eErr.message);
      estimates = estRows;
    }

    // KB submissions from this contractor's own users (created_by ->
    // contractor_users.id -> contractor_id), same lookup shape as
    // list-kb-submissions-admin.
    const { data: contractorUsers } = await supabase.from('contractor_users').select('id').eq('contractor_id', contractorId);
    const userIds = (contractorUsers || []).map((u) => u.id);
    let kbSubmissions = [];
    if (userIds.length) {
      const { data: kbRows, error: kErr } = await supabase
        .from('kb_entries')
        .select('id, fact_title, status, created_at, kb_trades ( name )')
        .in('created_by', userIds)
        .order('created_at', { ascending: false });
      if (kErr) throw new Error(kErr.message);
      kbSubmissions = kbRows;
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ jobs, technicians, invoices, estimates, kb_submissions: kbSubmissions }),
    };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') || err.message.includes('Blocked') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
