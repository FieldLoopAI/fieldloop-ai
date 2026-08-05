// backend/functions/create-contractor/index.js
const { requireRole } = require('./shared/auth');
const { getSupabaseClient } = require('./shared/supabaseClient');
const { storeSecret } = require('./shared/secrets');
const { enforceIpAllowlist } = require('./shared/ipAllowlist');

exports.handler = async (event) => {
  try {
    const flUser = await requireRole(event, ['admin', 'onboarding']);
    await enforceIpAllowlist(event, flUser);
    const body = JSON.parse(event.body);

    const supabase = await getSupabaseClient();

    // 1. Insert the non-sensitive fields first to get a contractor id
    const { data: contractor, error: insertError } = await supabase
      .from('contractors')
      .insert({
        legal_name: body.legal_name,
        dba_name: body.dba_name,
        business_structure: body.business_structure,
        year_established: body.year_established,
        website: body.website,
        business_phone: body.business_phone,
        business_sms: body.business_sms,
        business_email: body.business_email,
        physical_street: body.physical_street,
        physical_city: body.physical_city,
        physical_state: body.physical_state,
        physical_zip: body.physical_zip,
        physical_county: body.physical_county,
        mailing_street: body.mailing_street,
        mailing_city: body.mailing_city,
        mailing_state: body.mailing_state,
        mailing_zip: body.mailing_zip,
      })
      .select()
      .single();
    if (insertError) throw insertError;

    // 2. Encrypt the EIN and store only the reference
    const einRef = `fieldloop/contractor/${contractor.id}/ein`;
    await storeSecret(einRef, body.ein);

    // 3. Save the reference and the public-facing short ID
    const publicId = `${body.legal_name.slice(0,4).toUpperCase()}-${contractor.id.slice(0,4)}`;
    await supabase.from('contractors')
      .update({ ein_ref: einRef, contractor_id_public: publicId })
      .eq('id', contractor.id);

    // 4. Seed the system-meta row (status is NOT NULL and constrained to
    // 'pending'/'active'/'suspended'/'terminated', so this must exist —
    // with a value the check constraint actually allows — before the
    // record can be loaded/activated)
    const { error: metaError } = await supabase.from('contractor_system_meta').insert({
      contractor_id: contractor.id,
      status: 'pending',
      onboarded_by: flUser.id,
      onboarded_at: new Date().toISOString(),
    });
    if (metaError) throw metaError;

    // 5. Audit log
    await supabase.from('access_audit_log').insert({
      user_id: flUser.id,
      contractor_id: contractor.id,
      action: 'update',
      field_accessed: 'contractors (created)',
      ip_address: event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || null,
      user_agent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
    });

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ contractorId: contractor.id, publicId }),
    };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};