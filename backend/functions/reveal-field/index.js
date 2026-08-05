// backend/functions/reveal-field/index.js
const { requireRole } = require('./shared/auth');
const { getSupabaseClient } = require('./shared/supabaseClient');
const { getSecret } = require('./shared/secrets');
const { enforceIpAllowlist } = require('./shared/ipAllowlist');

// Per-field role matrix ported from mockDb.checkRoleAccess — the outer
// requireRole() below only proves the caller is *some* fl_user; this is
// what actually decides whether their role may see this specific field.
function checkFieldReveal(role, tableName, columnName) {
  if (tableName === 'contractor_principals') {
    if (!['admin', 'onboarding'].includes(role)) {
      throw new Error(`Role '${role}' does not have permission to view Principal Owner PII.`);
    }
  } else if (tableName === 'contractors' && columnName === 'ein_ref') {
    if (!['admin', 'onboarding'].includes(role)) {
      throw new Error(`Role '${role}' does not have permission to view the Business Tax EIN.`);
    }
  } else if (tableName === 'contractor_financials') {
    if (columnName.includes('stripe')) {
      if (role !== 'admin') throw new Error(`Role '${role}' does not have permission to view Stripe account IDs.`);
    } else if (!['admin', 'onboarding', 'finance'].includes(role)) {
      throw new Error(`Role '${role}' does not have permission to view bank or routing data.`);
    }
  } else {
    throw new Error('Invalid request field for reveal.');
  }
}

exports.handler = async (event) => {
  try {
    const flUser = await requireRole(event, ['admin', 'onboarding', 'finance']);
    await enforceIpAllowlist(event, flUser);
    const { contractorId, tableName, columnName, fieldRef, fieldName } = JSON.parse(event.body);

    checkFieldReveal(flUser.role, tableName, columnName);

    const supabase = await getSupabaseClient();
    const value = await getSecret(fieldRef);

    await supabase.from('access_audit_log').insert({
      user_id: flUser.id,
      contractor_id: contractorId,
      action: 'reveal',
      field_accessed: fieldName || `${tableName}.${columnName}`,
      ip_address: event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || null,
      user_agent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
    });

    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ value }) };
  } catch (err) {
    return { statusCode: err.message.includes('not permitted') || err.message.includes('does not have permission') ? 403 : 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }) };
  }
};
