-- REVIEW BEFORE APPLYING. Not applied to any shared database.
-- Validated only on a disposable local PostgreSQL instance (see docs/CHANGES-2026-11-19.md).
--
-- Customer corrections of extracted numbers (src/lib/input-overrides.ts).
-- Non-destructive: one nullable JSON column. Extracted results are never changed; corrections are applied when an audit
-- is read, so dropping the column restores every audit's original result.
--
-- Access: the column is NOT added to the owner column grant (20261029_audit_ownership_rls.sql), so clients cannot read
-- or write it with their own JWT. Only the server writes it, through /api/audit/[id]/inputs, after it has checked
-- sign-in, ownership and a verified payment.
--
-- Shape: {"version": 1, "values": {"<input key>": {"value": <number>, "original": <number|null>, "at": "<ISO time>"}}}

alter table public.audits
  add column if not exists input_overrides jsonb;

alter table public.audits
  drop constraint if exists audits_input_overrides_shape;
alter table public.audits
  add constraint audits_input_overrides_shape
  -- coalesce(..., false): a CHECK that evaluates to NULL passes, so every test must be false (not NULL) when a part is
  -- missing. The size limit uses the text length, not pg_column_size (which measures the compressed value).
  check (
    input_overrides is null
    or coalesce(
         jsonb_typeof(input_overrides) = 'object'
         and input_overrides->>'version' = '1'
         and jsonb_typeof(input_overrides->'values') = 'object'
         and octet_length(input_overrides::text) < 16384,
         false)
  );
