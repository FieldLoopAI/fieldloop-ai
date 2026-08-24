// backend/functions/add-customer/index.js
// POST /customers — creates a customer directly (Panel 5's "+ Add customer"),
// distinct from create-job's inline new_customer path (§12) which only ever
// creates one as a side effect of scheduling a job. Same phone
// validation/normalization as create-job, copied verbatim for consistency —
// this repo has no shared/ helper for it yet (each Lambda folder is a
// self-contained copy, per this project's no-Lambda-Layer convention).
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };
// customers.preferred_contact CHECK constraint — verified live via
// probe-insert ('voice', 'sms', 'phone' all rejected).
const VALID_PREFERRED_CONTACT = ['call', 'email', 'text'];

function validatePhone(phone) {
  const cleaned = phone.replace(/[\s\-().+]/g, '');
  return /^\d{10,15}$/.test(cleaned);
}

function normalizeE164(phone) {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return phone;
  if (phone.trim().startsWith('+')) return '+' + digits;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return '+' + digits;
}

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin', 'dispatcher']);
    const body = JSON.parse(event.body || '{}');
    const { household_name, primary_contact_name, primary_phone, secondary_phone, email, service_address, billing_address, preferred_contact, notes } = body;

    if (!household_name || !household_name.trim()) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'household_name is required.' }) };
    }
    if (!primary_phone || !validatePhone(primary_phone.trim())) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'A valid primary_phone is required.' }) };
    }
    // customers.service_address is NOT NULL — verified live (a probe-insert
    // without it failed) after this Lambda was first deployed; the CHECK-
    // constraint probes earlier in this build always happened to include it,
    // so this requirement wasn't caught until a real, unscripted test run.
    if (!service_address || !service_address.trim()) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'service_address is required.' }) };
    }
    if (secondary_phone && !validatePhone(secondary_phone.trim())) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid secondary phone format.' }) };
    }
    if (preferred_contact !== undefined && preferred_contact !== '' && !VALID_PREFERRED_CONTACT.includes(preferred_contact)) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: `preferred_contact must be one of: ${VALID_PREFERRED_CONTACT.join(', ')}` }) };
    }

    const supabase = await getSupabaseClient();

    // Dedupe by normalized phone, same reasoning as create-job's inline
    // new_customer path — re-entering the same number reuses the row
    // instead of creating a duplicate.
    const cleanPhone = normalizeE164(primary_phone.trim());
    const { data: existing } = await supabase
      .from('customers').select('id')
      .eq('contractor_id', contractorUser.contractor_id).eq('primary_phone', cleanPhone).maybeSingle();
    if (existing) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'A customer with this phone number already exists.' }) };
    }

    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        contractor_id: contractorUser.contractor_id,
        household_name: household_name.trim(),
        primary_contact_name: primary_contact_name?.trim() || null,
        primary_phone: cleanPhone,
        secondary_phone: secondary_phone ? normalizeE164(secondary_phone.trim()) : null,
        email: email?.trim() || null,
        service_address: service_address?.trim() || null,
        billing_address: billing_address?.trim() || null,
        preferred_contact: preferred_contact || null,
        notes: notes?.trim() || null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, customer }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
