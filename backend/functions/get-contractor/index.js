// backend/functions/get-contractor/index.js
const { requireRole } = require('./shared/auth');
const { getSupabaseClient } = require('./shared/supabaseClient');
const { enforceIpAllowlist } = require('./shared/ipAllowlist');

// Role matrix ported from mockDb.checkRoleAccess. There's no partial-reveal
// capability in reveal-field (it either returns the full secret or throws),
// so "last 4 only" roles here just means "keeps the *_ref so the reveal
// button works" — same real exposure as "full", just cosmetically masked
// client-side until the user clicks reveal. Roles that fail these checks
// get the *_ref nulled out entirely, which hides the reveal button.
const canReadPii = (role) => ['admin', 'onboarding'].includes(role);
const canReadBank = (role) => ['admin', 'onboarding', 'finance'].includes(role);
const canReadStripe = (role) => role === 'admin';

function requestMeta(event) {
  return {
    ip: event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || null,
    userAgent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
  };
}

exports.handler = async (event) => {
  try {
    const flUser = await requireRole(event, ['admin', 'onboarding', 'finance', 'support', 'jenex_dev']);
    await enforceIpAllowlist(event, flUser);
    const { contractorId } = JSON.parse(event.body);
    const supabase = await getSupabaseClient();

    const { data: contractor, error: cErr } = await supabase
      .from('contractors').select('*').eq('id', contractorId).single();
    if (cErr || !contractor) throw new Error('Contractor record not found.');

    if (flUser.role === 'jenex_dev' && !contractor.is_sandbox) {
      throw new Error('Security Alert: Jenex Developer accounts are strictly restricted to Sandbox / Test Data and cannot access Production contractor records in this system.');
    }

    const [
      { data: principal },
      { data: contacts },
      { data: compliance },
      { data: operations },
      { data: financials },
      { data: meta },
      { data: auditLog },
    ] = await Promise.all([
      supabase.from('contractor_principals').select('*').eq('contractor_id', contractorId).maybeSingle(),
      supabase.from('contractor_contacts').select('*').eq('contractor_id', contractorId),
      supabase.from('contractor_compliance').select('*').eq('contractor_id', contractorId).maybeSingle(),
      supabase.from('contractor_operations').select('*').eq('contractor_id', contractorId).maybeSingle(),
      supabase.from('contractor_financials').select('*').eq('contractor_id', contractorId).maybeSingle(),
      supabase.from('contractor_system_meta').select('*').eq('contractor_id', contractorId).maybeSingle(),
      supabase.from('access_audit_log').select('*').eq('contractor_id', contractorId).order('timestamp', { ascending: false }).limit(8),
    ]);

    let onboardedByName = null;
    if (meta?.onboarded_by) {
      const { data: onboarder } = await supabase.from('fl_users').select('email').eq('id', meta.onboarded_by).single();
      onboardedByName = onboarder?.email || null;
    }

    const role = flUser.role;
    const cleanContractor = { ...contractor };
    const cleanPrincipal = { ...(principal || {}) };
    const cleanCompliance = { ...(compliance || {}) };
    const cleanFinancials = { ...(financials || {}) };
    const cleanOperations = operations || {};
    const cleanMeta = { ...(meta || {}), onboarded_by_name: onboardedByName };

    if (role === 'support') {
      const keep = ['id', 'is_sandbox', 'contractor_id_public', 'legal_name', 'dba_name', 'business_phone', 'business_sms', 'business_email'];
      Object.keys(cleanContractor).forEach((k) => { if (!keep.includes(k)) delete cleanContractor[k]; });
      cleanCompliance.primary_license_number = '[MASKED]';
      cleanCompliance.gl_policy_number = '[MASKED]';
    }

    if (!canReadPii(role)) {
      cleanContractor.ein_ref = null;
      cleanPrincipal.dob_ref = null;
      cleanPrincipal.ssn_last4_ref = null;
      cleanPrincipal.home_address_ref = null;
    }
    if (!canReadBank(role)) {
      cleanFinancials.routing_number_ref = null;
      cleanFinancials.account_number_ref = null;
      cleanFinancials.backup_card_ref = null;
    }
    if (!canReadStripe(role)) {
      cleanFinancials.stripe_account_id_ref = null;
    }

    const { ip, userAgent } = requestMeta(event);
    await supabase.from('access_audit_log').insert({
      user_id: flUser.id,
      contractor_id: contractorId,
      action: 'VIEWED',
      field_accessed: 'contractor record',
      ip_address: ip,
      user_agent: userAgent,
    });

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        contractor: cleanContractor,
        principal: cleanPrincipal,
        contacts: contacts || [],
        compliance: cleanCompliance,
        operations: cleanOperations,
        financials: cleanFinancials,
        meta: cleanMeta,
        auditLog: auditLog || [],
      }),
    };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') || err.message.includes('Security Alert') ? 403 : 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
