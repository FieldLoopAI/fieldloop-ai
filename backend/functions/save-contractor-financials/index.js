// backend/functions/save-contractor-financials/index.js
const { requireRole } = require('./shared/auth');
const { getSupabaseClient } = require('./shared/supabaseClient');
const { storeSecret } = require('./shared/secrets');
const { enforceIpAllowlist } = require('./shared/ipAllowlist');

// Only re-encrypts a secret-backed field when the caller actually sent a
// new plaintext value for it. Sending nothing keeps the existing *_ref —
// this matters because the frontend only sends plaintext for fields the
// user explicitly revealed and edited, never the masked display value.
async function refFor(base, name, newValue, existingRef) {
  if (newValue === undefined || newValue === null) return existingRef ?? null;
  return storeSecret(`${base}/${name}`, newValue);
}

exports.handler = async (event) => {
  try {
    const flUser = await requireRole(event, ['admin']); // admin only
    await enforceIpAllowlist(event, flUser);
    const body = JSON.parse(event.body);
    const supabase = await getSupabaseClient();

    const { data: existing } = await supabase
      .from('contractor_financials')
      .select('routing_number_ref, account_number_ref, stripe_account_id_ref, backup_card_ref')
      .eq('contractor_id', body.contractor_id)
      .single();

    const base = `fieldloop/contractor/${body.contractor_id}`;
    const routingRef = await refFor(base, 'routing_number', body.routing_number, existing?.routing_number_ref);
    const accountRef = await refFor(base, 'account_number', body.account_number, existing?.account_number_ref);
    const stripeRef = await refFor(base, 'stripe_account_id', body.stripe_account_id, existing?.stripe_account_id_ref);
    const backupCardRef = await refFor(base, 'backup_card', body.backup_card, existing?.backup_card_ref);

    const { error } = await supabase.from('contractor_financials').upsert({
      contractor_id: body.contractor_id,
      payout_bank_name: body.payout_bank_name,
      account_type: body.account_type,
      account_holder_name: body.account_holder_name,
      routing_number_ref: routingRef,
      account_number_ref: accountRef,
      micro_deposit_verified_ts: body.micro_deposit_verified_ts,
      stripe_account_id_ref: stripeRef,
      stripe_connect_model: body.stripe_connect_model,
      payment_methods_accepted: body.payment_methods_accepted,
      monthly_floor_amount: body.monthly_floor_amount,
      volume_discount_tier: body.volume_discount_tier,
      ach_authorization_signed: body.ach_authorization_signed,
      ach_authorization_ts: body.ach_authorization_signed ? new Date().toISOString() : null,
      ach_authorization_ip: event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || null,
      ach_authorization_signed_by: body.ach_authorization_signed_by,
      backup_card_ref: backupCardRef,
      backup_card_last4: body.backup_card?.slice(-4) || undefined,
      backup_card_expiration: body.backup_card_expiration,
    });
    if (error) throw error;

    await supabase.from('access_audit_log').insert({
      user_id: flUser.id,
      contractor_id: body.contractor_id,
      action: 'update',
      field_accessed: 'contractor_financials',
      ip_address: event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || null,
      user_agent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
    });

    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }) };
  }
};
