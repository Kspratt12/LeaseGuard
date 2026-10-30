/**
 * Analysis coverage: which parts of a document each extraction component actually received.
 *
 * Two components read the same document text:
 *   - pattern matching (regex) reads the WHOLE text;
 *   - the AI step reads only the first AI_TEXT_CHAR_LIMIT characters of each document.
 * When a document is longer than that, provisions later in the text were seen by pattern matching only. The result
 * must not be presented as a review of the whole document, and a provision that was not detected must never be
 * described as absent: the software cannot establish absence.
 *
 * The record is small and structural. It is stored inside the audit's existing clause-summary JSON (no new column),
 * and EVERY surface words it through the functions below so the preview, the purchase disclosure, the PDF, the plan
 * and the letter cannot disagree. Pure: no database, no network.
 */

/** Characters of each document's text the AI extraction step receives. The single source for that limit. */
export const AI_TEXT_CHAR_LIMIT = 20_000;

export interface AnalysisCoverage {
  /** The AI step read only this many characters from the start of each document. */
  aiCharLimit: number;
  /** The lease was longer than the limit when the AI step ran. */
  leaseAiTruncated: boolean;
  /** The primary reconciliation statement was longer than the limit. */
  statementAiTruncated: boolean;
  /** How many additional statements were longer than the limit. */
  extraStatementsAiTruncated: number;
}

/**
 * Coverage for a run, or null when nothing was cut. `aiRan` must be true only if the AI step was actually attempted:
 * with no AI configured nothing was truncated, and claiming so would be wrong.
 */
export function buildCoverage(i: { aiRan: boolean; leaseChars: number; statementChars: number; extraStatementChars?: number[]; limit?: number }): AnalysisCoverage | null {
  if (!i.aiRan) return null;
  const limit = i.limit ?? AI_TEXT_CHAR_LIMIT;
  const c: AnalysisCoverage = {
    aiCharLimit: limit,
    leaseAiTruncated: i.leaseChars > limit,
    statementAiTruncated: i.statementChars > limit,
    extraStatementsAiTruncated: (i.extraStatementChars ?? []).filter((n) => n > limit).length,
  };
  return isAiTruncated(c) ? c : null;
}

/** Add additional statements (processed later, in the route) to an existing coverage record. */
export function addExtraStatementCoverage(current: AnalysisCoverage | null, extraChars: number[], limit: number = AI_TEXT_CHAR_LIMIT): AnalysisCoverage | null {
  const extra = extraChars.filter((n) => n > limit).length;
  if (extra === 0) return current;
  return {
    aiCharLimit: current?.aiCharLimit ?? limit,
    leaseAiTruncated: current?.leaseAiTruncated ?? false,
    statementAiTruncated: current?.statementAiTruncated ?? false,
    extraStatementsAiTruncated: (current?.extraStatementsAiTruncated ?? 0) + extra,
  };
}

export function isAiTruncated(c: AnalysisCoverage | null | undefined): c is AnalysisCoverage {
  return !!c && (c.leaseAiTruncated || c.statementAiTruncated || c.extraStatementsAiTruncated > 0);
}

/** Read a coverage record from stored JSON. Anything malformed counts as "no record", never as a claim. */
export function parseCoverage(v: unknown): AnalysisCoverage | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const limit = typeof o.aiCharLimit === "number" && o.aiCharLimit > 0 ? o.aiCharLimit : null;
  if (limit === null) return null;
  const c: AnalysisCoverage = {
    aiCharLimit: limit,
    leaseAiTruncated: o.leaseAiTruncated === true,
    statementAiTruncated: o.statementAiTruncated === true,
    extraStatementsAiTruncated: typeof o.extraStatementsAiTruncated === "number" && o.extraStatementsAiTruncated > 0 ? Math.floor(o.extraStatementsAiTruncated) : 0,
  };
  return isAiTruncated(c) ? c : null;
}

/** The coverage record of an audit, from its stored clause summary. */
export function coverageOf(summary: { coverage?: unknown } | null | undefined): AnalysisCoverage | null {
  return parseCoverage(summary?.coverage);
}

const fmt = (n: number) => n.toLocaleString("en-US");

/** "your lease", "your lease and your reconciliation statement", "2 additional statements", ... */
function whichDocuments(c: AnalysisCoverage): { text: string; plural: boolean } {
  const parts: string[] = [];
  if (c.leaseAiTruncated) parts.push("your lease");
  if (c.statementAiTruncated) parts.push("your reconciliation statement");
  if (c.extraStatementsAiTruncated > 0) parts.push(`${c.extraStatementsAiTruncated} of your additional statements`);
  const text = parts.length <= 2 ? parts.join(" and ") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return { text, plural: parts.length > 1 || c.extraStatementsAiTruncated > 1 };
}

/**
 * The one customer-facing statement of the limitation. It separates what each component read, and says plainly that
 * not detecting a provision is not the same as the provision being absent.
 */
export function coverageSentence(c: AnalysisCoverage): string {
  const d = whichDocuments(c);
  return (
    `${d.text.charAt(0).toUpperCase()}${d.text.slice(1)} ${d.plural ? "are" : "is"} longer than the AI step reads. Pattern matching read the whole text, ` +
    `but the AI step read only the first ${fmt(c.aiCharLimit)} characters, so provisions later in the text may not have been considered. ` +
    `A provision we did not detect may still be in the document. We have not established that any provision is absent.`
  );
}

/** Shorter form for tight spaces (a list item in the purchase disclosure). */
export function coverageShort(c: AnalysisCoverage): string {
  const d = whichDocuments(c);
  return `The AI step read only the first ${fmt(c.aiCharLimit)} characters of ${d.text}, so provisions later in the text may not have been considered.`;
}

/** Added to a confidence label so a score is never read as confidence in complete coverage. */
export const CONFIDENCE_COVERAGE_QUALIFIER = "partial coverage";

export const CONFIDENCE_COVERAGE_CAPTION =
  "Based on the data our checks could extract. It is not confidence that the whole document was analyzed: see the coverage notice.";
