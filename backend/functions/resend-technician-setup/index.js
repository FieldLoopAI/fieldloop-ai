// backend/functions/resend-technician-setup/index.js
//
// Issues a fresh technician_setup_tokens row and resends it, for a
// technician who hasn't completed setup yet (lost the SMS, let it expire,
// etc). Deliberately does NOT touch any existing unexpired token for the
// same technician — an explicit product decision: both the old and new
// links stay valid until whichever is used first (see
// complete-technician-setup, which invalidates all siblings the moment any
// one of them is actually used).
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');
const { issueSetupToken, buildSetupLink } = require('./shared/technicianSetupTokens');
const { sendMessage } = require('./shared/messagingAdapter');

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

    const { data: tech } = await supabase
      .from('technicians')
      .select('id, full_name, email, mobile_phone, delivery_channel, password_changed, is_active')
      .eq('id', technician_id)
      .eq('contractor_id', contractorUser.contractor_id)
      .maybeSingle();

    if (!tech || !tech.is_active) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Technician not found for your company.' }) };
    }

    // Resend is meaningless once setup is already complete — the roster UI
    // hides the button in this case too, this is the server-side backstop.
    if (tech.password_changed) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'This technician has already completed setup.' }) };
    }

    const { rawToken } = await issueSetupToken(supabase, {
      technicianId: tech.id,
      createdBy: contractorUser.id,
    });
    const setupLink = buildSetupLink(rawToken);

    // Delivery routes through the shared messaging adapter (HANDOFF.md §19)
    // instead of this Lambda's own Twilio/SES branching.
    const smsBody = [
      'FieldLoop — Here is a new setup link for your technician account.',
      `Tap the link to set your password and finish setup: ${setupLink}`,
      'This link expires in 48 hours.',
    ].join('\n');
    const emailSubject = 'Your FieldLoop Technician Account — Setup Link';
    const emailHtml = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px">
          <h2 style="color:#0f1b2d;margin:0 0 12px">Finish setting up your FieldLoop account</h2>
          <p style="color:#455469;margin:0 0 20px">Tap below to set your password and finish setup — you'll sign in on the FieldLoop mobile app afterward using your phone number (${tech.mobile_phone}) and the password you choose.</p>
          <div style="background:#f0f8f4;border:1px solid #c9eed9;border-radius:8px;padding:20px;margin:0 0 20px;text-align:center">
            <a href="${setupLink}" style="display:inline-block;background:#1f9d61;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">Set Your Password</a>
          </div>
          <p style="color:#d02c2c;font-weight:600;margin:0 0 12px">⚠ This link expires in 48 hours.</p>
          <p style="color:#8a94a3;font-size:13px;margin:0">If you did not expect this email, please ignore it.</p>
        </div>`;

    const deliveryResult = await sendMessage(supabase, {
      preferredChannel: tech.delivery_channel,
      phone: tech.mobile_phone,
      email: tech.email,
      smsBody,
      emailSubject,
      emailHtml,
    });

    try {
      await supabase.from('access_audit_log').insert({
        user_id: contractorUser.id,
        contractor_id: contractorUser.contractor_id,
        action: 'update',
        field_accessed: 'technician_setup_resend',
        ip_address: event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || null,
        user_agent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
      });
    } catch { /* best-effort */ }

    const response = {
      success: true,
      credential_delivery: {
        channel: tech.delivery_channel,
        channel_used: deliveryResult.channelUsed,
        provider: deliveryResult.provider,
        delivered: deliveryResult.delivered,
      },
    };
    if (!deliveryResult.delivered) {
      response.credential_delivery.reason = deliveryResult.reason;
      response.credential_delivery.setup_link = setupLink;
      response.credential_delivery.warning =
        'The setup link could not be delivered automatically. It is shown once — share it securely with the technician.';
    }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(response) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
