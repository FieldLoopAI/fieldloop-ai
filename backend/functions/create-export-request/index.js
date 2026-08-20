// backend/functions/create-export-request/index.js
// POST /export-requests — real request-tracking only for Panel 9 "Data
// archive & export": writes a genuine data_export_requests row and leaves it
// at status 'queued'. Deliberately does NOT generate a file or a download
// link — no async export pipeline (ZIP/CSV generation, S3 signed URL,
// watermarking) exists in this repo yet. That's real future work, flagged
// in HANDOFF.md, not simulated here the way the old mock UI faked a
// queued→ready transition with a client-side setTimeout.
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };
// Verified live via probe-insert against the real table, not guessed
// (matches the schema doc exactly here, unlike several other tables in this
// project — see HANDOFF.md §3).
const VALID_EXPORT_TYPES = ['full', 'jobs', 'invoices', 'single_job', 'media_only'];
const VALID_OUTPUT_FORMATS = ['zip', 'csv', 'pdf'];

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin']);
    const body = JSON.parse(event.body || '{}');
    const { export_type, date_range_start, date_range_end, include_categories, output_format } = body;

    if (!VALID_EXPORT_TYPES.includes(export_type)) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: `export_type must be one of: ${VALID_EXPORT_TYPES.join(', ')}` }) };
    }
    if (!VALID_OUTPUT_FORMATS.includes(output_format)) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: `output_format must be one of: ${VALID_OUTPUT_FORMATS.join(', ')}` }) };
    }

    const supabase = await getSupabaseClient();
    const { data: exportRequest, error } = await supabase
      .from('data_export_requests')
      .insert({
        contractor_id: contractorUser.contractor_id,
        requested_by: contractorUser.id,
        export_type,
        date_range_start: date_range_start || null,
        date_range_end: date_range_end || null,
        include_categories: Array.isArray(include_categories) ? include_categories : null,
        output_format,
        status: 'queued',
      })
      .select('id, export_type, output_format, status, requested_at')
      .single();
    if (error) throw new Error(error.message);

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, exportRequest }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
