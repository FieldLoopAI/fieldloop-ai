// backend/functions/list-kb-entries/index.js
const { requireRole } = require('./shared/auth');
const { getSupabaseClient } = require('./shared/supabaseClient');

exports.handler = async (event) => {
  try {
    await requireRole(event, ['admin', 'onboarding', 'finance', 'support', 'jenex_dev']);
    const { trade, status } = JSON.parse(event.body || '{}');
    const supabase = await getSupabaseClient();

    let q = supabase
      .from('estimate_knowledge_base')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (trade) q = q.eq('trade', trade);
    if (status) q = q.eq('status', status);

    const { data, error } = await q;
    if (error) throw error;

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ entries: data }),
    };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
