const { getSupabaseClient } = require('./supabaseClient');

// Contractor-side equivalent of requireRole (which checks fl_users for staff).
// Validates the Supabase JWT and looks up the caller's contractor_users row.
// Returns { id, contractor_id, role, email }.
async function requireContractorRole(event, allowedRoles) {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  if (!authHeader) throw new Error('No authorization header');
  const token = authHeader.replace('Bearer ', '');

  const supabase = await getSupabaseClient();
  const { data: userData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !userData?.user) throw new Error('Invalid session');

  const { data: contractorUser, error: lookupError } = await supabase
    .from('contractor_users')
    .select('id, contractor_id, role, email, is_active')
    .eq('auth_user_id', userData.user.id)
    .single();

  if (lookupError || !contractorUser) {
    throw new Error('No contractor_users record for this session');
  }

  // is_active defaults to true for every pre-existing row (015 migration) —
  // undefined here just means the migration hasn't run yet in this
  // environment, so don't treat a missing column as "removed."
  if (contractorUser.is_active === false) {
    throw new Error('This account has been removed and no longer has access.');
  }

  if (!allowedRoles.includes(contractorUser.role)) {
    throw new Error(`Role '${contractorUser.role}' is not permitted for this action`);
  }

  return contractorUser;
}

module.exports = { requireContractorRole };
