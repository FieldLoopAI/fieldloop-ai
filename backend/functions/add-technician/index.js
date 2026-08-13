// backend/functions/add-technician/index.js
const crypto = require('crypto');
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');
const { issueSetupToken, buildSetupLink, formatSetupCode } = require('./shared/technicianSetupTokens');
const { sendMessage } = require('./shared/messagingAdapter');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

// ---------------------------------------------------------------------------
// Password generation — 16 chars, guaranteed upper/lower/digit/special.
// Uses crypto.randomInt (CSPRNG) for unbiased index selection.
// ---------------------------------------------------------------------------
function generateSecurePassword(length = 16) {
  const lower   = 'abcdefghkmnpqrstuvwxyz';   // no i/l/o (ambiguous)
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';  // no I/O
  const digits  = '23456789';                   // no 0/1
  const specials = '!@#$%&*';
  const all = lower + upper + digits + specials;

  // One from each category guarantees complexity rules
  const mandatory = [
    lower[crypto.randomInt(lower.length)],
    upper[crypto.randomInt(upper.length)],
    digits[crypto.randomInt(digits.length)],
    specials[crypto.randomInt(specials.length)],
  ];

  const remaining = [];
  for (let i = 0; i < length - mandatory.length; i++) {
    remaining.push(all[crypto.randomInt(all.length)]);
  }

  // Fisher–Yates shuffle so the mandatory chars aren't always first
  const combined = [...mandatory, ...remaining];
  for (let i = combined.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }
  return combined.join('');
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone) {
  const cleaned = phone.replace(/[\s\-().+]/g, '');
  return /^\d{10,15}$/.test(cleaned);
}

function normalizeE164(phone) {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return phone;
  if (phone.trim().startsWith('+')) return '+' + digits;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return '+' + digits;
}

// isFinite-based check — parseFloat('abc') is NaN but parseFloat('12abc') is
// 12, so this also rejects trailing-garbage numeric strings a naive isNaN
// check would silently accept.
function validateRate(value) {
  if (value === undefined || value === null || value === '') return true; // optional
  return /^\d+(\.\d{1,2})?$/.test(String(value).trim()) && parseFloat(value) >= 0;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
exports.handler = async (event) => {
  try {
    // Only owner_admin can add technicians
    const contractorUser = await requireContractorRole(event, ['owner_admin']);
    const body = JSON.parse(event.body);

    const {
      full_name, email, mobile_phone, role,
      certifications, delivery_channel,
      hourly_rate, billable_rate,
    } = body;

    // ---- Validate ----
    // Mobile phone is the technician's login identity (Supabase Auth
    // phone+password) — always required. Email is optional contact info,
    // required only when the contractor picks email as the delivery
    // channel for the generated password.
    const errors = [];
    if (!full_name?.trim())    errors.push('Full name is required.');
    if (!mobile_phone?.trim()) errors.push('Mobile phone is required.');
    else if (!validatePhone(mobile_phone.trim())) errors.push('Invalid phone format.');
    if (email?.trim() && !validateEmail(email.trim())) errors.push('Invalid email format.');
    if (!delivery_channel)     errors.push('Delivery channel is required.');
    else if (!['sms', 'email'].includes(delivery_channel))
      errors.push('Delivery channel must be "sms" or "email".');
    if (delivery_channel === 'email' && !email?.trim())
      errors.push('Email is required when the delivery channel is set to email.');
    if (!validateRate(hourly_rate)) errors.push('Hourly rate must be a non-negative number.');
    if (!validateRate(billable_rate)) errors.push('Billable rate must be a non-negative number.');

    if (errors.length) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: errors.join(' ') }) };
    }

    const cleanEmail = email?.trim() ? email.trim().toLowerCase() : null;
    const cleanPhone = normalizeE164(mobile_phone);

    const supabase = await getSupabaseClient();

    // ---- Uniqueness check (per-contractor; Supabase Auth itself enforces
    // global phone uniqueness across the whole project below) ----
    const { data: existing } = await supabase
      .from('technicians')
      .select('id')
      .eq('contractor_id', contractorUser.contractor_id)
      .eq('mobile_phone', cleanPhone)
      .maybeSingle();

    if (existing) {
      return {
        statusCode: 400, headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'A technician with this mobile number already exists for your company.' }),
      };
    }

    // ---- Generate an internal-only Auth password. The technician never
    // sees this value — it exists purely so the Supabase Auth user has
    // *some* password on creation (there's no verified "passwordless phone
    // user" creation path), and gets fully overwritten by
    // complete-technician-setup once the technician picks their own via the
    // setup link below. Never sent in SMS/email, never logged, never
    // returned in any API response. ----
    const tempPassword = generateSecurePassword();

    // ---- Create Supabase Auth user — phone identity, NOT email.
    // Technicians must only ever be able to sign into their mobile app; they
    // deliberately get no contractor_users row, since the web Contractor
    // Command Dashboard has no per-role content gating and a contractor_users
    // row is what the web login checks for. ----
    // Email is registered as a second, pre-confirmed Auth identity (not just
    // the technicians.email contact column) whenever one is on file — the
    // mobile login screen accepts "identifier: email or phone", and without
    // this, signInWithPassword({ email }) has no identity to match against
    // and would always fail for a technician who has an email.
    const authPayload = {
      phone: cleanPhone,
      password: tempPassword,
      phone_confirm: true,
      user_metadata: {
        must_change_password: true,
        contractor_id: contractorUser.contractor_id,
      },
    };
    if (cleanEmail) {
      authPayload.email = cleanEmail;
      authPayload.email_confirm = true;
    }

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser(authPayload);

    if (authError) {
      if (authError.message?.includes('already') || authError.message?.includes('exists')) {
        return {
          statusCode: 400, headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'An authentication account with this phone number or email already exists.' }),
        };
      }
      throw new Error(authError.message);
    }

    // ---- Parse certifications (comma-separated string → text[]) ----
    let certsArray = null;
    if (certifications) {
      certsArray = Array.isArray(certifications)
        ? certifications.filter(c => c?.trim())
        : certifications.split(',').map(c => c.trim()).filter(Boolean);
      if (certsArray.length === 0) certsArray = null;
    }

    // ---- Insert technician row ----
    const { data: techRow, error: techError } = await supabase
      .from('technicians')
      .insert({
        contractor_id: contractorUser.contractor_id,
        full_name: full_name.trim(),
        email: cleanEmail,
        mobile_phone: cleanPhone,
        role: role?.trim() || null,
        certifications: certsArray,
        hourly_rate: hourly_rate !== '' && hourly_rate != null ? parseFloat(hourly_rate) : null,
        billable_rate: billable_rate !== '' && billable_rate != null ? parseFloat(billable_rate) : null,
        auth_user_id: authUser.user.id,
        password_changed: false,
        invite_status: 'pending',
        invite_sent_ts: new Date().toISOString(),
        delivery_channel,
        created_by: contractorUser.id,
      })
      .select('id, full_name, email, mobile_phone, role, certifications, invite_status, created_at')
      .single();

    if (techError) {
      // Roll back the auth user we just created
      await supabase.auth.admin.deleteUser(authUser.user.id).catch(() => {});
      throw new Error(`Failed to create technician record: ${techError.message}`);
    }

    // ---- Issue a one-time setup link instead of sending a password.
    // Expires in 48h; a resend (see resend-technician-setup) issues a
    // second, independently-valid token rather than invalidating this one —
    // both stay live until whichever is used first. ----
    const { rawToken, rawCode } = await issueSetupToken(supabase, {
      technicianId: techRow.id,
      createdBy: contractorUser.id,
    });
    const setupLink = buildSetupLink(rawToken);
    const displayCode = formatSetupCode(rawCode);

    // ---- Deliver the setup link + code via the shared messaging adapter
    // (see HANDOFF.md §19) — routes through Twilio/SES/simulation-log
    // depending on MESSAGING_PROVIDER, without this Lambda needing to know
    // which. Both a link (web fallback, §18) and a code (in-app entry,
    // §21.2) are sent together — same underlying secret, two ways to use
    // it, so whichever surface the technician has available works. ----
    const smsBody = [
      'FieldLoop — Your technician account is ready.',
      `Open the app and enter setup code ${displayCode}, or tap this link: ${setupLink}`,
      'This expires in 48 hours.',
    ].join('\n');
    const emailSubject = 'Your FieldLoop Technician Account';
    const emailHtml = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px">
          <h2 style="color:#0f1b2d;margin:0 0 12px">Welcome to FieldLoop</h2>
          <p style="color:#455469;margin:0 0 20px">Your technician account has been created. Open the FieldLoop app and enter the setup code below, or tap the button, to set your password and finish setup — you'll sign in afterward using your phone number (${cleanPhone}) and the password you choose.</p>
          <div style="background:#f0f8f4;border:1px solid #c9eed9;border-radius:8px;padding:20px;margin:0 0 20px;text-align:center">
            <p style="font-family:monospace;font-size:24px;letter-spacing:2px;font-weight:700;color:#0f1b2d;margin:0 0 16px">${displayCode}</p>
            <a href="${setupLink}" style="display:inline-block;background:#1f9d61;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">Set Your Password</a>
          </div>
          <p style="color:#d02c2c;font-weight:600;margin:0 0 12px">⚠ This expires in 48 hours.</p>
          <p style="color:#8a94a3;font-size:13px;margin:0">If you did not expect this email, please ignore it.</p>
        </div>`;

    const deliveryResult = await sendMessage(supabase, {
      preferredChannel: delivery_channel,
      phone: cleanPhone,
      email: cleanEmail,
      smsBody,
      emailSubject,
      emailHtml,
    });

    // ---- Update invite_status if delivered ----
    if (deliveryResult.delivered) {
      await supabase.from('technicians')
        .update({ invite_status: 'active' })
        .eq('id', techRow.id);
      techRow.invite_status = 'active';
    }

    // ---- Audit log (best-effort — supabase-js query builders only
    // implement .then(), not .catch(), so this needs a real try/catch) ----
    try {
      await supabase.from('access_audit_log').insert({
        user_id: contractorUser.id,
        contractor_id: contractorUser.contractor_id,
        // 'create' is not a valid access_audit_log.action value (verified via
        // probe-insert against the live CHECK constraint) — silently rejected
        // before this fix, meaning technician creation was never actually
        // audit-logged. 'update' is confirmed valid and matches the value
        // create-contractor's own audit call already uses.
        action: 'update',
        field_accessed: 'technician_account',
        ip_address: event.requestContext?.http?.sourceIp
          || event.requestContext?.identity?.sourceIp || null,
        user_agent: event.headers?.['user-agent']
          || event.headers?.['User-Agent'] || null,
      });
    } catch { /* best-effort */ }

    // ---- Response ----
    const response = {
      success: true,
      technician: techRow,
      credential_delivery: {
        channel: delivery_channel,
        channel_used: deliveryResult.channelUsed,
        provider: deliveryResult.provider,
        delivered: deliveryResult.delivered,
      },
    };

    // If delivery failed, surface the setup link + code so the contractor
    // can share them manually (one-time display, over HTTPS) — never a
    // password, since no password exists yet until the technician sets one
    // themself.
    if (!deliveryResult.delivered) {
      response.credential_delivery.reason = deliveryResult.reason;
      response.credential_delivery.setup_link = setupLink;
      response.credential_delivery.setup_code = displayCode;
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
