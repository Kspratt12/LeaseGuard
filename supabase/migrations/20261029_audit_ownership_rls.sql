-- REVIEW BEFORE APPLYING. Not applied to any database.
-- Validate on a development/staging project first (see supabase/pending/AUTH-OWNERSHIP.md).
--
-- Adds audit ownership and deny-by-default row-level security.
-- Non-destructive: adds one nullable column, an index, and access controls.
-- Existing (anonymous) audits keep owner_id NULL and become unreadable to every
-- client role; they are NOT assigned to anyone and NOT deleted.

alter table public.audits
  add column if not exists owner_id uuid references auth.users (id) on delete set null;

create index if not exists audits_owner_id_idx on public.audits (owner_id);

alter table public.audits enable row level security;

-- Start from zero for client roles. The server (service role) bypasses RLS and
-- is the only writer: inserts, processing results and status updates.
revoke all on public.audits from anon, authenticated;

-- Owners may read only their own rows, and only non-sensitive columns.
-- paid_findings, lease_url, recon_url, report_pdf_url and error_message are
-- deliberately NOT granted, so a user calling PostgREST directly with their own
-- JWT cannot bypass paid-content gating.
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by column_name)
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'audits'
    and column_name = any (array[
      'id', 'owner_id', 'status', 'savings_estimate', 'free_findings',
      'confidence', 'confidence_score', 'validation_warning', 'was_swapped',
      'audit_mode', 'estimated_overcharge', 'overcharge_breakdown',
      'lease_clauses_summary'
    ]);

  execute format('grant select (%s) on public.audits to authenticated', cols);
end $$;

drop policy if exists audits_select_own on public.audits;
create policy audits_select_own
  on public.audits
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

-- No insert/update/delete policies for clients: all writes go through server
-- routes that authenticate the caller and set owner_id themselves.

-- Storage (bucket "invoices"): no storage.objects policies are created, so
-- clients cannot read or write objects directly. All document access is
-- server-side. Making the bucket private is a separate, deliberate step:
--   update storage.buckets set public = false where id = 'invoices';
