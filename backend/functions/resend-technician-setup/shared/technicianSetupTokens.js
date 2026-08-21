// backend/functions/shared/technicianSetupTokens.js
//
// One-time setup-link tokens for technician onboarding (see
// backend/sql/008_technician_setup_tokens.sql). Replaces the raw-password-
// over-SMS flow: a technician taps a link containing this token and chooses
// their own password via complete-technician-setup — the token itself is
// never stored, only its SHA-256 hash, same principle already applied to
// the generated Auth password never being logged in add-technician.
const crypto = require('crypto');

// Real production origin — Amplify Hosting, custom domain app.fieldloopai.com
// (§30 HANDOFF.md). Everything downstream (SMS copy, the /technician-setup
// route) already treats the link as an opaque URL, so this is also what the
// future Flutter deep link will register Associated Domains / App Links against.
const SETUP_BASE_URL = 'https://app.fieldloopai.com';

function generateSetupToken() {
  return crypto.randomBytes(32).toString('base64url'); // 256 bits — the actual brute-force defense, not rate-limiting
}

// Short, human-typable companion to the link token above, for the mobile
// app's in-app "Have a setup code?" entry (see HANDOFF.md §21.2). Alphabet
// excludes ambiguous characters (0/O, 1/I/L), same reasoning as
// add-technician's generateSecurePassword. ~39 bits of entropy — far less
// than the link token's 256 bits by necessity (it has to be typed), which
// is exactly why this value is defended by attempt-count lockout
// (technician_setup_attempts, checked in complete-technician-setup) rather
// than entropy alone.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateSetupCode(length = 8) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

// Strips whitespace/dashes and uppercases, so "ab3d-3f9k", "AB3D3F9K", and
// "ab3d 3f9k" all hash identically — applied both at issuance (before
// hashing for storage) and at verification (before hashing the submitted
// value), so display formatting (e.g. "AB3D-3F9K") never affects matching.
function canonicalizeCode(code) {
  return String(code || '').replace(/[\s-]/g, '').toUpperCase();
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Issues a new token+code row without touching any existing unexpired ones
// for the same technician — resends must leave prior links/codes live until
// whichever one gets used first (an explicit product decision, not an
// oversight). Also resets any setup-code lockout for this technician, since
// a fresh code being issued is a natural "start over" point.
async function issueSetupToken(supabase, { technicianId, createdBy, expiryHours = 48 }) {
  const rawToken = generateSetupToken();
  const rawCode = generateSetupCode();
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from('technician_setup_tokens').insert({
    technician_id: technicianId,
    token_hash: hashToken(rawToken),
    short_code_hash: hashToken(canonicalizeCode(rawCode)),
    expires_at: expiresAt,
    created_by: createdBy,
  });
  if (error) throw new Error(`Failed to issue setup token: ${error.message}`);

  // Best-effort — a lockout-reset failure shouldn't block issuing the token
  // itself; worst case an old lockout lingers a little past when it should.
  // Real try/catch, not .catch() — supabase-js query builders only
  // implement .then(), a .catch() chained directly throws TypeError instead
  // of being caught (a documented recurring mistake in this codebase).
  try {
    await supabase.from('technician_setup_attempts')
      .upsert({ technician_id: technicianId, failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() });
  } catch { /* best-effort */ }

  return { rawToken, rawCode, expiresAt };
}

function buildSetupLink(rawToken) {
  return `${SETUP_BASE_URL}/technician-setup?token=${rawToken}`;
}

// "AB3D-3F9K" display form — purely cosmetic, canonicalizeCode() strips the
// dash back out before hashing/comparison.
function formatSetupCode(rawCode) {
  return `${rawCode.slice(0, 4)}-${rawCode.slice(4)}`;
}

module.exports = {
  generateSetupToken, generateSetupCode, canonicalizeCode, formatSetupCode,
  hashToken, issueSetupToken, buildSetupLink, SETUP_BASE_URL,
};
