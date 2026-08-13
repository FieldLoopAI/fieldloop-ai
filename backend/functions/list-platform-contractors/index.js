// backend/functions/list-platform-contractors/index.js
// POST /platform/contractors — admin-only, full contractor roster across the
// whole platform (unlike list-contractors, which is a 50-row name-search
// picker for staff loading ONE contractor into the registration wizard).
// Returns every contractor with its status, trade, and real usage counts
// (jobs, technicians) in one round trip.
const { requireRole } = require('./shared/auth');
const { getSupabaseClient } = require('./shared/supabaseClient');
const { enforceIpAllowlist } = require('./shared/ipAllowlist');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  try {
    const flUser = await requireRole(event, ['admin']);
    await enforceIpAllowlist(event, flUser);
    const supabase = await getSupabaseClient();

    const { data: contractors, error: cErr } = await supabase
      .from('contractors')
      .select('id, legal_name, contractor_id_public, is_sandbox, created_at')
      .order('legal_name');
    if (cErr) throw new Error(cErr.message);

    const { data: metaRows, error: mErr } = await supabase
      .from('contractor_system_meta').select('contractor_id, status, onboarded_at, activated_at, next_credential_review');
    if (mErr) throw new Error(mErr.message);
    const metaByContractor = Object.fromEntries(metaRows.map((m) => [m.contractor_id, m]));

    const { data: ops, error: oErr } = await supabase
      .from('contractor_operations').select('contractor_id, primary_trade, technician_count');
    if (oErr) throw new Error(oErr.message);
    const opsByContractor = Object.fromEntries(ops.map((o) => [o.contractor_id, o]));

    const { data: jobs, error: jErr } = await supabase.from('jobs').select('contractor_id, status');
    if (jErr) throw new Error(jErr.message);
    const jobCountByContractor = {};
    jobs.forEach((j) => { jobCountByContractor[j.contractor_id] = (jobCountByContractor[j.contractor_id] || 0) + 1; });

    const { data: techs, error: tErr } = await supabase.from('technicians').select('contractor_id, is_active');
    if (tErr) throw new Error(tErr.message);
    const techCountByContractor = {};
    techs.filter((t) => t.is_active).forEach((t) => { techCountByContractor[t.contractor_id] = (techCountByContractor[t.contractor_id] || 0) + 1; });

    const enriched = contractors.map((c) => ({
      ...c,
      status: metaByContractor[c.id]?.status || null,
      onboarded_at: metaByContractor[c.id]?.onboarded_at || null,
      activated_at: metaByContractor[c.id]?.activated_at || null,
      primary_trade: opsByContractor[c.id]?.primary_trade || null,
      job_count: jobCountByContractor[c.id] || 0,
      active_technician_count: techCountByContractor[c.id] || 0,
    }));

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ contractors: enriched }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') || err.message.includes('Blocked') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
