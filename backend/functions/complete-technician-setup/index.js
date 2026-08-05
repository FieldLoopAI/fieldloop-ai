// backend/functions/complete-technician-setup/index.js
//
// The one endpoint in this system NOT authenticated via requireRole/
// requireContractorRole — the technician has no working password yet (that
// is exactly what this call sets), so there is no JWT to check. Auth here
// is "possession of a valid, unexpired, unused setup token" instead. Called
// by the web fallback page (src/technician-setup/TechnicianSetupPage.jsx)
// today, and by the future Flutter mobile app once it exists — see the
// technician-onboarding plan's "mobile app contract" section for the exact
// request/response shape it was designed against.
const { getSupabaseClient } = require('./shared/supabaseClient');
const { hashToken } = require('./shared/technicianSetupTokens');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

// Single generic message for every "this link doesn't work" case — not
// found, expired, already used, or the technician was deactivated in the
// meantime. Deliberately never distinguishes which, so a second person who
// received an old/superseded SMS learns nothing about token state.
const INVALID_LINK_ERROR = 'This setup link is invalid or has expired.';

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const { token, new_password } = body;

    if (!token || !new_password) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'token and new_password are required.' }) };
    }
    // Agreed policy: 8+ characters, no complexity rule — technicians are
    // field workers typing on a phone, friction matters more here than
    // staff-grade complexity (see the technician-onboarding plan).
    if (new_password.length < 8) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Password must be at least 8 characters.' }) };
    }

    const supabase = await getSupabaseClient();
    const hash = hashToken(token);

    const { data: tokenRow } = await supabase
      .from('technician_setup_tokens')
      .select('id, technician_id, expires_at, used_at')
      .eq('token_hash', hash)
      .maybeSingle();

    if (!tokenRow || tokenRow.used_at || new Date(tokenRow.expires_at) < new Date()) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: INVALID_LINK_ERROR }) };
    }

    const { data: tech } = await supabase
      .from('technicians')
      .select('id, contractor_id, auth_user_id, is_active')
      .eq('id', tokenRow.technician_id)
      .maybeSingle();

    if (!tech || !tech.is_active) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: INVALID_LINK_ERROR }) };
    }

    // ---- Set the real password on the Auth account. If this fails, the
    // token is left completely untouched — safe for the technician to just
    // retry. ----
    const { error: authError } = await supabase.auth.admin.updateUserById(tech.auth_user_id, {
      password: new_password,
    });
    if (authError) throw new Error(authError.message);

    const { error: techError } = await supabase
      .from('technicians')
      .update({ password_changed: true, invite_status: 'active' })
      .eq('id', tech.id);
    if (techError) throw new Error(`Failed to finalize technician setup: ${techError.message}`);

    // Mark this token used, and invalidate every other outstanding token
    // for the same technician. This does NOT contradict resend leaving
    // prior tokens live — that rule is about issuance time, before anyone
    // has acted. This is about completion time: once a password is
    // actually set, a second person holding an older SMS must not be able
    // to walk in later and silently reset it again.
    await supabase.from('technician_setup_tokens')
      .update({ used_at: new Date().toISOString(), consumed_reason: 'completed' })
      .eq('id', tokenRow.id);
    await supabase.from('technician_setup_tokens')
      .update({ used_at: new Date().toISOString(), consumed_reason: 'superseded_by_sibling' })
      .eq('technician_id', tech.id)
      .is('used_at', null)
      .neq('id', tokenRow.id);

    // Best-effort audit log — no fl_users/contractor_users actor exists for
    // this self-service action (user_id intentionally omitted), matching
    // this codebase's existing tolerance for a best-effort insert that may
    // not satisfy every column's constraints.
    try {
      await supabase.from('access_audit_log').insert({
        contractor_id: tech.contractor_id,
        action: 'update',
        field_accessed: 'technician_setup_complete',
        ip_address: event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || null,
        user_agent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
      });
    } catch { /* best-effort */ }

    // Deliberately no session/JWT in the response — setting the password is
    // a distinct step from logging in. The caller must separately call
    // supabase.auth.signInWithPassword({ phone, password: new_password }),
    // exactly like any normal login.
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
