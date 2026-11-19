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
  check (
    input_overrides is null
    or (jsonb_typeof(input_overrides) = 'object'
        and input_overrides->>'version' = '1'
        and jsonb_typeof(input_overrides->'values') = 'object'
        and pg_column_size(input_overrides) < 16384)
  );
