// backend/functions/create-kb-entry/index.js
const { requireRole } = require('./shared/auth');
const { getSupabaseClient } = require('./shared/supabaseClient');

exports.handler = async (event) => {
  try {
    const flUser = await requireRole(event, ['admin', 'onboarding']);
    const { trade, category, topic, answer, source_type, jurisdiction_dependent } = JSON.parse(event.body || '{}');

    if (!trade || !category || !topic || !answer || !source_type) {
      throw new Error('trade, category, topic, answer, and source_type are all required.');
    }

    const supabase = await getSupabaseClient();

    const { data, error } = await supabase
      .from('estimate_knowledge_base')
      .insert({
        trade,
        category,
        topic,
        answer,
        source_type,
        jurisdiction_dependent: Boolean(jurisdiction_dependent),
        status: 'pending',
        created_by: flUser.id,
      })
      .select()
      .single();
    if (error) throw error;

    await supabase.from('access_audit_log').insert({
      user_id: flUser.id,
      contractor_id: null,
      action: 'update',
      field_accessed: `estimate_knowledge_base:${data.id}`,
      ip_address: event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || null,
      user_agent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
    });

    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(data) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
