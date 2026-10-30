/**
 * The ONE fictional example used by every demonstration on the marketing pages (hero preview, sample report,
 * dashboard preview). Nothing here is real. Amounts are integer cents and every derived figure is computed
 * from the inputs, so the demonstrations cannot drift out of agreement with each other.
 *
 * Same formula the product uses for a fee above its cap:
 *   billed fee - (fee at the lease cap) = excess;  excess x tenant share = amount to review
 */

export const SHARE_BP = 808; // 8.08% in basis points; 4,200 / 52,000 sq ft = 8.0769%, stated as 8.08%
const OPEX_CENTS = 56_054_000; // total operating expenses on the fictional statement: $560,540.00
const FEE_RATE = 18; // percent billed
const FEE_CAP = 15; // percent allowed by the fictional lease
const ROOF_CENTS = 2_450_000; // $24,500.00 billed for roof repair

const pct = (cents: number, p: number) => Math.round((cents * p) / 100);
const share = (cents: number) => Math.round((cents * SHARE_BP) / 10_000);

const feeBilled = pct(OPEX_CENTS, FEE_RATE); // $100,897.20
const feeAtCap = pct(OPEX_CENTS, FEE_CAP); // $84,081.00
const feeExcess = feeBilled - feeAtCap; // $16,816.20
const feeReview = share(feeExcess); // $1,358.75
const roofReview = share(ROOF_CENTS); // $1,979.60

/** Exported so the sample review plan uses the very same figures as the table. */
export const SAMPLE_FEE_REVIEW = feeReview / 100;
export const SAMPLE_ROOF_REVIEW = roofReview / 100;

export const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type RowStatus = "review" | "matches" | "data";

export interface SampleRow {
  id: string;
  item: string;
  /** What the fictional lease requires */
  lease: string;
  leaseRef: string;
  /** What the fictional statement shows */
  statement: string;
  statementRef: string;
  /** Calculated variance, or null when none could be calculated */
  variance: string;
  status: RowStatus;
  statusLabel: string;
  /** How the number was reached; "judgment" rows depend on lease interpretation */
  basis: "Calculated" | "Needs your judgment" | "Needs more data";
  explanation: string;
  calc: string;
}

export const SAMPLE_ROWS: SampleRow[] = [
  {
    id: "fee",
    item: "Management fee",
    lease: "Capped at 15% of operating expenses",
    leaseRef: "Lease p. 2, §3.3",
    statement: `Charged at 18%: ${money(feeBilled)}`,
    statementRef: "Statement p. 1",
    variance: money(feeReview),
    status: "review",
    statusLabel: "Needs review",
    basis: "Calculated",
    explanation: "The statement bills an 18% fee; the lease allows up to 15%. This is arithmetic from the two documents.",
    calc: `${money(OPEX_CENTS)} operating expenses × 18% = ${money(feeBilled)} billed; × 15% cap = ${money(feeAtCap)} allowed; ${money(feeBilled)} − ${money(feeAtCap)} = ${money(feeExcess)}; × 8.08% share = ${money(feeReview)} (rounded to the cent)`,
  },
  {
    id: "roof",
    item: "Roof repair",
    lease: "Capital and structural repairs excluded",
    leaseRef: "Lease p. 3, §4.1",
    statement: `Billed: ${money(ROOF_CENTS)}`,
    statementRef: "Statement p. 1",
    variance: money(roofReview),
    status: "review",
    statusLabel: "Needs review",
    basis: "Needs your judgment",
    explanation: "Whether this repair counts as excluded capital work depends on the lease wording and the repair itself. Ask the landlord.",
    calc: `${money(ROOF_CENTS)} × 8.08% share = ${money(roofReview)}`,
  },
  {
    id: "share",
    item: "Tenant share",
    lease: "4,200 of 52,000 sq ft (8.08%)",
    leaseRef: "Lease p. 1",
    statement: "Applied at 8.08%",
    statementRef: "Statement p. 1",
    variance: money(0),
    status: "matches",
    statusLabel: "Matches lease",
    basis: "Calculated",
    explanation: "The share on the statement agrees with the square footage in the lease.",
    calc: "4,200 ÷ 52,000 = 8.0769%, stated as 8.08%",
  },
  {
    id: "cap",
    item: "Annual increase cap",
    lease: "Increases limited to 5% a year",
    leaseRef: "Lease p. 2, §3.5",
    statement: "No prior-year total found",
    statementRef: "Statement p. 1",
    variance: "Not calculated",
    status: "data",
    statusLabel: "Needs prior year",
    basis: "Needs more data",
    explanation: "Add last year’s statement to run this check. Until then nothing is counted toward the total.",
    calc: "Needs this year’s and last year’s controllable expenses",
  },
];

export const SAMPLE_TOTAL = feeReview + roofReview; // $3,338.35
export const SAMPLE_TOTAL_LABEL = money(SAMPLE_TOTAL);
export const SAMPLE_REVIEW_COUNT = SAMPLE_ROWS.filter((r) => r.status === "review").length;

export const SAMPLE_LETTER = {
  re: "Re: [Premises / suite] – CAM reconciliation for [year]",
  items: [
    `1. Management fee above lease cap – ${money(feeReview)}`,
    "The reconciliation shows a management fee at 18% of operating expenses, while the lease limits this fee to 15%. " +
      `Applying the cap to the fee on the statement and my 8.08% share, the difference is approximately ${money(feeReview)}.`,
  ],
  source: "Source: Lease, page 2, §3.3: “…not to exceed 15%…”",
  close: "Please send the supporting documents for each item by [response date].",
};

// ───────────── the same fictional example, in the shape the audit engine produces, for the sample review plan ─────────────
import type { Finding, LeaseClauseSummary, OverchargeLineItem } from "@/services/audit-logic";

export const SAMPLE_PLAN_FINDINGS: Finding[] = [
  {
    category: "Admin Fee Above Lease Cap",
    description: "The statement bills an 18% management fee; the lease allows up to 15%. This is arithmetic from the two documents.",
    potential_savings: SAMPLE_FEE_REVIEW,
    severity: "medium",
    sourceEvidence: [
      { document: "lease.pdf", page: 2, extractedText: "Landlord may charge an administrative fee not to exceed 15% of total operating expenses.", findingCategory: "Admin Fee Above Lease Cap" },
      { document: "cam-statement-2025.pdf", page: 1, extractedText: "Management Fee (18%) $100,897.20", findingCategory: "Admin Fee Above Lease Cap" },
    ],
  },
  {
    category: "Excluded Category Billed",
    description: "The lease excludes capital and structural repairs. The statement bills roof repair, which may fall in that category.",
    potential_savings: 0,
    severity: "high",
    sourceEvidence: [{ document: "lease.pdf", page: 3, extractedText: "Capital and structural repairs are excluded from operating expenses.", findingCategory: "Excluded Category Billed" }],
  },
  {
    category: "CAM Cap Review: Prior-Year Data Needed",
    description: "The lease limits annual increases to 5%, but no prior-year total was found to compare against.",
    potential_savings: 0,
    severity: "medium",
    insufficientData: true,
    sourceEvidence: [{ document: "lease.pdf", page: 2, extractedText: "Annual increases in controllable expenses are limited to 5%.", findingCategory: "CAM Cap Review: Prior-Year Data Needed" }],
  },
  {
    category: "Tenant share (matches lease)",
    description: "The share on the statement (8.08%) agrees with 4,200 of 52,000 square feet in the lease.",
    potential_savings: 0,
    severity: "low",
    sourceEvidence: [{ document: "lease.pdf", page: 1, extractedText: "Tenant's share: 4,200 of 52,000 rentable square feet.", findingCategory: "Tenant share (matches lease)" }],
  },
];

export const SAMPLE_PLAN_BREAKDOWN: OverchargeLineItem[] = [
  {
    category: "roof repair",
    total_expense: 24500,
    tenant_share_percent: 8.08,
    tenant_charge: SAMPLE_ROOF_REVIEW,
    reason: "Excluded Expense",
    sourceEvidence: { document: "cam-statement-2025.pdf", page: 1, extractedText: "Roof Repair $24,500.00", findingCategory: "Excluded Category Billed" },
  },
];

export const SAMPLE_PLAN_CLAUSES: LeaseClauseSummary = {
  camCap: "5%",
  adminFeeCap: "15%",
  managementFeeCap: null,
  tenantProRataShare: "8.08%",
  tenantSquareFootage: "4,200 sq ft",
  buildingSquareFootage: "52,000 sq ft",
  excludedCategories: ["capital improvements", "structural repairs"],
  additionalClauses: [],
};
