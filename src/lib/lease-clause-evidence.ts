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
        section: "CAM Expense Cap",
        text: `Annual CAM or controllable operating expense increases shall not exceed ${summary.camCap} of prior year expenses per the lease agreement.`,
      };
    }
  }

  // Admin fee cap findings
  if (cat.includes("admin") && cat.includes("fee")) {
    if (summary.adminFeeCap) {
      return {
        section: "Administrative Fee Cap",
        text: `The lease limits administrative fees to ${summary.adminFeeCap} of total CAM or operating expenses billed to the tenant.`,
      };
    }
  }

  // Management fee findings
  if (cat.includes("management fee")) {
    if (summary.managementFeeCap) {
      return {
        section: "Management Fee Cap",
        text: `Property management fees are capped at ${summary.managementFeeCap} of total operating expenses per the lease terms.`,
      };
    }
  }

  // Tenant allocation / pro-rata share findings
  if (
    cat.includes("allocation") ||
    cat.includes("pro-rata") ||
    cat.includes("pro rata")
  ) {
    if (summary.tenantProRataShare) {
      const parts: string[] = [
        `Tenant's pro-rata share is specified as ${summary.tenantProRataShare}`,
      ];
      if (summary.tenantSquareFootage) {
        parts.push(`based on tenant premises of ${summary.tenantSquareFootage} sq ft`);
      }
      if (summary.buildingSquareFootage) {
        parts.push(`within a total building area of ${summary.buildingSquareFootage} sq ft`);
      }
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
        section: "CAM Expense Cap",
        text: `Annual CAM escalation is capped at ${summary.camCap} per lease terms.`,
      };
    }
  }

  // Excluded expense findings
  if (cat.includes("excluded") || cat.includes("non-recoverable")) {
    if (summary.excludedCategories.length > 0) {
      return {
        section: "Excluded Expense Categories",
        text: `The lease excludes the following categories from tenant reimbursement: ${summary.excludedCategories.join(", ")}. These expenses should not appear in the tenant's CAM reconciliation charges.`,
      };
    }
  }

  return null;
}
