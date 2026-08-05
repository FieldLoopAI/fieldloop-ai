// backend/functions/get-system-settings/index.js
const { requireRole } = require('./shared/auth');
const { getSupabaseClient } = require('./shared/supabaseClient');

exports.handler = async (event) => {
  try {
    await requireRole(event, ['admin', 'onboarding', 'finance', 'support', 'jenex_dev']);
    const supabase = await getSupabaseClient();

    const { data, error } = await supabase.from('system_settings').select('*').eq('id', 1).single();
    if (error) throw error;

    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(data) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
