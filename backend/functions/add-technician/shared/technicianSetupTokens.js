// backend/functions/shared/technicianSetupTokens.js
//
// One-time setup-link tokens for technician onboarding (see
// backend/sql/008_technician_setup_tokens.sql). Replaces the raw-password-
// over-SMS flow: a technician taps a link containing this token and chooses
// their own password via complete-technician-setup — the token itself is
// never stored, only its SHA-256 hash, same principle already applied to
// the generated Auth password never being logged in add-technician.
const crypto = require('crypto');

// Placeholder — no real hosting domain exists yet for the web fallback page
// or the future Flutter deep link. Swap this for the real production
// origin once it's decided; everything downstream (SMS copy, the
// /technician-setup route) already treats the link as an opaque URL.
const SETUP_BASE_URL = 'https://app.fieldloop.io';

function generateSetupToken() {
  return crypto.randomBytes(32).toString('base64url'); // 256 bits — the actual brute-force defense, not rate-limiting
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Issues a new token row without touching any existing unexpired tokens for
// the same technician — resends must leave prior links live until whichever
// one gets used first (an explicit product decision, not an oversight).
async function issueSetupToken(supabase, { technicianId, createdBy, expiryHours = 48 }) {
  const rawToken = generateSetupToken();
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from('technician_setup_tokens').insert({
    technician_id: technicianId,
    token_hash: hashToken(rawToken),
    expires_at: expiresAt,
    created_by: createdBy,
  });
  if (error) throw new Error(`Failed to issue setup token: ${error.message}`);

  return { rawToken, expiresAt };
}

function buildSetupLink(rawToken) {
  return `${SETUP_BASE_URL}/technician-setup?token=${rawToken}`;
}

module.exports = { generateSetupToken, hashToken, issueSetupToken, buildSetupLink, SETUP_BASE_URL };
