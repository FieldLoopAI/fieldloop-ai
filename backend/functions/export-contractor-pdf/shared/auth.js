const { getSupabaseClient } = require('./supabaseClient');

// Verifies the Supabase JWT sent by the React app and looks up the
// caller's role in fl_users. Throws if the token is invalid or the
// caller has no fl_users row.
async function requireRole(event, allowedRoles) {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  if (!authHeader) throw new Error('No authorization header');
  const token = authHeader.replace('Bearer ', '');

  const supabase = await getSupabaseClient();
  const { data: userData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !userData?.user) throw new Error('Invalid session');

  const { data: flUser, error: roleError } = await supabase
    .from('fl_users')
    .select('id, role')
    .eq('auth_user_id', userData.user.id)
    .single();
  if (roleError || !flUser) throw new Error('No fl_users record for this session');

  if (!allowedRoles.includes(flUser.role)) {
    throw new Error(`Role '${flUser.role}' is not permitted for this action`);
  }
  return { ...flUser, email: userData.user.email }; // { id, role, email } — use flUser.id for audit logging
}

module.exports = { requireRole };