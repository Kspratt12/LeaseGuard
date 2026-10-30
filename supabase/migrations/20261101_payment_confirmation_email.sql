-- Bookkeeping for the purchase confirmation email (sent once per verified payment).
-- Additive and safe to re-run. Applied by hand in the Supabase SQL editor, like the other migrations.
alter table public.payments
  add column if not exists confirmation_email_claimed_at timestamptz,
  add column if not exists confirmation_email_sent_at    timestamptz,
  add column if not exists confirmation_email_error      text;

comment on column public.payments.confirmation_email_claimed_at is 'Set atomically by the one webhook run that sends the email; cleared if sending fails.';
comment on column public.payments.confirmation_email_sent_at    is 'When the provider accepted the confirmation email.';
comment on column public.payments.confirmation_email_error      is 'Short error code of the last failed attempt (no personal data).';
