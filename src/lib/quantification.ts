/**
 * Quantification containment: which findings may carry a dollar amount, and what the customer is told when one does not.
 *
 * A cap or gross-up result is only a dollar figure when the lease's method, baseline, covered expenses and amendments
 * are established. The software extracts one percentage and nothing else about the clause, so those checks report what
 * was observed (statement totals, category amounts, the extracted percentage) and calculate no allowable maximum,
 * excess or adjustment. Such a finding is marked `quantified: false`.
 *
 * Semantics of the flag on a stored finding (one rule, used by every surface):
 *   quantified === false  -> the amount was deliberately not calculated. It is counted in NO total, shown in NO amount
 *                            line, treated as "needs review" (never as a calculated or judgment item), and cannot by
 *                            itself make an audit purchasable.
 *   quantified absent     -> no claim is made. The finding behaves exactly as before. This is also what every audit
 *                            stored before this change looks like. It is NOT certified: it is simply unchanged.
 *   quantified === true   -> reserved for a future affirmative standard; handled like absent.
 *
 * The record of what did not run is stored inside the existing clause-summary JSON (no new column), the same way the
 * analysis-coverage record is, and EVERY surface words it through the functions below so they cannot disagree.
 * Pure: no database, no network.
 */

/** A finding-like value: only the fields this module reads. */
export interface QuantifiableFinding {
  potential_savings: number;
  quantified?: boolean;
}

/** True when the finding's amount was deliberately not calculated. Absent flag is NOT unquantified (see above). */
export const isUnquantified = (f: { quantified?: boolean } | null | undefined): boolean => f?.quantified === false;

/** The amount a finding may contribute to any total or amount line. */
export const countedAmount = (f: QuantifiableFinding): number => (isUnquantified(f) ? 0 : f.potential_savings);

/** Sum of the amounts findings may contribute. A stray non-zero amount on an unquantified finding is never counted. */
export const sumCounted = (findings: QuantifiableFinding[]): number => findings.reduce((s, f) => s + countedAmount(f), 0);

/** Which kind of check left an amount uncalculated. */
import { PRICE_NOT_COMPARISON_SENTENCE } from "@/lib/pricing-copy";

export type UnquantifiedCheck = "cap" | "gross-up";

export interface ComparisonStatus {
  /** Year pairs (or years) that were not compared, each as "2021 to 2024: reason". */
  notCompared: string[];
  /** Checks that reported an observation but deliberately calculated no amount. */
  unquantified: UnquantifiedCheck[];
  /** Set only by the read-time adapter (src/lib/legacy-containment.ts): this audit was stored before the amounts were withheld. */
  legacyContained?: boolean;
  /**
   * Set only by the read-time adapter: the stored headline, the removed amounts and the retained components do not agree
   * under the documented rule (see reconcileLegacyHeadline), so NO overall total is presented anywhere.
   */
  headlineUnavailable?: boolean;
  /**
   * Facts the engine established about the year-over-year comparison, present only when two or more statements were
   * processed together. years = distinct statement years; pairsRun / pairsSkipped = consecutive pairs compared / not.
   */
  comparison?: ComparisonFacts;
  /** Extra statements were uploaded but a year and total could not be read from them. */
  uploadedButFailed?: boolean;
}

export interface ComparisonFacts {
  years: number;
  pairsRun: number;
  pairsSkipped: number;
}

/** The record for a run, or null when nothing needs saying. */
export function buildComparisonStatus(i: { notCompared: string[]; unquantified: UnquantifiedCheck[]; legacyContained?: boolean; headlineUnavailable?: boolean; comparison?: ComparisonFacts; uploadedButFailed?: boolean }): ComparisonStatus | null {
  const unquantified = Array.from(new Set(i.unquantified));
  if (i.notCompared.length === 0 && unquantified.length === 0 && !i.legacyContained && !i.headlineUnavailable && !i.comparison && !i.uploadedButFailed) return null;
  return {
    notCompared: [...i.notCompared],
    unquantified,
    ...(i.legacyContained ? { legacyContained: true } : {}),
    ...(i.headlineUnavailable ? { headlineUnavailable: true } : {}),
    ...(i.comparison ? { comparison: { ...i.comparison } } : {}),
    ...(i.uploadedButFailed ? { uploadedButFailed: true } : {}),
  };
}

/** True when this audit's overall total must not be shown (or rebuilt from a fallback) on any surface. */
export const headlineUnavailable = (s: ComparisonStatus | null | undefined): boolean => s?.headlineUnavailable === true;

/**
 * The audit page's headline figure, as one pure decision: the stored headline, or the sum of the counted findings if that
 * is larger, EXCEPT that an unavailable total yields no figure at all (0 here, and the page shows the unavailable state).
 */
export function headlineFigures(i: { storedHeadline: number | null | undefined; findings: QuantifiableFinding[]; status: ComparisonStatus | null | undefined }): { unavailable: boolean; savingsEstimate: number } {
  const unavailable = headlineUnavailable(i.status);
  return { unavailable, savingsEstimate: unavailable ? 0 : Math.max(i.storedHeadline ?? 0, sumCounted(i.findings)) };
}

export const HEADLINE_UNAVAILABLE_SENTENCE =
  "The overall total for this earlier audit could not be reconciled from its stored figures, so none is shown. The individual items below are listed as stored.";

/**
 * The documented rule for presenting a legacy aggregate as reconciled. Inputs are stored values only:
 *   headline  = the stored savings_estimate
 *   removed   = the amounts of the legacy cap/gross-up findings that the headline counted
 *   retained  = the amounts of the remaining counted findings (not insufficient-data, not unquantified)
 *   overcharge= the excluded-category overcharge the headline also counted (stored column, else the breakdown rows)
 * It is reconciled only when the headline exists, is not smaller than what was removed (no clamping), and
 *   headline - removed  equals  retained + overcharge   to within half a cent.
 * That is the engine's own formula (totalSavings), applied to what remains.
 */
export function reconcileLegacyHeadline(i: { headline: number | null; removed: number; retained: number; overcharge: number | null }): { reconciled: boolean; value: number | null } {
  const { headline, removed, retained, overcharge } = i;
  if (headline == null || !Number.isFinite(headline) || overcharge == null || !Number.isFinite(overcharge)) return { reconciled: false, value: null };
  if (headline + 0.005 < removed) return { reconciled: false, value: null };
  const remaining = Math.round((headline - removed) * 100) / 100;
  const expected = Math.round((retained + overcharge) * 100) / 100;
  return Math.abs(remaining - expected) < 0.005 ? { reconciled: true, value: remaining } : { reconciled: false, value: null };
}

/** Read a record from stored JSON. Anything malformed counts as "no record", never as a claim. */
export function parseComparisonStatus(v: unknown): ComparisonStatus | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const notCompared = Array.isArray(o.notCompared) ? o.notCompared.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
  const unquantified = Array.isArray(o.unquantified)
    ? o.unquantified.filter((x): x is UnquantifiedCheck => x === "cap" || x === "gross-up")
    : [];
  const c = o.comparison;
  const cnt = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
  const comparison =
    c && typeof c === "object" && !Array.isArray(c) && cnt((c as Record<string, unknown>).years) != null && cnt((c as Record<string, unknown>).pairsRun) != null && cnt((c as Record<string, unknown>).pairsSkipped) != null
      ? { years: cnt((c as Record<string, unknown>).years)!, pairsRun: cnt((c as Record<string, unknown>).pairsRun)!, pairsSkipped: cnt((c as Record<string, unknown>).pairsSkipped)! }
      : undefined;
  return buildComparisonStatus({ notCompared, unquantified, legacyContained: o.legacyContained === true, headlineUnavailable: o.headlineUnavailable === true, comparison, uploadedButFailed: o.uploadedButFailed === true });
}

/** The record of an audit, from its stored clause summary. A missing record is "no record", not "nothing was skipped". */
export function comparisonStatusOf(summary: { comparisonStatus?: unknown } | null | undefined): ComparisonStatus | null {
  return parseComparisonStatus(summary?.comparisonStatus);
}

export interface QuantificationNotice {
  title: string;
  lines: string[];
}

/**
 * The one customer-facing statement, shown next to the purchase control, in the report and on the review plan. It is
 * built from the stored record only, so it does not depend on which findings happen to be visible.
 */
export function quantificationNotice(status: ComparisonStatus | null | undefined): QuantificationNotice | null {
  if (!status) return null;
  const lines: string[] = [];
  if (status.legacyContained) {
    lines.push(
      "This audit was created by an earlier version of the review. Its cap and gross-up calculations are no longer shown, because the lease's cap method, baseline and covered expenses were not established. " +
        "The statement figures and lease text quoted as source evidence are unchanged.",
    );
  }
  if (status.headlineUnavailable) lines.push(HEADLINE_UNAVAILABLE_SENTENCE);
  // What the year-over-year comparison did. Said only from facts the engine recorded: uploading several years is never
  // described as a completed comparison.
  const cmp = status.comparison;
  if (cmp) {
    if (cmp.pairsRun === 0) {
      lines.push("No year-over-year comparison ran.");
      if (cmp.years < 2 && status.notCompared.length === 0) lines.push("The statements you uploaded cover only one distinct year.");
    } else {
      lines.push(`Year-over-year comparison ran for ${cmp.pairsRun} pair${cmp.pairsRun === 1 ? "" : "s"} of consecutive years${cmp.pairsSkipped > 0 ? " only" : ""}.`);
    }
  }
  if (status.uploadedButFailed) lines.push("Additional statements were uploaded, but a year and total could not be read from them, so no comparison ran for those.");
  for (const n of status.notCompared) lines.push(`Year-over-year comparison did not run for ${n}.`);
  if (cmp && cmp.pairsRun > 0) lines.push("A completed comparison reports the change in total charges between two years. It is an observation, not a calculated cap claim.");
  if (status.unquantified.includes("cap")) {
    lines.push(
      "Where a statement total rose by more than the cap percentage found in your lease, the item is shown without an amount. " +
        "How the lease measures the cap, which expenses it covers, its baseline year and any amendments were not established, " +
        "so no allowable maximum or excess is calculated, and nothing from these items is counted in any total.",
    );
  }
  if (status.unquantified.includes("gross-up")) {
    lines.push(
      "The gross-up item is a screening heuristic: it flags categories that rose more than 15% year over year, a threshold set by this tool and not by your lease. " +
        "No adjustment amount is calculated or counted.",
    );
  }
  if (status.notCompared.length > 0 || (cmp && (cmp.pairsRun === 0 || cmp.pairsSkipped > 0))) {
    lines.push(PRICE_NOT_COMPARISON_SENTENCE);
  }
  if (lines.length === 0) return null;
  const onlyComparison = !!cmp && status.unquantified.length === 0 && !status.legacyContained && !status.headlineUnavailable;
  return { title: onlyComparison ? "Year-over-year comparison: what ran" : "Some comparisons did not produce a dollar amount", lines };
}

/** The no-cap observations: a year-over-year change reported together with the fact that the lease had no cap to compare it with. */
export const NO_CAP_OBSERVATION_CATEGORIES = ["Year-over-Year CAM Change (Multi-Year)", "Year-over-Year CAM Increase Detected"] as const;
const NO_CAP_FACT = "No CAM cap was detected in the lease to compare against.";

/**
 * True only when EVERY finding of the audit is a no-cap observation (and there is at least one). A single other finding,
 * of any kind, makes it false, so the wording below never applies to an audit that has anything else on it.
 */
export function isNoCapObservationOnly<T extends { category: string; description?: string }>(findings: T[] | null | undefined): boolean {
  if (!Array.isArray(findings) || findings.length === 0) return false;
  return findings.every((f) => (NO_CAP_OBSERVATION_CATEGORIES as readonly string[]).includes(f.category) && typeof f.description === "string" && f.description.includes(NO_CAP_FACT));
}

/** Wording for that case only. It must not read as though a cap comparison was run and passed. */
export const NO_CAP_ONLY_LABEL = "No Discrepancy Identified by the Checks That Could Run";
export const NO_CAP_ONLY_IDENTIFIED = "No billing discrepancy was identified by the checks that could run.";
export const NO_CAP_ONLY_NO_CAP = "No CAM cap was found in the uploaded lease, so the observed change could not be compared with a lease cap.";
export const NO_CAP_ONLY_NOT_A_PASS = "This is not a statement that the charges comply with a cap, or that the statement is correct in every respect.";

/** Shown on an item that carries no amount because it was deliberately not calculated. */
export const NO_AMOUNT_LABEL = "No amount calculated";
export const NO_AMOUNT_ACTION = "No amount is calculated for this item. Check the lease and ask the landlord how the cap or adjustment was applied.";
