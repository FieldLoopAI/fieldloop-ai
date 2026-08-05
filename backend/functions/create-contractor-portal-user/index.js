// backend/functions/create-contractor-portal-user/index.js
const { requireRole } = require('./shared/auth');
const { getSupabaseClient } = require('./shared/supabaseClient');

exports.handler = async (event) => {
  try {
    const flUser = await requireRole(event, ['admin', 'onboarding']);
    const { contractorId, userId, password } = JSON.parse(event.body);
    const supabase = await getSupabaseClient();

    // Creates the real Supabase Auth account for the contractor's portal
    // login — this needs the service-role client (admin API), which is why
    // it can't just be a direct Supabase call from the browser.
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: userId,
      password,
      email_confirm: true,
    });
    if (authError) throw new Error(authError.message);

    // password_hash is a NOT NULL legacy column from before this was wired
    // to real Supabase Auth — it's never read anywhere (auth_user_id is the
    // real credential link), so a placeholder satisfies the constraint.
    // invited_by references another contractor_users row (a teammate who
    // sent the invite), not the fl_users staff member creating this first
    // account — left null since there's no inviting teammate yet.
    const { error: insertError } = await supabase.from('contractor_users').insert({
      contractor_id: contractorId,
      email: userId,
      password_hash: 'unused-supabase-auth-is-source-of-truth',
      role: 'owner_admin',
      is_designated_admin: true,
      mfa_enabled: false,
      auth_user_id: authUser.user.id,
    });
    if (insertError) throw insertError;

    await supabase.from('access_audit_log').insert({
      user_id: flUser.id,
      contractor_id: contractorId,
      action: 'create',
      field_accessed: 'contractor_dashboard_credentials',
      ip_address: event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || null,
      user_agent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
    });

    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
