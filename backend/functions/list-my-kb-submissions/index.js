// backend/functions/list-my-kb-submissions/index.js
// POST /kb/my-submissions — lets a contractor see the review status of
// facts they've submitted via submit-kb-entry (pending/approved/rejected).
// Without this, a submission disappears into a queue with no feedback loop.
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin']);
    const supabase = await getSupabaseClient();

    const { data: entries, error } = await supabase
      .from('kb_entries')
      .select('id, fact_title, fact, status, import_batch, created_at, reviewed_at, kb_trades ( name ), kb_categories ( name )')
      .eq('created_by', contractorUser.id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ entries: entries || [] }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
