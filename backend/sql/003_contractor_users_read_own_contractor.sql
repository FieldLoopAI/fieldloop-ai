-- Run this once in the Supabase SQL Editor.
-- contractor_users sessions (get_my_fl_role() is null for them, since they
-- have no fl_users row) currently can't read `contractors` at all — every
-- existing policy on that table is scoped to fl staff. That blocks the
-- real contractor login from showing the signed-in user's own company name.
-- This adds read-only access to a contractor's own row, mirroring the
-- tenant-isolation pattern already used on customers/jobs/vehicles/etc.

create policy "contractor users read own contractor" on contractors
  for select using (id = get_my_contractor_id());
