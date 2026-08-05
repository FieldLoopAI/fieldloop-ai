-- Run this once in the Supabase SQL Editor.
-- get_my_contractor_id() queries contractor_users directly, and
-- contractor_users has a "tenant isolation" RLS policy that calls
-- get_my_contractor_id() to evaluate — without SECURITY DEFINER, the
-- function's own query is itself subject to that same policy, which
-- calls the function again, forever: "stack depth limit exceeded".
-- SECURITY DEFINER makes the function run with its owner's privileges,
-- bypassing RLS for this one internal lookup (same pattern already used
-- correctly elsewhere for helper functions like this).
--
-- This was never hit by the actual app before now — every real Lambda
-- call uses the service-role client, which bypasses RLS entirely. It
-- only surfaces when something queries `contractors` (via the
-- "contractor users read own contractor" policy from migration 003) or
-- `contractor_users` directly using the anon key + a signed-in session.

create or replace function public.get_my_contractor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select contractor_id from contractor_users
  where auth_user_id = auth.uid()
  limit 1;
$$;
