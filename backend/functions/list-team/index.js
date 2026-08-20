// backend/functions/list-team/index.js
// POST /team/list — real data for Panel 10 "Team & access". contractor_users
// currently only ever has role 'owner_admin' — migration 006 deliberately
// narrowed the CHECK constraint to that single value (HANDOFF.md §10 Round 5)
// after the original mock UI's dispatcher/bookkeeper/field_lead roles turned
// out to be guessed, not verified. This just returns whatever real rows
// exist for the contractor today (in practice: one or a few owner_admins) —
// a full multi-role team system is future work, not built here.
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin']);
    const supabase = await getSupabaseClient();

    const { data: team, error } = await supabase
      .from('contractor_users')
      .select('id, email, role, is_designated_admin, mfa_enabled, last_login_at, created_at')
      .eq('contractor_id', contractorUser.contractor_id)
      .order('created_at');
    if (error) throw new Error(error.message);

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ team }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
