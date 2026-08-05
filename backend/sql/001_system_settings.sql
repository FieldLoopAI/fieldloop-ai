-- Run this once in the Supabase SQL Editor.
-- Backs the Step 1 "Security & Session Policy" panel in the registration
-- dashboard (password policy, session timeout, IP-allowlist toggle), which
-- previously only existed as UI-simulated state in mockDb.js.

create table if not exists system_settings (
  id int primary key default 1 check (id = 1), -- enforced single row
  password_min_length int not null default 14,
  password_complexity boolean not null default true,
  password_rotation_days int not null default 90,
  mfa_required_roles text[] not null default '{admin,finance}',
  session_timeout_minutes int not null default 15,
  session_max_hours int not null default 8,
  ip_allowlist_enabled boolean not null default true
);

insert into system_settings (id) values (1)
on conflict (id) do nothing;

alter table system_settings enable row level security;

create policy "fl staff read settings" on system_settings
  for select using (get_my_fl_role() is not null);

create policy "admin only write settings" on system_settings
  for update using (get_my_fl_role() = 'admin');
