-- REVIEW BEFORE APPLYING. Not applied anywhere. STAGING first.
-- Depends on 20260101_baseline_audits.sql and 20261029_audit_ownership_rls.sql.
--
-- Adds payment records, webhook idempotency, and the verified reconciliation-year
-- count that decides which one-time price applies. Non-destructive.

-- Number of distinct reconciliation years the system verified (1-5), written by
-- the server when processing finishes. NULL (older audits) = not purchasable until
-- backfilled; the browser can never set it (clients have no write access to audits).
alter table public.audits
  add column if not exists recon_year_count integer
  check (recon_year_count is null or recon_year_count between 1 and 5);

create table if not exists public.payments (
  id                       uuid primary key default gen_random_uuid(),
  audit_id                 uuid not null references public.audits (id) on delete restrict,
  owner_id                 uuid not null references auth.users (id) on delete restrict,
  tier                     text not null check (tier in ('single', 'multi')),
  stripe_session_id        text not null unique,
  stripe_payment_intent_id text,
  amount_expected          integer not null check (amount_expected > 0),
  amount_paid              integer,
  currency                 text not null default 'usd',
  livemode                 boolean not null,
  status                   text not null default 'pending'
                           check (status in ('pending', 'paid', 'failed', 'expired', 'rejected')),
  status_reason            text,
  created_at               timestamptz not null default now(),
  paid_at                  timestamptz
);

create index if not exists payments_audit_owner_idx on public.payments (audit_id, owner_id);
-- At most one verified payment per audit (a second purchase can never "stack").
create unique index if not exists payments_one_paid_per_audit
  on public.payments (audit_id) where status = 'paid';

-- Webhook idempotency: one row per Stripe event id.
create table if not exists public.stripe_events (
  id           text primary key,
  type         text not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

-- Server-only tables: deny-by-default, no client policies. Only the service role
-- (the API routes, after authenticating and authorising the user) can read/write.
alter table public.payments enable row level security;
alter table public.stripe_events enable row level security;
revoke all on public.payments from anon, authenticated;
revoke all on public.stripe_events from anon, authenticated;
