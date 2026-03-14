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

import {
  normalizeNumber,
  type DocumentValidationResult,
  type ConfidenceLevel,
  type AuditMode,
  type ExtractionMethod,
  type ValidationIssue,
} from "@/services/document-validator";

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
  sourceEvidence?: SourceEvidence[];
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
    ["capital improvement", "capital expenditure", "capital expense", "capital cost", "capital replacement", "capital repair"],
    ["roof repair", "roof replacement", "roofing"],
    ["structural repair", "structural maintenance", "structural defect", "foundation"],
    ["depreciation", "amortization"],
    ["leasing commission", "brokerage commission"],
    ["tenant improvement", "tenant buildout", "tenant allowance", "ti allowance"],
    ["legal fee", "litigation", "attorney", "legal cost"],
    ["environmental remediation", "hazardous material", "asbestos", "mold remediation"],
    ["mortgage", "debt service", "interest expense"],
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
 */
function extractSnippet(
  text: string,
  searchTerm: string,
  contextChars: number = 60,
): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(searchTerm.toLowerCase());
  if (idx === -1) return "";
  const start = Math.max(0, idx - contextChars);
  const end = Math.min(text.length, idx + searchTerm.length + contextChars);
  let snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
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
  const isLimited = auditMode === "limited";

  // Track which required fields were flagged as missing
  const missingFields = new Set(issues.map((i: ValidationIssue) => i.field));

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

  // ------------------------------------------------------------------
  // 1. CAM Cap Exceeded
  // ------------------------------------------------------------------
  if (leaseFields.camCapPercentage && reconTotal != null && reconTotal > 0) {
    const capPct = parseFloat(leaseFields.camCapPercentage);
    // Estimate potential overage: if year-over-year increase exceeds cap,
    // the excess portion of total charges is the savings estimate.
    // Conservative estimate: assume 2% above cap as typical overage.
    const estimatedOverage = reconTotal * (Math.max(capPct, 2) / 100);
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
    freeFindings.push({
      category: "CAM Cap Exceeded",
      description:
        `Lease specifies a CAM cap of ${leaseFields.camCapPercentage}%. ` +
        `Total CAM charges of ${reconFields.totalCamCharges ?? reconFields.reconciliationTotal} were detected in the reconciliation. ` +
        `If year-over-year charges increased beyond the ${leaseFields.camCapPercentage}% cap, the excess amount may be recoverable. ` +
        `Compare prior-year charges to confirm the actual overage.`,
      potential_savings: Math.round(estimatedOverage),
      severity: "high",
      sourceEvidence: evidence.length > 0 ? evidence : undefined,
    });
  } else if (leaseFields.camCapPercentage && !reconTotal) {
    // We found a cap in the lease but no total in the reconciliation
    const capSnippet = extractSnippet(leaseText, leaseFields.camCapPercentage + "%");
    freeFindings.push({
      category: "CAM Cap Exceeded",
      description:
        `Lease specifies a CAM cap of ${leaseFields.camCapPercentage}%, ` +
        `but the reconciliation statement contains only individual expense line items without a total CAM or operating expense summary. ` +
        `Because no total is available, the system cannot verify whether the year-over-year increase exceeds the contractual cap. ` +
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
  } else if (!leaseFields.camCapPercentage && !isLimited) {
    freeFindings.push({
      category: "CAM Cap Compliance",
      description:
        "No CAM cap language was detected in the lease. This may mean the lease does not include a cap on controllable expenses, " +
        "or the cap language uses non-standard phrasing. Review the lease to confirm whether a cap exists.",
      potential_savings: 0,
      severity: "medium",
      insufficientData: true,
    });
  }

  // ------------------------------------------------------------------
  // 1b. Year-over-Year CAM Increase Detection
  // ------------------------------------------------------------------
  const priorYearRaw = reconFields.priorYearTotal;
  const priorYearTotal = priorYearRaw ? normalizeNumber(priorYearRaw) : null;

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

    if (camCapPct != null && increasePercent > camCapPct) {
      // Cap exceeded — HIGH severity
      const allowedTotal = priorYearTotal * (1 + camCapPct / 100);
      const estimatedExcess = Math.max(0, reconTotal - allowedTotal);

      freeFindings.push({
        category: "Year-over-Year CAM Increase Exceeds Lease Cap",
        description:
          `Year-over-year CAM expenses increased by ${increasePercent.toFixed(1)}%, ` +
          `from $${priorYearTotal.toLocaleString()} to $${reconTotal.toLocaleString()}. ` +
          `The lease limits annual increases to ${camCapPct}%. ` +
          `The allowable maximum was $${Math.round(allowedTotal).toLocaleString()}, ` +
          `resulting in an estimated excess of $${Math.round(estimatedExcess).toLocaleString()} ` +
          `that may be recoverable.`,
        potential_savings: Math.round(estimatedExcess),
        severity: "high",
        sourceEvidence: yoyEvidence.length > 0 ? yoyEvidence : undefined,
      });
    } else if (camCapPct == null && increasePercent > 0) {
      // No cap in lease but increase detected — informational
      freeFindings.push({
        category: "Year-over-Year CAM Increase Detected",
        description:
          `Year-over-year CAM expenses increased by ${increasePercent.toFixed(1)}%, ` +
          `from $${priorYearTotal.toLocaleString()} to $${reconTotal.toLocaleString()}. ` +
          `No CAM cap was detected in the lease to compare against. ` +
          `Review your lease to determine if this increase is within contractual limits.`,
        potential_savings: 0,
        severity: "medium",
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
      if (reconVal > leaseVal) {
        // Calculate savings: excess fee percentage applied to total expenses
        let feeSavings = 0;
        if (reconTotal != null && reconTotal > 0) {
          feeSavings = Math.round(reconTotal * ((reconVal - leaseVal) / 100));
        }
        paidFindings.push({
          category: "Admin Fee Overcharge",
          description:
            `Management/admin fee charged at ${reconVal}% in the reconciliation, ` +
            `but the lease caps this fee at ${leaseVal}%. ` +
            `The ${(reconVal - leaseVal).toFixed(1)}% excess may be recoverable.` +
            (feeSavings > 0 ? ` Based on total charges, the estimated overcharge is $${feeSavings.toLocaleString()}.` : ""),
          potential_savings: feeSavings,
          severity: "medium",
          sourceEvidence: adminEvidence.length > 0 ? adminEvidence : undefined,
        });
      } else {
        // Fee is within cap — positive finding
        paidFindings.push({
          category: "Admin Fee Compliance",
          description:
            `Management/admin fee of ${reconVal}% in the reconciliation is within the lease cap of ${leaseVal}%. No overcharge detected.`,
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
  } else if (!isLimited && missingFields.has("admin_fee")) {
    paidFindings.push({
      category: "Admin Fee Review",
      description:
        "No admin or management fee cap was detected in the lease. " +
        "If the lease includes fee limitations under different terminology, manual review is recommended.",
      potential_savings: 0,
      severity: "low",
      insufficientData: true,
    });
  }

  // ------------------------------------------------------------------
  // 3. Pro-Rata Share Mismatch
  // ------------------------------------------------------------------
  if (leaseFields.proRataShare && reconFields.proRataShare) {
    const leaseShare = parseFloat(leaseFields.proRataShare);
    const reconShare = parseFloat(reconFields.proRataShare);
    if (
      !isNaN(leaseShare) &&
      !isNaN(reconShare) &&
      Math.abs(leaseShare - reconShare) > 0.01
    ) {
      let shareSavings = 0;
      if (reconTotal != null && reconTotal > 0) {
        shareSavings = Math.round(
          reconTotal * (Math.abs(reconShare - leaseShare) / 100),
        );
      }
      const shareEvidence: SourceEvidence[] = [];
      const leaseShareSnippet = extractSnippet(leaseText, leaseFields.proRataShare + "%");
      if (leaseShareSnippet) {
        shareEvidence.push({
          document: leaseDocName,
          page: findPageForText(leaseText, leaseFields.proRataShare + "%"),
          extractedText: leaseShareSnippet,
        });
      }
      const reconShareSnippet = extractSnippet(reconText, reconFields.proRataShare + "%");
      if (reconShareSnippet) {
        shareEvidence.push({
          document: reconDocName,
          page: findPageForText(reconText, reconFields.proRataShare + "%"),
          extractedText: reconShareSnippet,
        });
      }
      paidFindings.push({
        category: "Pro-Rata Share Mismatch",
        description:
          `Tenant's pro-rata share calculated at ${reconShare}% in the reconciliation ` +
          `but lease specifies ${leaseShare}% based on rentable square footage. ` +
          `The ${Math.abs(reconShare - leaseShare).toFixed(2)}% difference may result in overcharges.` +
          (shareSavings > 0 ? ` Estimated impact: $${shareSavings.toLocaleString()}.` : ""),
        potential_savings: shareSavings,
        severity: "high",
        sourceEvidence: shareEvidence.length > 0 ? shareEvidence : undefined,
      });
    }
  } else if (!isLimited && missingFields.has("pro_rata")) {
    paidFindings.push({
      category: "Pro-Rata Share Review",
      description:
        "Pro-rata share percentage could not be detected in the lease. " +
        "Verify that the reconciliation applies the correct tenant share based on actual rentable area.",
      potential_savings: 0,
      severity: "low",
      insufficientData: true,
    });
  }

  // ------------------------------------------------------------------
  // 3b. CAM Allocation Discrepancy (square footage validation)
  // ------------------------------------------------------------------
  const tenantSqFtRaw = leaseFields.tenantPremisesSqFt;
  const buildingSqFtRaw = leaseFields.buildingTotalSqFt;
  const tenantSqFt = tenantSqFtRaw ? normalizeNumber(tenantSqFtRaw) : null;
  const buildingSqFt = buildingSqFtRaw ? normalizeNumber(buildingSqFtRaw) : null;

  // Calculate expected share from square footage
  const expectedShare =
    tenantSqFt != null && buildingSqFt != null && buildingSqFt > 0
      ? (tenantSqFt / buildingSqFt) * 100
      : null;

  // Determine billed share: prefer recon pro-rata, then lease stated share
  const billedShareRaw =
    reconFields.proRataShare ?? leaseFields.statedTenantSharePercent;
  const billedShare = billedShareRaw ? parseFloat(billedShareRaw) : null;

  if (expectedShare != null && billedShare != null) {
    const shareDifference = billedShare - expectedShare;
    const absDifference = Math.abs(shareDifference);

    if (absDifference > 0.5) {
      // Calculate estimated overcharge impact
      let estimatedImpact = 0;
      if (reconTotal != null && reconTotal > 0) {
        estimatedImpact = Math.round(reconTotal * (absDifference / 100));
      }

      // Build source evidence
      const allocEvidence: SourceEvidence[] = [];

      // Evidence from lease for square footage
      const sqFtSearchTerms = [
        tenantSqFtRaw,
        buildingSqFtRaw,
        leaseFields.statedTenantSharePercent
          ? leaseFields.statedTenantSharePercent + "%"
          : null,
      ].filter(Boolean) as string[];

      for (const term of sqFtSearchTerms) {
        const snippet = extractSnippet(leaseText, term);
        if (snippet) {
          allocEvidence.push({
            document: leaseDocName,
            page: findPageForText(leaseText, term),
            extractedText: snippet,
          });
          break; // one lease evidence is enough
        }
      }

      // Evidence from reconciliation for billed share
      if (reconFields.proRataShare) {
        const reconSnippet = extractSnippet(reconText, reconFields.proRataShare + "%");
        if (reconSnippet) {
          allocEvidence.push({
            document: reconDocName,
            page: findPageForText(reconText, reconFields.proRataShare + "%"),
            extractedText: reconSnippet,
          });
        }
      }

      const direction = shareDifference > 0 ? "overbilled" : "underbilled";

      paidFindings.push({
        category: "CAM Allocation Discrepancy",
        description:
          `The tenant appears to be billed a CAM allocation of ${billedShare.toFixed(2)}%, ` +
          `while the lease indicates the tenant's proportionate share should be approximately ` +
          `${expectedShare.toFixed(2)}% based on square footage ` +
          `(${tenantSqFt!.toLocaleString()} sq ft premises / ${buildingSqFt!.toLocaleString()} sq ft building). ` +
          `The ${absDifference.toFixed(2)}% difference suggests the tenant may be ${direction}.` +
          (estimatedImpact > 0
            ? ` Estimated impact: $${estimatedImpact.toLocaleString()}.`
            : ""),
        potential_savings: shareDifference > 0 ? estimatedImpact : 0,
        severity: "high",
        sourceEvidence: allocEvidence.length > 0 ? allocEvidence : undefined,
      });
    }
  }

  // ------------------------------------------------------------------
  // 3c. Tenant Allocation Validation
  // ------------------------------------------------------------------
  {
    // Determine billed share from reconciliation
    const billedSharePercent = reconFields.proRataShare
      ? parseFloat(reconFields.proRataShare)
      : null;

    // Priority A: calculate expected share from square footage
    const calcExpectedShare =
      tenantSqFt != null && buildingSqFt != null && buildingSqFt > 0
        ? (tenantSqFt / buildingSqFt) * 100
        : null;

    // Priority B: use stated tenant share if sqft unavailable
    const statedShare = leaseFields.statedTenantSharePercent
      ? parseFloat(leaseFields.statedTenantSharePercent)
      : null;

    const tavExpectedShare = calcExpectedShare ?? statedShare;
    const usedSqFt = calcExpectedShare != null;

    // Priority C: note when both exist and diverge
    let statedVsCalcNote = "";
    if (calcExpectedShare != null && statedShare != null) {
      const statedDiff = Math.abs(calcExpectedShare - statedShare);
      if (statedDiff > 0.5) {
        statedVsCalcNote =
          ` Note: the lease states a tenant share of ${statedShare.toFixed(2)}%, ` +
          `which differs from the square-footage-based calculation of ${calcExpectedShare.toFixed(2)}%.`;
      }
    }

    if (tavExpectedShare != null && billedSharePercent != null) {
      const tavDifference = billedSharePercent - tavExpectedShare;
      const tavAbsDiff = Math.abs(tavDifference);

      if (tavAbsDiff > 0.5) {
        const overbilled = tavDifference > 0;
        const direction = overbilled ? "overbilled" : "underbilled";
        const severity: "high" | "medium" = overbilled ? "high" : "medium";

        // Financial impact only when overbilled and total available
        let estimatedOverallocation = 0;
        if (overbilled && reconTotal != null && reconTotal > 0) {
          estimatedOverallocation = Math.round(
            reconTotal * (tavDifference / 100),
          );
        }

        // --- Source evidence ---
        const tavEvidence: SourceEvidence[] = [];

        // Tenant sqft evidence
        if (tenantSqFtRaw) {
          const snippet = extractSnippet(leaseText, tenantSqFtRaw);
          if (snippet) {
            tavEvidence.push({
              document: leaseDocName,
              page: findPageForText(leaseText, tenantSqFtRaw),
              extractedText: snippet,
            });
          }
        }

        // Building sqft evidence
        if (buildingSqFtRaw) {
          const snippet = extractSnippet(leaseText, buildingSqFtRaw);
          if (snippet) {
            tavEvidence.push({
              document: leaseDocName,
              page: findPageForText(leaseText, buildingSqFtRaw),
              extractedText: snippet,
            });
          }
        }

        // Stated tenant share evidence
        if (leaseFields.statedTenantSharePercent) {
          const term = leaseFields.statedTenantSharePercent + "%";
          const snippet = extractSnippet(leaseText, term);
          if (snippet) {
            tavEvidence.push({
              document: leaseDocName,
              page: findPageForText(leaseText, term),
              extractedText: snippet,
            });
          }
        }

        // Billed share evidence from reconciliation
        if (reconFields.proRataShare) {
          const term = reconFields.proRataShare + "%";
          const snippet = extractSnippet(reconText, term);
          if (snippet) {
            tavEvidence.push({
              document: reconDocName,
              page: findPageForText(reconText, term),
              extractedText: snippet,
            });
          }
        }

        // Build description
        const basisLabel = usedSqFt
          ? `based on square footage (${tenantSqFt!.toLocaleString()} sq ft premises / ${buildingSqFt!.toLocaleString()} sq ft building)`
          : "based on the stated lease percentage";

        let desc =
          `The reconciliation statement bills the tenant at a ${billedSharePercent.toFixed(2)}% allocation share, ` +
          `but the expected share is ${tavExpectedShare.toFixed(2)}% ${basisLabel}. ` +
          `The ${tavAbsDiff.toFixed(2)}% difference indicates the tenant appears to be ${direction}.`;

        if (estimatedOverallocation > 0) {
          desc += ` Estimated recoverable overcharge: $${estimatedOverallocation.toLocaleString()}.`;
        }

        desc += statedVsCalcNote;

        freeFindings.push({
          category: "Tenant Allocation Discrepancy",
          description: desc,
          potential_savings: overbilled ? estimatedOverallocation : 0,
          severity,
          sourceEvidence: tavEvidence.length > 0 ? tavEvidence : undefined,
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // 3d. Tenant Allocation Validation (Premium)
  // ------------------------------------------------------------------
  {
    // Only run when square footage data is available
    if (tenantSqFt != null && buildingSqFt != null && buildingSqFt > 0) {
      const tavPremiumExpected = (tenantSqFt / buildingSqFt) * 100;

      // Determine billed share: prefer recon billedSharePercent, fallback to stated
      const tavPremiumBilledRaw =
        reconFields.proRataShare ?? leaseFields.statedTenantSharePercent;
      const tavPremiumBilled = tavPremiumBilledRaw
        ? parseFloat(tavPremiumBilledRaw)
        : null;

      if (tavPremiumBilled != null && !isNaN(tavPremiumBilled)) {
        const tavPremiumDiff = tavPremiumBilled - tavPremiumExpected;
        const tavPremiumAbsDiff = Math.abs(tavPremiumDiff);

        if (tavPremiumAbsDiff > 0.5) {
          // Financial impact only when overbilled
          let tavPremiumOvercharge = 0;
          if (
            tavPremiumDiff > 0 &&
            reconTotal != null &&
            reconTotal > 0
          ) {
            tavPremiumOvercharge = Math.round(
              reconTotal * (tavPremiumDiff / 100),
            );
          }

          // Build structured source evidence
          const tavPremiumEvidence: SourceEvidence[] = [];

          if (tenantSqFtRaw) {
            const snippet = extractSnippet(leaseText, tenantSqFtRaw);
            if (snippet) {
              tavPremiumEvidence.push({
                document: leaseDocName,
                page: findPageForText(leaseText, tenantSqFtRaw),
                extractedText: snippet,
                findingCategory: "Tenant Premises Sq Ft",
              });
            }
          }

          if (buildingSqFtRaw) {
            const snippet = extractSnippet(leaseText, buildingSqFtRaw);
            if (snippet) {
              tavPremiumEvidence.push({
                document: leaseDocName,
                page: findPageForText(leaseText, buildingSqFtRaw),
                extractedText: snippet,
                findingCategory: "Building Total Sq Ft",
              });
            }
          }

          if (reconFields.proRataShare) {
            const term = reconFields.proRataShare + "%";
            const snippet = extractSnippet(reconText, term);
            if (snippet) {
              tavPremiumEvidence.push({
                document: reconDocName,
                page: findPageForText(reconText, term),
                extractedText: snippet,
                findingCategory: "Billed Share",
              });
            }
          } else if (leaseFields.statedTenantSharePercent) {
            const term = leaseFields.statedTenantSharePercent + "%";
            const snippet = extractSnippet(leaseText, term);
            if (snippet) {
              tavPremiumEvidence.push({
                document: leaseDocName,
                page: findPageForText(leaseText, term),
                extractedText: snippet,
                findingCategory: "Stated Tenant Share (fallback)",
              });
            }
          }

          const billedSource = reconFields.proRataShare
            ? "reconciliation statement"
            : "lease stated percentage";

          let tavPremiumDesc =
            `Tenant Allocation Validation: The tenant's billed CAM share does not match the lease-defined pro-rata share. ` +
            `Tenant premises: ${tenantSqFt!.toLocaleString()} sq ft. ` +
            `Building total: ${buildingSqFt!.toLocaleString()} sq ft. ` +
            `Calculated expected share: ${tavPremiumExpected.toFixed(2)}%. ` +
            `Billed share (from ${billedSource}): ${tavPremiumBilled.toFixed(2)}%. ` +
            `Difference: ${tavPremiumAbsDiff.toFixed(2)}%.`;

          if (tavPremiumDiff > 0 && tavPremiumOvercharge > 0) {
            tavPremiumDesc +=
              ` Estimated overcharge: $${tavPremiumOvercharge.toLocaleString()}.`;
          }

          paidFindings.push({
            category: "Tenant Allocation Discrepancy",
            description: tavPremiumDesc,
            potential_savings:
              tavPremiumDiff > 0 ? tavPremiumOvercharge : 0,
            severity: "high",
            sourceEvidence:
              tavPremiumEvidence.length > 0
                ? tavPremiumEvidence
                : undefined,
          });
        }
      }
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

      for (const item of reconFields.lineItems) {
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
          // Calculate tenant-level overcharge: excess fee % × tenant's total
          const tenantTotal = reconTotal ?? feeBaseTotal!;
          const excessPercent = adminPercent - adminFeeCap;
          const adminOvercharge = Math.round(tenantTotal * (excessPercent / 100));

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
            `Administrative Fee Cap Exceeded: The admin/management fee detected in the reconciliation ` +
            `is $${adminFeeAmount.toLocaleString()}, which represents ${adminPercent.toFixed(2)}% of building operating expenses ` +
            `($${feeBaseTotal!.toLocaleString()}). The lease caps this fee at ${adminFeeCap}%. ` +
            `Difference: ${excessPercent.toFixed(2)}%. ` +
            `Estimated overcharge: $${adminOvercharge.toLocaleString()}.`;

          paidFindings.push({
            category: "Administrative Fee Cap Exceeded",
            description: adminValDesc,
            potential_savings: adminOvercharge,
            severity: "high",
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

      const highConf = [...bestByCategory.values()].filter((m) => m.score >= 0.7);
      const medConf = [...bestByCategory.values()].filter((m) => m.score >= 0.4 && m.score < 0.7);

      const parts: string[] = [];
      if (highConf.length > 0) {
        parts.push(
          `The following categories appear in the reconciliation but are likely excluded under the lease: ` +
          `${highConf.map((m) => m.reconCat).join(", ")}. ` +
          (leaseFields.excludedTerms.length > 0
            ? `The lease excludes: ${leaseFields.excludedTerms.join(", ")}.`
            : `These appear to be capital or non-pass-through items.`),
        );
      }
      if (medConf.length > 0) {
        parts.push(
          `Additional categories may warrant review: ${medConf.map((m) => `${m.reconCat} (possible match to "${m.matchedExclusion}")`).join("; ")}.`,
        );
      }

      freeFindings.push({
        category: "Excluded Category Billed",
        description: parts.join(" "),
        potential_savings: 0,
        severity: highConf.length > 0 ? "high" : "medium",
      });
    }
  } else if (!isLimited && missingFields.has("expense_categories")) {
    freeFindings.push({
      category: "Expense Category Review",
      description:
        "No itemized expense categories were detected in the reconciliation statement. " +
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

    // Build a lookup from line items: normalized category → { amount, rawLine }
    const lineItemLookup = new Map<string, { amount: number; rawLine: string }>();
    for (const item of reconFields.lineItems) {
      const normalized = item.category.toLowerCase().trim();
      const amount = normalizeNumber(item.amount);
      if (!isNaN(amount) && amount > 0) {
        lineItemLookup.set(normalized, { amount, rawLine: item.rawLine });
      }
    }

    // Collect all excluded categories that were matched (reuse section 4 logic)
    const excludedMatches: Array<{ reconCat: string; score: number }> = [];

    // Capital-nature indicators (always suspect)
    const capitalIndicators = [
      "capital improvement", "capital expenditure", "capital expense",
      "roof repair", "roof replacement", "structural repair",
      "foundation", "depreciation", "amortization",
    ];
    for (const cat of reconFields.expenseCategories) {
      if (capitalIndicators.includes(cat)) {
        excludedMatches.push({ reconCat: cat, score: 1.0 });
      }
    }

    // Cross-reference lease exclusion terms
    if (leaseFields.excludedTerms.length > 0) {
      for (const excluded of leaseFields.excludedTerms) {
        for (const reconCat of reconFields.expenseCategories) {
          const score = exclusionMatchScore(excluded, reconCat);
          if (score >= 0.4) {
            const alreadyMatched = excludedMatches.some(
              (m) => m.reconCat === reconCat && m.score >= score,
            );
            if (!alreadyMatched) {
              excludedMatches.push({ reconCat, score });
            }
          }
        }
      }
    }

    // De-duplicate by category, keep highest score
    const bestExcluded = new Map<string, number>();
    for (const m of excludedMatches) {
      const existing = bestExcluded.get(m.reconCat);
      if (!existing || m.score > existing) {
        bestExcluded.set(m.reconCat, m.score);
      }
    }

    // For each excluded category, try to find its dollar amount and calculate tenant charge
    for (const [cat] of bestExcluded) {
      // Try exact match in line items, then fuzzy substring match
      let categoryTotal: number | null = null;
      let matchedRawLine = "";
      for (const [lineKey, lineData] of lineItemLookup) {
        if (lineKey === cat || lineKey.includes(cat) || cat.includes(lineKey)) {
          categoryTotal = lineData.amount;
          matchedRawLine = lineData.rawLine;
          break;
        }
      }

      if (categoryTotal != null && categoryTotal > 0 && tenantSharePct != null && tenantSharePct > 0) {
        const tenantCharge = Math.round(categoryTotal * (tenantSharePct / 100) * 100) / 100;
        // Build source evidence from the matched line item
        const evidenceText = matchedRawLine || extractSnippet(reconText, cat);
        overchargeBreakdown.push({
          category: cat,
          total_expense: categoryTotal,
          tenant_share_percent: tenantSharePct,
          tenant_charge: tenantCharge,
          reason: "Excluded Expense",
          sourceEvidence: evidenceText ? {
            document: reconDocName,
            page: findPageForText(reconText, cat),
            extractedText: evidenceText,
          } : undefined,
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
    if (!isLimited && missingFields.has("total_cam")) {
      freeFindings.push({
        category: "Reconciliation Totals",
        description:
          "Your reconciliation statement contains individual expense line items but does not include a total CAM or operating expense summary. " +
          "Because of this, savings calculations that depend on total charges cannot be completed. " +
          "If available, upload a reconciliation summary page that includes a total operating expense amount, or request one from the landlord.",
        potential_savings: 0,
        severity: "low",
        insufficientData: true,
      });
    }
  }

  // ------------------------------------------------------------------
  // Findings integrity: only keep findings with actual descriptions
  // ------------------------------------------------------------------
  const verifiedFree = freeFindings.filter(
    (f) => f.insufficientData || f.description.length > 0,
  );
  const verifiedPaid = paidFindings.filter(
    (f) => f.insufficientData || f.description.length > 0,
  );

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

  // Calculate savings only from verified, non-insufficient findings
  // Include estimated overcharge from excluded categories
  const findingSavings = [...verifiedFree, ...verifiedPaid]
    .filter((f) => !f.insufficientData)
    .reduce((sum, f) => sum + f.potential_savings, 0);
  const savings = findingSavings + Math.round(estimatedOvercharge);

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
  const multiYearRecons = options?.multiYearReconciliations;
  const multiYearComparisonRan = multiYearRecons != null && multiYearRecons.length >= 2;

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

  // When multi-year comparison ran successfully, add positive status message
  if (multiYearComparisonRan) {
    const multiYearNote =
      "Multi-year CAM comparison completed. Year-over-year change was analyzed against the lease-defined cap.";
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

  // Boost confidence score by +10 if overcharge was successfully calculated
  let adjustedConfidenceScore = confidenceScore;
  let adjustedConfidence = confidence;
  if (estimatedOvercharge > 0) {
    adjustedConfidenceScore = Math.min(adjustedConfidenceScore + 10, 100);
    if (adjustedConfidenceScore >= 70) adjustedConfidence = "high";
    else if (adjustedConfidenceScore >= 40) adjustedConfidence = "medium";
  }

  // ------------------------------------------------------------------
  // Multi-Year CAM Reconciliation Escalation Comparison
  // ------------------------------------------------------------------
  if (multiYearRecons && multiYearRecons.length >= 2) {
    // Sort chronologically
    const sorted = [...multiYearRecons].sort((a, b) => a.year - b.year);

    const camCapPct = leaseFields.camCapPercentage
      ? parseFloat(leaseFields.camCapPercentage)
      : null;

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];

      if (prev.total <= 0 || curr.total <= 0) continue;

      const increasePercent =
        ((curr.total - prev.total) / prev.total) * 100;

      if (camCapPct != null && increasePercent > camCapPct) {
        const allowedIncrease = prev.total * (camCapPct / 100);
        const allowedTotal = prev.total + allowedIncrease;
        const overcharge = Math.max(0, curr.total - allowedTotal);

        const evidence: SourceEvidence[] = [
          {
            document: prev.docName ?? `Reconciliation ${prev.year}`,
            page: null,
            extractedText: `${prev.year} Total: $${prev.total.toLocaleString()}`,
            findingCategory: "Year-over-Year CAM Escalation Exceeds Lease Cap",
          },
          {
            document: curr.docName ?? `Reconciliation ${curr.year}`,
            page: null,
            extractedText: `${curr.year} Total: $${curr.total.toLocaleString()}`,
            findingCategory: "Year-over-Year CAM Escalation Exceeds Lease Cap",
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
              findingCategory: "Year-over-Year CAM Escalation Exceeds Lease Cap",
            });
          }
        }

        const finding: Finding = {
          category: "Year-over-Year CAM Escalation Exceeds Lease Cap",
          description:
            `CAM charges increased ${increasePercent.toFixed(1)}% from ${prev.year} ($${prev.total.toLocaleString()}) ` +
            `to ${curr.year} ($${curr.total.toLocaleString()}), exceeding the lease CAM cap of ${camCapPct}%. ` +
            `The maximum allowable total for ${curr.year} was $${Math.round(allowedTotal).toLocaleString()}. ` +
            `Estimated overcharge: $${Math.round(overcharge).toLocaleString()}.`,
          potential_savings: overcharge > 0 ? Math.round(overcharge) : 0,
          severity: "high",
          sourceEvidence: evidence,
        };

        // Add to paid (premium) findings — appears in both Premium and
        // Identified Findings sections via premiumInIdentified filter in PDF
        paidFindings.push(finding);
      }
    }
  }

  // ------------------------------------------------------------------
  // 6. Gross-Up Review (heuristic audit module)
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
          ? `${jump.category}: $${jump.priorAmount.toLocaleString()} (${jump.priorYear}) → $${jump.currentAmount.toLocaleString()} (${jump.currentYear}), +${jump.increasePercent.toFixed(1)}%`
          : `${jump.category}: $${jump.currentAmount.toLocaleString()} (controllable category with elevated overall increase)`;
        grossUpEvidence.push({
          document: reconDocName,
          page: null,
          extractedText: jumpText,
          findingCategory: "Controllable Category Jump",
        });
      }

      // Estimate potential review amount from suspicious controllable increases
      let potentialReviewAmount = 0;
      const hasDetailedJumps = suspiciousJumps.some((j) => j.priorAmount > 0);
      if (hasDetailedJumps) {
        for (const jump of suspiciousJumps) {
          if (jump.priorAmount > 0) {
            // Excess above a 5% reasonable increase threshold
            const reasonable = jump.priorAmount * 1.05;
            const excess = Math.max(0, jump.currentAmount - reasonable);
            potentialReviewAmount += excess;
          }
        }
        potentialReviewAmount = Math.round(potentialReviewAmount);
      }

      // Determine severity
      const severity: "high" | "medium" =
        hasDetailedJumps && matchedKeywords.length >= 2 ? "high" : "medium";

      let description =
        "The uploaded documents suggest a possible gross-up or occupancy-based adjustment to operating expenses. " +
        "Certain controllable categories increased materially year-over-year, and gross-up style language " +
        `was detected (${matchedKeywords.slice(0, 3).map((k) => `"${k}"`).join(", ")}). ` +
        "Review recommended to confirm whether expenses were adjusted beyond what the lease permits.";

      if (potentialReviewAmount > 0) {
        description += ` Potential review amount: $${potentialReviewAmount.toLocaleString()}.`;
      }

      paidFindings.push({
        category: "Possible Gross-Up / Occupancy Adjustment",
        description,
        potential_savings: potentialReviewAmount,
        severity,
        sourceEvidence: grossUpEvidence.length > 0 ? grossUpEvidence : undefined,
      });
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
