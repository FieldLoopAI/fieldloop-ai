// backend/functions/update-customer/index.js
// POST /customers/update — partial-update a customer (Panel 5's "Edit").
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };
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
    const contractorUser = await requireContractorRole(event, ['owner_admin']);
    const body = JSON.parse(event.body || '{}');
    const { customer_id, household_name, primary_contact_name, primary_phone, secondary_phone, email, service_address, billing_address, preferred_contact, notes } = body;

    if (!customer_id) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'customer_id is required.' }) };
    }
    if (primary_phone !== undefined && !validatePhone(primary_phone.trim())) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid primary phone format.' }) };
    }
    if (secondary_phone && !validatePhone(secondary_phone.trim())) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid secondary phone format.' }) };
    }
    if (preferred_contact !== undefined && preferred_contact !== '' && !VALID_PREFERRED_CONTACT.includes(preferred_contact)) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: `preferred_contact must be one of: ${VALID_PREFERRED_CONTACT.join(', ')}` }) };
    }

    const supabase = await getSupabaseClient();

    const { data: existing } = await supabase
      .from('customers').select('id')
      .eq('id', customer_id).eq('contractor_id', contractorUser.contractor_id).maybeSingle();
    if (!existing) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Customer not found for your company.' }) };
    }

    const update = {};
    if (household_name !== undefined) update.household_name = household_name.trim();
    if (primary_contact_name !== undefined) update.primary_contact_name = primary_contact_name?.trim() || null;
    if (primary_phone !== undefined) update.primary_phone = normalizeE164(primary_phone.trim());
    if (secondary_phone !== undefined) update.secondary_phone = secondary_phone ? normalizeE164(secondary_phone.trim()) : null;
    if (email !== undefined) update.email = email?.trim() || null;
    if (service_address !== undefined) update.service_address = service_address?.trim() || null;
    if (billing_address !== undefined) update.billing_address = billing_address?.trim() || null;
    if (preferred_contact !== undefined) update.preferred_contact = preferred_contact || null;
    if (notes !== undefined) update.notes = notes?.trim() || null;
    if (Object.keys(update).length === 0) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Nothing to update.' }) };
    }

    const { data: customer, error } = await supabase
      .from('customers').update(update).eq('id', customer_id).select().single();
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
