// backend/functions/update-team-member/index.js
//
// Changes a team member's role. Owner/Admin only, per the spec's explicit
// "only Owner/Admin can add, remove, or change roles for other team
// members" mandate (FieldLoop_Contractor_Command_Dashboard_SPEC.md §13).
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };
// Single admin role only for now — see invite-team-member's header comment.
const VALID_ROLES = ['owner_admin'];

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin']);
    const body = JSON.parse(event.body);
    const { contractor_user_id, role } = body;

    if (!contractor_user_id) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'contractor_user_id is required.' }) };
    }
    if (!role || !VALID_ROLES.includes(role)) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: `Role must be one of: ${VALID_ROLES.join(', ')}.` }) };
    }

    const supabase = await getSupabaseClient();

    const { data: member } = await supabase
      .from('contractor_users')
      .select('id, role, is_active')
      .eq('id', contractor_user_id)
      .eq('contractor_id', contractorUser.contractor_id)
      .maybeSingle();

    if (!member || member.is_active === false) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Team member not found for your company.' }) };
    }

    // Refuse demoting the company's only owner_admin — that would leave no
    // one able to manage the team, approve estimates, etc.
    if (member.role === 'owner_admin' && role !== 'owner_admin') {
      const { count } = await supabase
        .from('contractor_users')
        .select('id', { count: 'exact', head: true })
        .eq('contractor_id', contractorUser.contractor_id)
        .eq('role', 'owner_admin')
        .eq('is_active', true);
      if ((count || 0) <= 1) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Cannot change this role — your company must have at least one Owner/Admin.' }) };
      }
    }

    const { error: updateError } = await supabase
      .from('contractor_users')
      .update({ role })
      .eq('id', contractor_user_id);
    if (updateError) throw new Error(`Failed to update role: ${updateError.message}`);

    try {
      await supabase.from('access_audit_log').insert({
        user_id: contractorUser.id,
        contractor_id: contractorUser.contractor_id,
        action: 'update',
        field_accessed: 'team_member_role',
        ip_address: event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || null,
        user_agent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
      });
    } catch { /* best-effort */ }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
