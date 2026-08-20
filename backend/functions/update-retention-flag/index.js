// backend/functions/update-retention-flag/index.js
// POST /retention/update — backs the Retention queue's real Pause/Resume
// action. Only ever toggles `paused` inside customers.retention_flags —
// never touches the *_sent flags, since nothing in this repo actually sends
// a follow-up yet (see list-retention-queue/index.js's header).
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin']);
    const body = JSON.parse(event.body || '{}');
    const { customer_id, paused } = body;

    if (!customer_id || typeof paused !== 'boolean') {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'customer_id and a boolean paused are required.' }) };
    }

    const supabase = await getSupabaseClient();

    const { data: customer } = await supabase
      .from('customers').select('id, retention_flags')
      .eq('id', customer_id).eq('contractor_id', contractorUser.contractor_id).maybeSingle();
    if (!customer) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Customer not found for your company.' }) };
    }

    const { error } = await supabase
      .from('customers')
      .update({ retention_flags: { ...(customer.retention_flags || {}), paused } })
      .eq('id', customer_id);
    if (error) throw new Error(error.message);

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
