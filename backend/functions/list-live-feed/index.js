// backend/functions/list-live-feed/index.js
// POST /jobs/live-feed — backs Panel 6 "Live field data stream". Real data
// for every job the contractor has actively en_route/on_site right now,
// each with its own recent field_events (written by the technician mobile
// app — see get-job-file's header comment; nothing in this repo writes to
// field_events). Deliberately narrower than "every job with events" — a
// job that's scheduled/complete/paid/invoiced already has a real historical
// view via get-job-file/JobFileModal, so this endpoint only ever returns
// what's genuinely happening right now.
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };
const ACTIVE_STATUSES = ['en_route', 'on_site'];
const EVENTS_PER_JOB = 5;

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin', 'dispatcher', 'bookkeeper', 'field_lead']);
    const supabase = await getSupabaseClient();

    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select(`
        id, job_id_public, job_type, trade_category, description, service_address,
        status, lead_technician_id,
        customers ( household_name, primary_phone ),
        technicians ( id, full_name )
      `)
      .eq('contractor_id', contractorUser.contractor_id)
      .in('status', ACTIVE_STATUSES);
    if (jobsError) throw new Error(jobsError.message);

    const jobIds = jobs.map((j) => j.id);
    let eventsByJob = {};
    let techniciansById = {};
    if (jobIds.length > 0) {
      const { data: events, error: eventsError } = await supabase
        .from('field_events')
        .select('id, job_id, technician_id, event_type, event_ts, s3_object_key, transcript, metadata')
        .in('job_id', jobIds)
        .order('event_ts', { ascending: false });
      if (eventsError) throw new Error(eventsError.message);

      const technicianIds = [...new Set((events || []).map((e) => e.technician_id).filter(Boolean))];
      if (technicianIds.length) {
        const { data: techs } = await supabase.from('technicians').select('id, full_name').in('id', technicianIds);
        techniciansById = Object.fromEntries((techs || []).map((t) => [t.id, t.full_name]));
      }

      // Events already come back newest-first from the query above, so
      // capping each job's array to the first EVENTS_PER_JOB entries
      // encountered gives the N most recent per job with no extra sort.
      for (const e of events || []) {
        if (!eventsByJob[e.job_id]) eventsByJob[e.job_id] = [];
        if (eventsByJob[e.job_id].length < EVENTS_PER_JOB) {
          eventsByJob[e.job_id].push({ ...e, technician_name: techniciansById[e.technician_id] || null });
        }
      }
    }

    const enrichedJobs = jobs.map((j) => ({
      ...j,
      events: eventsByJob[j.id] || [],
      most_recent_event_ts: (eventsByJob[j.id] || [])[0]?.event_ts || null,
    }));

    // Freshest activity first; jobs with no events yet sort last.
    enrichedJobs.sort((a, b) => {
      if (!a.most_recent_event_ts && !b.most_recent_event_ts) return 0;
      if (!a.most_recent_event_ts) return 1;
      if (!b.most_recent_event_ts) return -1;
      return new Date(b.most_recent_event_ts) - new Date(a.most_recent_event_ts);
    });

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ jobs: enrichedJobs }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
