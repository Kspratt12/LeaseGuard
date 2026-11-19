-- Rollback for 20261120_audit_input_overrides.sql. REVIEW BEFORE APPLYING.
-- Removes customer corrections. Every audit then shows its original extracted result again; no other data changes.
-- Deploy the application version that no longer writes the column BEFORE running this (the current code tolerates the
-- column being absent: reads ignore it and saving a correction returns "not available").

alter table public.audits drop constraint if exists audits_input_overrides_shape;
alter table public.audits drop column if exists input_overrides;
