// backend/functions/complete-team-setup/index.js
//
// Unauthenticated, token-based — mirrors complete-technician-setup exactly
// (§18). The invitee has no working password yet (that's what this call
// sets), so there's no JWT to check; possession of the 256-bit setup token
// is the entire auth model, same as the technician flow. Link-only (no
// short-code path) — that existed for the technician mobile app's in-app
// entry, which has no equivalent here.
const { getSupabaseClient } = require('./shared/supabaseClient');
const { hashToken } = require('./shared/teamSetupTokens');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

// Single generic message for every failure case — never distinguishes
// not-found/expired/used/removed, same reasoning as
// complete-technician-setup's INVALID_SETUP_ERROR.
const INVALID_SETUP_ERROR = 'This setup link is invalid or has expired.';

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const { token, new_password } = body;

    if (!token) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'token is required.' }) };
    }
    if (!new_password) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'new_password is required.' }) };
    }
    if (new_password.length < 8) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Password must be at least 8 characters.' }) };
    }

    const supabase = await getSupabaseClient();
    const hash = hashToken(token);

    const { data: tokenRow } = await supabase
      .from('team_setup_tokens')
      .select('id, contractor_user_id, expires_at, used_at')
      .eq('token_hash', hash)
      .maybeSingle();

    if (!tokenRow || tokenRow.used_at || new Date(tokenRow.expires_at) < new Date()) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: INVALID_SETUP_ERROR }) };
    }

    const { data: member } = await supabase
      .from('contractor_users')
      .select('id, contractor_id, auth_user_id, is_active')
      .eq('id', tokenRow.contractor_user_id)
      .maybeSingle();

    if (!member || member.is_active === false) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: INVALID_SETUP_ERROR }) };
    }

    const { error: authError } = await supabase.auth.admin.updateUserById(member.auth_user_id, { password: new_password });
    if (authError) throw new Error(authError.message);

    const { error: memberError } = await supabase
      .from('contractor_users')
      .update({ password_changed: true })
      .eq('id', member.id);
    if (memberError) throw new Error(`Failed to finalize team setup: ${memberError.message}`);

    await supabase.from('team_setup_tokens')
      .update({ used_at: new Date().toISOString(), consumed_reason: 'completed' })
      .eq('id', tokenRow.id);
    await supabase.from('team_setup_tokens')
      .update({ used_at: new Date().toISOString(), consumed_reason: 'superseded_by_sibling' })
      .eq('contractor_user_id', member.id)
      .is('used_at', null)
      .neq('id', tokenRow.id);

    try {
      await supabase.from('access_audit_log').insert({
        contractor_id: member.contractor_id,
        action: 'update',
        field_accessed: 'team_setup_complete',
        ip_address: event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || null,
        user_agent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
      });
    } catch { /* best-effort */ }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
