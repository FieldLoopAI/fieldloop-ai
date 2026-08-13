// backend/functions/update-technician/index.js
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');
const { issueSetupToken, buildSetupLink, formatSetupCode } = require('./shared/technicianSetupTokens');
const { sendMessage } = require('./shared/messagingAdapter');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

// ---------------------------------------------------------------------------
// Validation helpers — copied verbatim from add-technician/index.js so the
// two Lambdas apply identical rules; keep them in sync if either changes.
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

function validateRate(value) {
  if (value === undefined || value === null || value === '') return true; // optional
  return /^\d+(\.\d{1,2})?$/.test(String(value).trim()) && parseFloat(value) >= 0;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin']);
    const body = JSON.parse(event.body);
    const { technician_id, full_name, email, mobile_phone, role, certifications, hourly_rate, billable_rate } = body;

    if (!technician_id) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'technician_id is required.' }) };
    }

    const supabase = await getSupabaseClient();

    // ---- Ownership check (service-role key bypasses RLS entirely) ----
    // Only active technicians can be edited from this dashboard — a
    // deactivated one has no path back into the roster in this pass.
    const { data: existingTech } = await supabase
      .from('technicians')
      .select('id, contractor_id, mobile_phone, email, delivery_channel, auth_user_id, is_active, password_changed')
      .eq('id', technician_id)
      .eq('contractor_id', contractorUser.contractor_id)
      .maybeSingle();

    if (!existingTech || !existingTech.is_active) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Technician not found for your company.' }) };
    }

    // ---- Validate only the fields actually provided (partial update) ----
    const errors = [];
    if (full_name !== undefined && !full_name?.trim()) errors.push('Full name cannot be blank.');
    if (email !== undefined && email?.trim() && !validateEmail(email.trim())) errors.push('Invalid email format.');
    if (mobile_phone !== undefined) {
      if (!mobile_phone?.trim()) errors.push('Mobile phone cannot be blank — it is the technician\'s login.');
      else if (!validatePhone(mobile_phone.trim())) errors.push('Invalid phone format.');
    }
    if (!validateRate(hourly_rate)) errors.push('Hourly rate must be a non-negative number.');
    if (!validateRate(billable_rate)) errors.push('Billable rate must be a non-negative number.');

    if (errors.length) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: errors.join(' ') }) };
    }

    // ---- Build the partial update payload ----
    const updates = {};
    if (full_name !== undefined) updates.full_name = full_name.trim();
    if (email !== undefined) updates.email = email?.trim() ? email.trim().toLowerCase() : null;
    if (role !== undefined) updates.role = role?.trim() || null;
    if (hourly_rate !== undefined) updates.hourly_rate = hourly_rate !== '' && hourly_rate != null ? parseFloat(hourly_rate) : null;
    if (billable_rate !== undefined) updates.billable_rate = billable_rate !== '' && billable_rate != null ? parseFloat(billable_rate) : null;
    if (certifications !== undefined) {
      let certsArray = null;
      if (certifications) {
        certsArray = Array.isArray(certifications)
          ? certifications.filter(c => c?.trim())
          : certifications.split(',').map(c => c.trim()).filter(Boolean);
        if (certsArray.length === 0) certsArray = null;
      }
      updates.certifications = certsArray;
    }

    // ---- Phone change: this is the technician's actual login identity, not
    // just contact info, so Supabase Auth has to move in lockstep or their
    // login silently breaks. Skipped entirely if unchanged, to avoid
    // pointless phone_confirm churn on every unrelated edit. ----
    let notificationWarning = null;
    if (mobile_phone !== undefined) {
      const cleanPhone = normalizeE164(mobile_phone.trim());
      if (cleanPhone !== existingTech.mobile_phone) {
        const { data: dupe } = await supabase
          .from('technicians')
          .select('id')
          .eq('contractor_id', contractorUser.contractor_id)
          .eq('mobile_phone', cleanPhone)
          .neq('id', technician_id)
          .maybeSingle();
        if (dupe) {
          return {
            statusCode: 400, headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'A technician with this mobile number already exists for your company.' }),
          };
        }

        const { error: authError } = await supabase.auth.admin.updateUserById(existingTech.auth_user_id, {
          phone: cleanPhone,
          phone_confirm: true,
        });
        if (authError) {
          if (authError.message?.includes('already') || authError.message?.includes('exists')) {
            return {
              statusCode: 400, headers: CORS_HEADERS,
              body: JSON.stringify({ error: 'An authentication account with this phone number already exists.' }),
            };
          }
          throw new Error(authError.message);
        }

        updates.mobile_phone = cleanPhone;

        // Delivery routes through the shared messaging adapter (HANDOFF.md
        // §19) — the technician's current email (possibly changing in this
        // same call) is passed alongside the phone so dev_email mode has
        // somewhere to actually deliver to; preferredChannel mirrors their
        // originally-chosen delivery_channel and is only honored in
        // prod_sms mode.
        const currentEmail = updates.email !== undefined ? updates.email : existingTech.email;

        if (existingTech.password_changed === false) {
          // The technician hasn't completed setup yet — any setup link
          // already sent went to the OLD (likely typo'd) number, and
          // whoever holds that SMS still has a fully valid link that could
          // let them claim this technician's account. Invalidate every
          // outstanding token and immediately issue + send a fresh one to
          // the corrected number, rather than leaving the old link live.
          await supabase.from('technician_setup_tokens')
            .update({ used_at: new Date().toISOString(), consumed_reason: 'phone_changed' })
            .eq('technician_id', technician_id)
            .is('used_at', null);

          const { rawToken, rawCode } = await issueSetupToken(supabase, {
            technicianId: technician_id,
            createdBy: contractorUser.id,
          });
          const setupLink = buildSetupLink(rawToken);
          const displayCode = formatSetupCode(rawCode);
          const smsBody = [
            'FieldLoop — Your technician account login number was updated.',
            `Open the app and enter setup code ${displayCode}, or tap this link: ${setupLink}`,
            'This expires in 48 hours.',
          ].join('\n');
          const emailSubject = 'Your FieldLoop technician login number was updated';
          const emailHtml = `<p>Your technician account login number was updated. Open the FieldLoop app and enter setup code <strong>${displayCode}</strong>, or tap below, to set your password and finish setup:</p><p><a href="${setupLink}">Set Your Password</a></p><p>This expires in 48 hours.</p>`;
          const deliveryResult = await sendMessage(supabase, {
            preferredChannel: existingTech.delivery_channel,
            phone: cleanPhone,
            email: currentEmail,
            smsBody,
            emailSubject,
            emailHtml,
          }).catch(() => ({ delivered: false, reason: 'Delivery failed.' }));
          if (!deliveryResult.delivered) {
            notificationWarning = `Login phone updated, but the new setup link could not be delivered automatically (${deliveryResult.reason}). Use "Resend setup link" from the roster to share it with the technician.`;
          }
        } else {
          const smsBody = `FieldLoop — Your technician account login phone number has changed to ${cleanPhone}. Use this number to sign in going forward.`;
          const emailSubject = 'Your FieldLoop technician login number changed';
          const emailHtml = `<p>Your technician account login phone number has changed to <strong>${cleanPhone}</strong>. Use this number to sign in going forward.</p>`;
          const deliveryResult = await sendMessage(supabase, {
            preferredChannel: existingTech.delivery_channel,
            phone: cleanPhone,
            email: currentEmail,
            smsBody,
            emailSubject,
            emailHtml,
          }).catch(() => ({ delivered: false, reason: 'Delivery failed.' }));
          if (!deliveryResult.delivered) {
            notificationWarning = `Login phone updated, but the change-notification message could not be delivered automatically (${deliveryResult.reason}). Let the technician know their login number changed to ${cleanPhone}.`;
          }
        }
      }
    }

    // ---- Email change: sync to the Auth user as a real, confirmed identity.
    // add-technician now registers email as a second Auth identity whenever
    // one is on file (so "identifier: email or phone" works on login) — this
    // keeps that in lockstep on edit, same reasoning as the phone-change
    // block above. Only fires when the email actually changed and isn't
    // being cleared, to avoid pointless email_confirm churn on unrelated
    // edits and to avoid Supabase Auth email-removal semantics, which
    // aren't needed here.
    if (email !== undefined && updates.email && updates.email !== existingTech.email) {
      const { error: emailAuthError } = await supabase.auth.admin.updateUserById(existingTech.auth_user_id, {
        email: updates.email,
        email_confirm: true,
      });
      if (emailAuthError) {
        if (emailAuthError.message?.includes('already') || emailAuthError.message?.includes('exists')) {
          return {
            statusCode: 400, headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'An authentication account with this email already exists.' }),
          };
        }
        throw new Error(emailAuthError.message);
      }
    }

    if (Object.keys(updates).length === 0) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'No fields provided to update.' }) };
    }

    const { data: techRow, error: updateError } = await supabase
      .from('technicians')
      .update(updates)
      .eq('id', technician_id)
      .select('id, full_name, email, mobile_phone, role, certifications, hourly_rate, billable_rate, invite_status, created_at')
      .single();

    if (updateError) throw new Error(`Failed to update technician: ${updateError.message}`);

    // ---- Audit log (best-effort, real try/catch — supabase-js query
    // builders only implement .then(), not .catch()) ----
    try {
      await supabase.from('access_audit_log').insert({
        user_id: contractorUser.id,
        contractor_id: contractorUser.contractor_id,
        action: 'update',
        field_accessed: 'technician_account',
        ip_address: event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || null,
        user_agent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
      });
    } catch { /* best-effort */ }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, technician: techRow, warning: notificationWarning }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
