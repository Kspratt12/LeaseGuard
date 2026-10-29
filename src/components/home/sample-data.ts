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
    calc: `${money(feeBilled)} billed − ${money(feeAtCap)} at the 15% cap = ${money(feeExcess)}; × 8.08% share = ${money(feeReview)}`,
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
