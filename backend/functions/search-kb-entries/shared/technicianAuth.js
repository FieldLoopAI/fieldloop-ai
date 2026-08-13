const { getSupabaseClient } = require('./supabaseClient');

// Technician-side equivalent of requireRole (fl_users, staff) and
// requireContractorRole (contractor_users, dashboard). Validates the
// Supabase JWT and looks up the caller's own technicians row. Technicians
// have no role column to gate on (unlike fl_users/contractor_users) — the
// only real "is this account allowed to act" check is is_active, since a
// deactivated technician's Auth account is banned but a currently-live
// session could theoretically still hold a token minted before that.
async function requireTechnicianAuth(event) {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  if (!authHeader) throw new Error('No authorization header');
  const token = authHeader.replace('Bearer ', '');

  const supabase = await getSupabaseClient();
  const { data: userData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !userData?.user) throw new Error('Invalid session');

  const { data: technician, error: lookupError } = await supabase
    .from('technicians')
    .select('id, contractor_id, full_name, mobile_phone, is_active')
    .eq('auth_user_id', userData.user.id)
    .single();

  if (lookupError || !technician) {
    throw new Error('No technicians record for this session');
  }
  if (!technician.is_active) {
    throw new Error('This technician account is not permitted for this action');
  }

  const { is_active: _is_active, ...rest } = technician;
  return rest; // { id, contractor_id, full_name, mobile_phone }
}

module.exports = { requireTechnicianAuth };
