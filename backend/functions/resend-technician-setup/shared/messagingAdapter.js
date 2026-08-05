// backend/functions/shared/messagingAdapter.js
//
// Provider-adapter for all client/technician-facing message delivery (SMS +
// email), decoupling "what gets sent" from "how it actually leaves this
// system" — built in response to an external $0-cost messaging directive
// (see HANDOFF.md §19). Three modes, chosen via the MESSAGING_PROVIDER
// Lambda environment variable:
//
//   'dev_log'   — never sends anything real; records what WOULD have been
//                 sent into `simulated_messages` for inspection.
//   'dev_email' — routes EVERYTHING through real AWS SES email, regardless
//                 of the caller's preferredChannel. This is the directive's
//                 stated Phase 1 default: it lets an Alpha tester actually
//                 receive something on a real device at $0 telecom cost,
//                 not just an admin-facing fallback banner. Requires an
//                 email address for the recipient; fails gracefully (not an
//                 error) if none is on file.
//   'prod_sms'  — real production behavior, unchanged from what this
//                 project did before this adapter existed: honors
//                 preferredChannel (SMS via Twilio, or email via SES if
//                 that's what was actually chosen), falling back to
//                 whichever destination is available.
//
// Twilio/SES credentials remain unpopulated in this project until go-live
// is approved (HANDOFF.md §10) — this file doesn't change that contract,
// just centralizes the graceful-degradation logic that used to be
// duplicated across add-technician/update-technician/resend-technician-setup.
const { getSecret } = require('./secrets');

async function sendSmsReal(phone, message) {
  let creds;
  try {
    const raw = await getSecret('fieldloop/twilio-credentials');
    creds = JSON.parse(raw);
  } catch {
    return {
      delivered: false,
      reason: 'Twilio credentials not configured. Add the secret "fieldloop/twilio-credentials" to AWS Secrets Manager with keys: accountSid, authToken, fromNumber.',
    };
  }

  const { accountSid, authToken, fromNumber } = creds;
  if (!accountSid || !authToken || !fromNumber) {
    return { delivered: false, reason: 'Twilio credentials incomplete — required keys: accountSid, authToken, fromNumber.' };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({ To: phone, From: fromNumber, Body: message });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { delivered: false, reason: `Twilio error: ${err.message || res.statusText}` };
  }
  return { delivered: true };
}

async function sendEmailReal(to, subject, htmlBody) {
  let SESClient, SendEmailCommand;
  try {
    ({ SESClient, SendEmailCommand } = require('@aws-sdk/client-ses'));
  } catch {
    return { delivered: false, reason: 'AWS SES SDK not available.' };
  }

  let senderEmail;
  try {
    const raw = await getSecret('fieldloop/ses-credentials');
    senderEmail = JSON.parse(raw).senderEmail;
  } catch {
    return {
      delivered: false,
      reason: 'SES sender not configured. Add the secret "fieldloop/ses-credentials" to AWS Secrets Manager with key: senderEmail.',
    };
  }
  if (!senderEmail) {
    return { delivered: false, reason: 'senderEmail not set in fieldloop/ses-credentials.' };
  }

  const ses = new SESClient({});
  try {
    await ses.send(new SendEmailCommand({
      Source: senderEmail,
      Destination: { ToAddresses: [to] },
      Message: { Subject: { Data: subject }, Body: { Html: { Data: htmlBody } } },
    }));
    return { delivered: true };
  } catch (err) {
    return { delivered: false, reason: `SES error: ${err.message}` };
  }
}

async function logSimulatedMessage(supabase, { provider, channelUsed, phone, email, subject, body }) {
  try {
    await supabase.from('simulated_messages').insert({
      provider, channel_used: channelUsed,
      phone: phone || null, email: email || null,
      subject: subject || null, body: body || null,
    });
  } catch { /* best-effort — dev_log mode must never fail a real request over its own logging */ }
}

// preferredChannel: 'sms' or 'email' — the caller's actual intent (e.g. a
// technician's chosen delivery_channel). Only honored in 'prod_sms' mode;
// 'dev_email' overrides it deliberately, 'dev_log' just records it.
async function sendMessage(supabase, { preferredChannel, phone, email, smsBody, emailSubject, emailHtml }) {
  const provider = process.env.MESSAGING_PROVIDER || 'dev_email';

  if (provider === 'dev_log') {
    const channelUsed = preferredChannel === 'email' ? 'email' : (phone ? 'sms' : 'email');
    await logSimulatedMessage(supabase, {
      provider, channelUsed, phone, email,
      subject: emailSubject, body: channelUsed === 'sms' ? smsBody : emailHtml,
    });
    return { delivered: true, simulated: true, provider, channelUsed };
  }

  if (provider === 'dev_email') {
    if (!email) {
      return { delivered: false, provider, channelUsed: 'email', reason: 'dev_email mode requires an email address on file for this recipient, and none is set.' };
    }
    const result = await sendEmailReal(email, emailSubject, emailHtml);
    return { ...result, provider, channelUsed: 'email' };
  }

  // prod_sms — real production behavior, honors the actual chosen channel.
  if (preferredChannel === 'email' && email) {
    return { ...(await sendEmailReal(email, emailSubject, emailHtml)), provider, channelUsed: 'email' };
  }
  if (preferredChannel !== 'email' && phone) {
    return { ...(await sendSmsReal(phone, smsBody)), provider, channelUsed: 'sms' };
  }
  // Fallback if the preferred destination isn't actually available.
  if (email) return { ...(await sendEmailReal(email, emailSubject, emailHtml)), provider, channelUsed: 'email' };
  if (phone) return { ...(await sendSmsReal(phone, smsBody)), provider, channelUsed: 'sms' };
  return { delivered: false, provider, reason: 'No phone or email destination available.' };
}

module.exports = { sendMessage };
