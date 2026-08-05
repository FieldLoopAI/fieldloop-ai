// Frontend Supabase client — Auth only (anon key). Contractor data reads/
// writes for the registration dashboard go through Lambda instead, since
// that side needs role-based field masking and Secrets Manager access that
// Postgres RLS alone can't provide. Direct table access here is limited to
// what each caller is allowed to see under RLS (e.g. `fl_users`/
// `contractor_users` own-row lookups for identity/role).
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
