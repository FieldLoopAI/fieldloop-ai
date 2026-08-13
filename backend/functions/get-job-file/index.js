// backend/functions/get-job-file/index.js
// POST /jobs/job-file — backs the "View job file" action on a dispatch-board
// job card. Returns that one job's real field_events timeline (GPS arrivals,
// photos, etc.), written directly by the technician mobile app via its own
// Supabase session — no Lambda in this repo has ever written to
// field_events, this is the first one reading it. Deliberately does NOT
// reuse the old mock "Live field data stream" panel; per the user's
// instruction this only returns the specific job's own details, not a
// separate always-on-FL-2847 panel.
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin']);
    const body = JSON.parse(event.body || '{}');
    const { job_id } = body;

    if (!job_id) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'job_id is required.' }) };
    }

    const supabase = await getSupabaseClient();

    const { data: job } = await supabase
      .from('jobs')
      .select(`
        id, job_id_public, job_type, trade_category, description, service_address,
        scheduled_start, scheduled_end, status, lead_technician_id,
        customers ( household_name, primary_phone ),
        technicians ( id, full_name )
      `)
      .eq('id', job_id).eq('contractor_id', contractorUser.contractor_id).maybeSingle();
    if (!job) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Job not found for your company.' }) };
    }

    const { data: events, error: eventsError } = await supabase
      .from('field_events')
      .select('id, technician_id, event_type, event_ts, s3_object_key, transcript, metadata')
      .eq('job_id', job_id)
      .order('event_ts', { ascending: true });
    if (eventsError) throw new Error(eventsError.message);

    const technicianIds = [...new Set((events || []).map((e) => e.technician_id).filter(Boolean))];
    let techniciansById = {};
    if (technicianIds.length) {
      const { data: techs } = await supabase.from('technicians').select('id, full_name').in('id', technicianIds);
      techniciansById = Object.fromEntries((techs || []).map((t) => [t.id, t.full_name]));
    }

    const enrichedEvents = (events || []).map((e) => ({
      ...e,
      technician_name: techniciansById[e.technician_id] || null,
    }));

    return {
      statusCode: 200, headers: CORS_HEADERS,
      body: JSON.stringify({ job, events: enrichedEvents }),
    };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
