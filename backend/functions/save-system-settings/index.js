// backend/functions/save-system-settings/index.js
const { requireRole } = require('./shared/auth');
const { getSupabaseClient } = require('./shared/supabaseClient');

exports.handler = async (event) => {
  try {
    const flUser = await requireRole(event, ['admin']);
    const body = JSON.parse(event.body);
    const supabase = await getSupabaseClient();

    const {
      password_min_length, password_complexity, password_rotation_days,
      mfa_required_roles, session_timeout_minutes, session_max_hours, ip_allowlist_enabled,
    } = body;

    // The dashboard's own input clamps this to [8, 64], but that's
    // client-side only — enforce the same bound here so a direct API call
    // (or a client bug) can't silently weaken the platform-wide password
    // policy.
    if (
      password_min_length !== undefined &&
      (!Number.isInteger(password_min_length) || password_min_length < 8 || password_min_length > 64)
    ) {
      throw new Error('Password minimum length must be a whole number between 8 and 64.');
    }

    const { data, error } = await supabase.from('system_settings').update({
      password_min_length, password_complexity, password_rotation_days,
      mfa_required_roles, session_timeout_minutes, session_max_hours, ip_allowlist_enabled,
    }).eq('id', 1).select().single();
    if (error) throw error;

    await supabase.from('access_audit_log').insert({
      user_id: flUser.id,
      contractor_id: null,
      action: 'update',
      field_accessed: 'system_settings',
      ip_address: event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || null,
      user_agent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
    });

    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(data) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
