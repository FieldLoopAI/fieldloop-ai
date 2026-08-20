// backend/functions/list-audit-log/index.js
// POST /audit-log/list — real data for Panel 10's "View audit log" action.
// access_audit_log.user_id references fl_users(id) — this table records
// FieldLoop *staff* actions against a contractor's account (onboarding
// saves, admin terminations, PDF exports, etc.), not the contractor's own
// team activity — there's no audit trail for contractor-side writes today
// (add-technician's own audit-log insert is best-effort and, in practice,
// fails silently since it passes a contractor_users id where an fl_users id
// is expected — a known gap, see HANDOFF.md §12). Labeled honestly as
// "account activity" rather than "team activity" for that reason.
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin']);
    const supabase = await getSupabaseClient();

    const { data: rows, error } = await supabase
      .from('access_audit_log')
      .select('id, user_id, action, field_accessed, timestamp')
      .eq('contractor_id', contractorUser.contractor_id)
      .order('timestamp', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);

    const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
    let staffById = {};
    if (userIds.length > 0) {
      const { data: staff } = await supabase.from('fl_users').select('id, email, role').in('id', userIds);
      staffById = Object.fromEntries((staff || []).map((s) => [s.id, s]));
    }

    const entries = rows.map((r) => ({
      id: r.id,
      action: r.action,
      field_accessed: r.field_accessed,
      timestamp: r.timestamp,
      actor: r.user_id
        ? (staffById[r.user_id] ? `FieldLoop staff (${staffById[r.user_id].email})` : 'Unknown')
        : 'Automated process',
    }));

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ entries }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
