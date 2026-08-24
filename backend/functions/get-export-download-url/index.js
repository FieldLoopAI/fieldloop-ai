// backend/functions/get-export-download-url/index.js
//
// Mints a fresh, short-lived S3 signed URL on demand for a ready export
// request. Kept deliberately separate from process-export-queue's write —
// download_url_ref only ever stores the S3 *key* (see that Lambda's header
// comment for why: Lambda's execution role has a 1-hour MaxSessionDuration,
// which caps any presigned URL's real validity regardless of the requested
// expiresIn, so a 72-hour-valid link can never be minted once and stored;
// this endpoint re-signs a fresh one, well within that 1-hour cap, every
// time the user actually clicks Download).
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };
const BUCKET = 'fieldloop-data-exports';
const LINK_TTL_SECONDS = 15 * 60;

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin', 'dispatcher', 'bookkeeper']);
    const body = JSON.parse(event.body || '{}');
    const { id } = body;
    if (!id) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'id is required.' }) };
    }

    const supabase = await getSupabaseClient();
    const { data: req } = await supabase
      .from('data_export_requests')
      .select('id, status, download_url_ref, expires_at')
      .eq('id', id)
      .eq('contractor_id', contractorUser.contractor_id)
      .maybeSingle();

    if (!req) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Export request not found for your company.' }) };
    }
    if (req.status !== 'ready') {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: `This export is not ready yet (status: ${req.status}).` }) };
    }
    if (req.expires_at && new Date(req.expires_at) < new Date()) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'This export has expired. Request a new one.' }) };
    }

    const s3 = new S3Client({});
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: req.download_url_ref }), { expiresIn: LINK_TTL_SECONDS });

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ url }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
