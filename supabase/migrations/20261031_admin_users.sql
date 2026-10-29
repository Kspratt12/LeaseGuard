-- REVIEW BEFORE APPLYING. Not applied to any database.
-- Depends on 20261029_audit_ownership_rls.sql (the auth.users account system).
--
-- Allow-list of administrators. Non-destructive: creates one new table, touches nothing else.
-- Server-only: row-level security is on with NO client policies and all client privileges are
-- revoked, so the browser (anon or signed-in) can neither read nor write it. Only the service
-- role (the API routes, after verifying the caller's session) can. Nobody can grant themselves
-- access through the app, and registering with a given email address grants nothing.
-- Rows are added by the owner, deliberately, with supabase/pending/ADMIN-ACTIVATION.sql.

create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  note       text
);

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;
