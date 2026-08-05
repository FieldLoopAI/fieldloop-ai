-- 009_simulated_messages.sql
-- Backs the messaging adapter's `dev_log` provider mode (see
-- backend/functions/shared/messagingAdapter.js, HANDOFF.md §19) — records
-- what a message WOULD have been (channel, destination, subject/body)
-- without ever actually sending it. Deliberately a separate table from
-- access_audit_log: that table's `action` column has a tightly verified
-- CHECK constraint (only 'update'/'view'/'reveal'/'delete'/'export') meant
-- for security/compliance auditing, a different concern from a message-send
-- simulation log — forcing this into it would either violate the
-- constraint or misuse a value that means something else.
--
-- Run in the Supabase SQL Editor after confirming 008 already ran.

CREATE TABLE IF NOT EXISTS simulated_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text NOT NULL,   -- the MESSAGING_PROVIDER mode active when this was "sent"
  channel_used  text,            -- 'sms' or 'email' — which channel the adapter resolved to
  phone         text,
  email         text,
  subject       text,
  body          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS simulated_messages_created_at_idx
  ON simulated_messages (created_at DESC);

-- No RLS — only ever written by Lambdas using the service-role key, same
-- convention as every other table in this project.

NOTIFY pgrst, 'reload schema';
