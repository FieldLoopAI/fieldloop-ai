-- 008_technician_setup_tokens.sql
-- Adds one-time setup-link tokens for technician onboarding, replacing the
-- generated-password-over-SMS flow from 005/006. A dedicated table (not
-- columns on technicians) because the approved design lets a resend issue a
-- second live token without invalidating the first — a technicians-row
-- column could only ever hold one active token at a time.
--
-- Tokens themselves are NEVER stored — only a SHA-256 hash, same principle
-- add-technician already applies to the temp password never being logged.
--
-- Run in the Supabase SQL Editor after confirming 007 already ran.

CREATE TABLE IF NOT EXISTS technician_setup_tokens (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id    uuid NOT NULL REFERENCES technicians(id),
  token_hash       text NOT NULL,
  expires_at       timestamptz NOT NULL,
  used_at          timestamptz,
  -- Distinguishes "technician actually completed setup with this token"
  -- from "invalidated because a sibling token was used first, or because
  -- the phone number changed before setup completed" — both set used_at
  -- but for very different reasons; keeping them apart matters for support
  -- debugging ("why didn't my link work?").
  consumed_reason  text CHECK (consumed_reason IN ('completed', 'superseded_by_sibling', 'phone_changed')),
  created_by       uuid,              -- contractor_users.id that triggered send/resend
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS technician_setup_tokens_hash_idx
  ON technician_setup_tokens (token_hash);

-- Fast "does this technician have a still-valid token" lookup, used by
-- complete-setup's validation and by phone-change invalidation.
CREATE INDEX IF NOT EXISTS technician_setup_tokens_technician_idx
  ON technician_setup_tokens (technician_id) WHERE used_at IS NULL;

-- No RLS policy — every Lambda touching this table uses the service-role
-- key (see backend/functions/shared/supabaseClient.js), which bypasses RLS
-- entirely. Tenant isolation and ownership are enforced explicitly in each
-- Lambda's own WHERE clauses, matching every other table in this project.
