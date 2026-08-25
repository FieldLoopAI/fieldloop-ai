// backend/functions/cancel-contractor-registration/index.js
//
// Hard-deletes a contractor registration that was never activated. For a
// still-`pending` contractor, "cancel" means genuinely gone — the row,
// every child row, and every secret actually stored (real value: the EIN
// alone is always stored the moment a contractor is created, before any
// wizard step is even filled in) — not the soft terminate-and-keep-the-
// audit-trail behavior terminate-contractor uses for a real, once-active
// contractor. Refuses to run on anything past `pending` so this can't be
// used to hard-delete a live contractor's history by mistake — that's what
// terminate-contractor is for.
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
    // Same allowlist as who can create a contractor in the first place
    // (create-contractor) — whoever can start a registration can cancel it.
    const flUser = await requireRole(event, ['admin', 'onboarding']);
    await enforceIpAllowlist(event, flUser);
    const { contractorId } = JSON.parse(event.body);
    if (!contractorId) throw new Error('contractorId is required.');
    const supabase = await getSupabaseClient();

    const [
      { data: contractor },
      { data: meta },
      { data: principal },
      { data: financials },
    ] = await Promise.all([
      supabase.from('contractors').select('id, legal_name, contractor_id_public, ein_ref').eq('id', contractorId).single(),
      supabase.from('contractor_system_meta').select('status').eq('contractor_id', contractorId).maybeSingle(),
      supabase.from('contractor_principals').select('dob_ref, ssn_last4_ref, home_address_ref').eq('contractor_id', contractorId).maybeSingle(),
      supabase.from('contractor_financials').select('routing_number_ref, account_number_ref, stripe_account_id_ref, backup_card_ref').eq('contractor_id', contractorId).maybeSingle(),
    ]);
    if (!contractor) throw new Error('Contractor record not found.');
    if (meta?.status !== 'pending') {
      throw new Error('Only a contractor still in "pending" status can be cancelled — an activated contractor must be terminated instead.');
    }

    const refs = [
      contractor.ein_ref,
      principal?.dob_ref, principal?.ssn_last4_ref, principal?.home_address_ref,
      financials?.routing_number_ref, financials?.account_number_ref,
      financials?.stripe_account_id_ref, financials?.backup_card_ref,
    ].filter(Boolean);
    await Promise.allSettled(refs.map((ref) => deleteSecret(ref)));

    // Every child table's contractor_id FK is RESTRICT, not CASCADE
    // (confirmed live — a direct delete of the contractors row fails with
    // "still referenced from table contractor_contacts" until children are
    // gone first), so these have to run before the parent delete, not after.
    await Promise.all([
      supabase.from('contractor_principals').delete().eq('contractor_id', contractorId),
      supabase.from('contractor_contacts').delete().eq('contractor_id', contractorId),
      supabase.from('contractor_compliance').delete().eq('contractor_id', contractorId),
      supabase.from('contractor_operations').delete().eq('contractor_id', contractorId),
      supabase.from('contractor_financials').delete().eq('contractor_id', contractorId),
      supabase.from('contractor_system_meta').delete().eq('contractor_id', contractorId),
      supabase.from('access_audit_log').delete().eq('contractor_id', contractorId),
    ]);

    // A 'pending' contractor should never have a portal login (that's only
    // ever created after activation, by create-contractor-portal-user) —
    // but defensively clear it if one somehow exists, rather than the whole
    // cancellation failing on an FK violation for an edge case like that.
    // team_setup_tokens references contractor_users, so it has to go first.
    const { data: portalUsers } = await supabase
      .from('contractor_users').select('id').eq('contractor_id', contractorId);
    if (portalUsers?.length) {
      const userIds = portalUsers.map((u) => u.id);
      await supabase.from('team_setup_tokens').delete().in('contractor_user_id', userIds);
      await supabase.from('contractor_users').delete().eq('contractor_id', contractorId);
    }

    const { error: deleteErr } = await supabase.from('contractors').delete().eq('id', contractorId);
    if (deleteErr) throw new Error(`Failed to delete contractor record: ${deleteErr.message}`);

    // The audit_log FK is exactly why the row above had to be cleared
    // first — can't reference a contractor_id that's about to stop
    // existing. Logged after the fact with contractor_id: null (same
    // pattern save-system-settings already uses for non-contractor-scoped
    // actions) and identifying details in the text instead.
    const { ip, userAgent } = requestMeta(event);
    const { error: auditErr } = await supabase.from('access_audit_log').insert({
      user_id: flUser.id,
      contractor_id: null,
      action: 'delete',
      field_accessed: `contractor_registration_cancelled (${contractor.legal_name}, ${contractor.contractor_id_public}, ${refs.length} secret(s) purged)`,
      ip_address: ip,
      user_agent: userAgent,
    });
    if (auditErr) console.error('access_audit_log insert failed:', auditErr.message);

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true, secretsPurged: refs.length }),
    };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
