// backend/functions/update-estimate/index.js
// POST /estimates/update — the contractor's ONE real decision point on an
// estimate/change order: approve it for billing, or reject it. Everything
// upstream of this (drafting by voice, sending to the customer, the
// customer's e-signature) happens on the technician's mobile app, not here
// — the contractor dashboard never creates, edits, or sends these records,
// only approves/rejects ones the customer has already signed. Narrowed from
// an earlier version of this Lambda that let the contractor set any status
// and edit price tiers — that was wrong; see HANDOFF.md for the correction.
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };
// The only two transitions the contractor is allowed to make. 'draft',
// 'sent', and 'signed' are all set by the technician's mobile app / the
// customer's e-signature — never by this Lambda.
const CONTRACTOR_SETTABLE_STATUSES = ['approved', 'rejected'];

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin']);
    const body = JSON.parse(event.body || '{}');
    const { estimate_id, status } = body;

    if (!estimate_id || !CONTRACTOR_SETTABLE_STATUSES.includes(status)) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: `estimate_id and a valid status (${CONTRACTOR_SETTABLE_STATUSES.join(', ')}) are required.` }) };
    }

    const supabase = await getSupabaseClient();

    const { data: estimate } = await supabase
      .from('estimates_and_change_orders').select('id, job_id, status')
      .eq('id', estimate_id).maybeSingle();
    if (!estimate) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Estimate not found.' }) };
    }

    const { data: job } = await supabase
      .from('jobs').select('id')
      .eq('id', estimate.job_id).eq('contractor_id', contractorUser.contractor_id).maybeSingle();
    if (!job) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Estimate not found for your company.' }) };
    }

    // Only a customer-signed document is actually awaiting the contractor's
    // decision — approving/rejecting a draft or an unsigned sent estimate
    // would be a real workflow error, not a hypothetical.
    if (estimate.status !== 'signed') {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: `This estimate is '${estimate.status}', not 'signed' — it isn't awaiting your decision yet.` }) };
    }

    const update = { status };
    if (status === 'approved') {
      update.owner_approved_ts = new Date().toISOString();
      update.owner_approved_by = contractorUser.id;
    }

    const { data: updated, error } = await supabase
      .from('estimates_and_change_orders').update(update).eq('id', estimate_id).select().single();
    if (error) throw new Error(error.message);

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, estimate: updated }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
