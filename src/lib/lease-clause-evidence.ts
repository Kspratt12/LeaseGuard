import type { Finding, LeaseClauseSummary } from "@/services/audit-logic";

export interface LeaseClauseRef {
  section: string;
  text: string;
}

/**
 * Maps a finding to its supporting lease clause evidence based on the
 * finding category and the extracted lease clause summary.
 *
 * Returns null if no relevant clause is available.
 */
export function getLeaseClauseEvidence(
  finding: Finding,
  summary: LeaseClauseSummary | null | undefined,
): LeaseClauseRef | null {
  if (!summary) return null;

  const cat = finding.category.toLowerCase();

  // CAM cap related findings
  if (
    cat.includes("cam cap") ||
    cat.includes("cam escalation") ||
    cat.includes("year-over-year cam")
  ) {
    if (summary.camCap) {
      return {
        section: "CAM Expense Cap Provision",
        text: `The lease limits annual increases in CAM or controllable operating expenses to ${summary.camCap} over the prior year. Any charges exceeding this cap are not the tenant's responsibility.`,
      };
    }
  }

  // Admin fee cap findings
  if (cat.includes("admin") && cat.includes("fee")) {
    if (summary.adminFeeCap) {
      return {
        section: "Administrative Fee Limitation",
        text: `The lease limits administrative or overhead fees to ${summary.adminFeeCap} of total operating expenses. Charges exceeding this percentage should be credited to the tenant.`,
      };
    }
    // Fall through to management fee if admin cap not found
    if (summary.managementFeeCap) {
      return {
        section: "Management/Administrative Fee Cap",
        text: `The lease caps management and administrative fees at ${summary.managementFeeCap} of operating expenses.`,
      };
    }
  }

  // Management fee findings
  if (cat.includes("management fee") || cat.includes("management/admin")) {
    if (summary.managementFeeCap) {
      return {
        section: "Property Management Fee Cap",
        text: `Property management fees are contractually capped at ${summary.managementFeeCap} of total operating expenses. Any management fee charged above this rate constitutes an overcharge.`,
      };
    }
    if (summary.adminFeeCap) {
      return {
        section: "Administrative/Management Fee Cap",
        text: `The lease limits admin and management fees to ${summary.adminFeeCap} of operating expenses.`,
      };
    }
  }

  // Tenant allocation / pro-rata share findings
  if (
    cat.includes("allocation") ||
    cat.includes("pro-rata") ||
    cat.includes("pro rata") ||
    cat.includes("share mismatch")
  ) {
    if (summary.tenantProRataShare) {
      const parts: string[] = [
        `The lease establishes the tenant's pro-rata share at ${summary.tenantProRataShare}`,
      ];
      if (summary.tenantSquareFootage && summary.buildingSquareFootage) {
        parts.push(`calculated from ${summary.tenantSquareFootage} of tenant premises within a ${summary.buildingSquareFootage} total building area`);
      } else if (summary.tenantSquareFootage) {
        parts.push(`based on tenant premises of ${summary.tenantSquareFootage}`);
      }
      parts.push(`Any billing at a higher share percentage constitutes an overcharge`);
      return {
        section: "Tenant Pro-Rata Share",
        text: parts.join(", ") + ".",
      };
    }
  }

  // Gross-up / occupancy adjustment
  if (cat.includes("gross-up") || cat.includes("occupancy")) {
    if (summary.camCap) {
      return {
        section: "CAM Expense Cap / Gross-Up",
        text: `Annual CAM escalation is capped at ${summary.camCap} per lease terms. Gross-up adjustments must comply with this limitation.`,
      };
    }
  }

  // Excluded expense findings
  if (cat.includes("excluded") || cat.includes("non-recoverable")) {
    if (summary.excludedCategories.length > 0) {
      const displayCats = summary.excludedCategories.slice(0, 10).join(", ");
      return {
        section: "Excluded Expense Categories",
        text: `The lease explicitly excludes the following from tenant reimbursement: ${displayCats}. Any pass-through of these expenses to the tenant is a breach of the lease exclusion provisions.`,
      };
    }
  }

  // Reconciliation totals / completeness
  if (cat.includes("reconciliation") || cat.includes("completeness")) {
    if (summary.camCap) {
      return {
        section: "Operating Expense Provisions",
        text: `The lease establishes a ${summary.camCap} cap on annual CAM increases. Complete reconciliation data is required to verify compliance.`,
      };
    }
  }

  // Document review summary — provide whatever we have
  if (cat.includes("review summary") || cat.includes("document review")) {
    const clauseParts: string[] = [];
    if (summary.camCap) clauseParts.push(`CAM cap: ${summary.camCap}`);
    if (summary.adminFeeCap) clauseParts.push(`admin fee cap: ${summary.adminFeeCap}`);
    if (summary.managementFeeCap) clauseParts.push(`management fee cap: ${summary.managementFeeCap}`);
    if (summary.tenantProRataShare) clauseParts.push(`tenant share: ${summary.tenantProRataShare}`);
    if (clauseParts.length > 0) {
      return {
        section: "Extracted Lease Terms",
        text: `Key lease provisions detected: ${clauseParts.join(", ")}.`,
      };
    }
  }

  return null;
}
