-- 015_contractor_users_roles.sql
-- Team & Access invite flow (HANDOFF.md §28.4a's deferred build, now
-- partially picked up). Per the project owner's direction: stick to a
-- single admin role for now — contractor_users.role stays owner_admin-only
-- (the CHECK constraint 006 already set is untouched by this migration).
-- "Admin" just means whoever's holding that one role, which can be more
-- than one person (Bob, the Jenex team, etc.) — this migration adds the
-- pieces needed to invite *additional* owner_admin users via a one-time
-- setup link, not additional roles. Full multi-role RBAC (dispatcher/
-- bookkeeper/field_lead, the original spec's §13b matrix) is real, deferred
-- future work — see HANDOFF.md for the reconnaissance already done, whenever
-- that's picked back up.
--
-- Two decisions behind this migration:
--   1. Invite mechanism: one-time setup link, reusing the exact
--      technician_setup_tokens design (008/011) rather than an admin-set
--      password shown once — same reasoning that moved technician
--      onboarding off plaintext passwords in the first place.
--   2. Soft-delete for "Remove team member": is_active + Auth ban, mirroring
--      technicians.is_active (007) and deactivate-technician's pattern —
--      not a hard delete, so audit history stays intact.
--
-- Run in the Supabase SQL Editor after confirming 014 already ran.

-- 1. Soft-delete flag for "Remove team member" — contractor_users had no
--    equivalent of technicians.is_active before this.
ALTER TABLE contractor_users
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2. Tracks whether an invited member has completed their own setup-link
--    flow yet, same purpose as technicians.password_changed (005). Existing
--    rows default to true — they already have a real password from the
--    original contractor-portal-activation flow, they were never "pending."
--    Only invite-team-member explicitly inserts a new row with this false.
ALTER TABLE contractor_users
  ADD COLUMN IF NOT EXISTS password_changed boolean NOT NULL DEFAULT true;

-- 3. One-time setup-link tokens for team-member invites — same shape as
--    technician_setup_tokens (008), FK'd to contractor_users instead. A
--    dedicated table for the same reason 008 uses one: a resend must be
--    able to issue a second live token without invalidating the first.
CREATE TABLE IF NOT EXISTS team_setup_tokens (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_user_id uuid NOT NULL REFERENCES contractor_users(id),
  token_hash         text NOT NULL,
  expires_at         timestamptz NOT NULL,
  used_at            timestamptz,
  consumed_reason    text CHECK (consumed_reason IN ('completed', 'superseded_by_sibling')),
  created_by         uuid,              -- contractor_users.id that triggered invite/resend
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS team_setup_tokens_hash_idx
  ON team_setup_tokens (token_hash);

CREATE INDEX IF NOT EXISTS team_setup_tokens_user_idx
  ON team_setup_tokens (contractor_user_id) WHERE used_at IS NULL;

-- No RLS — every Lambda touching this table uses the service-role key and
-- enforces tenant isolation explicitly in its own WHERE clauses, same as
-- every other table in this project (see supabaseClient.js).
