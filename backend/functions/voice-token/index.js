// backend/functions/voice-token/index.js
//
// Mints a short-lived, scoped Deepgram token so the browser can stream mic
// audio directly to Deepgram's WebSocket without ever seeing the long-lived
// master API key. This is what keeps the persistent streaming connection
// off this repo's Lambda backend entirely (browser <-> Deepgram directly) —
// the Lambda's only job is a fast, stateless "mint a token" call, exactly
// the kind of request AWS Lambda is a good fit for, sidestepping the
// cold-start-vs-persistent-connection concern the FieldLoop AI planning
// docs raise about using Lambda for the voice pipeline generally.
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSecret } = require('./shared/secrets');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

// Long enough to cover describing a real job by voice, short enough that a
// leaked token (e.g. from a browser devtools inspection) isn't useful for
// long. Deepgram's own default is 30s; this is intentionally more generous.
const TOKEN_TTL_SECONDS = 300;

exports.handler = async (event) => {
  try {
    await requireContractorRole(event, ['owner_admin', 'dispatcher']);

    let apiKey;
    try {
      const raw = await getSecret('fieldloop/deepgram-credentials');
      apiKey = JSON.parse(raw).apiKey;
    } catch {
      return {
        statusCode: 400, headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Voice capture is not configured yet. Add the secret "fieldloop/deepgram-credentials" (key: apiKey) to AWS Secrets Manager.' }),
      };
    }
    if (!apiKey) {
      return {
        statusCode: 400, headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Voice capture is not configured yet — fieldloop/deepgram-credentials is missing its apiKey.' }),
      };
    }

    const res = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl_seconds: TOKEN_TTL_SECONDS }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(`Deepgram token grant failed: ${errBody.err_msg || res.statusText}`);
    }

    const { access_token, expires_in } = await res.json();
    return {
      statusCode: 200, headers: CORS_HEADERS,
      body: JSON.stringify({ success: true, token: access_token, expires_in }),
    };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
