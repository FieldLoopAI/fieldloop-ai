// backend/functions/remove-team-member/index.js
//
// Soft-delete only, mirroring deactivate-technician's exact pattern (§16):
// sets is_active=false and bans the Supabase Auth account (revokes login
// immediately, keeps auth_user_id intact so historic audit-log rows stay
// attributable, reversible later if reactivation is ever built). Refuses
// self-removal and removing the company's last Owner/Admin, per the spec's
// explicit rules (§13).
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin']);
    const body = JSON.parse(event.body);
    const { contractor_user_id } = body;

    if (!contractor_user_id) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'contractor_user_id is required.' }) };
    }
    if (contractor_user_id === contractorUser.id) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'You cannot remove your own account.' }) };
    }

    const supabase = await getSupabaseClient();

    const { data: member } = await supabase
      .from('contractor_users')
      .select('id, contractor_id, role, auth_user_id, is_active')
      .eq('id', contractor_user_id)
      .eq('contractor_id', contractorUser.contractor_id)
      .maybeSingle();

    if (!member || !member.is_active) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Team member not found for your company.' }) };
    }

    if (member.role === 'owner_admin') {
      const { count } = await supabase
        .from('contractor_users')
        .select('id', { count: 'exact', head: true })
        .eq('contractor_id', contractorUser.contractor_id)
        .eq('role', 'owner_admin')
        .eq('is_active', true);
      if ((count || 0) <= 1) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Cannot remove this member — your company must have at least one Owner/Admin.' }) };
      }
    }

    const { error: removeError } = await supabase
      .from('contractor_users')
      .update({ is_active: false })
      .eq('id', contractor_user_id);
    if (removeError) throw new Error(`Failed to remove team member: ${removeError.message}`);

    const { error: banError } = await supabase.auth.admin.updateUserById(member.auth_user_id, { ban_duration: '876000h' });
    if (banError) throw new Error(`Failed to revoke team member login: ${banError.message}`);

    try {
      await supabase.from('access_audit_log').insert({
        user_id: contractorUser.id,
        contractor_id: contractorUser.contractor_id,
        action: 'delete',
        field_accessed: 'team_member_account',
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
