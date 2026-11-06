/**
 * Whether the automated (AI) reading of a document FAILED, so that a missing value is never presented as proof that a
 * lease term is absent, and no paid report is offered on an analysis that could not be completed reliably.
 *
 * The record is stored inside the audit's existing clause-summary JSON (no new column) and exists ONLY when the AI step
 * was attempted (a key was configured) and returned nothing for at least one document. A value the AI read as "not in
 * the document" is a successful reading and leaves no record. Audits stored before this existed have no record either,
 * and that is never read as "failed" or as "fine": they behave exactly as before.
 */
export interface ExtractionIncomplete {
  /** The lease could not be read by the AI step. */
  lease: boolean;
  /** The reconciliation statement could not be read by the AI step. */
  statement: boolean;
}

export function buildExtractionIncomplete(i: { attempted: boolean; leaseRead: boolean; statementRead: boolean }): ExtractionIncomplete | null {
  if (!i.attempted) return null;
  if (i.leaseRead && i.statementRead) return null;
  return { lease: !i.leaseRead, statement: !i.statementRead };
}

/** Strict read of stored JSON: anything malformed counts as "no record", never as a claim. */
export function parseExtractionIncomplete(v: unknown): ExtractionIncomplete | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.lease !== "boolean" || typeof o.statement !== "boolean") return null;
  if (!o.lease && !o.statement) return null;
  return { lease: o.lease, statement: o.statement };
}

/** The record held by a clause summary, if any. */
export function extractionIncompleteOf(summary: unknown): ExtractionIncomplete | null {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return null;
  return parseExtractionIncomplete((summary as Record<string, unknown>).extractionIncomplete);
}

export const EXTRACTION_INCOMPLETE_TITLE = "The automated reading of your documents did not finish";

/** Shown wherever the results are shown, and as the reason no paid report is offered. */
export const EXTRACTION_INCOMPLETE_SENTENCE =
  "Part of the automated reading of your documents did not complete, so this analysis is not reliable. Anything listed as not detected or not found may be present in your documents, and any amount shown is not a complete picture. No paid report is offered for this analysis. Please run the audit again with the same documents.";

/** Shown in place of the confidence level and bar when the automated reading did not finish. */
export const CONFIDENCE_NOT_RATED = "Not rated: the automated reading did not finish";

/** Shown with the headline total of such an analysis, so the total is not read as a reliable result. */
export const TOTAL_UNRELIABLE_QUALIFIER =
  "This total comes from an analysis that did not complete. It is not a reliable result and may be missing items or amounts.";

/** Replaces an "absent / not detected" statement when the reading did not complete. */
export function undetermined(what: string): string {
  return `The automated reading of your documents did not complete, so we could not determine ${what}. This is not a finding that it is absent.`;
}
