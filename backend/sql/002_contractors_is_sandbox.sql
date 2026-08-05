-- Run this once in the Supabase SQL Editor.
-- `contractors.is_sandbox` wasn't present in the schema dump shared during
-- planning, but is required by the Jenex Developer role restriction ported
-- from mockDb.checkRoleAccess (jenex_dev accounts must never see non-sandbox
-- contractor records). Skip this file if the column already exists.

alter table contractors
  add column if not exists is_sandbox boolean not null default false;
