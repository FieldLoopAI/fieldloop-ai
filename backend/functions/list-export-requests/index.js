// backend/functions/list-export-requests/index.js
// POST /export-requests/list — real data for Panel 9 "Data archive & export".
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin']);
    const supabase = await getSupabaseClient();

    const { data: requests, error } = await supabase
      .from('data_export_requests')
      .select('id, export_type, date_range_start, date_range_end, include_categories, output_format, status, file_size_bytes, expires_at, requested_at, completed_at')
      .eq('contractor_id', contractorUser.contractor_id)
      .order('requested_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ requests }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
