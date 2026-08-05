// backend/functions/list-technicians/index.js
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  try {
    // Only owner_admin has a contractor_users row in the current role model
    // (see backend/sql/006_technicians_fix_identity.sql) — technicians log
    // into their mobile app via a separate phone-based Auth identity and
    // never get web dashboard access.
    const contractorUser = await requireContractorRole(event, ['owner_admin']);

    const supabase = await getSupabaseClient();

    const { data: technicians, error } = await supabase
      .from('technicians')
      .select('id, full_name, email, mobile_phone, role, certifications, hourly_rate, billable_rate, invite_status, last_active_ts, created_at, password_changed')
      .eq('contractor_id', contractorUser.contractor_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ technicians: technicians || [] }),
    };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
