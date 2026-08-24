// backend/functions/activate-contractor/index.js
const { requireRole } = require('./shared/auth');
const { getSupabaseClient } = require('./shared/supabaseClient');
const { enforceIpAllowlist } = require('./shared/ipAllowlist');
const { saveContractorDraft } = require('./shared/contractorDraft');
const { getSecret } = require('./shared/secrets');

function requestMeta(event) {
  return {
    ip: event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || null,
    userAgent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
  };
}

// Ported from mockDb.activateContractor's required-field checklist, adjusted
// to the real column set (fields that never existed in the real schema —
// e.g. gl_agent_name — were never real requirements to begin with).
function validate({ contractor, principal, contacts, compliance, operations, financials }) {
  const issues = [];

  if (!contractor?.legal_name) issues.push('Business Legal Name is required.');
  if (!contractor?.business_structure) issues.push('Business Structure selection is required.');
  if (!contractor?.ein_ref) issues.push('Business Tax EIN is required.');
  if (!contractor?.business_phone) issues.push('Business Phone Number is required.');
  if (!contractor?.business_email) issues.push('Business Email Address is required.');
  if (!contractor?.physical_street || !contractor?.physical_city || !contractor?.physical_state || !contractor?.physical_zip) {
    issues.push('Physical Address fields (Street, City, State, ZIP) are required.');
  }

  if (!principal?.full_name) issues.push('Owner/Principal full name is required.');
  if (!principal?.title) issues.push('Owner/Principal job title is required.');
  if (!principal?.dob_ref) issues.push('Owner Date of Birth is required for Stripe KYC.');
  if (!principal?.ssn_last4_ref) issues.push('Owner SSN Last 4 digits is required for Stripe KYC.');
  if (!principal?.personal_mobile) issues.push('Owner Personal Mobile Number is required.');
  if (!principal?.personal_email) issues.push('Owner Personal Email Address is required.');
  if (!principal?.home_address_ref) issues.push('Owner Home Address is required.');

  if (!(contacts || []).some((c) => c.contact_type === 'primary')) {
    issues.push('At least one Primary Contact must be specified in Key Contacts.');
  }

  if (!compliance?.primary_license_number) issues.push('Primary State Trade License Number is required.');
  if (!compliance?.license_state) issues.push('License State is required.');
  if (!compliance?.license_issuing_authority) issues.push('License Issuing Authority is required.');
  if (!compliance?.license_expiration_date) issues.push('License Expiration Date is required.');
  if (!compliance?.gl_insurance_provider || !compliance?.gl_policy_number || !compliance?.gl_expiration) {
    issues.push("General Liability Insurance details (Carrier, Policy #, Expiration) are required.");
  }
  if (!compliance?.wc_carrier || !compliance?.wc_policy_number || !compliance?.wc_expiration) {
    issues.push("Workers' Compensation details (Carrier, Policy #, Expiration) are required.");
  }
  if (compliance?.is_bonded === undefined || compliance?.is_bonded === null) issues.push('Surety Bond status (Yes/No) is required.');
  if (!compliance?.w9_on_file) issues.push('W-9 Tax Documentation must be marked as On File.');

  if (!operations?.primary_trade) issues.push('Primary Trade setting is required.');
  if (!(operations?.services_offered || []).length) {
    issues.push('At least one Service Offered must be listed.');
  }
  if (!operations?.technician_count || operations.technician_count <= 0) {
    issues.push('Active Technician count must be greater than zero.');
  }

  if (!financials?.account_type) issues.push('Account Type selection is required.');
  if (!financials?.routing_number_ref) issues.push('Payout Bank Routing number is required.');
  if (!financials?.account_number_ref) issues.push('Payout Bank Account number is required.');
  if (!financials?.stripe_account_id_ref) issues.push('Stripe Connect Account ID is required.');
  if (!financials?.ach_authorization_signed) {
    issues.push('Contractor must explicitly authorize the Weekly ACH platform fee pull for cash/check jobs.');
  }

  return issues;
}

// The client (RegistrationDashboard's validateStep) checks these same
// formats before a save, but that's advisory only — a direct API call or a
// draft saved before validation existed can still reach here with a
// malformed value. Re-checking the actual decrypted secret server-side
// closes that gap for activation specifically (drafts stay permissive by
// design, since they're meant to tolerate partial/in-progress data).
const EIN_RE = /^\d{2}-?\d{7}$/;
const SSN_LAST4_RE = /^\d{4}$/;
const ROUTING_RE = /^\d{9}$/;
const ACCOUNT_RE = /^\d{4,17}$/;
const STRIPE_RE = /^acct_[a-zA-Z0-9]+$/;

async function validateSecretFormats({ contractor, principal, financials }) {
  const issues = [];
  const checks = [
    [contractor?.ein_ref, EIN_RE, 'Business Tax EIN must be a 9-digit number in the format XX-XXXXXXX or XXXXXXXXX.'],
    [principal?.ssn_last4_ref, SSN_LAST4_RE, 'Owner SSN Last 4 must be exactly 4 digits.'],
    [financials?.routing_number_ref, ROUTING_RE, 'Payout Bank Routing number must be exactly 9 digits.'],
    [financials?.account_number_ref, ACCOUNT_RE, 'Payout Bank Account number must be between 4 and 17 digits.'],
    [financials?.stripe_account_id_ref, STRIPE_RE, "Stripe Connect Account ID must start with 'acct_'."],
  ];

  await Promise.all(checks.map(async ([ref, re, message]) => {
    if (!ref) return; // presence already covered by validate()
    const plaintext = await getSecret(ref);
    if (!re.test((plaintext || '').trim())) issues.push(message);
  }));

  return issues;
}

exports.handler = async (event) => {
  try {
    const flUser = await requireRole(event, ['admin', 'onboarding']);
    await enforceIpAllowlist(event, flUser);
    const { contractorId, ...payload } = JSON.parse(event.body);
    const supabase = await getSupabaseClient();

    // 1. Save the latest draft first
    await saveContractorDraft(supabase, contractorId, payload);

    // 2. Re-fetch the raw (unmasked) rows to validate against — this runs
    // server-side with the service-role client, not through get-contractor's
    // role-based masking, since activation must see the real ref values.
    const [
      { data: contractor },
      { data: principal },
      { data: contacts },
      { data: compliance },
      { data: operations },
      { data: financials },
    ] = await Promise.all([
      supabase.from('contractors').select('*').eq('id', contractorId).single(),
      supabase.from('contractor_principals').select('*').eq('contractor_id', contractorId).maybeSingle(),
      supabase.from('contractor_contacts').select('*').eq('contractor_id', contractorId),
      supabase.from('contractor_compliance').select('*').eq('contractor_id', contractorId).maybeSingle(),
      supabase.from('contractor_operations').select('*').eq('contractor_id', contractorId).maybeSingle(),
      supabase.from('contractor_financials').select('*').eq('contractor_id', contractorId).maybeSingle(),
    ]);

    const issues = validate({ contractor, principal, contacts, compliance, operations, financials });
    const formatIssues = await validateSecretFormats({ contractor, principal, financials });
    const allIssues = [...issues, ...formatIssues];
    if (allIssues.length > 0) {
      return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ success: false, errors: allIssues }) };
    }

    await supabase.from('contractor_system_meta').update({
      status: 'active',
      activated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('contractor_id', contractorId);

    const { ip, userAgent } = requestMeta(event);
    await supabase.from('access_audit_log').insert({
      user_id: flUser.id,
      contractor_id: contractorId,
      action: 'update',
      field_accessed: 'contractor_status_activated',
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
