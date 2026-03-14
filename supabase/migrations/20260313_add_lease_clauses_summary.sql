-- Add lease_clauses_summary column to audits table
-- Stores extracted lease clause data (CAM cap, fee caps, sq ft, exclusions, etc.)
-- Nullable JSONB — older audits without this field remain valid.

ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS lease_clauses_summary JSONB DEFAULT NULL;

COMMENT ON COLUMN audits.lease_clauses_summary IS
  'Extracted lease clause summary: CAM cap, fee caps, pro-rata share, square footage, excluded categories, additional provisions.';
