// backend/functions/list-contractors/index.js
const { requireRole } = require('./shared/auth');
const { getSupabaseClient } = require('./shared/supabaseClient');
const { enforceIpAllowlist } = require('./shared/ipAllowlist');

exports.handler = async (event) => {
  try {
    const flUser = await requireRole(event, ['admin', 'onboarding', 'finance', 'support', 'jenex_dev']);
    await enforceIpAllowlist(event, flUser);
    const { query } = JSON.parse(event.body || '{}');
    const supabase = await getSupabaseClient();

    let q = supabase
      .from('contractors')
      .select('id, legal_name, contractor_id_public, is_sandbox')
      .order('legal_name')
      .limit(50);

    // Jenex Developer accounts are sandbox-only, same restriction as get-contractor.
    if (flUser.role === 'jenex_dev') q = q.eq('is_sandbox', true);
    if (query) q = q.ilike('legal_name', `%${query}%`);

    const { data, error } = await q;
    if (error) throw error;

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ contractors: data }),
    };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
