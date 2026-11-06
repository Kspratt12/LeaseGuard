/**
 * Read-time containment of audits stored BEFORE cap and gross-up amounts were withheld.
 *
 * Stored rows are never rewritten or recomputed. Every place that READS an audit passes it through this one adapter
 * (audit API and teaser, account list, checkout eligibility, report, letter), so the old calculated amounts and the
 * sentences that stated them cannot reach a screen, a download or a purchase decision.
 *
 * Matching is by explicit category identifier PLUS, for the wording cases, the exact generated sentence. A category name
 * alone never establishes that a cap was extracted. Anything that does not match is left exactly as stored.
 *
 * AMOUNT class (the old calculated cap excess / gross-up review amount). Identifiers from the earlier engine:
 *   - "Potential CAM Cap Exceedance"                     single-statement cap, always carried a dollar excess
 *   - "Year-over-Year CAM Escalation Exceeds Lease Cap"  multi-year cap step, carried a dollar excess
 *   - "Possible Gross-Up / Occupancy Adjustment"         with category jumps (a 5%-rule "review amount", or $0 judgment
 *                                                        wording); the language-only variant is insufficientData, has no
 *                                                        amount and is left unchanged
 *   These become $0 / quantified:false, and the stored headline is reconciled (see below).
 *
 * WORDING class (no amount, but an unsupported compliance statement). Each is replaced only where the exact generated
 * sentence is present:
 *   - "CAM Cap Within Limit"                        "...which is within the X% cap. Verify prior-year baseline accuracy to confirm."
 *   - "Year-over-Year CAM Change (Multi-Year)"      "...This is within the lease CAM cap of X%."   (cap-present variant ONLY;
 *                                                   the "No CAM cap was detected..." variant is left as stored)
 *   - "Year-over-Year CAM Increase Detected"        "Review your lease to determine if this increase is within contractual limits."
 *   Not handled, on purpose: "CAM Cap Exceeded". Before the launch commit the same sentences were stored under that
 *   category together with an assumed dollar overage, and the current engine still emits the name for a $0 no-total
 *   notice; stored rows carry no version stamp, so the two cannot be told apart reliably.
 *
 * A finding that already has a `quantified` field is new-format and is never touched. `created_at` is NOT used.
 *
 * HEADLINE. The stored headline is presented only when it reconciles (reconcileLegacyHeadline in quantification.ts);
 * otherwise the contained row carries `savings_estimate: null` and a `headlineUnavailable` record, and no surface may
 * show, rebuild or fall back to an overall total.
 *
 * Idempotent (output matches nothing) and non-mutating (changed values are copies; an untouched row is returned as the
 * same object). Invents no quote, page reference or interpretation: source evidence is kept as stored.
 * Pure: no database, no network.
 */
import type { Finding } from "@/services/audit-logic";
import { buildComparisonStatus, parseComparisonStatus, reconcileLegacyHeadline, type UnquantifiedCheck } from "@/lib/quantification";

export const LEGACY_CAP_CATEGORIES: readonly string[] = ["Potential CAM Cap Exceedance", "Year-over-Year CAM Escalation Exceeds Lease Cap"];
export const LEGACY_GROSS_UP_CATEGORY = "Possible Gross-Up / Occupancy Adjustment";
export const LEGACY_WITHIN_LIMIT_CATEGORY = "CAM Cap Within Limit";
export const LEGACY_MULTI_YEAR_CATEGORY = "Year-over-Year CAM Change (Multi-Year)";
export const LEGACY_INCREASE_DETECTED_CATEGORY = "Year-over-Year CAM Increase Detected";

const NEW_CAP_CATEGORY = "CAM Cap Review: Increase Above Stated Percentage";
const NEW_BELOW_CATEGORY = "CAM Cap Review: Increase Below Stated Percentage";
const NEW_GROSS_UP_CATEGORY = "Gross-Up Screening Signal (Heuristic)";

const LEGACY_CAP_DESCRIPTION =
  "An earlier version of this review compared statement totals with a cap percentage found in the lease text and calculated an excess. " +
  "That calculation is no longer shown: how the cap is measured, which expenses it covers and its baseline were not established. " +
  "The statement figures and lease text quoted as source evidence are from your documents. No amount is counted for this item.";
const LEGACY_CAP_LETTER =
  "My review of the statements compared the change in total CAM charges with a limit on increases mentioned in the lease. " +
  "Please explain how the cap applies under the lease (whether it is measured against the prior year or a base year, whether it is cumulative, and which expenses it covers) and provide the calculation you used.";
const LEGACY_GROSS_UP_DESCRIPTION =
  "An earlier version of this review flagged expense categories that rose year over year alongside gross-up language, and calculated a review amount. " +
  "That amount is no longer shown: it used a screening threshold set by the tool, not by your lease. " +
  "This is a screening signal from a heuristic, not a conclusion about what your lease permits. The statement figures and text quoted as source evidence are from your documents. No amount is counted for this item.";
const LEGACY_GROSS_UP_LETTER =
  "The statements show increases in some expense categories, and the lease or statements refer to a gross-up or occupancy adjustment. " +
  "Please explain whether expenses were adjusted for occupancy, the occupancy percentage used, which lease provision permits the adjustment, and provide the calculation.";

// Exact generated sentences (src/services/audit-logic.ts before the containment change; git history: introduced once, never edited).
const PCT = "(\\d+(?:\\.\\d+)?)";
const RE_LIMITS_SENTENCE = new RegExp(`The lease limits annual CAM or controllable expense increases to ${PCT}%\\.`);
const RE_WITHIN_CAP = new RegExp(`which is within the ${PCT}% cap\\. Verify prior-year baseline accuracy to confirm\\.`);
const RE_CONTROLLABLE_NOTE = /so it may overstate any excess\. Compare only the categories the cap covers to confirm\./;
const RE_MULTI_WITHIN = new RegExp(` This is within the lease CAM cap of ${PCT}%\\.$`);
const NO_CAP_SENTENCE = "No CAM cap was detected in the lease to compare against.";
const EXACT_CONTRACTUAL_LIMITS = " Review your lease to determine if this increase is within contractual limits.";
const BELOW_NOTE = "It does not confirm compliance: how the cap is measured and which expenses it covers were not established.";

type Kind = "cap" | "gross-up";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const round2 = (n: number) => Math.round(n * 100) / 100;

interface Contained {
  finding: Finding;
  /** amount class: dollars the stored headline counted for this finding */
  removed: number;
  kind: Kind | null;
}

function containOne(f: Finding): Contained | null {
  if (!isObj(f) || typeof f.category !== "string") return null;
  if ((f as { quantified?: unknown }).quantified !== undefined) return null; // a new-format record says what it is
  const desc = typeof f.description === "string" ? f.description : "";

  // ── amount class ──
  const kind: Kind | null = LEGACY_CAP_CATEGORIES.includes(f.category) ? "cap" : f.category === LEGACY_GROSS_UP_CATEGORY && f.insufficientData !== true ? "gross-up" : null;
  if (kind) {
    const amount = typeof f.potential_savings === "number" && f.potential_savings > 0 && f.insufficientData !== true ? f.potential_savings : 0;
    return {
      kind,
      removed: amount,
      finding: {
        ...f,
        category: kind === "cap" ? NEW_CAP_CATEGORY : NEW_GROSS_UP_CATEGORY,
        description: kind === "cap" ? LEGACY_CAP_DESCRIPTION : LEGACY_GROSS_UP_DESCRIPTION,
        letterText: kind === "cap" ? LEGACY_CAP_LETTER : LEGACY_GROSS_UP_LETTER,
        potential_savings: 0,
        quantified: false,
        severity: kind === "cap" ? ("medium" as const) : f.severity,
      },
    };
  }

  // ── wording class: category AND the exact generated sentence ──
  if (f.category === LEGACY_WITHIN_LIMIT_CATEGORY && f.potential_savings === 0 && RE_WITHIN_CAP.test(desc)) {
    const description = desc
      .replace(RE_LIMITS_SENTENCE, (_m, p) => `The lease text identified in this review mentions a ${p}% limit on increases.`)
      .replace(RE_WITHIN_CAP, (_m, p) => `which is below ${p}%. ${BELOW_NOTE}`)
      .replace(RE_CONTROLLABLE_NOTE, "which may include expenses the cap does not cover.");
    return { kind: null, removed: 0, finding: { ...f, category: NEW_BELOW_CATEGORY, description, quantified: false, letterText: "" } };
  }
  if (f.category === LEGACY_MULTI_YEAR_CATEGORY && f.potential_savings === 0 && RE_MULTI_WITHIN.test(desc)) {
    const description = desc.replace(RE_MULTI_WITHIN, (_m, p) => ` This is below the ${p}% figure found in the lease text. ${BELOW_NOTE}`);
    return { kind: null, removed: 0, finding: { ...f, category: NEW_BELOW_CATEGORY, description, quantified: false, letterText: "", severity: "low" as const } };
  }
  if (f.category === LEGACY_MULTI_YEAR_CATEGORY && f.potential_savings === 0 && f.severity === "medium" && desc.endsWith(` ${NO_CAP_SENTENCE}`)) {
    // No cap was detected: an observation, not an item to raise. Only the severity changes (so it is a note); text, figures and evidence stay.
    return { kind: null, removed: 0, finding: { ...f, severity: "low" as const } };
  }
  if (f.category === LEGACY_INCREASE_DETECTED_CATEGORY && f.potential_savings === 0) {
    const hasLimitsSentence = desc.includes(EXACT_CONTRACTUAL_LIMITS);
    const asNote = f.severity === "medium" && desc.includes(NO_CAP_SENTENCE);
    if (hasLimitsSentence || asNote) {
      return {
        kind: null,
        removed: 0,
        finding: {
          ...f,
          ...(hasLimitsSentence ? { description: desc.replace(EXACT_CONTRACTUAL_LIMITS, " Check your lease for any limit on increases.") } : {}),
          ...(asNote ? { severity: "low" as const } : {}),
        },
      };
    }
  }
  return null;
}

export interface ContainedFindings {
  findings: Finding[];
  /** Dollars the stored headline counted for the amount-class findings. */
  removed: number;
  kinds: Kind[];
  /** Any finding was replaced (amount class or wording class). */
  changed: boolean;
}

/** Contain a list of findings. Returns the SAME array when nothing matches. */
export function containLegacyFindings(findings: Finding[]): ContainedFindings {
  let removed = 0;
  const kinds: Kind[] = [];
  let changed = false;
  const out = findings.map((f) => {
    const c = containOne(f);
    if (!c) return f;
    changed = true;
    removed += c.removed;
    if (c.kind) kinds.push(c.kind);
    return c.finding;
  });
  return { findings: changed ? out : findings, removed: round2(removed), kinds, changed };
}

/** Sum of the amounts the engine's own formula counts: not insufficient-data, not withheld. */
const counted = (fs: Finding[]) =>
  round2(fs.reduce((s, f) => s + (f.insufficientData || f.quantified === false || typeof f.potential_savings !== "number" ? 0 : f.potential_savings), 0));

/**
 * Contain an audit row (or any object with the same fields). Only the fields that are present are replaced:
 * free_findings, paid_findings, savings_estimate and lease_clauses_summary.comparisonStatus.
 */
export function containLegacyAudit<T extends Record<string, unknown>>(row: T): T {
  const free = Array.isArray(row.free_findings) ? containLegacyFindings(row.free_findings as Finding[]) : null;
  const paid = Array.isArray(row.paid_findings) ? containLegacyFindings(row.paid_findings as Finding[]) : null;
  if (!free?.changed && !paid?.changed) return row;

  const next: Record<string, unknown> = { ...row };
  if (free) next.free_findings = free.findings;
  if (paid) next.paid_findings = paid.findings;

  const removed = round2((free?.removed ?? 0) + (paid?.removed ?? 0));
  const kinds = [...(free?.kinds ?? []), ...(paid?.kinds ?? [])];
  if (kinds.length === 0 && removed === 0) return next as T; // wording-only change: no amount was withheld, nothing else to say

  // Headline: presented only if it reconciles. Nothing is clamped into a precise-looking total.
  let unavailable = false;
  if (removed > 0) {
    const stored = row.savings_estimate;
    const headline = typeof stored === "number" ? stored : typeof stored === "string" && stored.trim() !== "" ? Number(stored) : null;
    const breakdown = Array.isArray(row.overcharge_breakdown) ? (row.overcharge_breakdown as { tenant_charge?: unknown }[]) : null;
    const overcharge =
      typeof row.estimated_overcharge === "number"
        ? row.estimated_overcharge
        : breakdown
          ? round2(breakdown.reduce((s, r) => s + (typeof r?.tenant_charge === "number" ? r.tenant_charge : 0), 0))
          : null;
    const retained = counted([...((next.free_findings as Finding[] | undefined) ?? []), ...((next.paid_findings as Finding[] | undefined) ?? [])]);
    const r = reconcileLegacyHeadline({ headline: headline != null && Number.isFinite(headline) ? headline : null, removed, retained, overcharge });
    next.savings_estimate = r.reconciled ? r.value : null;
    unavailable = !r.reconciled;
  }

  const lcs = isObj(row.lease_clauses_summary) ? row.lease_clauses_summary : null;
  const existing = parseComparisonStatus(lcs?.comparisonStatus);
  const unquantified: UnquantifiedCheck[] = [...(existing?.unquantified ?? []), ...kinds];
  next.lease_clauses_summary = {
    ...(lcs ?? {
      camCap: null, adminFeeCap: null, managementFeeCap: null, tenantProRataShare: null,
      tenantSquareFootage: null, buildingSquareFootage: null, excludedCategories: [], additionalClauses: [],
    }),
    comparisonStatus: buildComparisonStatus({
      notCompared: existing?.notCompared ?? [],
      unquantified,
      legacyContained: true,
      headlineUnavailable: unavailable || existing?.headlineUnavailable === true,
      comparison: existing?.comparison,
      uploadedButFailed: existing?.uploadedButFailed,
    }),
  };
  return next as T;
}
