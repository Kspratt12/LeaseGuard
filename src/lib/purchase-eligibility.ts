/**
 * Purchase eligibility: may this audit be SOLD?
 *
 * One rule, used by the checkout endpoint (which enforces it) and by the audit API (which tells the screen what to
 * show). The screen never decides on its own, and hiding a button is never the protection: the server refuses
 * to start a checkout for an audit that fails this rule.
 *
 * What a purchase unlocks is the full findings with their evidence, the PDF report, the CAM Review Plan and the
 * dispute letter, all built from the audit's real findings. So an audit is worth buying only when it has at least one
 * real item to raise with the landlord. The classification is the CAM Review Plan's own (calculated or judgment), so
 * the plan, the letter and the sale can never disagree about what counts.
 *
 *   actionable item present                        -> eligible ("complete", or "partial" with a disclosure)
 *   no actionable item, checks ran and matched      -> not eligible: "nothing_to_unlock" (a legitimate clean audit)
 *   no actionable item, checks could not complete   -> not eligible: "insufficient_analysis"
 *
 * Pure: no database, no network.
 */
import { buildReviewPlan, type ReviewPlan } from "@/services/review-plan";
import type { Finding, LeaseClauseSummary, OverchargeLineItem } from "@/services/audit-logic";
import { coverageOf, coverageShort, isAiTruncated } from "@/lib/analysis-coverage";

export interface PurchaseInput {
  freeFindings: Finding[];
  paidFindings: Finding[];
  overchargeBreakdown: OverchargeLineItem[];
  leaseClausesSummary: LeaseClauseSummary | null;
  auditMode: string | null;
  confidence: "high" | "medium" | "low" | null;
  validationWarning: string | null;
}

export type NotEligibleReason = "nothing_to_unlock" | "insufficient_analysis";

export type PurchaseDecision =
  | { eligible: true; completeness: "complete" | "partial"; notes: string[] }
  | { eligible: false; reason: NotEligibleReason; /** set when the AI step read only part of a document: a result with nothing flagged does not cover the whole text */ coverageNote?: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const list = <T,>(v: unknown, ok: (x: unknown) => boolean): T[] => (Array.isArray(v) ? (v.filter(ok) as T[]) : []);

/** Build the input from a raw audits row. Anything missing or malformed counts as absent, never as a finding. */
export function purchaseInputFromRow(row: Record<string, unknown> | null | undefined): PurchaseInput {
  const r = row ?? {};
  const conf = r.confidence;
  return {
    freeFindings: list<Finding>(r.free_findings, (f) => isObj(f) && typeof f.category === "string"),
    paidFindings: list<Finding>(r.paid_findings, (f) => isObj(f) && typeof f.category === "string"),
    overchargeBreakdown: list<OverchargeLineItem>(r.overcharge_breakdown, (x) => isObj(x) && typeof x.category === "string"),
    leaseClausesSummary: isObj(r.lease_clauses_summary) ? (r.lease_clauses_summary as unknown as LeaseClauseSummary) : null,
    auditMode: typeof r.audit_mode === "string" ? r.audit_mode : null,
    confidence: conf === "high" || conf === "medium" || conf === "low" ? conf : null,
    validationWarning: typeof r.validation_warning === "string" && r.validation_warning.trim() ? r.validation_warning : null,
  };
}

/** Warnings whose cause is KNOWN to be unreadable or unprocessed material (pages with no text, pages past the OCR limit). */
const UNREAD_WARNING = /no readable text|were not processed/i;
/** The generic data-gap warning: checks that could not be completed. The cause is not known from this text alone. */
const GENERIC_GAP_WARNING = /limited data|could not be completed|could not be detected/i;

export function decidePurchase(input: PurchaseInput): PurchaseDecision {
  const plan: ReviewPlan = buildReviewPlan({
    findings: [...input.freeFindings, ...input.paidFindings],
    overchargeBreakdown: input.overchargeBreakdown,
    leaseClausesSummary: input.leaseClausesSummary,
    confidence: input.confidence,
  });
  const actionable = plan.tierCounts.calculated + plan.tierCounts.judgment;
  const needsData = plan.tierCounts["needs-data"];
  const limited = input.auditMode === "limited";
  const coverage = coverageOf(input.leaseClausesSummary);
  const coverageNote = isAiTruncated(coverage) ? coverageShort(coverage) : null;

  // WHETHER the audit may be sold depends only on the findings. Everything below (notes, completeness) is wording and
  // can never change this answer.
  if (actionable === 0) {
    // Nothing to raise. Say "nothing found" only if checks actually ran and matched; otherwise the analysis was
    // insufficient and we must not present it as a clean result.
    const reason: NotEligibleReason = plan.items.length === 0 || needsData > 0 || limited ? "insufficient_analysis" : "nothing_to_unlock";
    return coverageNote ? { eligible: false, reason, coverageNote } : { eligible: false, reason };
  }

  const notes: string[] = [];
  if (limited) notes.push("Some checks could not be completed because information was missing or unclear in the documents.");
  if (needsData > 0) notes.push(`${needsData} check${needsData === 1 ? "" : "s"} could not be completed and ${needsData === 1 ? "is" : "are"} listed as needing more information. Nothing is counted for ${needsData === 1 ? "it" : "them"}.`);
  const warning = input.validationWarning;
  if (warning && UNREAD_WARNING.test(warning)) {
    // the cause is known: say it
    notes.push("Part of the uploaded material could not be read. See the notice above.");
  } else if (warning && GENERIC_GAP_WARNING.test(warning) && !limited && needsData === 0) {
    // the cause is not known: do not guess one
    notes.push("Some checks could not be completed with the information found in the documents. See the notice above.");
  }
  if (coverageNote) notes.push(coverageNote);
  return { eligible: true, completeness: notes.length ? "partial" : "complete", notes };
}

/** What the screen is told. Counts and fixed sentences only: never any finding text. */
export type PublicPurchase =
  | { eligible: true; completeness: "complete" | "partial"; notes: string[] }
  | { eligible: false; reason: NotEligibleReason };

export const publicPurchase = (d: PurchaseDecision): PublicPurchase => d;
