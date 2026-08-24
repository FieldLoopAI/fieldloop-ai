// backend/functions/list-team/index.js
// POST /team/list — real data for Panel 10 "Team & access". contractor_users
// still only ever has role 'owner_admin' — migration 015 added invite/
// remove plumbing (is_active, password_changed, team_setup_tokens) but
// deliberately left the single-role CHECK constraint (006) untouched; see
// 015's header comment and HANDOFF.md §34 for the full multi-role RBAC
// deferral. This returns every active row for the contractor (in practice:
// one or a few owner_admins).
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin']);
    const supabase = await getSupabaseClient();

    const { data: team, error } = await supabase
      .from('contractor_users')
      .select('id, email, role, is_designated_admin, mfa_enabled, last_login_at, password_changed, created_at')
      .eq('contractor_id', contractorUser.contractor_id)
      .eq('is_active', true)
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
