// backend/functions/complete-technician-setup/index.js
//
// The one endpoint in this system NOT authenticated via requireRole/
// requireContractorRole — the technician has no working password yet (that
// is exactly what this call sets), so there is no JWT to check. Two ways
// in, both "possession of a secret" instead of a JWT:
//
//   - { token, new_password } — the original web-link flow (§18). The
//     token is a 256-bit value; its own entropy is the entire brute-force
//     defense, no rate limiting applied or needed on this path.
//   - { phone, code, new_password } — the newer in-app "have a setup code?"
//     flow (§21.2). The code is short and human-typable by necessity, so it
//     carries far less entropy — defended instead by attempt-count lockout
//     (technician_setup_attempts), checked before the code is ever compared.
//
// Both paths converge on the same finalization logic and both invalidate
// every other outstanding token/code for the technician once one succeeds.
// Called by the web fallback page (src/technician-setup/TechnicianSetupPage.jsx)
// and by the future Flutter mobile app — see HANDOFF.md §21.2 /
// MOBILE_TEAM_HANDOFF.md §2.2a for the mobile-app contract this was built
// against.
const { getSupabaseClient } = require('./shared/supabaseClient');
const { hashToken, canonicalizeCode } = require('./shared/technicianSetupTokens');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

// Single generic message for every "this doesn't work" case — token not
// found/expired/used, code not found/expired/used/locked-out, or the
// technician was deactivated in the meantime. Deliberately never
// distinguishes which, so a second person holding an old/superseded
// SMS — or an attacker probing — learns nothing about actual state.
const INVALID_SETUP_ERROR = 'This setup code or link is invalid or has expired.';

const MAX_CODE_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

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

// Shared completion logic for both paths — sets the real Auth password,
// flips technicians.password_changed/invite_status, invalidates every
// outstanding token/code row for this technician (marking the one actually
// used as 'completed', every sibling as 'superseded_by_sibling'), clears
// any code-attempt lockout, and best-effort audit-logs the action.
async function finalizeSetup(supabase, { usedTokenRowId, tech, newPassword, event }) {
  const { error: authError } = await supabase.auth.admin.updateUserById(tech.auth_user_id, {
    password: newPassword,
  });
  if (authError) throw new Error(authError.message);

  const { error: techError } = await supabase
    .from('technicians')
    .update({ password_changed: true, invite_status: 'active' })
    .eq('id', tech.id);
  if (techError) throw new Error(`Failed to finalize technician setup: ${techError.message}`);

  await supabase.from('technician_setup_tokens')
    .update({ used_at: new Date().toISOString(), consumed_reason: 'completed' })
    .eq('id', usedTokenRowId);
  await supabase.from('technician_setup_tokens')
    .update({ used_at: new Date().toISOString(), consumed_reason: 'superseded_by_sibling' })
    .eq('technician_id', tech.id)
    .is('used_at', null)
    .neq('id', usedTokenRowId);

  // Real try/catch, not .catch() — supabase-js query builders only
  // implement .then() (documented recurring mistake in this codebase).
  try {
    await supabase.from('technician_setup_attempts')
      .update({ failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() })
      .eq('technician_id', tech.id);
  } catch { /* best-effort */ }

  try {
    await supabase.from('access_audit_log').insert({
      contractor_id: tech.contractor_id,
      action: 'update',
      field_accessed: 'technician_setup_complete',
      ip_address: event?.requestContext?.http?.sourceIp || event?.requestContext?.identity?.sourceIp || null,
      user_agent: event?.headers?.['user-agent'] || event?.headers?.['User-Agent'] || null,
    });
  } catch { /* best-effort */ }
}

// Records a failed code attempt and locks the technician out for
// LOCKOUT_MINUTES once MAX_CODE_ATTEMPTS is reached. Best-effort in the
// sense that this isn't perfectly race-safe under concurrent requests (no
// distributed locking anywhere else in this codebase either), but that's
// an acceptable gap for a defense that only needs to make brute-forcing
// impractical, not airtight against a determined concurrent attacker who's
// already past the harder problem of finding the right technician.
async function recordFailedAttempt(supabase, technicianId) {
  const { data: existing } = await supabase
    .from('technician_setup_attempts')
    .select('failed_attempts')
    .eq('technician_id', technicianId)
    .maybeSingle();

  const nextCount = (existing?.failed_attempts || 0) + 1;
  const lockedUntil = nextCount >= MAX_CODE_ATTEMPTS
    ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString()
    : null;

  const { error } = await supabase.from('technician_setup_attempts').upsert({
    technician_id: technicianId,
    failed_attempts: lockedUntil ? 0 : nextCount, // lockout consumed the streak; next window starts fresh
    locked_until: lockedUntil,
    updated_at: new Date().toISOString(),
  });
  // Logged loudly rather than silently swallowed on failure — a lockout
  // that silently fails to record would quietly defeat the whole defense.
  if (error) console.error('recordFailedAttempt upsert failed:', JSON.stringify(error));
}

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const { token, phone, code, new_password } = body;

    if (!new_password) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'new_password is required.' }) };
    }
    // Agreed policy: 8+ characters, no complexity rule — technicians are
    // field workers typing on a phone, friction matters more here than
    // staff-grade complexity (see the technician-onboarding plan).
    if (new_password.length < 8) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Password must be at least 8 characters.' }) };
    }

    const supabase = await getSupabaseClient();

    // ---- Path 1: long-token web link (§18) — unchanged, entropy-only. ----
    if (token) {
      const hash = hashToken(token);
      const { data: tokenRow } = await supabase
        .from('technician_setup_tokens')
        .select('id, technician_id, expires_at, used_at')
        .eq('token_hash', hash)
        .maybeSingle();

      if (!tokenRow || tokenRow.used_at || new Date(tokenRow.expires_at) < new Date()) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: INVALID_SETUP_ERROR }) };
      }

      const { data: tech } = await supabase
        .from('technicians')
        .select('id, contractor_id, auth_user_id, is_active')
        .eq('id', tokenRow.technician_id)
        .maybeSingle();

      if (!tech || !tech.is_active) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: INVALID_SETUP_ERROR }) };
      }

      await finalizeSetup(supabase, { usedTokenRowId: tokenRow.id, tech, newPassword: new_password, event });
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
    }

    // ---- Path 2: short in-app code (§21.2) — phone-scoped, lockout-defended. ----
    if (phone && code) {
      if (!validatePhone(phone.trim())) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: INVALID_SETUP_ERROR }) };
      }
      const cleanPhone = normalizeE164(phone.trim());

      const { data: tech } = await supabase
        .from('technicians')
        .select('id, contractor_id, auth_user_id, is_active')
        .eq('mobile_phone', cleanPhone)
        .maybeSingle();

      if (!tech || !tech.is_active) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: INVALID_SETUP_ERROR }) };
      }

      // Lockout is checked BEFORE the code is compared — a locked-out
      // technician gets the same generic error whether their code was
      // right or wrong, no extra signal leaked either way.
      const { data: attempts } = await supabase
        .from('technician_setup_attempts')
        .select('locked_until')
        .eq('technician_id', tech.id)
        .maybeSingle();
      if (attempts?.locked_until && new Date(attempts.locked_until) > new Date()) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: INVALID_SETUP_ERROR }) };
      }

      const codeHash = hashToken(canonicalizeCode(code));
      const { data: tokenRow } = await supabase
        .from('technician_setup_tokens')
        .select('id, expires_at, used_at')
        .eq('technician_id', tech.id)
        .eq('short_code_hash', codeHash)
        .is('used_at', null)
        .maybeSingle();

      if (!tokenRow || new Date(tokenRow.expires_at) < new Date()) {
        await recordFailedAttempt(supabase, tech.id);
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: INVALID_SETUP_ERROR }) };
      }

      await finalizeSetup(supabase, { usedTokenRowId: tokenRow.id, tech, newPassword: new_password, event });
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
    }

    return {
      statusCode: 400, headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Provide either token, or phone and code, along with new_password.' }),
    };
  } catch (err) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
