-- 007_technicians_deactivation.sql
-- Adds soft-delete support for technicians. A dedicated column rather than
-- reusing `invite_status` — that column tracks a different concern ("how
-- did they get invited") whose own CHECK constraint values were never
-- verified; extending someone else's enum by guessing is exactly the
-- mistake this project's HANDOFF.md repeatedly warns against.
--
-- Run in the Supabase SQL Editor after confirming 006 already ran.

ALTER TABLE technicians
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
