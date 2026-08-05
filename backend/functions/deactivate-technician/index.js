// backend/functions/deactivate-technician/index.js
//
// Soft-delete only. See HANDOFF.md / the approved plan for why: technicians
// are referenced by jobs.lead_technician_id and job_technician_assignments,
// so a hard delete would either violate the FK or destroy completed-job
// history. "Deactivate" sets is_active=false and bans the Supabase Auth
// account (revokes login immediately, keeps auth_user_id intact so historic
// assignment rows stay valid, and is reversible later if reactivation is
// ever built).
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin']);
    const body = JSON.parse(event.body);
    const { technician_id } = body;

    if (!technician_id) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'technician_id is required.' }) };
    }

    const supabase = await getSupabaseClient();

    // ---- Ownership check (service-role key bypasses RLS entirely) ----
    const { data: existingTech } = await supabase
      .from('technicians')
      .select('id, contractor_id, full_name, auth_user_id, is_active')
      .eq('id', technician_id)
      .eq('contractor_id', contractorUser.contractor_id)
      .maybeSingle();

    if (!existingTech || !existingTech.is_active) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Technician not found for your company.' }) };
    }

    // ---- Soft-delete the technicians row ----
    const { error: deactivateError } = await supabase
      .from('technicians')
      .update({ is_active: false })
      .eq('id', technician_id);

    if (deactivateError) throw new Error(`Failed to deactivate technician: ${deactivateError.message}`);

    // ---- Ban the Supabase Auth account. ~100 years is Supabase's own
    // convention for an effectively-permanent ban; set ban_duration:'none'
    // to reverse it if reactivation is ever built. ----
    const { error: banError } = await supabase.auth.admin.updateUserById(existingTech.auth_user_id, {
      ban_duration: '876000h',
    });
    if (banError) throw new Error(`Failed to revoke technician login: ${banError.message}`);

    // ---- Auto-unassign only active jobs. Completed/closed/invoiced/paid
    // jobs keep their technician reference untouched — that's the accurate
    // historical record of who did the work. ----
    const { data: activeJobs } = await supabase
      .from('jobs')
      .select('id')
      .eq('lead_technician_id', technician_id)
      .in('status', ['draft', 'scheduled']);

    if (activeJobs && activeJobs.length > 0) {
      const jobIds = activeJobs.map(j => j.id);

      const { error: clearError } = await supabase
        .from('jobs')
        .update({ lead_technician_id: null })
        .in('id', jobIds);
      if (clearError) throw new Error(`Failed to unassign technician from active jobs: ${clearError.message}`);

      const { error: assignmentError } = await supabase
        .from('job_technician_assignments')
        .delete()
        .eq('technician_id', technician_id)
        .in('job_id', jobIds);
      if (assignmentError) throw new Error(`Failed to remove technician job assignments: ${assignmentError.message}`);
    }

    // ---- Audit log (best-effort, real try/catch) ----
    try {
      await supabase.from('access_audit_log').insert({
        user_id: contractorUser.id,
        contractor_id: contractorUser.contractor_id,
        action: 'delete',
        field_accessed: 'technician_account',
        ip_address: event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || null,
        user_agent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
      });
    } catch { /* best-effort */ }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
