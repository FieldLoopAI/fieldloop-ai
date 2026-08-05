// backend/functions/save-contractor-draft/index.js
const { requireRole } = require('./shared/auth');
const { getSupabaseClient } = require('./shared/supabaseClient');
const { enforceIpAllowlist } = require('./shared/ipAllowlist');
const { saveContractorDraft } = require('./shared/contractorDraft');

function requestMeta(event) {
  return {
    ip: event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || null,
    userAgent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
  };
}

exports.handler = async (event) => {
  try {
    const flUser = await requireRole(event, ['admin', 'onboarding']);
    await enforceIpAllowlist(event, flUser);
    const { contractorId, ...payload } = JSON.parse(event.body);
    const supabase = await getSupabaseClient();

    await saveContractorDraft(supabase, contractorId, payload);

    const { ip, userAgent } = requestMeta(event);
    await supabase.from('access_audit_log').insert({
      user_id: flUser.id,
      contractor_id: contractorId,
      action: 'update',
      field_accessed: 'contractor_draft_save',
      ip_address: ip,
      user_agent: userAgent,
    });

    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
