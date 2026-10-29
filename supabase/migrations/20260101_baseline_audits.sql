-- REVIEW BEFORE APPLYING. Not applied anywhere.
-- STAGING BASELINE reconstructed from the application code (the original
-- production schema is not in this repo). Column types are inferred, so compare
-- with production's real definition before trusting it.
-- Idempotent: "if not exists" everywhere, so it cannot alter an existing table.
-- Sorts before 20260313_add_lease_clauses_summary.sql so that migration works.

create table if not exists public.audits (
  id                      uuid primary key default gen_random_uuid(),
  created_at              timestamptz not null default now(),
  status                  text not null default 'pending',
  lease_url               text,
  recon_url               text,
  free_findings           jsonb,
  paid_findings           jsonb,
  savings_estimate        numeric,
  estimated_overcharge    numeric,
  overcharge_breakdown    jsonb,
  report_pdf_url          text,
  error_message           text,
  confidence              text,
  confidence_score        numeric,
  validation_warning      text,
  was_swapped             boolean,
  audit_mode              text,
  lease_extraction_method text,
  recon_extraction_method text,
  lease_clauses_summary   jsonb
);

-- Private bucket for uploaded documents and generated reports.
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;
