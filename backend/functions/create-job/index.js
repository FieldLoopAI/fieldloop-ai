// backend/functions/create-job/index.js
const crypto = require('crypto');
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');
const { geocodeAddress } = require('./shared/geocoding');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

// jobs.job_type CHECK constraint — verified live via probe-insert against the
// real DB (every other plausible value tested — 'project', 'installation',
// 'repair', 'maintenance', 'Project', 'Service Call', etc. — was rejected).
// 'service_call' is the only value currently valid. If a "Project" job type
// is ever needed (per the source planning docs' Service-Call-vs-Project
// flag), that requires a schema migration first, not a guess here.
const VALID_JOB_TYPES = ['service_call'];

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

// Copied verbatim from add-technician/index.js — isFinite-based, not isNaN,
// so 'parseFloat("12abc") === 12' can't sneak past validation (the exact gap
// found and fixed in the Add Technician review).
function validateRate(value) {
  if (value === undefined || value === null || value === '') return true;
  return /^\d+(\.\d{1,2})?$/.test(String(value).trim()) && parseFloat(value) >= 0;
}

function generateJobIdPublic() {
  return 'FL-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin']);
    const body = JSON.parse(event.body);

    const {
      customer_id, new_customer,
      job_type, trade_category, description, service_address,
      scheduled_start, scheduled_end, technician_id, total_estimate,
    } = body;

    // ---- Validate ----
    const errors = [];

    const hasExistingCustomer = Boolean(customer_id);
    const hasNewCustomer = Boolean(new_customer);
    if (hasExistingCustomer === hasNewCustomer) {
      errors.push('Provide exactly one of an existing customer_id or new_customer details.');
    }
    if (hasNewCustomer) {
      if (!new_customer.household_name?.trim()) errors.push('New customer name is required.');
      if (!new_customer.primary_phone?.trim()) errors.push('New customer phone is required.');
      else if (!validatePhone(new_customer.primary_phone.trim())) errors.push('Invalid new customer phone format.');
      if (!new_customer.service_address?.trim()) errors.push('New customer service address is required.');
    }

    if (!job_type) errors.push('Job type is required.');
    else if (!VALID_JOB_TYPES.includes(job_type)) errors.push(`Job type must be one of: ${VALID_JOB_TYPES.join(', ')}.`);

    if (!service_address?.trim()) errors.push('Service address is required.');

    let startDate = null;
    let endDate = null;
    if (scheduled_start) {
      startDate = new Date(scheduled_start);
      if (Number.isNaN(startDate.getTime())) errors.push('Invalid scheduled start time.');
    }
    if (scheduled_end) {
      endDate = new Date(scheduled_end);
      if (Number.isNaN(endDate.getTime())) errors.push('Invalid scheduled end time.');
    }
    if (startDate && endDate && !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && endDate <= startDate) {
      errors.push('Scheduled end must be after scheduled start.');
    }

    if (!validateRate(total_estimate)) errors.push('Total estimate must be a non-negative number.');

    if (errors.length) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: errors.join(' ') }) };
    }

    const supabase = await getSupabaseClient();

    // ---- Ownership checks — these Lambdas use the service-role key, which
    // bypasses RLS entirely, so a client-supplied foreign-key id must always
    // be re-verified as belonging to this contractor before it's trusted. ----
    if (hasExistingCustomer) {
      const { data: existing } = await supabase
        .from('customers').select('id').eq('id', customer_id).eq('contractor_id', contractorUser.contractor_id).maybeSingle();
      if (!existing) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Customer not found for your company.' }) };
      }
    }
    if (technician_id) {
      const { data: existing } = await supabase
        .from('technicians').select('id').eq('id', technician_id).eq('contractor_id', contractorUser.contractor_id).maybeSingle();
      if (!existing) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Technician not found for your company.' }) };
      }
    }

    // ---- Resolve the customer ----
    let resolvedCustomerId = customer_id;
    let createdCustomerId = null;
    let customerNote = null;

    if (hasNewCustomer) {
      const cleanPhone = normalizeE164(new_customer.primary_phone.trim());
      const { data: dupe } = await supabase
        .from('customers').select('id').eq('contractor_id', contractorUser.contractor_id).eq('primary_phone', cleanPhone).maybeSingle();
      if (dupe) {
        resolvedCustomerId = dupe.id;
        customerNote = 'An existing customer with this phone number was reused instead of creating a duplicate.';
      } else {
        const { data: newCust, error: custErr } = await supabase
          .from('customers')
          .insert({
            contractor_id: contractorUser.contractor_id,
            household_name: new_customer.household_name.trim(),
            primary_contact_name: new_customer.primary_contact_name?.trim() || null,
            primary_phone: cleanPhone,
            email: new_customer.email?.trim() || null,
            service_address: new_customer.service_address.trim(),
          })
          .select('id')
          .single();
        if (custErr) throw new Error(`Failed to create customer: ${custErr.message}`);
        resolvedCustomerId = newCust.id;
        createdCustomerId = newCust.id;
      }
    }

    // ---- Create the job ----
    const status = (technician_id && startDate) ? 'scheduled' : 'draft';

    // Best-effort — geocoding.js degrades to null on any failure (missing
    // secret, bad address, quota, network), which is fine: geofencing just
    // won't activate for this job, but job creation itself must never be
    // blocked by an external vendor call.
    const geocoded = await geocodeAddress(service_address.trim());

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        contractor_id: contractorUser.contractor_id,
        job_id_public: generateJobIdPublic(),
        customer_id: resolvedCustomerId,
        job_type,
        trade_category: trade_category?.trim() || null,
        description: description?.trim() || null,
        service_address: service_address.trim(),
        service_lat: geocoded?.lat ?? null,
        service_lng: geocoded?.lng ?? null,
        scheduled_start: startDate ? startDate.toISOString() : null,
        scheduled_end: endDate ? endDate.toISOString() : null,
        status,
        lead_technician_id: technician_id || null,
        total_estimate: total_estimate !== '' && total_estimate != null ? parseFloat(total_estimate) : null,
      })
      .select(`
        id, job_id_public, job_type, trade_category, description, service_address,
        service_lat, service_lng,
        scheduled_start, scheduled_end, status, lead_technician_id, total_estimate, created_at,
        customers ( id, household_name, primary_contact_name, primary_phone ),
        technicians ( id, full_name )
      `)
      .single();

    if (jobError) {
      // Roll back the customer only if this request created it — never
      // delete a pre-existing customer just because the job insert failed.
      if (createdCustomerId) {
        await supabase.from('customers').delete().eq('id', createdCustomerId).catch(() => {});
      }
      throw new Error(`Failed to create job: ${jobError.message}`);
    }

    // ---- Assignment (best-effort — job already exists even if this fails) ----
    let assignmentWarning = null;
    if (technician_id) {
      const { error: assignError } = await supabase
        .from('job_technician_assignments')
        .insert({ job_id: job.id, technician_id, role_on_job: 'lead' });
      if (assignError) {
        assignmentWarning = 'Job created, but the technician assignment record failed to save — reassign from the dispatch board.';
      }
    }

    // ---- Audit log (best-effort, real try/catch — supabase-js query
    // builders only implement .then(), not .catch()). 'create' is NOT a
    // valid access_audit_log.action value (verified live); 'update' is. ----
    try {
      await supabase.from('access_audit_log').insert({
        user_id: contractorUser.id,
        contractor_id: contractorUser.contractor_id,
        action: 'update',
        field_accessed: 'job',
        ip_address: event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || null,
        user_agent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
      });
    } catch { /* best-effort */ }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true, job, note: customerNote, warning: assignmentWarning }),
    };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
