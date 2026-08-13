-- 011_technician_setup_codes.sql
-- Adds a short, human-typable setup code alongside the existing long
-- setup-link token (008_technician_setup_tokens.sql), for the mobile app's
-- "Have a setup code?" in-app entry screen (Flow A) — see HANDOFF.md §21.2
-- and MOBILE_TEAM_HANDOFF.md §2.2a. Both values are issued together, at the
-- same time, on the same row, and share the same expiry/used_at lifecycle —
-- completing setup via either one invalidates both.
--
-- The long token keeps its existing 256-bit entropy-only defense (used by
-- the web fallback link, unchanged). The short code has far less entropy
-- by necessity (has to be typeable), so it needs a *separate* defense:
-- attempt-count lockout, tracked per-technician in technician_setup_attempts
-- below — this table does NOT apply to the long-token/link path.
--
-- Run in the Supabase SQL Editor after confirming 008-010 already ran.

ALTER TABLE technician_setup_tokens
  ADD COLUMN IF NOT EXISTS short_code_hash text;

CREATE INDEX IF NOT EXISTS technician_setup_tokens_short_code_idx
  ON technician_setup_tokens (technician_id, short_code_hash) WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS technician_setup_attempts (
  technician_id    uuid PRIMARY KEY REFERENCES technicians(id),
  failed_attempts  int NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- No RLS policy — same reasoning as technician_setup_tokens (008): every
-- Lambda touching this table uses the service-role key, which bypasses RLS
-- entirely; tenant/technician scoping is enforced explicitly in Lambda code.
