import type { Finding } from "@/services/audit-logic";

/**
 * ONE definition of how a finding is treated, shared by the dispute letter and the CAM Review Plan so
 * the two can never disagree about what is a calculated item, a question, or a note.
 */

/** Excluded-category findings are carried by their breakdown rows (statement line plus tenant share). */
export const isExcludedCategoryFinding = (f: Finding): boolean => /excluded category/i.test(f.category);

export type FindingKind =
  /** carried by the excluded-expense breakdown rows */
  | "excluded"
  /** has a dollar amount worked out from the documents */
  | "adjustment"
  /** needs an answer from the landlord: not verifiable, or flagged without an amount */
  | "clarify"
  /** compliance or informational note: nothing to raise */
  | "note";

export function findingKind(f: Finding): FindingKind {
  if (isExcludedCategoryFinding(f)) return "excluded";
  if (f.insufficientData) return "clarify"; // never an amount: the check could not be completed
  if (f.potential_savings > 0) return "adjustment";
  if (f.potential_savings === 0 && f.severity !== "low") return "clarify";
  return "note";
}
