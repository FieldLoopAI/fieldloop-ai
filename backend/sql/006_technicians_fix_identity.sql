-- 006_technicians_fix_identity.sql
-- Corrects two decisions made in 005_technicians_extend.sql that deviated
-- from the agreed design for the Add Technician feature:
--
-- 1. Technicians must NOT be able to log into the web Contractor Command
--    Dashboard (contractor_users) — only their mobile app, via a phone+
--    password Supabase Auth identity linked through technicians.auth_user_id
--    (added by 005, still reused here). 005 additionally inserted a
--    contractor_users row per technician with role='technician'; since
--    ContractorCommandDashboard.jsx has no per-role content gating, that
--    granted every technician full web access to company-wide customer PII,
--    financials, and the whole roster. This migration does not delete any
--    contractor_users rows (the broken add-technician Lambda never
--    successfully ran, so none should exist) but any 'technician'-role
--    row found is removed as a safety net.
--
-- 2. contractor_users.role's CHECK constraint was replaced in 005 by
--    guessing a superset of values ('dispatcher', 'bookkeeper', 'field_ops',
--    'technician') taken from the *mock* Team()/Permissions() UI labels in
--    ContractorCommandDashboard.jsx, not from any verified real constraint
--    or requirement — the exact "guess instead of verify" mistake this
--    project's own HANDOFF.md explicitly warns about. The original
--    constraint (pre-005) was never captured before being dropped, so it
--    can't be restored byte-for-byte; this migration instead restores it to
--    the only value ever actually used in production data ('owner_admin'),
--    which is the safe, conservative baseline. If dispatcher/bookkeeper/
--    field_ops roles are genuinely needed later, add them deliberately with
--    real requirements behind them, not as a guess.
--
-- Run in the Supabase SQL Editor after 005_technicians_extend.sql.

-- 1. Remove any technician-role contractor_users rows (safety net; the
--    broken Lambda deployment means this should affect 0 rows in practice).
DELETE FROM contractor_users WHERE role = 'technician';

-- 2. Restore contractor_users.role CHECK to only the value actually in use.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'contractor_users'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%role%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE contractor_users DROP CONSTRAINT %I', cname);
  END IF;

  ALTER TABLE contractor_users
    ADD CONSTRAINT contractor_users_role_check
    CHECK (role IN ('owner_admin'));
END $$;

-- 3. Technicians authenticate by phone, not email — email stays optional
--    metadata (only required when a contractor chooses email delivery, a
--    Lambda-side validation rule, not a DB constraint). Drop the email
--    uniqueness constraint from 005 in favor of one on mobile_phone, which
--    is the actual per-contractor identity now.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'technicians'::regclass
      AND conname = 'technicians_contractor_email_unique'
  ) THEN
    ALTER TABLE technicians DROP CONSTRAINT technicians_contractor_email_unique;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'technicians'::regclass
      AND conname = 'technicians_contractor_phone_unique'
  ) THEN
    ALTER TABLE technicians
      ADD CONSTRAINT technicians_contractor_phone_unique
      UNIQUE (contractor_id, mobile_phone);
  END IF;
END $$;
