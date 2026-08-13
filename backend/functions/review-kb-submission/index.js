// backend/functions/review-kb-submission/index.js
// POST /kb/admin/review — admin-only. Approves or rejects a single
// contractor-submitted KB fact by id — the real-UI equivalent of running
// backend/scripts/approve-kb-entries.mjs / reject-kb-entries.mjs by hand,
// scoped to one entry instead of a whole import_batch (finer-grained, which
// matters here since each contractor submission already gets its own
// unique import_batch — see submit-kb-entry/index.js). Only ever acts on a
// row that's actually a contractor submission (created_by set) and
// currently pending — approving/rejecting the original 500-fact import or
// an already-decided row would be a real mistake, not a hypothetical one.
const { requireRole } = require('./shared/auth');
const { getSupabaseClient } = require('./shared/supabaseClient');
const { enforceIpAllowlist } = require('./shared/ipAllowlist');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };
const VALID_ACTIONS = ['approve', 'reject'];

exports.handler = async (event) => {
  try {
    const flUser = await requireRole(event, ['admin']);
    await enforceIpAllowlist(event, flUser);
    const body = JSON.parse(event.body || '{}');
    const { entry_id, action } = body;

    if (!entry_id || !VALID_ACTIONS.includes(action)) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: `entry_id and a valid action (${VALID_ACTIONS.join(', ')}) are required.` }) };
    }

    const supabase = await getSupabaseClient();

    const { data: entry } = await supabase
      .from('kb_entries').select('id, status, created_by').eq('id', entry_id).maybeSingle();
    if (!entry) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Entry not found.' }) };
    }
    if (!entry.created_by) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'This entry is not a contractor submission — review it via the import/approve scripts instead.' }) };
    }
    if (entry.status !== 'pending') {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: `This entry is already '${entry.status}', not pending.` }) };
    }

    const { data: updated, error } = await supabase
      .from('kb_entries')
      .update({ status: action === 'approve' ? 'approved' : 'rejected', reviewed_by: flUser.id, reviewed_at: new Date().toISOString() })
      .eq('id', entry_id)
      .select('id, status')
      .single();
    if (error) throw new Error(error.message);

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, entry: updated }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') || err.message.includes('Blocked') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
