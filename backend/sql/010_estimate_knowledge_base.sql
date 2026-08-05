-- 010_estimate_knowledge_base.sql
-- Backs the FieldLoop AI on-site estimating assistant's knowledge base
-- (plain-language facts — PSI tables, code triggers, typical failure points —
-- that answer the trade-specific "common questions" bank). Entries are
-- drafted by staff (or, later, AI-assisted) and must be approved by staff
-- before use — see the new Knowledge Base panel in the Registration
-- Dashboard, gated to admin/onboarding.
--
-- Versioning is intentionally lightweight: approving a pending entry with
-- an edited answer inserts a new row (incremented `version`,
-- `previous_version_id` pointing back at the row it supersedes) rather
-- than mutating the original, whose status flips to 'superseded' — so a
-- bad edit can be traced/rolled back without a separate history table.
--
-- `trade`/`category` are deliberately free text, not CHECK-constrained —
-- trades beyond GC interior remodeling aren't finalized yet, and guessing
-- an enum ahead of real requirements is the exact mistake §3 of HANDOFF.md
-- already warns about (see jobs.trade_category for the same precedent).
--
-- Run in the Supabase SQL Editor after confirming 009 already ran.

CREATE TABLE IF NOT EXISTS estimate_knowledge_base (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade                  text NOT NULL,
  category               text NOT NULL,
  topic                  text NOT NULL,
  answer                 text NOT NULL,
  source_type            text NOT NULL,
  jurisdiction_dependent boolean NOT NULL DEFAULT false,
  status                 text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected', 'superseded')),
  version                integer NOT NULL DEFAULT 1,
  previous_version_id    uuid REFERENCES estimate_knowledge_base (id),
  created_by             uuid,  -- fl_users.id
  reviewed_by            uuid,  -- fl_users.id
  reviewed_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_knowledge_base_trade_status_idx
  ON estimate_knowledge_base (trade, status);

-- No RLS — only ever written/read by Lambdas using the service-role key,
-- same convention as every other table in this project; role gating
-- (admin/onboarding for write, any fl_user for read) is enforced in the
-- list-kb-entries/create-kb-entry/review-kb-entry Lambdas instead.

NOTIFY pgrst, 'reload schema';
