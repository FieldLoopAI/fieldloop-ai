// backend/functions/assign-job/index.js
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

// Only these two statuses are dispatcher-owned; everything from en_route
// onward belongs to the (not yet built) mobile app's beats — reassigning a
// job that's already on site or invoiced is a real data-integrity problem,
// not a hypothetical.
const REASSIGNABLE_STATUSES = ['draft', 'scheduled'];

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin', 'dispatcher', 'field_lead']);
    const body = JSON.parse(event.body);
    const { job_id, technician_id } = body;

    if (!job_id || !technician_id) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'job_id and technician_id are required.' }) };
    }

    const supabase = await getSupabaseClient();

    // ---- Ownership checks (service-role key bypasses RLS entirely) ----
    const { data: job } = await supabase
      .from('jobs').select('id, status, scheduled_start')
      .eq('id', job_id).eq('contractor_id', contractorUser.contractor_id).maybeSingle();
    if (!job) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Job not found for your company.' }) };
    }

    const { data: technician } = await supabase
      .from('technicians').select('id')
      .eq('id', technician_id).eq('contractor_id', contractorUser.contractor_id).maybeSingle();
    if (!technician) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Technician not found for your company.' }) };
    }

    if (!REASSIGNABLE_STATUSES.includes(job.status)) {
      return {
        statusCode: 400, headers: CORS_HEADERS,
        body: JSON.stringify({ error: `This job is already ${job.status.replace('_', ' ')} and can no longer be reassigned from the dispatch board.` }),
      };
    }

    // ---- Replace the assignment (no unique constraint to .upsert() against) ----
    const { error: deleteError } = await supabase.from('job_technician_assignments').delete().eq('job_id', job_id);
    if (deleteError) throw new Error(deleteError.message);

    const { error: insertError } = await supabase
      .from('job_technician_assignments')
      .insert({ job_id, technician_id, role_on_job: 'lead' });
    if (insertError) throw new Error(insertError.message);

    // ---- Update the job ----
    const newStatus = (job.status === 'draft' && job.scheduled_start) ? 'scheduled' : job.status;
    const { data: updatedJob, error: updateError } = await supabase
      .from('jobs')
      .update({ lead_technician_id: technician_id, status: newStatus })
      .eq('id', job_id)
      .select(`
        id, job_id_public, job_type, trade_category, description, service_address,
        scheduled_start, scheduled_end, status, lead_technician_id, total_estimate, created_at,
        customers ( id, household_name, primary_contact_name, primary_phone ),
        technicians ( id, full_name )
      `)
      .single();
    if (updateError) throw new Error(updateError.message);

    // ---- Audit log (best-effort, real try/catch) ----
    try {
      await supabase.from('access_audit_log').insert({
        user_id: contractorUser.id,
        contractor_id: contractorUser.contractor_id,
        action: 'update',
        field_accessed: 'job_assignment',
        ip_address: event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || null,
        user_agent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
      });
    } catch { /* best-effort */ }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, job: updatedJob }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
