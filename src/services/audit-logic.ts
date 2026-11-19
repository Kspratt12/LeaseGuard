/**
 * Compare extracted lease terms against reconciliation charges
 * to identify potential overcharges.
 *
 * Supports two modes:
 *   full    — all checks run; insufficient-data findings for missing fields
 *   limited — only checks where required data exists; missing checks are skipped
 *
 * Findings are only generated when supported by actual extracted data.
 * Missing data results in explanatory findings — never fabricated numbers.
 */

import { formatMoney } from "@/lib/format";
import { isAiTruncated, type AnalysisCoverage } from "@/lib/analysis-coverage";
import { undetermined, type ExtractionIncomplete } from "@/lib/extraction-status";
import {
  normalizeNumber,
  type DocumentValidationResult,
  type ConfidenceLevel,
  type AuditMode,
  type ExtractionMethod,
  type ValidationIssue,
} from "@/services/document-validator";
import {
  computeAdminFeeTenantOvercharge,
  computeCamCapExcess,
  computeFeeOverBaseTenantOvercharge,
  totalSavings,
} from "@/services/savings-math";
import { dedupeBySourceLine, supportedPriorYearTotal } from "@/services/line-ledger";
import { extractAuditRights, type AuditRightsClause } from "@/lib/audit-rights";
import {
  SHARE_CHECK_ID,
  findSharePool,
  parseMoney,
  parsePercent,
  resolveExpectedShare,
  shareDecimals,
  shareFinding,
  shareMismatchThreshold,
  type ShareCalc,
} from "@/services/share-math";
import { buildComparisonStatus, type ComparisonStatus, type UnquantifiedCheck } from "@/lib/quantification";

/** Lines of the reconciliation that are management/admin fee charges (building level). */
const ADMIN_FEE_LINE_KEYWORDS = [
  "admin fee",
  "administrative fee",
  "management fee",
  "property management",
  "management charge",
];

export interface SourceEvidence {
  document: string;
  page: number | null;
  extractedText: string;
  /** Finding category this evidence supports. */
  findingCategory?: string;
}

export interface Finding {
  category: string;
  description: string;
  potential_savings: number;
  severity: "high" | "medium" | "low";
  /** When true, the finding could not be fully verified. */
  insufficientData?: boolean;
  /**
   * `false`: the amount was deliberately NOT calculated (the lease's cap method, baseline or covered expenses are not
   * established). It is counted nowhere and the finding is a needs-review item. Absent: unchanged legacy behavior.
   * See src/lib/quantification.ts.
   */
  quantified?: boolean;
  /** First-person wording for the dispute letter, for items that ask the landlord a question. Falls back to `description`. */
  letterText?: string;
  sourceEvidence?: SourceEvidence[];
  /**
   * Structured identity of the check that produced the finding (for example "pro-rata-share"). Absent on findings stored
   * before identities were added; code that recognises a finding uses this first and falls back to wording only for those.
   */
  checkId?: string;
  /** The deterministic inputs of a calculated finding, so its amount can be reproduced and recomputed from corrected values. */
  calc?: ShareCalc | AdminFeeCalc;
}

/** Inputs of the management/admin fee calculation (see src/services/savings-math.ts). */
export interface AdminFeeCalc {
  kind: "admin-fee";
  /** "stated-rate": the statement states the billed percentage. "fee-over-base": the percentage is the fee line divided by the base. */
  method: "stated-rate" | "fee-over-base";
  feeAmountBuilding: number;
  /** Billed percentage: as stated (stated-rate) or fee / base x 100 (fee-over-base). */
  statedPercent: number;
  capPercent: number;
  /** The total the fee is measured against (fee-over-base only). */
  feeBase: number | null;
  tenantSharePercent: number | null;
}

export interface OverchargeLineItem {
  category: string;
  total_expense: number;
  tenant_share_percent: number;
  tenant_charge: number;
  reason: string;
  sourceEvidence?: SourceEvidence;
}

export interface LeaseClauseSummary {
  camCap: string | null;
  adminFeeCap: string | null;
  managementFeeCap: string | null;
  tenantProRataShare: string | null;
  tenantSquareFootage: string | null;
  buildingSquareFootage: string | null;
  excludedCategories: string[];
  additionalClauses: string[];
  /**
   * Present only when the AI step read just the start of a long document. Stored here (an existing JSON column) so
   * the preview, report, plan and letter can all state the limitation. See src/lib/analysis-coverage.ts.
   */
  coverage?: AnalysisCoverage;
  /**
   * Which comparisons did not run and which checks calculated no amount, so the purchase control, report and plan can
   * say so without depending on which findings are visible. See src/lib/quantification.ts.
   */
  comparisonStatus?: ComparisonStatus;
  /** Present only when the AI reading failed for a document (see src/lib/extraction-status.ts). Absent on every earlier audit. */
  extractionIncomplete?: ExtractionIncomplete;
  /**
   * Audit-right / dispute-window sentences quoted from the lease (src/lib/audit-rights.ts). Absent on earlier audits and
   * when none was found. Released to the owner only after a verified payment (see toPublicAudit).
   */
  auditRights?: AuditRightsClause[];
}

export interface AuditResult {
  savings_estimate: number;
  free_findings: Finding[];
  paid_findings: Finding[];
  confidence: ConfidenceLevel;
  confidenceScore: number;
  validationWarning: string | null;
  wasSwapped: boolean;
  auditMode: AuditMode;
  leaseExtractionMethod: ExtractionMethod;
  reconExtractionMethod: ExtractionMethod;
  estimated_overcharge: number;
  overcharge_breakdown: OverchargeLineItem[];
  leaseClausesSummary: LeaseClauseSummary | null;
}

// ---------------------------------------------------------------------------
// Fuzzy matching helpers
// ---------------------------------------------------------------------------

/**
 * Tokenize a phrase into meaningful words (lowercase, no stopwords).
 */
function tokenize(phrase: string): string[] {
  const stopwords = new Set([
    "and", "or", "the", "of", "for", "a", "an", "in", "on", "to", "is", "are",
    "was", "were", "be", "been", "being", "at", "by", "from", "with", "as",
  ]);
  return phrase
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopwords.has(w));
}

/**
 * Compute token-overlap similarity between two phrases (0–1).
 * Uses Jaccard-like scoring with partial token matching for compound words.
 */
function phraseSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  let matches = 0;
  for (const ta of tokensA) {
    for (const tb of tokensB) {
      if (ta === tb) { matches += 1; break; }
      // Partial: one contains the other (e.g. "roof" matches "roofing")
      if (ta.length >= 3 && tb.length >= 3) {
        if (ta.includes(tb) || tb.includes(ta)) { matches += 0.7; break; }
      }
    }
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return matches / union;
}

/**
 * Check whether a reconciliation category likely matches a lease exclusion term.
 * Returns a confidence score 0–1.
 */
function exclusionMatchScore(exclusionTerm: string, reconCategory: string): number {
  // Direct substring match
  const exLower = exclusionTerm.toLowerCase();
  const rcLower = reconCategory.toLowerCase();
  if (rcLower.includes(exLower) || exLower.includes(rcLower)) return 1.0;

  // Token similarity
  const sim = phraseSimilarity(exLower, rcLower);
  if (sim >= 0.5) return sim;

  // Semantic category mappings for common equivalences
  const synonymGroups: string[][] = [
    ["capital improvement", "capital expenditure", "capital expense", "capital cost", "capital replacement", "capital repair", "capex", "capital outlay", "capital upgrade", "capital project"],
    ["roof repair", "roof replacement", "roofing", "roof maintenance", "roof restoration"],
    ["structural repair", "structural maintenance", "structural defect", "foundation", "structural work", "building shell", "building envelope", "exterior wall"],
    ["depreciation", "amortization"],
    ["leasing commission", "brokerage commission", "brokerage fee", "broker fee"],
    ["tenant improvement", "tenant buildout", "tenant allowance", "ti allowance", "tenant fit-out", "tenant build-out"],
    ["legal fee", "litigation", "attorney", "legal cost", "professional fee", "legal expense", "attorney fee"],
    ["environmental remediation", "hazardous material", "asbestos", "mold remediation", "hazmat", "environmental cleanup"],
    ["mortgage", "debt service", "interest expense", "financing cost", "loan payment"],
    ["advertising", "promotional expense", "marketing cost", "promotion"],
    ["penalty", "fine", "late fee", "interest charge", "late charge"],
    ["accounting fee", "audit expense", "audit cost", "cpa fee"],
    ["charitable contribution", "donation"],
    ["snow removal", "snow plowing", "ice removal", "winter maintenance", "de-icing"],
    ["pest control", "extermination", "pest management", "vermin control"],
    ["janitorial", "cleaning", "custodial", "janitor service", "cleaning service"],
    ["security", "guard service", "security patrol", "security system"],
    ["landscaping", "grounds maintenance", "lawn care", "ground keeping", "landscape maintenance"],
  ];

  for (const group of synonymGroups) {
    // For each side, check if the term matches a synonym in the group.
    // Use substring matching only when the candidate contains the synonym
    // (not vice versa) to avoid false positives like "maintenance" matching
    // "structural maintenance".
    const exInGroup = group.some(
      (s) => exLower === s || exLower.includes(s) || s.includes(exLower),
    );
    const rcInGroup = group.some(
      (s) => rcLower === s || rcLower.includes(s),
    );
    if (exInGroup && rcInGroup) return 0.85;
  }

  return sim;
}

// ---------------------------------------------------------------------------
// Source evidence helpers
// ---------------------------------------------------------------------------

const CAPITAL_LINE_INDICATORS = [
  "capital improvement", "capital expenditure", "capital expense",
  "roof repair", "roof replacement", "structural repair",
  "foundation", "depreciation", "amortization",
];

/** Rows that are totals, balances, payments or the tenant's own share, never an expense a lease could exclude. */
const NOT_AN_EXPENSE_ROW = /^(tenant|total|subtotal|balance)\b|total operating|balance due|estimated payments|payments? received|pro[\s-]*rata/i;

interface StatementLine { category: string; amount: string; rawLine: string }

/**
 * Statement lines that fall under a lease exclusion (or are capital in nature), one entry per LINE with its own amount.
 * The score keeps the existing thresholds: 0.4 and above is worth reviewing, 0.7 and above is a firm match.
 */
function findExcludedLines(
  lines: StatementLine[],
  excludedTerms: string[],
): Array<{ item: StatementLine; amount: number; score: number; matchedExclusion: string }> {
  const out: Array<{ item: StatementLine; amount: number; score: number; matchedExclusion: string }> = [];
  for (const item of lines) {
    const cat = item.category.toLowerCase().trim();
    const amount = normalizeNumber(item.amount);
    if (!(amount > 0) || NOT_AN_EXPENSE_ROW.test(cat)) continue;
    let score = 0;
    let matchedExclusion = "";
    const capital = CAPITAL_LINE_INDICATORS.find((ci) => cat.includes(ci));
    if (capital) { score = 1; matchedExclusion = capital; }
    for (const term of excludedTerms) {
      const s = exclusionMatchScore(term, cat);
      if (s > score) { score = s; matchedExclusion = term; }
    }
    if (score >= 0.4) out.push({ item, amount, score, matchedExclusion });
  }
  return out;
}

/**
 * Estimate which page a text snippet appears on by splitting on form-feed chars.
 */
function findPageForText(fullText: string, searchText: string): number | null {
  const pages = fullText.split("\f");
  if (pages.length <= 1) return null;
  const searchLower = searchText.toLowerCase();
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].toLowerCase().includes(searchLower)) {
      return i + 1;
    }
  }
  return null;
}

/**
 * Extract a short snippet of surrounding context from document text.
 * Snaps to sentence or clause boundaries when possible to avoid
 * mid-word cuts and ugly fragments.
 */
function extractSnippet(
  text: string,
  searchTerm: string,
  contextChars: number = 120,
): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(searchTerm.toLowerCase());
  if (idx === -1) return "";

  // Expand to generous boundaries first
  let start = Math.max(0, idx - contextChars);
  let end = Math.min(text.length, idx + searchTerm.length + contextChars);

  // Snap start to sentence/clause boundary (period, semicolon, newline)
  if (start > 0) {
    // Look for sentence boundary markers before start but after start-50
    const searchFrom = Math.max(0, start - 30);
    const region = text.slice(searchFrom, idx);
    // Find last sentence-ending punctuation followed by space/newline
    const sentEnd = region.search(/[.;]\s+(?=[A-Z])/);
    if (sentEnd !== -1) {
      start = searchFrom + sentEnd + 2; // skip the ". " part
    } else {
      // Fall back to word boundary
      const nextSpace = text.indexOf(" ", start);
      if (nextSpace !== -1 && nextSpace < idx) {
        start = nextSpace + 1;
      }
    }
  }

  // Snap end to sentence/clause boundary
  if (end < text.length) {
    // Look for sentence ending after the match
    const afterMatch = text.slice(idx + searchTerm.length, end + 40);
    const sentEndMatch = afterMatch.match(/[.;!]\s/);
    if (sentEndMatch && sentEndMatch.index !== undefined) {
      end = idx + searchTerm.length + sentEndMatch.index + 1;
    } else {
      // Fall back to word boundary
      const prevSpace = text.lastIndexOf(" ", end);
      if (prevSpace > idx + searchTerm.length) {
        end = prevSpace;
      }
    }
  }

  let snippet = text.slice(start, end).replace(/\s+/g, " ").trim();

  // Clean leading/trailing fragments that look ugly
  // Remove leading lowercase fragments (partial words from mid-sentence)
  snippet = snippet.replace(/^[a-z][a-z,;:\s]{0,15}\s+(?=[A-Z$\d])/, "");

  if (start > 0 && !snippet.startsWith("...")) snippet = "..." + snippet;
  if (end < text.length && !snippet.endsWith("...")) snippet = snippet + "...";

  return snippet;
}

// ---------------------------------------------------------------------------
// Main audit
// ---------------------------------------------------------------------------

/** A single reconciliation year's extracted data for multi-year comparison. */
export interface ReconciliationYearData {
  year: number;
  total: number;
  lineItems: Array<{ category: string; amount: string; rawLine: string }>;
  docName?: string;
}

export interface RunAuditOptions {
  leaseDocName?: string;
  reconDocName?: string;
  /** When multiple reconciliation documents are uploaded, provide their data here. */
  multiYearReconciliations?: ReconciliationYearData[];
  /** True when extra recon files were uploaded but could not be parsed into valid year entries. */
  multiYearUploadedButFailed?: boolean;
}

export async function runAudit(
  validation: DocumentValidationResult,
  options?: RunAuditOptions,
): Promise<AuditResult> {
  const {
    leaseFields,
    reconFields,
    issues,
    confidence,
    confidenceScore,
    auditMode,
  } = validation;

  const leaseDocName = options?.leaseDocName ?? "Lease Document";
  const reconDocName = options?.reconDocName ?? "CAM Reconciliation";
  const { reconText, leaseText } = validation;

  const freeFindings: Finding[] = [];
  const paidFindings: Finding[] = [];
  // Checks that reported an observation but deliberately calculated no amount (see src/lib/quantification.ts).
  const unquantifiedChecks: UnquantifiedCheck[] = [];
  const notComparedPairs: string[] = [];
  const isLimited = auditMode === "limited";

  // Track which required fields were flagged as missing
  const missingFields = new Set(issues.map((i: ValidationIssue) => i.field));
  // The AI reading failed for a document: a value that is missing may simply not have been read, so no finding below may
  // say a term is absent. (Audits without this record are unchanged.)
  const aiDegraded = !!validation.extraction;

  // --- Diagnostic logging: trace extracted fields ---
  console.log(`[audit-engine] === Extracted Fields ===`);
  console.log(`[audit-engine] Lease — camCap: ${leaseFields.camCapPercentage ? "found" : "NULL"}, adminFee: ${leaseFields.adminFeePercentage ? "found" : "NULL"}, mgmtFee: ${leaseFields.managementFee ? "found" : "NULL"}, proRata: ${leaseFields.proRataShare ? "found" : "NULL"}`);
  console.log(`[audit-engine] Lease — tenantSqFt: ${leaseFields.tenantPremisesSqFt ? "found" : "NULL"}, buildingSqFt: ${leaseFields.buildingTotalSqFt ? "found" : "NULL"}, excludedTerms: ${leaseFields.excludedTerms.length} found`);
  console.log(`[audit-engine] Recon — totalCam: ${reconFields.totalCamCharges ? "found" : "NULL"}, reconTotal: ${reconFields.reconciliationTotal ? "found" : "NULL"}, derivedTotal: ${reconFields.derivedTotal}`);
  console.log(`[audit-engine] Recon — proRata: ${reconFields.proRataShare ? "found" : "NULL"}, adminFee: ${reconFields.adminFeePercentage ? "found" : "NULL"}, mgmtFee: ${reconFields.managementFee ? "found" : "NULL"}`);
  console.log(`[audit-engine] Recon — lineItems: ${reconFields.lineItems.length}, expenseCategories: ${reconFields.expenseCategories.length}`);
  console.log(`[audit-engine] Recon — priorYearTotal: ${reconFields.priorYearTotal ? "found" : "NULL"}, reconYear: ${reconFields.reconciliationYear ? "found" : "NULL"}`);
  console.log(`[audit-engine] Mode: ${auditMode}, Confidence: ${confidence} (${confidenceScore}/100)`);

  // Parse dollar amounts for savings calculations
  const reconTotal = reconFields.totalCamCharges
    ? normalizeNumber(reconFields.totalCamCharges)
    : reconFields.reconciliationTotal
      ? normalizeNumber(reconFields.reconciliationTotal)
      : null;

  // Building-level total (used for fee percentage calculations where fees
  // are applied to building expenses, not the tenant's share)
  const buildingTotal = reconFields.reconciliationTotal
    ? normalizeNumber(reconFields.reconciliationTotal)
    : reconTotal;

  // Prior year total (used for year-over-year comparison)
  // Only a figure the statement itself labels as a prior/base-year total is a baseline. Extraction (pattern or AI) can
  // pick up a nearby number, for example "estimated payments received during 2025"; that is never a cap baseline.
  const priorYearRaw = supportedPriorYearTotal(reconFields.priorYearTotal, reconText, reconFields.reconciliationYear);
  const priorYearTotal = priorYearRaw ? normalizeNumber(priorYearRaw) : null;

  // Each statement line backs at most one amount: the same charge read under several names counts once.
  const ledgerItems = dedupeBySourceLine(reconFields.lineItems, reconText).kept;

  // ------------------------------------------------------------------
  // 1. CAM Cap Exceeded
  // ------------------------------------------------------------------
  if (leaseFields.camCapPercentage && reconTotal != null && reconTotal > 0) {
    const capPct = parseFloat(leaseFields.camCapPercentage);
    // Savings are only the PROVEN excess over the cap, which needs a prior-year
    // baseline. Previously this assumed an overage of max(cap, 2)% of the total
    // even with no prior year, which fabricated a dollar figure.
    const estimatedOverage = computeCamCapExcess({
      currentTotal: reconTotal,
      priorYearTotal,
      capPercent: isNaN(capPct) ? null : capPct,
    });
    const evidence: SourceEvidence[] = [];
    const capSnippet = extractSnippet(leaseText, leaseFields.camCapPercentage + "%");
    if (capSnippet) {
      evidence.push({
        document: leaseDocName,
        page: findPageForText(leaseText, leaseFields.camCapPercentage + "%"),
        extractedText: capSnippet,
        findingCategory: "CAM Cap Exceeded",
      });
    }
    const totalStr = reconFields.totalCamCharges ?? reconFields.reconciliationTotal ?? "";
    if (totalStr) {
      const totalSnippet = extractSnippet(reconText, totalStr);
      if (totalSnippet) {
        evidence.push({
          document: reconDocName,
          page: findPageForText(reconText, totalStr),
          extractedText: totalSnippet,
          findingCategory: "CAM Cap Exceeded",
        });
      }
    }
    // Build a stronger description depending on available data
    const totalDisplay = reconFields.totalCamCharges ?? reconFields.reconciliationTotal;
    let camCapDesc =
      `The lease text identified in this review mentions a ${leaseFields.camCapPercentage}% limit on increases. ` +
      `Total CAM charges of ${totalDisplay ? formatMoney(normalizeNumber(totalDisplay)) : totalDisplay} were detected in the reconciliation statement.`;

    if (priorYearTotal != null && priorYearTotal > 0) {
      const yoyIncrease = ((reconTotal! - priorYearTotal) / priorYearTotal) * 100;
      const capPctVal = parseFloat(leaseFields.camCapPercentage!);
      if (yoyIncrease > capPctVal) {
        // Observation only. How the lease measures the cap, what it covers and which year is the baseline are not
        // established, so no allowable maximum or excess is stated: that would present a lease result we do not have.
        camCapDesc +=
          ` The statement's total changed ${yoyIncrease.toFixed(1)}% (from ${formatMoney(priorYearTotal)} to ${formatMoney(reconTotal!)}), ` +
          `which is above ${leaseFields.camCapPercentage}%. ` +
          `This review did not establish how the cap is measured (against the prior year or a base year, cumulative or not), which expenses it covers, or whether an amendment changes it, ` +
          `so no allowable amount or excess is calculated and nothing is counted in any total.`;
      } else {
        camCapDesc +=
          ` The statement's total changed ${yoyIncrease.toFixed(1)}% (from ${formatMoney(priorYearTotal)}), ` +
          `which is below ${leaseFields.camCapPercentage}%. This does not confirm compliance: how the cap is measured and which expenses it covers were not established.`;
      }
      // The cap in many leases applies only to controllable expenses. This check compares the
      // statement's total, so say so instead of presenting it as a confirmed violation.
      if (/controllable/i.test(leaseText)) {
        camCapDesc +=
          ` Note: your lease refers to controllable expenses, and this comparison uses the statement's total charges, ` +
          `which may include expenses the cap does not cover.`;
      }
    } else {
      camCapDesc +=
        ` No prior-year total was found, so the system cannot tell whether the increase exceeds the cap. ` +
        `Upload the prior-year reconciliation to run this comparison.`;
    }

    // Three honest states: no baseline (cannot assess), within cap, or potentially exceeded.
    const baselineAvailable = priorYearTotal != null && priorYearTotal > 0 && !isNaN(capPct);
    // computeCamCapExcess is used only as the "total is above the stated percentage" test; its dollar result is not
    // reported anywhere, because the formula assumes a plain annual cap on total charges that this review cannot establish.
    const aboveStatedPercent = estimatedOverage > 0;
    const capLetterText =
      baselineAvailable && aboveStatedPercent
        ? `The statement shows total CAM charges of ${formatMoney(reconTotal!)}, compared with a prior-year total of ${formatMoney(priorYearTotal!)}, a change of ${(((reconTotal! - priorYearTotal!) / priorYearTotal!) * 100).toFixed(1)}%. ` +
          `The lease text I reviewed mentions a ${leaseFields.camCapPercentage}% limit on increases. ` +
          `Please explain how the cap applies under the lease (whether it is measured against the prior year or a base year, whether it is cumulative, and which expenses it covers) and provide the calculation you used.`
        : undefined;
    if (priorYearRaw && priorYearTotal != null && priorYearTotal > 0) {
      const priorSnippet = extractSnippet(reconText, priorYearRaw);
      if (priorSnippet) {
        evidence.push({
          document: reconDocName,
          page: findPageForText(reconText, priorYearRaw),
          extractedText: priorSnippet,
          findingCategory: "CAM Cap",
        });
      }
    }
    freeFindings.push(
      !baselineAvailable
        ? {
            category: "CAM Cap Review: Prior-Year Data Needed",
            description: camCapDesc,
            potential_savings: 0,
            severity: "medium",
            insufficientData: true,
            sourceEvidence: evidence.length > 0 ? evidence : undefined,
          }
        : aboveStatedPercent
          ? {
              category: "CAM Cap Review: Increase Above Stated Percentage",
              description: camCapDesc,
              potential_savings: 0,
              quantified: false,
              letterText: capLetterText,
              severity: "medium",
              sourceEvidence: evidence.length > 0 ? evidence : undefined,
            }
          : {
              category: "CAM Cap Review: Increase Below Stated Percentage",
              description: camCapDesc,
              potential_savings: 0,
              // Not a compliance result: the cap method is not established, so this cannot make an audit purchasable and
              // is not called clean. It raises nothing with the landlord (letterText "").
              quantified: false,
              letterText: "",
              severity: "low",
              sourceEvidence: evidence.length > 0 ? evidence : undefined,
            },
    );
    if (baselineAvailable && aboveStatedPercent) unquantifiedChecks.push("cap");
  } else if (leaseFields.camCapPercentage && !reconTotal) {
    // We found a cap in the lease but no total in the reconciliation
    const capSnippet = extractSnippet(leaseText, leaseFields.camCapPercentage + "%");
    freeFindings.push({
      category: "CAM Cap Exceeded",
      description:
        `The lease text identified in this review mentions a CAM cap of ${leaseFields.camCapPercentage}%, ` +
        `but the reconciliation statement contains only individual expense line items without a total CAM or operating expense summary. ` +
        `Because no total is available, the system cannot compare the year-over-year change with that percentage. ` +
        `If available, upload a reconciliation summary page that includes a total operating expense amount.`,
      potential_savings: 0,
      severity: "medium",
      insufficientData: true,
      sourceEvidence: capSnippet ? [{
        document: leaseDocName,
        page: findPageForText(leaseText, leaseFields.camCapPercentage + "%"),
        extractedText: capSnippet,
      }] : undefined,
    });
  } else if (!leaseFields.camCapPercentage) {
    // Only mark as insufficient data if we're in full mode AND there's evidence
    // the document was actually a lease (has other lease fields).
    // In limited mode, skip this finding entirely — it's not useful.
    if (!isLimited) {
      freeFindings.push({
        category: "CAM Cap Compliance",
        description: aiDegraded
          ? undetermined("whether the lease has a cap on controllable expenses")
          : "No CAM cap language was detected in the lease. This may mean the lease does not include a cap on controllable expenses, " +
            "or the cap language uses non-standard phrasing. Review the lease to confirm whether a cap exists.",
        potential_savings: 0,
        severity: "medium",
        insufficientData: true,
      });
    }
  }

  // ------------------------------------------------------------------
  // 1b. Year-over-Year CAM Increase Detection
  // ------------------------------------------------------------------
  if (priorYearTotal != null && priorYearTotal > 0 && reconTotal != null && reconTotal > 0) {
    const increasePercent = ((reconTotal - priorYearTotal) / priorYearTotal) * 100;
    const camCapPct = leaseFields.camCapPercentage ? parseFloat(leaseFields.camCapPercentage) : null;

    const yoyEvidence: SourceEvidence[] = [];

    // Prior year evidence
    const priorSnippet = extractSnippet(reconText, priorYearRaw!);
    if (priorSnippet) {
      yoyEvidence.push({
        document: reconDocName,
        page: findPageForText(reconText, priorYearRaw!),
        extractedText: priorSnippet,
        findingCategory: "Year-over-Year CAM Increase",
      });
    }

    // Current total evidence
    const currentTotalStr = reconFields.totalCamCharges ?? reconFields.reconciliationTotal ?? "";
    if (currentTotalStr) {
      const currentSnippet = extractSnippet(reconText, currentTotalStr);
      if (currentSnippet) {
        yoyEvidence.push({
          document: reconDocName,
          page: findPageForText(reconText, currentTotalStr),
          extractedText: currentSnippet,
          findingCategory: "Year-over-Year CAM Increase",
        });
      }
    }

    // CAM cap evidence from lease
    if (camCapPct != null && leaseFields.camCapPercentage) {
      const capSnippet = extractSnippet(leaseText, leaseFields.camCapPercentage + "%");
      if (capSnippet) {
        yoyEvidence.push({
          document: leaseDocName,
          page: findPageForText(leaseText, leaseFields.camCapPercentage + "%"),
          extractedText: capSnippet,
          findingCategory: "Year-over-Year CAM Increase",
        });
      }
    }

    if (camCapPct != null) {
      // A lease cap exists: section 1 already reports this comparison (exceeded or within
      // the cap) with its prior-year evidence. A second finding here counted the same
      // excess dollars twice, so none is added.
    } else if (camCapPct == null && increasePercent > 0) {
      // No cap in lease but increase detected — informational
      freeFindings.push({
        category: "Year-over-Year CAM Increase Detected",
        description:
          `Year-over-year CAM expenses increased by ${increasePercent.toFixed(1)}%, ` +
          `from ${formatMoney(priorYearTotal)} to ${formatMoney(reconTotal)}. ` +
          (aiDegraded
            ? `${undetermined("whether the lease has a cap to compare this change with")} `
            : `No CAM cap was detected in the lease to compare against. `) +
          `Check your lease for any limit on increases.`,
        potential_savings: 0,
        // A change with no cap detected is an observation for the customer to read, not an item to raise: low severity makes it a
        // note, so it never qualifies an audit for purchase by itself.
        severity: "low",
        sourceEvidence: yoyEvidence.length > 0 ? yoyEvidence : undefined,
      });
    }
    // If cap exists and increase is within cap, no finding needed
  }

  // ------------------------------------------------------------------
  // 2. Admin / Management Fee
  // ------------------------------------------------------------------
  const leaseAdminFee =
    leaseFields.adminFeePercentage ?? leaseFields.managementFee;
  const reconAdminFee =
    reconFields.adminFeePercentage ?? reconFields.managementFee;

  let adminFeeCheckedByStatedPercent = false;

  if (leaseAdminFee && reconAdminFee) {
    const leaseVal = parseFloat(leaseAdminFee);
    const reconVal = parseFloat(reconAdminFee);
    if (!isNaN(leaseVal) && !isNaN(reconVal)) {
      const adminEvidence: SourceEvidence[] = [];
      const leaseAdminSnippet = extractSnippet(leaseText, leaseAdminFee + "%");
      if (leaseAdminSnippet) {
        adminEvidence.push({
          document: leaseDocName,
          page: findPageForText(leaseText, leaseAdminFee + "%"),
          extractedText: leaseAdminSnippet,
        });
      }
      const reconAdminSnippet = extractSnippet(reconText, reconAdminFee + "%");
      if (reconAdminSnippet) {
        adminEvidence.push({
          document: reconDocName,
          page: findPageForText(reconText, reconAdminFee + "%"),
          extractedText: reconAdminSnippet,
        });
      }
      // The statement's stated percentage takes precedence; section 3e must not
      // re-evaluate the same fee on a different base (that double counted it).
      adminFeeCheckedByStatedPercent = true;
      if (reconVal > leaseVal) {
        // Tenant's share of the building-level fee charged above the cap.
        let feeAmountBuilding = 0;
        for (const item of ledgerItems) {
          const catLower = item.category.toLowerCase().trim();
          if (ADMIN_FEE_LINE_KEYWORDS.some((kw) => catLower.includes(kw))) {
            const amt = normalizeNumber(item.amount);
            if (!isNaN(amt) && amt > 0) feeAmountBuilding += amt;
          }
        }
        const shareRaw = reconFields.proRataShare ?? leaseFields.proRataShare;
        const feeSavings = Math.round(
          computeAdminFeeTenantOvercharge({
            feeAmountBuilding: feeAmountBuilding > 0 ? feeAmountBuilding : null,
            statedPercent: reconVal,
            capPercent: leaseVal,
            tenantSharePercent: shareRaw ? parseFloat(shareRaw) : null,
          }),
        );
        paidFindings.push({
          category: "Admin Fee Above Lease Cap",
          checkId: "admin-fee",
          ...(feeSavings > 0
            ? { calc: { kind: "admin-fee" as const, method: "stated-rate" as const, feeAmountBuilding, statedPercent: reconVal, capPercent: leaseVal, feeBase: null, tenantSharePercent: parsePercent(shareRaw) } }
            : {}),
          description:
            `The reconciliation shows a management/admin fee at ${reconVal}%, ` +
            `while the lease caps this fee at ${leaseVal}%. ` +
            `The ${(reconVal - leaseVal).toFixed(1)}-point difference should be reviewed with the landlord.` +
            (feeSavings > 0
              ? ` Calculation: the fee line on the statement is ${formatMoney(feeAmountBuilding)}, billed at ${reconVal}%. At the ${leaseVal}% cap the permitted fee is ${formatMoney((feeAmountBuilding * leaseVal) / reconVal)} (the same base, assuming the cap and the billed rate apply to the same expenses), so the building was billed ${formatMoney(feeAmountBuilding - (feeAmountBuilding * leaseVal) / reconVal)} above it. Your ${shareRaw}% share of that is approximately ${formatMoney(feeSavings)}. This is a calculation from the documents, not a confirmed overcharge.`
              : " The documents did not provide enough detail to calculate a dollar amount."),
          potential_savings: feeSavings,
          severity: "medium",
          sourceEvidence: adminEvidence.length > 0 ? adminEvidence : undefined,
        });
      } else {
        // Fee is within cap — positive finding
        paidFindings.push({
          category: "Admin Fee Compliance",
          description:
            `Management/admin fee of ${reconVal}% in the reconciliation is within the lease cap of ${leaseVal}%. No discrepancy detected.`,
          potential_savings: 0,
          severity: "low",
          sourceEvidence: adminEvidence.length > 0 ? adminEvidence : undefined,
        });
      }
    }
  } else if (leaseAdminFee && !reconAdminFee) {
    paidFindings.push({
      category: "Admin Fee Review",
      description:
        `Lease caps the admin/management fee at ${leaseAdminFee}%, ` +
        `but the fee percentage could not be identified in the reconciliation statement. ` +
        `Verify the charged fee does not exceed the lease-allowed rate.`,
      potential_savings: 0,
      severity: "low",
      insufficientData: true,
    });
  } else if (missingFields.has("admin_fee") && !isLimited) {
    paidFindings.push({
      category: "Admin Fee Review",
      description: aiDegraded
        ? undetermined("whether the lease limits administrative or management fees")
        : "No admin or management fee cap was detected in the lease. " +
          "If the lease includes fee limitations under different terminology, manual review is recommended.",
      potential_savings: 0,
      severity: "low",
      insufficientData: true,
    });
  }

  // ------------------------------------------------------------------
  // 3. Pro-rata share: ONE check, ONE finding, at most ONE amount (see src/services/share-math.ts)
  // ------------------------------------------------------------------
  // Earlier versions ran four overlapping share checks that each added an amount for the same discrepancy, and priced it
  // as "the statement total" x the percentage-point difference, which is meaningless when that total is the tenant's own
  // charge. Now the lease's expected share is resolved once and compared once with the billed share, and an amount is
  // calculated only from a pool that the statement's own figures show the share was applied to. Underbilling is never savings.
  {
    const tenantSqFtRaw = leaseFields.tenantPremisesSqFt;
    const buildingSqFtRaw = leaseFields.buildingTotalSqFt;
    const tenantSqFt = tenantSqFtRaw ? normalizeNumber(tenantSqFtRaw) : null;
    const buildingSqFt = buildingSqFtRaw ? normalizeNumber(buildingSqFtRaw) : null;
    // A percentage the lease itself states. A share this software derived from square footage is never "stated".
    const statedLeaseShareRaw = leaseFields.derivedProRataShare
      ? leaseFields.statedTenantSharePercent
      : (leaseFields.proRataShare ?? leaseFields.statedTenantSharePercent);
    const expected = resolveExpectedShare({ statedPercent: statedLeaseShareRaw, tenantSqFt, buildingSqFt });
    const billed = parsePercent(reconFields.proRataShare);
    const pct = (n: number) => `${parseFloat(n.toFixed(4))}%`;
    const sqftText =
      expected.fromSquareFootage != null
        ? `${tenantSqFt!.toLocaleString("en-US")} sq ft / ${buildingSqFt!.toLocaleString("en-US")} sq ft = ${pct(expected.fromSquareFootage)}`
        : null;

    // Evidence: where the lease states the share (or the square footage), and where the statement applies it.
    const shareEvidence: SourceEvidence[] = [];
    const addEvidence = (text: string, doc: string, term: string | null | undefined, label: string) => {
      if (!term) return;
      const snippet = extractSnippet(text, term);
      if (snippet && !shareEvidence.some((e) => e.extractedText === snippet)) {
        shareEvidence.push({ document: doc, page: findPageForText(text, term), extractedText: snippet, findingCategory: label });
      }
    };
    if (statedLeaseShareRaw) addEvidence(leaseText, leaseDocName, `${statedLeaseShareRaw}%`, "Lease Share");
    if (expected.basis !== "stated" || expected.conflict) {
      addEvidence(leaseText, leaseDocName, tenantSqFtRaw, "Tenant Premises Sq Ft");
      addEvidence(leaseText, leaseDocName, buildingSqFtRaw, "Building Total Sq Ft");
    }
    if (reconFields.proRataShare) addEvidence(reconText, reconDocName, `${reconFields.proRataShare}%`, "Billed Share");

    const expectedSentence =
      expected.basis === "stated"
        ? `The lease text identified in this review states a share of ${pct(expected.value!)}` +
          (sqftText ? ` (its square footage gives ${sqftText}, consistent with that).` : ".")
        : expected.basis === "square-footage"
          ? `No share percentage stated in the lease was identified; the lease's square footage gives ${sqftText}.`
          : "";

    if (billed != null && expected.value != null) {
      const diff = billed - expected.value;
      if (Math.abs(diff) > shareMismatchThreshold(expected.basis!)) {
        if (diff > 0) {
          const pool = findSharePool({
            statementText: reconText,
            billedShare: billed,
            billedShareDecimals: shareDecimals(reconFields.proRataShare),
            candidateCharges: [parseMoney(reconFields.totalCamCharges), parseMoney(reconFields.reconciliationTotal)],
          });
          const calc: ShareCalc = {
            kind: "share",
            billedShare: billed,
            expectedShare: expected.value,
            expectedBasis: expected.basis!,
            pool: pool?.pool ?? null,
            tenantCharge: pool?.tenantCharge ?? null,
          };
          if (pool) {
            if (pool.poolLine) shareEvidence.push({ document: reconDocName, page: findPageForText(reconText, pool.poolLine), extractedText: pool.poolLine, findingCategory: "Amount the Share Was Applied To" });
            if (pool.chargeLine && pool.chargeLine !== pool.poolLine) shareEvidence.push({ document: reconDocName, page: findPageForText(reconText, pool.chargeLine), extractedText: pool.chargeLine, findingCategory: "Tenant Charge" });
          }
          freeFindings.push({ ...shareFinding(calc, { expectedSentence, sqftText }), sourceEvidence: shareEvidence.length > 0 ? shareEvidence : undefined });
        } else {
          // Billed below the lease share: reported so the figures are visible, never as savings and never raised in the letter.
          freeFindings.push({
            category: "Pro-Rata Share Below Lease Share",
            checkId: SHARE_CHECK_ID,
            description:
              `The statement applies a tenant share of ${pct(billed)}. ${expectedSentence} ` +
              `The billed share is ${parseFloat(Math.abs(diff).toFixed(4))} percentage points lower than the lease share, so it is not a charge above the lease. ` +
              `No amount is counted. A landlord could later correct an underbilled share, so keep this in mind before raising other items.`,
            potential_savings: 0,
            letterText: "",
            severity: "low",
            sourceEvidence: shareEvidence.length > 0 ? shareEvidence : undefined,
          });
        }
      }
    } else if (expected.conflict) {
      // The lease gives two different figures. Which governs is a reading of the lease, so no expected share and no amount.
      const matchesOne =
        billed != null &&
        (Math.abs(billed - expected.stated!) <= shareMismatchThreshold("stated") ||
          Math.abs(billed - expected.fromSquareFootage!) <= shareMismatchThreshold("square-footage"));
      freeFindings.push({
        category: "Pro-Rata Share Review",
        checkId: SHARE_CHECK_ID,
        description:
          `The lease text identified in this review states a share of ${pct(expected.stated!)}, but its square footage gives ${sqftText}. ` +
          (billed != null
            ? `The statement applies ${pct(billed)}. `
            : "No billed share percentage was identified in the statement. ") +
          `Which figure governs depends on the lease's wording (for example whether the stated share is fixed or subject to remeasurement), ` +
          `so no expected share is assumed and no amount is calculated.`,
        potential_savings: 0,
        ...(billed == null
          ? { insufficientData: true }
          : {
              letterText: matchesOne
                ? ""
                : `The statement applies a tenant share of ${pct(billed)}. The lease I reviewed states ${pct(expected.stated!)}, and its square footage gives ${sqftText}. Please explain how my share was determined and provide the calculation.`,
            }),
        severity: billed != null && !matchesOne ? "medium" : "low",
        sourceEvidence: shareEvidence.length > 0 ? shareEvidence : undefined,
      });
    } else if (missingFields.has("pro_rata") && !isLimited) {
      paidFindings.push({
        category: "Pro-Rata Share Review",
        description: aiDegraded
          ? undetermined("the tenant's pro-rata share")
          : "Pro-rata share percentage could not be detected in the lease. " +
            "Verify that the reconciliation applies the correct tenant share based on actual rentable area.",
        potential_savings: 0,
        severity: "low",
        insufficientData: true,
      });
    }
  }

  // ------------------------------------------------------------------
  // 3e. Admin Fee Validation (Premium)
  // ------------------------------------------------------------------
  {
    const adminFeeCapRaw =
      leaseFields.adminFeePercentage ?? leaseFields.managementFee;
    const adminFeeCap = adminFeeCapRaw ? parseFloat(adminFeeCapRaw) : null;

    if (
      !adminFeeCheckedByStatedPercent &&
      adminFeeCap != null &&
      !isNaN(adminFeeCap) &&
      reconTotal != null &&
      reconTotal > 0 &&
      reconFields.lineItems.length > 0
    ) {
      // Detect admin/management fee line items by keyword
      const adminKeywords = [
        "admin fee",
        "administrative fee",
        "management fee",
        "property management",
        "management charge",
      ];

      let adminFeeAmount = 0;
      let adminFeeLabel = "";
      let adminFeeRawLine = "";

      for (const item of ledgerItems) {
        const catLower = item.category.toLowerCase().trim();
        const matched = adminKeywords.some(
          (kw) => catLower.includes(kw) || kw.includes(catLower),
        );
        if (matched) {
          const amt = normalizeNumber(item.amount);
          if (!isNaN(amt) && amt > 0) {
            adminFeeAmount += amt;
            if (!adminFeeLabel) {
              adminFeeLabel = item.category;
              adminFeeRawLine = item.rawLine;
            }
          }
        }
      }

      if (adminFeeAmount > 0) {
        // Use building-level total for fee percentage since management fees
        // are applied to building operating expenses, not the tenant's share.
        const feeBaseTotal = buildingTotal ?? reconTotal;
        const adminPercent = feeBaseTotal != null && feeBaseTotal > 0
          ? (adminFeeAmount / feeBaseTotal) * 100
          : null;

        if (adminPercent != null && adminPercent > adminFeeCap) {
          // Tenant's part of the fee above the cap: (fee - base x cap%) x tenant share%. Needs the share; without it, no amount.
          const excessPercent = adminPercent - adminFeeCap;
          const feeShareRaw = reconFields.proRataShare ?? leaseFields.proRataShare;
          const feeShare = parsePercent(feeShareRaw);
          const permittedFee = Math.round(feeBaseTotal! * adminFeeCap) / 100;
          const exactFeeExcess = computeFeeOverBaseTenantOvercharge({ feeAmountBuilding: adminFeeAmount, feeBase: feeBaseTotal!, capPercent: adminFeeCap, tenantSharePercent: feeShare });
          const adminOvercharge = Math.round(exactFeeExcess);

          // Build evidence
          const adminValEvidence: SourceEvidence[] = [];

          // Evidence: admin fee line item from reconciliation
          if (adminFeeRawLine) {
            adminValEvidence.push({
              document: reconDocName,
              page: findPageForText(reconText, adminFeeLabel),
              extractedText: adminFeeRawLine,
              findingCategory: "Admin Fee Detected",
            });
          }

          // Evidence: admin fee cap from lease
          if (adminFeeCapRaw) {
            const capSnippet = extractSnippet(
              leaseText,
              adminFeeCapRaw + "%",
            );
            if (capSnippet) {
              adminValEvidence.push({
                document: leaseDocName,
                page: findPageForText(leaseText, adminFeeCapRaw + "%"),
                extractedText: capSnippet,
                findingCategory: "Lease Admin Fee Cap",
              });
            }
          }

          const adminValDesc =
            `The admin/management fee in the reconciliation is ${formatMoney(adminFeeAmount)}, ` +
            `representing ${adminPercent.toFixed(2)}% of building operating expenses (${formatMoney(feeBaseTotal!)}). ` +
            `The lease limits this fee to ${adminFeeCap}%, ${excessPercent.toFixed(2)} percentage points less. ` +
            (adminOvercharge > 0
              ? `Calculation: at ${adminFeeCap}% of ${formatMoney(feeBaseTotal!)} the permitted fee is ${formatMoney(permittedFee)}, so the fee is ${formatMoney(Math.round((adminFeeAmount - permittedFee) * 100) / 100)} above it; ` +
                `your ${feeShareRaw}% share of that is ${formatMoney(exactFeeExcess)}, rounded to ${formatMoney(adminOvercharge)}. ` +
                `This assumes the lease measures the fee against the same total, which this review did not establish (for example, whether that total includes the fee itself). This is a calculation from the documents, not a confirmed overcharge. `
              : `Your share percentage was not found in the documents, so no dollar amount is calculated and nothing is counted in any total. `) +
            `Ask the landlord to explain how the fee was calculated, and consider requesting an itemized breakdown of the management fee.`;

          paidFindings.push({
            category: "Administrative Fee Cap Exceeded",
            checkId: "admin-fee",
            ...(adminOvercharge > 0
              ? { calc: { kind: "admin-fee" as const, method: "fee-over-base" as const, feeAmountBuilding: adminFeeAmount, statedPercent: adminPercent, capPercent: adminFeeCap, feeBase: feeBaseTotal!, tenantSharePercent: feeShare } }
              : {}),
            description: adminValDesc,
            potential_savings: adminOvercharge,
            severity: adminOvercharge > 0 ? "high" : "medium",
            sourceEvidence:
              adminValEvidence.length > 0 ? adminValEvidence : undefined,
          });
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // 4. Excluded Category Billed — fuzzy matching
  // ------------------------------------------------------------------
  if (reconFields.expenseCategories.length > 0) {
    const suspectMatches: Array<{ reconCat: string; matchedExclusion: string; score: number }> = [];

    // Capital-nature indicators (always suspect)
    const capitalIndicators = [
      "capital improvement", "capital expenditure", "capital expense",
      "roof repair", "roof replacement", "structural repair",
      "foundation", "depreciation", "amortization",
    ];
    for (const cat of reconFields.expenseCategories) {
      if (capitalIndicators.includes(cat)) {
        suspectMatches.push({ reconCat: cat, matchedExclusion: cat, score: 1.0 });
      }
    }

    // Cross-reference lease exclusion terms against recon categories
    if (leaseFields.excludedTerms.length > 0) {
      for (const excluded of leaseFields.excludedTerms) {
        for (const reconCat of reconFields.expenseCategories) {
          const score = exclusionMatchScore(excluded, reconCat);
          if (score >= 0.4) {
            // Avoid duplicates
            const alreadyMatched = suspectMatches.some(
              (m) => m.reconCat === reconCat && m.score >= score,
            );
            if (!alreadyMatched) {
              suspectMatches.push({ reconCat, matchedExclusion: excluded, score });
            }
          }
        }
      }
    }

    if (suspectMatches.length > 0) {
      // De-duplicate by recon category, keep highest score
      const bestByCategory = new Map<string, typeof suspectMatches[0]>();
      for (const m of suspectMatches) {
        const existing = bestByCategory.get(m.reconCat);
        if (!existing || m.score > existing.score) {
          bestByCategory.set(m.reconCat, m);
        }
      }

      // Several labels can name one statement line: show each line once, under the label the statement itself uses.
      const lineIndexOf = (cat: string) =>
        ledgerItems.findIndex((li) => {
          const k = li.category.toLowerCase().trim();
          return k === cat || k.includes(cat) || cat.includes(k);
        });
      const byLine = new Map<string, typeof suspectMatches[0]>();
      for (const m of bestByCategory.values()) {
        const li = lineIndexOf(m.reconCat);
        const key = li >= 0 ? `line:${li}` : `cat:${m.reconCat}`;
        const label = li >= 0 ? ledgerItems[li].category.toLowerCase().trim() : m.reconCat;
        const seen = byLine.get(key);
        if (!seen || m.score > seen.score) byLine.set(key, { ...m, reconCat: label });
      }
      const collapsed = [...byLine.values()];
      const highConf = collapsed.filter((m) => m.score >= 0.7);
      const medConf = collapsed.filter((m) => m.score >= 0.4 && m.score < 0.7);

      const parts: string[] = [];
      if (highConf.length > 0) {
        const excludedList = highConf.map((m) => m.reconCat).join(", ");
        parts.push(
          `The reconciliation includes charges for ${excludedList}, ` +
          `which may fall within categories excluded from tenant pass-through expenses. `,
        );
        if (leaseFields.excludedTerms.length > 0) {
          parts.push(
            `The lease lists these exclusions: ${leaseFields.excludedTerms.slice(0, 8).join(", ")}. ` +
            `Ask the landlord to explain these charges and which lease provision allows them.`,
          );
        } else {
          parts.push(
            `These may be capital or non-pass-through items. ` +
            `Check them against the exclusion provisions in your lease.`,
          );
        }
      }
      if (medConf.length > 0) {
        parts.push(
          `Additional categories may warrant review: ${medConf.map((m) => `${m.reconCat} (possible match to "${m.matchedExclusion}")`).join("; ")}.`,
        );
      }

      // Build evidence for excluded categories
      const excludedEvidence: SourceEvidence[] = [];
      for (const m of highConf.slice(0, 2)) {
        const snippet = extractSnippet(reconText, m.reconCat);
        if (snippet) {
          excludedEvidence.push({
            document: reconDocName,
            page: findPageForText(reconText, m.reconCat),
            extractedText: snippet,
            findingCategory: "Excluded Category Billed",
          });
        }
      }
      if (leaseFields.excludedTerms.length > 0) {
        const exSnippet = extractSnippet(leaseText, leaseFields.excludedTerms[0]);
        if (exSnippet) {
          excludedEvidence.push({
            document: leaseDocName,
            page: findPageForText(leaseText, leaseFields.excludedTerms[0]),
            extractedText: exSnippet,
            findingCategory: "Lease Exclusion Clause",
          });
        }
      }

      freeFindings.push({
        category: "Excluded Category Billed",
        description: parts.join(" "),
        potential_savings: 0,
        severity: highConf.length > 0 ? "high" : "medium",
        sourceEvidence: excludedEvidence.length > 0 ? excludedEvidence : undefined,
      });
    }
  } else if (missingFields.has("expense_categories") && !isLimited) {
    freeFindings.push({
      category: "Expense Category Review",
      description: aiDegraded
        ? undetermined("which expense categories the statement lists")
        : "No itemized expense categories were detected in the reconciliation statement. " +
          "Without a line-item breakdown, it is not possible to verify whether excluded categories were billed. " +
          "Request a detailed expense breakdown from the landlord.",
      potential_savings: 0,
      severity: "low",
      insufficientData: true,
    });
  }

  // ------------------------------------------------------------------
  // 4b. Excluded Category Overcharge Calculation
  // ------------------------------------------------------------------
  let estimatedOvercharge = 0;
  const overchargeBreakdown: OverchargeLineItem[] = [];

  if (reconFields.expenseCategories.length > 0) {
    // Determine tenant share percentage (prefer recon, fall back to lease)
    const tenantShareRaw =
      reconFields.proRataShare ?? leaseFields.proRataShare;
    const tenantSharePct = tenantShareRaw ? parseFloat(tenantShareRaw) : null;

    // One contribution per statement line, never per label. Several category labels (the pattern reader's and the AI
    // step's) can name the same line; ledgerItems already holds each line once, so a line cannot be counted twice.
    const excludedLines = findExcludedLines(ledgerItems, leaseFields.excludedTerms);
    for (const line of excludedLines) {
      if (tenantSharePct != null && tenantSharePct > 0) {
        const tenantCharge = Math.round(line.amount * (tenantSharePct / 100) * 100) / 100;
        const cat = line.item.category.toLowerCase().trim();
        overchargeBreakdown.push({
          category: cat,
          total_expense: line.amount,
          tenant_share_percent: tenantSharePct,
          tenant_charge: tenantCharge,
          reason: "Excluded Expense",
          sourceEvidence: {
            document: reconDocName,
            page: findPageForText(reconText, cat),
            extractedText: line.item.rawLine || extractSnippet(reconText, cat) || cat,
          },
        });
        estimatedOvercharge += tenantCharge;
      }
    }

    // Round total overcharge
    estimatedOvercharge = Math.round(estimatedOvercharge * 100) / 100;
  }

  // ------------------------------------------------------------------
  // 5. Total CAM / Reconciliation Totals
  // ------------------------------------------------------------------
  if (!reconFields.totalCamCharges && !reconFields.reconciliationTotal) {
    if (missingFields.has("total_cam") && !isLimited) {
      freeFindings.push({
        category: "Reconciliation Totals",
        description: aiDegraded
          ? undetermined("the statement's total CAM or operating expense charges")
          : "Your reconciliation statement contains individual expense line items but does not include a total CAM or operating expense summary. " +
            "Because of this, savings calculations that depend on total charges cannot be completed. " +
            "If available, upload a reconciliation summary page that includes a total operating expense amount, or request one from the landlord.",
        potential_savings: 0,
        severity: "low",
        insufficientData: true,
      });
    }
  }

  // ------------------------------------------------------------------
  // Multi-Year CAM Reconciliation Escalation Comparison
  // IMPORTANT: Must run BEFORE filtering so findings are included in
  // verifiedPaid and counted in savings calculation.
  // ------------------------------------------------------------------
  const multiYearRecons = options?.multiYearReconciliations;
  const multiYearComparisonRan = multiYearRecons != null && multiYearRecons.length >= 2;

  let multiYearPairsCompared = 0;
  let multiYearPairsSkipped = 0;
  let multiYearDistinctYears = 0;

  if (multiYearRecons && multiYearRecons.length >= 2) {
    // One entry per distinct year, in order. A cap limits year-to-year change, so only a year and the year directly
    // before it can be compared. The same statement uploaded twice (same year, same total) counts once; a year with
    // two DIFFERENT totals is ambiguous and is never compared, because the software cannot tell which one is right.
    const totalsByYear = new Map<number, number[]>();
    for (const r of multiYearRecons) totalsByYear.set(r.year, [...(totalsByYear.get(r.year) ?? []), r.total]);
    const ambiguousYears = new Set<number>();
    const sorted = [...totalsByYear.keys()]
      .sort((a, b) => a - b)
      .map((year) => {
        const totals = totalsByYear.get(year)!;
        if (new Set(totals).size > 1) ambiguousYears.add(year);
        return multiYearRecons.find((r) => r.year === year && r.total === totals[0])!;
      });
    console.log(`[audit-engine] Multi-year comparison across ${sorted.length} distinct years`);
    multiYearDistinctYears = sorted.length;

    const camCapPct = leaseFields.camCapPercentage
      ? parseFloat(leaseFields.camCapPercentage)
      : null;

    // No cap step carries an amount (see src/lib/quantification.ts), so a year can be reported by both section 1 and
    // this comparison without counting anything twice. There is deliberately no guess about which findings describe the
    // same pair of years: that match would need the baseline, amount, scope and method to agree, and none is established.
    const notComparable: string[] = [];

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];

      if (ambiguousYears.has(prev.year) || ambiguousYears.has(curr.year)) {
        const dup = ambiguousYears.has(prev.year) ? prev.year : curr.year;
        notComparable.push(`${prev.year} to ${curr.year}: more than one statement with different totals was found for ${dup}`);
        multiYearPairsSkipped++;
        continue;
      }
      if (curr.year - prev.year !== 1) {
        notComparable.push(`${prev.year} to ${curr.year}: the years are not consecutive, so the annual cap cannot be applied to the change`);
        multiYearPairsSkipped++;
        continue;
      }
      if (prev.total <= 0 || curr.total <= 0) continue;
      multiYearPairsCompared++;

      const increasePercent =
        ((curr.total - prev.total) / prev.total) * 100;

      console.log(`[audit-engine] Multi-year step evaluated`);

      if (camCapPct != null && increasePercent > camCapPct) {
        const evidence: SourceEvidence[] = [
          {
            document: prev.docName ?? `Reconciliation ${prev.year}`,
            page: null,
            extractedText: `${prev.year} Total: ${formatMoney(prev.total)}`,
            findingCategory: "CAM Cap Review: Increase Above Stated Percentage",
          },
          {
            document: curr.docName ?? `Reconciliation ${curr.year}`,
            page: null,
            extractedText: `${curr.year} Total: ${formatMoney(curr.total)}`,
            findingCategory: "CAM Cap Review: Increase Above Stated Percentage",
          },
        ];

        // Add lease cap evidence
        if (leaseFields.camCapPercentage) {
          const capSnippet = extractSnippet(leaseText, leaseFields.camCapPercentage + "%");
          if (capSnippet) {
            evidence.push({
              document: leaseDocName,
              page: findPageForText(leaseText, leaseFields.camCapPercentage + "%"),
              extractedText: capSnippet,
              findingCategory: "CAM Cap Review: Increase Above Stated Percentage",
            });
          }
        }

        const finding: Finding = {
          category: "CAM Cap Review: Increase Above Stated Percentage",
          description:
            `Total CAM charges changed ${increasePercent.toFixed(1)}% from ${prev.year} (${formatMoney(prev.total)}) ` +
            `to ${curr.year} (${formatMoney(curr.total)}), which is above the ${camCapPct}% limit on increases mentioned in the lease text identified in this review. ` +
            `This review did not establish how the cap is measured (against the prior year or a base year, cumulative or not), which expenses it covers, or whether an amendment changes it, ` +
            `so no allowable amount or excess is calculated and nothing is counted in any total.` +
            (/controllable/i.test(leaseText)
              ? ` Note: your lease refers to controllable expenses, and this comparison uses each statement's total charges, which may include expenses the cap does not cover.`
              : ""),
          potential_savings: 0,
          quantified: false,
          letterText:
            `The statements show total CAM charges of ${formatMoney(prev.total)} for ${prev.year} and ${formatMoney(curr.total)} for ${curr.year}, a change of ${increasePercent.toFixed(1)}%. ` +
            `The lease text I reviewed mentions a ${camCapPct}% limit on increases. ` +
            `Please explain how the cap applies under the lease (whether it is measured against the prior year or a base year, whether it is cumulative, and which expenses it covers) and provide the calculation you used.`,
          severity: "medium",
          sourceEvidence: evidence,
        };

        paidFindings.push(finding);
        unquantifiedChecks.push("cap");
        console.log(`[audit-engine] Multi-year finding recorded`);
      } else if (increasePercent > 0) {
        // Even if within cap or no cap, generate an informational finding for multi-year
        freeFindings.push({
          // Cap present: an unsupported cap observation, same treatment as the single-statement one (needs review, cannot
          // make an audit purchasable, not called clean). No cap detected: the separate no-cap behavior is unchanged.
          category: camCapPct != null ? "CAM Cap Review: Increase Below Stated Percentage" : "Year-over-Year CAM Change (Multi-Year)",
          description:
            `CAM charges changed ${increasePercent.toFixed(1)}% from ${prev.year} (${formatMoney(prev.total)}) ` +
            `to ${curr.year} (${formatMoney(curr.total)}).` +
            (camCapPct != null
              ? ` This is below the ${camCapPct}% figure found in the lease text. It does not confirm compliance: how the cap is measured and which expenses it covers were not established.`
              : aiDegraded
                ? ` ${undetermined("whether the lease has a cap to compare this change with")}`
                : ` No CAM cap was detected in the lease to compare against.`),
          potential_savings: 0,
          ...(camCapPct != null ? { quantified: false, letterText: "" } : {}),
          // low in both variants: with or without a cap this is an observation, never an item that qualifies an audit for purchase
          severity: "low",
          sourceEvidence: [
            {
              document: prev.docName ?? `Reconciliation ${prev.year}`,
              page: null,
              extractedText: `${prev.year} Total: ${formatMoney(prev.total)}`,
            },
            {
              document: curr.docName ?? `Reconciliation ${curr.year}`,
              page: null,
              extractedText: `${curr.year} Total: ${formatMoney(curr.total)}`,
            },
          ],
        });
      }
    }

    for (const y of ambiguousYears) {
      if (!notComparable.some((n) => n.endsWith(` for ${y}`) || n.includes(` for ${y};`))) {
        notComparable.push(`${y}: more than one statement with different totals was found for ${y}`);
        multiYearPairsSkipped++;
      }
    }

    if (notComparable.length > 0) {
      notComparedPairs.push(...notComparable);
      freeFindings.push({
        category: "CAM Cap Review: Years Not Comparable",
        description:
          `Some of the statements you uploaded could not be compared against the annual cap: ${notComparable.join("; ")}. ` +
          `No amount is counted for these. To run the check, upload one statement for each year, with no year missing in between.`,
        potential_savings: 0,
        severity: "medium",
        insufficientData: true,
      });
    }
  }

  // ------------------------------------------------------------------
  // 6. Gross-Up Review (heuristic audit module)
  // IMPORTANT: Must run BEFORE filtering so findings are included in
  // verifiedPaid and counted in savings calculation.
  // ------------------------------------------------------------------
  {
    // Step 1: Search lease + recon text for gross-up / occupancy-adjustment indicators
    const grossUpKeywords = [
      "gross-up", "gross up", "grossed up", "grossed-up",
      "occupancy adjustment", "adjusted to full occupancy",
      "assumed occupancy", "stabilized occupancy",
      "administrative adjustment", "loaded to 95%", "loaded to 100%",
      "adjusted to 95%", "adjusted to 100%",
      "occupancy normalization", "normalized expenses",
    ];

    const combinedText = (leaseText + " " + reconText).toLowerCase();

    const matchedKeywords: string[] = [];
    for (const kw of grossUpKeywords) {
      if (combinedText.includes(kw)) {
        matchedKeywords.push(kw);
      }
    }
    const hasGrossUpLanguage = matchedKeywords.length > 0;

    // Step 2: Look for suspicious YoY jumps in controllable categories
    const controllableCategories = [
      "utilities", "utility", "electric", "electricity", "gas", "water",
      "janitorial", "janitor", "cleaning", "custodial",
      "repair", "maintenance", "repair and maintenance", "repairs",
      "landscaping", "landscape", "grounds",
      "management", "management fee", "admin", "administrative",
      "payroll", "personnel", "staffing",
    ];

    interface ControllableJump {
      category: string;
      priorAmount: number;
      currentAmount: number;
      increasePercent: number;
      priorYear: number;
      currentYear: number;
    }
    const suspiciousJumps: ControllableJump[] = [];

    // Compare line items across multi-year reconciliations
    if (multiYearRecons && multiYearRecons.length >= 2) {
      const sorted = [...multiYearRecons].sort((a, b) => a.year - b.year);
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        if (curr.year - prev.year !== 1) continue; // same year or a gap: not a year-over-year step

        // Build lookup for prior year line items
        const prevLookup = new Map<string, number>();
        for (const item of prev.lineItems) {
          const amt = normalizeNumber(item.amount);
          if (!isNaN(amt) && amt > 0) {
            prevLookup.set(item.category.toLowerCase().trim(), amt);
          }
        }

        // Check current year items against prior
        for (const item of curr.lineItems) {
          const catLower = item.category.toLowerCase().trim();
          const currAmt = normalizeNumber(item.amount);
          if (isNaN(currAmt) || currAmt <= 0) continue;

          const isControllable = controllableCategories.some(
            (cc) => catLower.includes(cc) || cc.includes(catLower),
          );
          if (!isControllable) continue;

          const prevAmt = prevLookup.get(catLower);
          if (prevAmt != null && prevAmt > 0) {
            const increase = ((currAmt - prevAmt) / prevAmt) * 100;
            if (increase > 15) {
              suspiciousJumps.push({
                category: item.category,
                priorAmount: prevAmt,
                currentAmount: currAmt,
                increasePercent: increase,
                priorYear: prev.year,
                currentYear: curr.year,
              });
            }
          }
        }
      }
    }

    // Also check single-recon prior year comparison for controllable jumps
    if (
      suspiciousJumps.length === 0 &&
      priorYearTotal != null &&
      reconTotal != null &&
      reconFields.lineItems.length > 0
    ) {
      // If overall increase is >15%, flag controllable line items present in recon
      const overallIncrease = ((reconTotal - priorYearTotal) / priorYearTotal) * 100;
      if (overallIncrease > 15) {
        for (const item of reconFields.lineItems) {
          const catLower = item.category.toLowerCase().trim();
          const isControllable = controllableCategories.some(
            (cc) => catLower.includes(cc) || cc.includes(catLower),
          );
          if (isControllable) {
            const amt = normalizeNumber(item.amount);
            if (!isNaN(amt) && amt > 0) {
              suspiciousJumps.push({
                category: item.category,
                priorAmount: 0,
                currentAmount: amt,
                increasePercent: overallIncrease,
                priorYear: 0,
                currentYear: reconFields.reconciliationYear ?? 0,
              });
            }
          }
        }
      }
    }

    const hasSuspiciousJumps = suspiciousJumps.length > 0;

    // Step 3: Trigger finding when both conditions are reasonably present
    if (hasGrossUpLanguage && hasSuspiciousJumps) {
      // Build evidence
      const grossUpEvidence: SourceEvidence[] = [];

      // Keyword evidence
      for (const kw of matchedKeywords.slice(0, 2)) {
        const inLease = leaseText.toLowerCase().includes(kw);
        const sourceDoc = inLease ? leaseDocName : reconDocName;
        const sourceText = inLease ? leaseText : reconText;
        const snippet = extractSnippet(sourceText, kw, 80);
        if (snippet) {
          grossUpEvidence.push({
            document: sourceDoc,
            page: findPageForText(sourceText, kw),
            extractedText: snippet,
            findingCategory: "Gross-Up Language",
          });
        }
      }

      // Suspicious jump evidence
      for (const jump of suspiciousJumps.slice(0, 3)) {
        const jumpText = jump.priorYear > 0
          ? `${jump.category}: ${formatMoney(jump.priorAmount)} (${jump.priorYear}) → ${formatMoney(jump.currentAmount)} (${jump.currentYear}), +${jump.increasePercent.toFixed(1)}%`
          : `${jump.category}: ${formatMoney(jump.currentAmount)} (controllable category with elevated overall increase)`;
        grossUpEvidence.push({
          document: reconDocName,
          page: null,
          extractedText: jumpText,
          findingCategory: "Controllable Category Jump",
        });
      }

      // Screening signal only. The previous version priced the jump above a fixed 5% "reasonable" increase and 15%
      // trigger: neither comes from the lease, and the same increase is also inside the total-change and fee checks.
      const hasDetailedJumps = suspiciousJumps.some((j) => j.priorAmount > 0);

      // Determine severity
      const severity: "high" | "medium" =
        hasDetailedJumps && matchedKeywords.length >= 2 ? "high" : "medium";

      const jumpFacts = suspiciousJumps
        .filter((j) => j.priorAmount > 0)
        .slice(0, 3)
        .map((j) => `${j.category} ${formatMoney(j.priorAmount)} (${j.priorYear}) to ${formatMoney(j.currentAmount)} (${j.currentYear}), +${j.increasePercent.toFixed(1)}%`);
      const description =
        "This is a screening signal from a heuristic. It is not a conclusion about what your lease permits. " +
        `Gross-up style language was detected (${matchedKeywords.slice(0, 3).map((k) => `"${k}"`).join(", ")}), ` +
        "and certain categories increased more than 15% year over year, a screening threshold set by this tool and not taken from your lease. " +
        (jumpFacts.length ? `Statement amounts: ${jumpFacts.join("; ")}. ` : "") +
        "The lease's gross-up provision, the occupancy percentages used and which expenses are variable were not reviewed, " +
        "so no adjustment amount is calculated and nothing is counted in any total. " +
        "Ask the landlord whether, and how, expenses were adjusted for occupancy.";

      paidFindings.push({
        category: "Gross-Up Screening Signal (Heuristic)",
        description,
        potential_savings: 0,
        quantified: false,
        letterText:
          (jumpFacts.length ? `The statements show these changes: ${jumpFacts.join("; ")}. ` : "") +
          `The lease or statements refer to a gross-up or occupancy adjustment (${matchedKeywords.slice(0, 3).map((k) => `"${k}"`).join(", ")}). ` +
          "Please explain whether expenses were adjusted for occupancy, the occupancy percentage used, which lease provision permits the adjustment, and provide the calculation.",
        severity,
        sourceEvidence: grossUpEvidence.length > 0 ? grossUpEvidence : undefined,
      });
      unquantifiedChecks.push("gross-up");
    } else if (hasGrossUpLanguage && !hasSuspiciousJumps) {
      // Gross-up language found but no controllable jump data to confirm — informational only
      const grossUpEvidence: SourceEvidence[] = [];
      for (const kw of matchedKeywords.slice(0, 2)) {
        const inLease = leaseText.toLowerCase().includes(kw);
        const sourceDoc = inLease ? leaseDocName : reconDocName;
        const sourceText = inLease ? leaseText : reconText;
        const snippet = extractSnippet(sourceText, kw, 80);
        if (snippet) {
          grossUpEvidence.push({
            document: sourceDoc,
            page: findPageForText(sourceText, kw),
            extractedText: snippet,
            findingCategory: "Gross-Up Language",
          });
        }
      }

      paidFindings.push({
        category: "Possible Gross-Up / Occupancy Adjustment",
        description:
          "Gross-up or occupancy-adjustment language was detected in the uploaded documents " +
          `(${matchedKeywords.slice(0, 3).map((k) => `"${k}"`).join(", ")}). ` +
          "However, insufficient year-over-year line-item data was available to confirm whether controllable " +
          "expenses were materially inflated. Upload prior-year reconciliation documents for a more complete review.",
        potential_savings: 0,
        severity: "low",
        insufficientData: true,
        sourceEvidence: grossUpEvidence.length > 0 ? grossUpEvidence : undefined,
      });
    }
  }

  // ------------------------------------------------------------------
  // Pre-filter diagnostic: log raw findings before filtering
  // ------------------------------------------------------------------
  console.log(`[audit-engine] === Pre-filter findings ===`);
  console.log(`[audit-engine] Raw findings: free=${freeFindings.length}, paid=${paidFindings.length}`);


  // ------------------------------------------------------------------
  // Findings integrity and noise reduction
  // ------------------------------------------------------------------
  // Count real substantive findings (not insufficient data)
  const realFreeFindings = freeFindings.filter(
    (f) => !f.insufficientData && f.description.length > 0,
  );
  const realPaidFindings = paidFindings.filter(
    (f) => !f.insufficientData && f.description.length > 0,
  );
  const totalRealFindings = realFreeFindings.length + realPaidFindings.length;

  // When we have enough real findings, suppress "insufficient data" noise
  // to avoid the report feeling weak when meaningful results exist
  const suppressInsufficient = totalRealFindings >= 2;

  const verifiedFree = freeFindings.filter((f) => {
    if (f.description.length === 0) return false;
    // If we have real findings, drop insufficient-data findings that add no value
    if (suppressInsufficient && f.insufficientData && f.potential_savings === 0 && !f.category.startsWith("CAM Cap Review")) {
      return false;
    }
    return true;
  });
  const verifiedPaid = paidFindings.filter((f) => {
    if (f.description.length === 0) return false;
    if (suppressInsufficient && f.insufficientData && f.potential_savings === 0 && !f.category.startsWith("CAM Cap Review")) {
      return false;
    }
    return true;
  });

  // ---------------------------------------------------------------------------
  // Promote paid findings to free preview when free findings are empty
  // ---------------------------------------------------------------------------
  // If no free-tier checks triggered but real paid findings exist, promote
  // up to 2 substantive findings so the preview is never misleadingly empty.
  if (
    verifiedFree.length === 0 &&
    verifiedPaid.filter((f) => !f.insufficientData).length > 0
  ) {
    const promotable = verifiedPaid.filter((f) => !f.insufficientData);
    const toPromote = promotable.slice(0, 2);
    for (const f of toPromote) {
      verifiedFree.push(f);
      // Remove from paid so it doesn't appear in both sections
      const idx = verifiedPaid.indexOf(f);
      if (idx !== -1) verifiedPaid.splice(idx, 1);
    }
  }

  // If free findings are STILL empty (only insufficient-data paid findings),
  // promote up to 1 insufficient-data finding as informational.
  if (verifiedFree.length === 0 && verifiedPaid.length > 0) {
    const infoFinding = verifiedPaid[0];
    verifiedFree.push(infoFinding);
    verifiedPaid.splice(0, 1);
  }

  // Guarantee at least one finding so the client never gets stuck polling.
  // When the audit extracted very little data, generate a summary finding.
  if (verifiedFree.length === 0 && verifiedPaid.length === 0) {
    verifiedFree.push({
      category: "Document Review Summary",
      description:
        "The system was unable to extract specific lease terms or reconciliation data from the uploaded documents. " +
        "This may occur when documents use non-standard formatting, are image-heavy, or contain limited text. " +
        "For best results, upload clearly formatted PDF lease agreements and CAM reconciliation statements. " +
        "A professional review of your documents is recommended to identify potential billing discrepancies.",
      potential_savings: 0,
      severity: "medium",
      insufficientData: true,
    });
  }

  // Invariant: a finding whose amount was deliberately not calculated carries exactly $0, whatever produced it.
  for (const f of [...verifiedFree, ...verifiedPaid]) if (f.quantified === false) f.potential_savings = 0;

  // Calculate savings only from verified, non-insufficient findings
  // Include estimated overcharge from excluded categories
  const savings = totalSavings([...verifiedFree, ...verifiedPaid], estimatedOvercharge);

  // Build validation warning — clear, non-alarming messages
  let validationWarning: string | null = null;
  if (auditMode === "limited") {
    validationWarning =
      "Limited Review: Some checks could not be completed due to missing or unclear data in the uploaded documents.";
  } else if (issues.length > 0) {
    // Only surface truly blocking issues, not informational gaps
    const blockingIssues = issues.filter(
      (i: ValidationIssue) =>
        i.field !== "prior_year" && i.field !== "total_cam",
    );
    if (blockingIssues.length > 0) {
      const missingNames = blockingIssues
        .map((i: ValidationIssue) => i.message)
        .slice(0, 3);
      validationWarning = `Some audit checks have limited data: ${missingNames.join(" ")}`;
    }
  }

  // Append derived-total note if the reconciliation total was summed from line items
  if (reconFields.derivedTotal) {
    const derivedNote = "Total estimated from detected line items.";
    validationWarning = validationWarning
      ? `${validationWarning} ${derivedNote}`
      : derivedNote;
  }

  // Append CAM cap prior-year note when cap exists but no prior year baseline
  // Skip this note when multi-year reconciliations were uploaded and comparison ran
  if (
    leaseFields.camCapPercentage &&
    reconTotal != null &&
    reconTotal > 0 &&
    priorYearTotal == null &&
    !multiYearComparisonRan
  ) {
    const camNote =
      "CAM total detected, but prior year comparison data was not found.";
    validationWarning = validationWarning
      ? `${validationWarning} ${camNote}`
      : camNote;
  }

  // Say what the multi-year step did, and no more: statement totals were compared. That is not a validation of the
  // lease cap, whose method and scope are not established, and no cap amount comes from it.
  if (multiYearComparisonRan && multiYearPairsCompared > 0) {
    const multiYearNote =
      multiYearPairsSkipped > 0
        ? "Statement totals were compared for consecutive years only. Other years could not be compared; see the notice in the findings. No cap amount is calculated."
        : "Statement totals were compared across the years uploaded. This does not validate the lease cap: no cap amount is calculated.";
    validationWarning = validationWarning
      ? `${validationWarning} ${multiYearNote}`
      : multiYearNote;
  }

  // When extra recons were uploaded but could not be parsed into valid comparison data
  if (options?.multiYearUploadedButFailed) {
    const failedNote =
      "Multiple CAM reconciliation documents were uploaded, but year-over-year comparison could not be completed due to missing year or total data in one or more files.";
    validationWarning = validationWarning
      ? `${validationWarning} ${failedNote}`
      : failedNote;
  }

  // Boost confidence based on actual findings quality
  let adjustedConfidenceScore = confidenceScore;
  let adjustedConfidence = confidence;

  // Boost for overcharge calculation
  if (estimatedOvercharge > 0) {
    adjustedConfidenceScore = Math.min(adjustedConfidenceScore + 12, 100);
  }

  // Boost for substantive findings with real savings
  const substantiveFindings = [...freeFindings, ...paidFindings].filter(
    (f) => !f.insufficientData && f.quantified !== false && f.potential_savings > 0,
  );
  if (substantiveFindings.length >= 2) {
    adjustedConfidenceScore = Math.min(adjustedConfidenceScore + 8, 100);
  } else if (substantiveFindings.length >= 1) {
    adjustedConfidenceScore = Math.min(adjustedConfidenceScore + 5, 100);
  }

  // No boost for comparing years: comparing statement totals does not validate the lease cap (method and scope are not
  // established), so it must not raise confidence. Confidence reflects calculated findings only.

  // Recalculate confidence level with adjusted thresholds
  if (adjustedConfidenceScore >= 55) adjustedConfidence = "high";
  else if (adjustedConfidenceScore >= 30) adjustedConfidence = "medium";
  else adjustedConfidence = "low";

  // ------------------------------------------------------------------
  // Build Lease Clause Summary
  // ------------------------------------------------------------------
  let leaseClausesSummary: LeaseClauseSummary | null = null;
  {
    const hasClauses =
      leaseFields.camCapPercentage ||
      leaseFields.adminFeePercentage ||
      leaseFields.managementFee ||
      leaseFields.proRataShare ||
      leaseFields.tenantPremisesSqFt ||
      leaseFields.buildingTotalSqFt ||
      leaseFields.excludedTerms.length > 0;

    if (hasClauses) {
      // Detect additional clause language related to capex, structural, legal, opex limits
      const additionalClauses: string[] = [];
      const clausePatterns: Array<{ pattern: RegExp; label: string }> = [
        { pattern: /capital\s*(?:expenditure|improvement|expense|cost)s?\s*(?:shall|are|is)\s*(?:not\s*)?(?:included|excluded|pass(?:ed)?\s*through)/i, label: "Capital expenditure pass-through restriction" },
        { pattern: /structural\s*(?:repair|maintenance|defect)s?\s*(?:shall|are|is)\s*(?:the\s*)?(?:landlord|owner)(?:'s)?\s*(?:sole\s*)?(?:responsibility|obligation)/i, label: "Structural repairs are landlord responsibility" },
        { pattern: /legal\s*(?:fee|cost|expense)s?\s*(?:shall|are|is)\s*(?:not\s*)?(?:included|excluded|pass(?:ed)?\s*through)/i, label: "Legal fee pass-through restriction" },
        { pattern: /operating\s*(?:expense|cost)s?\s*(?:shall\s*not\s*(?:exceed|include)|(?:are|is)\s*limited\s*to)/i, label: "Operating expense limitation clause" },
        { pattern: /controllable\s*(?:expense|cost)s?\s*(?:cap|limit|restrict|shall\s*not\s*exceed)/i, label: "Controllable expense cap provision" },
        { pattern: /gross[\s-]*up|occupancy\s*(?:adjustment|normalization)/i, label: "Gross-up / occupancy adjustment clause" },
        { pattern: /audit\s*(?:right|provision|clause)|tenant(?:'s)?\s*(?:right\s*to\s*)?audit/i, label: "Tenant audit rights provision" },
      ];
      for (const { pattern, label } of clausePatterns) {
        if (pattern.test(leaseText)) {
          additionalClauses.push(label);
        }
      }

      leaseClausesSummary = {
        camCap: leaseFields.camCapPercentage ? `${leaseFields.camCapPercentage}%` : null,
        adminFeeCap: leaseFields.adminFeePercentage ? `${leaseFields.adminFeePercentage}%` : null,
        managementFeeCap: leaseFields.managementFee ? `${leaseFields.managementFee}%` : null,
        tenantProRataShare: leaseFields.proRataShare ? `${leaseFields.proRataShare}%` : null,
        tenantSquareFootage: leaseFields.tenantPremisesSqFt
          ? `${normalizeNumber(leaseFields.tenantPremisesSqFt).toLocaleString()} sq ft`
          : null,
        buildingSquareFootage: leaseFields.buildingTotalSqFt
          ? `${normalizeNumber(leaseFields.buildingTotalSqFt).toLocaleString()} sq ft`
          : null,
        excludedCategories: leaseFields.excludedTerms,
        additionalClauses,
      };
    }
  }

  // A long document the AI step read only in part must say so, even if no clause at all was detected: the record is
  // kept in a summary with every field empty, which the screen and the PDF already treat as "nothing detected".
  if (isAiTruncated(validation.coverage)) {
    leaseClausesSummary = {
      ...(leaseClausesSummary ?? {
        camCap: null, adminFeeCap: null, managementFeeCap: null, tenantProRataShare: null,
        tenantSquareFootage: null, buildingSquareFootage: null, excludedCategories: [], additionalClauses: [],
      }),
      coverage: validation.coverage,
    };
  }

  // The AI reading failed for a document: keep the record with the clause summary (an existing JSON column), so the
  // server can refuse a purchase and every surface can say the analysis is not reliable. Same empty-summary rule as above.
  if (validation.extraction) {
    leaseClausesSummary = {
      ...(leaseClausesSummary ?? {
        camCap: null, adminFeeCap: null, managementFeeCap: null, tenantProRataShare: null,
        tenantSquareFootage: null, buildingSquareFootage: null, excludedCategories: [], additionalClauses: [],
      }),
      extractionIncomplete: validation.extraction,
    };
  }

  // Audit-right / dispute-window sentences, quoted from the lease. The text is not stored after processing, so they are
  // captured here. Same empty-summary rule as the coverage record. The period is read, never assumed.
  {
    const auditRights = extractAuditRights(leaseText);
    if (auditRights.length > 0) {
      leaseClausesSummary = {
        ...(leaseClausesSummary ?? {
          camCap: null, adminFeeCap: null, managementFeeCap: null, tenantProRataShare: null,
          tenantSquareFootage: null, buildingSquareFootage: null, excludedCategories: [], additionalClauses: [],
        }),
        auditRights,
      };
    }
  }

  // What did not run and what carries no amount, kept with the clause summary so the purchase control, report and plan
  // can say so without depending on which findings are visible. Same empty-summary rule as the coverage record.
  {
    const status = buildComparisonStatus({
      notCompared: notComparedPairs,
      unquantified: unquantifiedChecks,
      // facts for the pre-payment disclosure: only when statements were actually processed together
      comparison: multiYearComparisonRan ? { years: multiYearDistinctYears, pairsRun: multiYearPairsCompared, pairsSkipped: multiYearPairsSkipped } : undefined,
      uploadedButFailed: options?.multiYearUploadedButFailed === true,
    });
    if (status) {
      leaseClausesSummary = {
        ...(leaseClausesSummary ?? {
          camCap: null, adminFeeCap: null, managementFeeCap: null, tenantProRataShare: null,
          tenantSquareFootage: null, buildingSquareFootage: null, excludedCategories: [], additionalClauses: [],
        }),
        comparisonStatus: status,
      };
    }
  }

  // --- Diagnostic logging: trace final results ---
  console.log(`[audit-engine] === Final Results ===`);
  console.log(`[audit-engine] Totals computed (amounts not logged)`);
  console.log(`[audit-engine] Final findings: free=${verifiedFree.length}, paid=${verifiedPaid.length}`);

  console.log(`[audit-engine] Breakdown rows: ${overchargeBreakdown.length}`);

  return {
    savings_estimate: savings,
    free_findings: verifiedFree,
    paid_findings: verifiedPaid,
    confidence: adjustedConfidence,
    confidenceScore: adjustedConfidenceScore,
    validationWarning,
    wasSwapped: validation.wasSwapped,
    auditMode,
    leaseExtractionMethod: validation.leaseExtractionMethod,
    reconExtractionMethod: validation.reconExtractionMethod,
    estimated_overcharge: estimatedOvercharge,
    overcharge_breakdown: overchargeBreakdown,
    leaseClausesSummary,
  };
}
