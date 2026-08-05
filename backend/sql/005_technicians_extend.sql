-- 005_technicians_extend.sql
-- Extends the existing technicians table to support Supabase Auth-linked
-- technician accounts and credential delivery tracking.
-- Also ensures contractor_users.role CHECK allows 'technician'.
--
-- Run in the Supabase SQL Editor after confirming the current schema.

-- 1. Add auth and delivery columns to technicians
ALTER TABLE technicians
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS password_changed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_channel text,
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- 2. Add CHECK constraint on delivery_channel
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'technicians'::regclass
      AND conname = 'technicians_delivery_channel_check'
  ) THEN
    ALTER TABLE technicians
      ADD CONSTRAINT technicians_delivery_channel_check
      CHECK (delivery_channel IN ('sms', 'email'));
  END IF;
END $$;

-- 3. Add unique constraint on (contractor_id, email) to prevent duplicate
--    technician emails within the same contractor. email is nullable in the
--    original schema but auth-linked technicians will always have one set.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'technicians'::regclass
      AND conname = 'technicians_contractor_email_unique'
  ) THEN
    ALTER TABLE technicians
      ADD CONSTRAINT technicians_contractor_email_unique
      UNIQUE (contractor_id, email);
  END IF;
END $$;

-- 4. Ensure contractor_users.role allows 'technician'.
--    Drop any existing CHECK on role and re-add with technician included.
--    Uses a dynamic lookup so it works regardless of the original constraint name.
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

  -- Re-add with 'technician' included. Covers all known values from existing
  -- code (owner_admin from create-contractor-portal-user) plus reasonable
  -- future roles. If your contractor_users already has rows with other role
  -- values, add them here before running.
  ALTER TABLE contractor_users
    ADD CONSTRAINT contractor_users_role_check
    CHECK (role IN ('owner_admin', 'dispatcher', 'bookkeeper', 'field_ops', 'technician'));
END $$;
