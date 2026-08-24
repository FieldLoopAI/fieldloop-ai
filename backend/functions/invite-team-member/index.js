// backend/functions/invite-team-member/index.js
//
// Team & Access (HANDOFF.md §28.4a's deferred build) — invites a new
// contractor_users row via a one-time setup link, mirroring
// add-technician's exact design (§18) rather than an admin-set password
// shown once. Email-based, not phone-based: dashboard login is email+
// password, unlike a technician's phone-based mobile login.
const crypto = require('crypto');
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');
const { issueSetupToken, buildSetupLink } = require('./shared/teamSetupTokens');
const { sendMessage } = require('./shared/messagingAdapter');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };
// Single admin role only for now, per the project owner's direction — this
// invite flow adds more owner_admin users (e.g. Bob, the Jenex team), not
// different roles. Full multi-role RBAC is deferred; see HANDOFF.md.
const INVITABLE_ROLES = ['owner_admin'];

// Same design as add-technician's generateSecurePassword — 16 chars,
// guaranteed upper/lower/digit/special via crypto.randomInt. Never sent
// anywhere or logged; exists only so the Auth user has *some* password
// until complete-team-setup overwrites it with one the invitee chooses.
function generateSecurePassword(length = 16) {
  const lower = 'abcdefghkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const specials = '!@#$%&*';
  const all = lower + upper + digits + specials;

  const mandatory = [
    lower[crypto.randomInt(lower.length)],
    upper[crypto.randomInt(upper.length)],
    digits[crypto.randomInt(digits.length)],
    specials[crypto.randomInt(specials.length)],
  ];
  const remaining = [];
  for (let i = 0; i < length - mandatory.length; i++) remaining.push(all[crypto.randomInt(all.length)]);
  const combined = [...mandatory, ...remaining];
  for (let i = combined.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }
  return combined.join('');
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin']);
    const body = JSON.parse(event.body);
    const { email, role } = body;

    const errors = [];
    if (!email?.trim()) errors.push('Email is required.');
    else if (!validateEmail(email.trim())) errors.push('Invalid email format.');
    if (!role) errors.push('Role is required.');
    else if (!INVITABLE_ROLES.includes(role)) errors.push(`Role must be one of: ${INVITABLE_ROLES.join(', ')}.`);
    if (errors.length) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: errors.join(' ') }) };
    }

    const cleanEmail = email.trim().toLowerCase();
    const supabase = await getSupabaseClient();

    const { data: existing } = await supabase
      .from('contractor_users')
      .select('id, is_active')
      .eq('contractor_id', contractorUser.contractor_id)
      .eq('email', cleanEmail)
      .maybeSingle();
    if (existing && existing.is_active !== false) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'A team member with this email already exists for your company.' }) };
    }

    const tempPassword = generateSecurePassword();
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: cleanEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { must_change_password: true, contractor_id: contractorUser.contractor_id },
    });
    if (authError) {
      if (authError.message?.includes('already') || authError.message?.includes('exists')) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'An authentication account with this email already exists.' }) };
      }
      throw new Error(authError.message);
    }

    const { data: memberRow, error: insertError } = await supabase
      .from('contractor_users')
      .insert({
        contractor_id: contractorUser.contractor_id,
        email: cleanEmail,
        password_hash: 'unused-supabase-auth-is-source-of-truth',
        role,
        is_designated_admin: false,
        mfa_enabled: false,
        password_changed: false,
        auth_user_id: authUser.user.id,
        invited_by: contractorUser.id,
      })
      .select('id, email, role, is_designated_admin, mfa_enabled, created_at')
      .single();

    if (insertError) {
      await supabase.auth.admin.deleteUser(authUser.user.id).catch(() => {});
      throw new Error(`Failed to create team member record: ${insertError.message}`);
    }

    const { rawToken } = await issueSetupToken(supabase, {
      contractorUserId: memberRow.id,
      createdBy: contractorUser.id,
    });
    const setupLink = buildSetupLink(rawToken);

    const emailSubject = 'You’ve been invited to FieldLoop';
    const emailHtml = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px">
          <h2 style="color:#0f1b2d;margin:0 0 12px">Welcome to FieldLoop</h2>
          <p style="color:#455469;margin:0 0 20px">You've been added to the team as ${role.replace('_', ' ')}. Tap the button below to set your password and finish setup — you'll sign in afterward with this email (${cleanEmail}) and the password you choose.</p>
          <div style="background:#f0f8f4;border:1px solid #c9eed9;border-radius:8px;padding:20px;margin:0 0 20px;text-align:center">
            <a href="${setupLink}" style="display:inline-block;background:#1f9d61;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">Set Your Password</a>
          </div>
          <p style="color:#d02c2c;font-weight:600;margin:0 0 12px">⚠ This expires in 48 hours.</p>
          <p style="color:#8a94a3;font-size:13px;margin:0">If you did not expect this email, please ignore it.</p>
        </div>`;

    const deliveryResult = await sendMessage(supabase, {
      preferredChannel: 'email',
      phone: null,
      email: cleanEmail,
      smsBody: null,
      emailSubject,
      emailHtml,
    });

    try {
      await supabase.from('access_audit_log').insert({
        user_id: contractorUser.id,
        contractor_id: contractorUser.contractor_id,
        action: 'update',
        field_accessed: 'team_member_invited',
        ip_address: event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || null,
        user_agent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
      });
    } catch { /* best-effort */ }

    const response = {
      success: true,
      member: memberRow,
      credential_delivery: {
        channel: 'email',
        channel_used: deliveryResult.channelUsed,
        provider: deliveryResult.provider,
        delivered: deliveryResult.delivered,
      },
    };
    if (!deliveryResult.delivered) {
      response.credential_delivery.reason = deliveryResult.reason;
      response.credential_delivery.setup_link = setupLink;
      response.credential_delivery.warning =
        'The setup link could not be delivered automatically. It is shown once — share it securely with the invitee.';
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
