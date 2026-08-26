const { storeSecret } = require('./secrets');

// Throws with the real Postgres error message instead of the generic
// Supabase-js pattern of silently returning { data, error } and moving on.
// Real instance this caught: physical_state/mailing_state/license_state are
// fixed character(2) columns — any state value longer than 2 chars (e.g. a
// full state name, or garbage test data) failed with Postgres error 22001
// ("value too long for type character(2)"), and because nothing here ever
// checked the result, the whole contractors.update() call silently no-oped
// (Postgres rejects the entire statement, not just the offending column)
// while the Lambda still returned { success: true } — the wizard reported
// "saved successfully" and advanced a step while the database kept none of
// it. See HANDOFF.md for the fix writeup.
function assertNoError(error, context) {
  if (error) throw new Error(`Failed to save ${context}: ${error.message}`);
}

// Shared by save-contractor-draft and activate-contractor (activation always
// saves the latest draft first, same as mockDb.activateContractor did).
async function saveContractorDraft(supabase, contractorId, { contractor, principal, contacts, compliance, operations, meta, principalSecrets }) {
  if (contractor) {
    const {
      legal_name, dba_name, business_structure, year_established, website,
      business_phone, business_sms, business_email,
      physical_street, physical_city, physical_state, physical_zip, physical_county,
      mailing_street, mailing_city, mailing_state, mailing_zip,
    } = contractor;
    const { error } = await supabase.from('contractors').update({
      legal_name, dba_name, business_structure, year_established, website,
      business_phone, business_sms, business_email,
      physical_street, physical_city, physical_state, physical_zip, physical_county,
      mailing_street, mailing_city, mailing_state, mailing_zip,
    }).eq('id', contractorId);
    assertNoError(error, 'Business Identity (Step 2)');
  }

  if (principal) {
    const { data: existingPrincipal } = await supabase
      .from('contractor_principals').select('*').eq('contractor_id', contractorId).maybeSingle();

    const base = `fieldloop/contractor/${contractorId}/principal`;
    const dobRef = principalSecrets?.dob !== undefined
      ? await storeSecret(`${base}/dob`, principalSecrets.dob)
      : existingPrincipal?.dob_ref ?? null;
    const ssnRef = principalSecrets?.ssn_last4 !== undefined
      ? await storeSecret(`${base}/ssn`, principalSecrets.ssn_last4)
      : existingPrincipal?.ssn_last4_ref ?? null;
    const addressRef = principalSecrets?.home_address !== undefined
      ? await storeSecret(`${base}/home_address`, principalSecrets.home_address)
      : existingPrincipal?.home_address_ref ?? null;

    const {
      full_name, title, ownership_pct, personal_mobile, personal_email,
      id_verification_status, pep_flag, sanctions_check_ts,
    } = principal;

    const { error } = await supabase.from('contractor_principals').upsert({
      contractor_id: contractorId,
      id: existingPrincipal?.id,
      full_name, title, ownership_pct, personal_mobile, personal_email,
      dob_ref: dobRef, ssn_last4_ref: ssnRef, home_address_ref: addressRef,
      id_verification_status, pep_flag, sanctions_check_ts,
    });
    assertNoError(error, 'Ownership & Principal (Step 3)');
  }

  if (contacts) {
    const { error: deleteError } = await supabase.from('contractor_contacts').delete().eq('contractor_id', contractorId);
    assertNoError(deleteError, 'Key Contacts (Step 4)');
    if (contacts.length > 0) {
      const { error: insertError } = await supabase.from('contractor_contacts').insert(contacts.map(({ id: _id, ...c }) => ({
        contractor_id: contractorId,
        contact_type: c.contact_type,
        full_name: c.full_name,
        title: c.title,
        direct_phone: c.direct_phone,
        sms_phone: c.sms_phone,
        email: c.email,
        preferred_channel: c.preferred_channel,
        relationship: c.relationship,
      })));
      assertNoError(insertError, 'Key Contacts (Step 4)');
    }
  }

  if (compliance) {
    const { data: existingCompliance } = await supabase
      .from('contractor_compliance').select('w9_signed_ts').eq('contractor_id', contractorId).maybeSingle();

    const { error } = await supabase.from('contractor_compliance').upsert({
      contractor_id: contractorId,
      primary_license_number: compliance.primary_license_number,
      license_type: compliance.license_type,
      license_state: compliance.license_state,
      license_issuing_authority: compliance.license_issuing_authority,
      license_issue_date: compliance.license_issue_date,
      license_expiration_date: compliance.license_expiration_date,
      additional_licenses: compliance.additional_licenses,
      gl_insurance_provider: compliance.gl_insurance_provider,
      gl_policy_number: compliance.gl_policy_number,
      gl_coverage_amount: compliance.gl_coverage_amount,
      gl_aggregate_amount: compliance.gl_aggregate_amount,
      gl_expiration: compliance.gl_expiration,
      gl_coi_uploaded_ts: compliance.gl_coi_uploaded_ts,
      wc_carrier: compliance.wc_carrier,
      wc_policy_number: compliance.wc_policy_number,
      wc_expiration: compliance.wc_expiration,
      is_bonded: compliance.is_bonded,
      bond_provider: compliance.bond_provider,
      bond_number: compliance.bond_number,
      bond_amount: compliance.bond_amount,
      bond_expiration: compliance.bond_expiration,
      w9_on_file: compliance.w9_on_file,
      w9_signed_ts: compliance.w9_on_file ? (existingCompliance?.w9_signed_ts || new Date().toISOString()) : null,
      w9_signed_by: compliance.w9_signed_by,
    });
    assertNoError(error, 'Compliance & Licensing (Step 5)');
  }

  if (operations) {
    const { error } = await supabase.from('contractor_operations').upsert({
      contractor_id: contractorId,
      primary_trade: operations.primary_trade,
      services_offered: operations.services_offered,
      service_radius_miles: operations.service_radius_miles || null,
      counties_served: operations.counties_served,
      emergency_service_available: operations.emergency_service_available,
      business_hours: operations.business_hours,
      time_zone: operations.time_zone,
      technician_count: operations.technician_count || null,
      vehicle_count: operations.vehicle_count || null,
      vehicle_vins: operations.vehicle_vins,
    });
    assertNoError(error, 'Operations & Workforce (Step 6)');
  }

  if (meta) {
    const { error } = await supabase.from('contractor_system_meta').update({
      internal_notes: meta.internal_notes,
      risk_score: meta.risk_score === '' || meta.risk_score === undefined ? undefined : parseInt(meta.risk_score, 10),
      status: meta.status,
      next_credential_review: meta.next_credential_review,
      updated_at: new Date().toISOString(),
    }).eq('contractor_id', contractorId);
    assertNoError(error, 'Internal System Settings (Step 8)');
  }
}

module.exports = { saveContractorDraft };
