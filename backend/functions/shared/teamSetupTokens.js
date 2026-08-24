// backend/functions/shared/teamSetupTokens.js
//
// One-time setup-link tokens for Contractor Command Dashboard team-member
// invites (see backend/sql/015_contractor_users_roles.sql). Same design as
// technicianSetupTokens.js — the token itself is never stored, only its
// SHA-256 hash. No short-code companion here (unlike the technician version):
// that existed for the mobile app's in-app code entry, which has no
// equivalent for a web-dashboard team invite — link-only is sufficient.
const crypto = require('crypto');

const SETUP_BASE_URL = 'https://app.fieldloopai.com';

function generateSetupToken() {
  return crypto.randomBytes(32).toString('base64url'); // 256 bits
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Issues a new token without touching any existing unexpired one for the
// same contractor_users row — a resend must leave a prior link live until
// whichever is used first, matching technicianSetupTokens.js's same
// deliberate decision.
async function issueSetupToken(supabase, { contractorUserId, createdBy, expiryHours = 48 }) {
  const rawToken = generateSetupToken();
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from('team_setup_tokens').insert({
    contractor_user_id: contractorUserId,
    token_hash: hashToken(rawToken),
    expires_at: expiresAt,
    created_by: createdBy,
  });
  if (error) throw new Error(`Failed to issue setup token: ${error.message}`);

  return { rawToken, expiresAt };
}

function buildSetupLink(rawToken) {
  return `${SETUP_BASE_URL}/team-setup?token=${rawToken}`;
}

module.exports = { generateSetupToken, hashToken, issueSetupToken, buildSetupLink, SETUP_BASE_URL };
