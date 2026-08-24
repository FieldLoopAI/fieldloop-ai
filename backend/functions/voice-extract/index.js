// backend/functions/voice-extract/index.js
//
// Takes a finished transcript (not audio — Deepgram already turned speech
// into text directly in the browser, see voice-token) and asks GPT-4o to
// pull structured job-creation fields out of it. Never asked to guess:
// anything not clearly stated comes back null, and anything filled in but
// not fully confident about is separately named in flagged_fields so the
// frontend can visually mark it for manual review rather than silently
// trusting it — same principle as never forwarding a masked value as real.
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSecret } = require('./shared/secrets');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

// jobs.job_type only accepts 'service_call' right now (verified live,
// create-job/index.js) — there's nothing for the model to extract here,
// asking it to pick from a one-value enum is pure guess-risk for zero
// benefit, so this is hard-set rather than requested from the LLM.
const FIXED_JOB_TYPE = 'service_call';

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    household_name: { type: ['string', 'null'], description: 'Customer or household name mentioned, e.g. "Anderson family" or "Sarah Anderson".' },
    primary_contact_name: { type: ['string', 'null'], description: 'The specific person to contact, if different/more specific than household_name.' },
    primary_phone: { type: ['string', 'null'], description: 'Customer phone number, digits only or however spoken.' },
    email: { type: ['string', 'null'], description: 'Customer email address, only if explicitly stated.' },
    service_address: { type: ['string', 'null'], description: 'The job/service address.' },
    trade_category: { type: ['string', 'null'], description: 'Short trade label, e.g. "HVAC", "Plumbing", "Roofing".' },
    description: { type: ['string', 'null'], description: 'The problem/scope of work in the contractor\'s own words, lightly cleaned up.' },
    scheduled_start: { type: ['string', 'null'], description: 'ISO 8601 datetime, resolved from any relative phrase ("tomorrow at 2pm") using the provided current date/time/timezone. Null if no time was mentioned.' },
    scheduled_end: { type: ['string', 'null'], description: 'ISO 8601 datetime. Null unless an explicit end time or duration was mentioned.' },
    total_estimate: { type: ['number', 'null'], description: 'Dollar estimate as a plain number, only if an explicit price was stated.' },
    flagged_fields: {
      type: 'array',
      items: { type: 'string' },
      description: 'Names of fields above that you filled in but are not fully confident about (e.g. a mumbled digit, an inferred relative date). Empty array if nothing is uncertain.',
    },
  },
  required: [
    'household_name', 'primary_contact_name', 'primary_phone', 'email', 'service_address',
    'trade_category', 'description', 'scheduled_start', 'scheduled_end', 'total_estimate', 'flagged_fields',
  ],
  additionalProperties: false,
};

exports.handler = async (event) => {
  try {
    await requireContractorRole(event, ['owner_admin', 'dispatcher']);
    const body = JSON.parse(event.body);
    const { transcript, client_now_iso, client_timezone } = body;

    if (!transcript?.trim()) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'transcript is required.' }) };
    }

    let apiKey;
    try {
      const raw = await getSecret('fieldloop/openai-api-key');
      apiKey = JSON.parse(raw).apiKey;
    } catch {
      return {
        statusCode: 400, headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Voice extraction is not configured yet. Add the secret "fieldloop/openai-api-key" (key: apiKey) to AWS Secrets Manager.' }),
      };
    }
    if (!apiKey) {
      return {
        statusCode: 400, headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Voice extraction is not configured yet — fieldloop/openai-api-key is missing its apiKey.' }),
      };
    }

    const systemPrompt = `You extract structured field-service job details from a contractor's spoken description. The current date/time is ${client_now_iso || 'unknown'} in timezone ${client_timezone || 'unknown'} — use this to resolve relative dates like "tomorrow" or "next Tuesday". Only fill in a field if it is clearly stated in the transcript; return null for anything not mentioned or genuinely unclear — never guess a plausible-sounding value. If you do fill in a field but aren't fully confident (a mumbled number, an inferred date), name it in flagged_fields.`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // gpt-4o-mini, not gpt-4o — ~16x cheaper for what is a fixed-schema
        // extraction task, not open-ended reasoning; pinned to the dated
        // snapshot (not the floating "gpt-4o-mini" alias) for the same
        // reason gpt-4o-2024-08-06 was pinned originally: no silent model
        // swap out from under this prompt. Confirmed this snapshot supports
        // Structured Outputs (response_format json_schema, strict:true).
        model: 'gpt-4o-mini-2024-07-18',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: transcript.trim() },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'job_extraction',
            schema: EXTRACTION_SCHEMA,
            strict: true,
          },
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(`OpenAI extraction failed: ${errBody.error?.message || res.statusText}`);
    }

    const completion = await res.json();
    const message = completion.choices?.[0]?.message;
    if (message?.refusal) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: `Extraction was refused: ${message.refusal}` }) };
    }

    let extracted;
    try {
      extracted = JSON.parse(message.content);
    } catch {
      throw new Error('OpenAI returned a non-JSON response.');
    }

    const { flagged_fields, ...fields } = extracted;
    fields.job_type = FIXED_JOB_TYPE;

    return {
      statusCode: 200, headers: CORS_HEADERS,
      body: JSON.stringify({ success: true, extracted: fields, flagged_fields: flagged_fields || [] }),
    };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
