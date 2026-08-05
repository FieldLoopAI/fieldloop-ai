// backend/functions/terminate-contractor/index.js
//
// "Terminate + purge secrets": the contractor row and all related rows stay
// in Postgres (status flips to 'terminated', access_audit_log keeps its full
// history — both required for compliance/recordkeeping), but every AWS
// Secrets Manager secret backing that contractor's PII/bank fields is
// permanently deleted, since that data will never need to be revealed again
// and there's no reason to keep paying for or holding onto it. This is
// deliberately NOT a hard delete of the DB rows.
const { requireRole } = require('./shared/auth');
const { getSupabaseClient } = require('./shared/supabaseClient');
const { deleteSecret } = require('./shared/secrets');
const { enforceIpAllowlist } = require('./shared/ipAllowlist');

function requestMeta(event) {
  return {
    ip: event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || null,
    userAgent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
  };
}

exports.handler = async (event) => {
  try {
    // Admin-only: matches the precedent set by save-contractor-financials /
    // export-contractor-pdf for the other irreversible/high-sensitivity actions.
    const flUser = await requireRole(event, ['admin']);
    await enforceIpAllowlist(event, flUser);
    const { contractorId } = JSON.parse(event.body);
    if (!contractorId) throw new Error('contractorId is required.');
    const supabase = await getSupabaseClient();

    const [{ data: contractor }, { data: principal }, { data: financials }] = await Promise.all([
      supabase.from('contractors').select('id, ein_ref').eq('id', contractorId).single(),
      supabase.from('contractor_principals').select('dob_ref, ssn_last4_ref, home_address_ref').eq('contractor_id', contractorId).maybeSingle(),
      supabase.from('contractor_financials').select('routing_number_ref, account_number_ref, stripe_account_id_ref, backup_card_ref').eq('contractor_id', contractorId).maybeSingle(),
    ]);
    if (!contractor) throw new Error('Contractor record not found.');

    const refs = [
      contractor.ein_ref,
      principal?.dob_ref, principal?.ssn_last4_ref, principal?.home_address_ref,
      financials?.routing_number_ref, financials?.account_number_ref,
      financials?.stripe_account_id_ref, financials?.backup_card_ref,
    ].filter(Boolean);

    const results = await Promise.allSettled(refs.map((ref) => deleteSecret(ref)));
    const failedRefs = results
      .map((r, i) => (r.status === 'rejected' ? refs[i] : null))
      .filter(Boolean);

    // Null out the ref pointers for secrets that were actually deleted, so
    // reveal-field can't later try to fetch a secret that no longer exists.
    // A ref whose delete failed is deliberately left in place so it can be retried.
    const deletedRefs = new Set(refs.filter((r) => !failedRefs.includes(r)));
    await Promise.all([
      supabase.from('contractors').update({
        ein_ref: deletedRefs.has(contractor.ein_ref) ? null : contractor.ein_ref,
      }).eq('id', contractorId),
      principal ? supabase.from('contractor_principals').update({
        dob_ref: deletedRefs.has(principal.dob_ref) ? null : principal.dob_ref,
        ssn_last4_ref: deletedRefs.has(principal.ssn_last4_ref) ? null : principal.ssn_last4_ref,
        home_address_ref: deletedRefs.has(principal.home_address_ref) ? null : principal.home_address_ref,
      }).eq('contractor_id', contractorId) : Promise.resolve(),
      financials ? supabase.from('contractor_financials').update({
        routing_number_ref: deletedRefs.has(financials.routing_number_ref) ? null : financials.routing_number_ref,
        account_number_ref: deletedRefs.has(financials.account_number_ref) ? null : financials.account_number_ref,
        stripe_account_id_ref: deletedRefs.has(financials.stripe_account_id_ref) ? null : financials.stripe_account_id_ref,
        backup_card_ref: deletedRefs.has(financials.backup_card_ref) ? null : financials.backup_card_ref,
      }).eq('contractor_id', contractorId) : Promise.resolve(),
      supabase.from('contractor_system_meta').update({
        status: 'terminated',
        updated_at: new Date().toISOString(),
      }).eq('contractor_id', contractorId),
    ]);

    // access_audit_log.action has a real CHECK constraint — only
    // update/view/reveal/delete/export are valid ('terminate' is not, and
    // fails silently unless the insert's error is checked). 'delete' is the
    // closest fit for "purged this contractor's secrets."
    const { ip, userAgent } = requestMeta(event);
    const { error: auditErr } = await supabase.from('access_audit_log').insert({
      user_id: flUser.id,
      contractor_id: contractorId,
      action: 'delete',
      field_accessed: `contractor_terminated (${deletedRefs.size}/${refs.length} secrets purged)`,
      ip_address: ip,
      user_agent: userAgent,
    });
    if (auditErr) console.error('access_audit_log insert failed:', auditErr.message);

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        secretsPurged: deletedRefs.size,
        secretsTotal: refs.length,
        failedRefs,
      }),
    };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
