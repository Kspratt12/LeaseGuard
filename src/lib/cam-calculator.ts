/**
 * CAM reconciliation calculator (pure logic, no UI, no network).
 *
 * It shows the arithmetic a typical CAM reconciliation follows and compares the result with
 * the balance printed on a statement. A difference is a difference in arithmetic, NOT a
 * finding that the landlord overcharged: leases differ in what counts as an operating
 * expense, how the share is defined, whether a fee is inside or outside the pool, and more.
 * Nothing here scores risk or labels anything an "overcharge".
 */
import { computeCamCapExcess } from "@/services/savings-math";

export interface CamInput {
  /** Annual operating expenses to be shared (the pool), in dollars. */
  totalExpenses: number | null;
  /** Management/admin fee as a percent of the expenses, or null/0 for none. */
  feePercent: number | null;
  /** True if totalExpenses already includes that fee, so it must not be added again. */
  feeAlreadyIncluded: boolean;
  shareMode: "percent" | "sqft";
  sharePercent: number | null;
  tenantSqFt: number | null;
  buildingSqFt: number | null;
  /** Share % printed on the statement (optional, used only to compare with sq-ft math). */
  statementSharePercent: number | null;
  /** Total estimated (monthly) payments the tenant made for the year. */
  estimatedPayments: number | null;
  /** Balance printed on the statement: positive = amount due, negative = credit. Optional. */
  billedBalance: number | null;
  /** Optional cap check inputs. */
  priorYearTenantTotal: number | null;
  capPercent: number | null;
}

export interface CalcStep {
  label: string;
  formula: string;
  value: string;
}

export interface CamResult {
  steps: CalcStep[];
  feeAmount: number;
  pool: number;
  sharePercentUsed: number;
  tenantShare: number;
  expectedBalance: number | null;
  comparison:
    | { status: "not_compared" }
    | { status: "matches" | "statement_higher" | "statement_lower"; difference: number };
  cap:
    | { status: "not_checked" }
    | { status: "above_cap" | "within_cap"; allowedMax: number; difference: number };
  notes: string[];
}

export type CamOutcome =
  | { ok: true; result: CamResult; warnings: string[] }
  | { ok: false; errors: string[]; missing: string[] };

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const fmtMoney = (n: number) =>
  (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number) => `${Number(n.toFixed(4))}%`;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Dollars within this of each other are treated as "matches" (statement rounding). */
export const MATCH_TOLERANCE = 1.0;

export function calculateCam(input: CamInput): CamOutcome {
  const errors: string[] = [];
  const missing: string[] = [];
  const warnings: string[] = [];

  const nonNeg = (v: number | null, label: string) => {
    if (v != null && (!isNum(v) || v < 0)) errors.push(`${label} must be zero or more.`);
  };
  nonNeg(input.totalExpenses, "Total operating expenses");
  nonNeg(input.estimatedPayments, "Estimated payments");
  nonNeg(input.priorYearTenantTotal, "Prior-year total");
  nonNeg(input.capPercent, "Cap percentage");
  if (input.feePercent != null && (!isNum(input.feePercent) || input.feePercent < 0 || input.feePercent > 100)) {
    errors.push("Management fee must be between 0% and 100%.");
  }
  if (input.billedBalance != null && !isNum(input.billedBalance)) errors.push("Statement balance must be a number.");

  if (!isNum(input.totalExpenses)) missing.push("total operating expenses");

  // --- tenant share ---
  let sharePct: number | null = null;
  let shareFormula = "";
  if (input.shareMode === "percent") {
    if (!isNum(input.sharePercent)) missing.push("your pro-rata share");
    else if (input.sharePercent <= 0 || input.sharePercent > 100) errors.push("Your pro-rata share must be above 0% and at most 100%.");
    else {
      sharePct = input.sharePercent;
      shareFormula = `${fmtPct(sharePct)} (entered)`;
    }
  } else {
    if (!isNum(input.tenantSqFt)) missing.push("your square footage");
    if (!isNum(input.buildingSqFt)) missing.push("the building square footage");
    if (isNum(input.tenantSqFt) && isNum(input.buildingSqFt)) {
      if (input.tenantSqFt <= 0 || input.buildingSqFt <= 0) errors.push("Square footage must be above zero.");
      else if (input.tenantSqFt > input.buildingSqFt) errors.push("Your square footage cannot be larger than the building's.");
      else {
        sharePct = (input.tenantSqFt / input.buildingSqFt) * 100;
        shareFormula = `${input.tenantSqFt.toLocaleString("en-US")} / ${input.buildingSqFt.toLocaleString("en-US")} = ${fmtPct(sharePct)}`;
        if (isNum(input.statementSharePercent) && input.statementSharePercent > 0) {
          const gap = Math.abs(sharePct - input.statementSharePercent);
          if (gap <= 0.01) {
            warnings.push(
              `The statement's ${fmtPct(input.statementSharePercent)} share looks like a rounded version of ${fmtPct(sharePct)}. ` +
                `Rounding the share can move the result by a few dollars on large expense pools.`,
            );
          } else {
            warnings.push(
              `The statement's share (${fmtPct(input.statementSharePercent)}) differs from the square-footage math (${fmtPct(sharePct)}). ` +
                `Check which square footage figures your lease uses (rentable vs. usable, and what the building total includes).`,
            );
          }
        }
      }
    }
  }

  if (errors.length || missing.length) return { ok: false, errors, missing };

  const expenses = input.totalExpenses as number;
  const fee = input.feePercent ?? 0;
  const share = sharePct as number;

  const steps: CalcStep[] = [];
  const notes: string[] = [];

  steps.push({ label: "Operating expenses entered", formula: "input", value: fmtMoney(cents(expenses)) });

  let feeAmount = 0;
  let pool = expenses;
  if (fee > 0 && !input.feeAlreadyIncluded) {
    feeAmount = cents(expenses * (fee / 100));
    pool = cents(expenses + feeAmount);
    steps.push({ label: "Management/admin fee", formula: `${fmtMoney(cents(expenses))} x ${fmtPct(fee)}`, value: fmtMoney(feeAmount) });
    steps.push({ label: "Expense pool including fee", formula: `${fmtMoney(cents(expenses))} + ${fmtMoney(feeAmount)}`, value: fmtMoney(pool) });
    notes.push("The fee was added on top of the expenses. If your statement's expense total already includes the fee, tick the box so it is not counted twice.");
  } else if (fee > 0) {
    feeAmount = cents(expenses - expenses / (1 + fee / 100));
    notes.push(`The entered total already includes a ${fmtPct(fee)} fee, so it was not added again.`);
    pool = cents(expenses);
  } else {
    pool = cents(expenses);
  }

  const tenantShare = cents(pool * (share / 100));
  steps.push({ label: "Your share of the pool", formula: `${fmtMoney(pool)} x ${shareFormula}`, value: fmtMoney(tenantShare) });

  let expectedBalance: number | null = null;
  if (isNum(input.estimatedPayments)) {
    expectedBalance = cents(tenantShare - input.estimatedPayments);
    steps.push({
      label: expectedBalance >= 0 ? "Balance you would owe" : "Credit you would receive",
      formula: `${fmtMoney(tenantShare)} - ${fmtMoney(cents(input.estimatedPayments))} estimated payments`,
      value: fmtMoney(expectedBalance),
    });
    if (input.estimatedPayments > tenantShare * 2 && tenantShare > 0) {
      warnings.push("Your estimated payments are more than double your calculated share. Check that you entered a full year of payments and the right expense total.");
    }
  } else {
    notes.push("Add your estimated payments to see the balance due or credit.");
  }

  if (share > 50) warnings.push("A share above 50% is unusual for a multi-tenant property. Double-check the percentage or square footage.");

  let comparison: CamResult["comparison"] = { status: "not_compared" };
  if (expectedBalance != null && isNum(input.billedBalance)) {
    const diff = cents(input.billedBalance - expectedBalance);
    comparison =
      Math.abs(diff) < MATCH_TOLERANCE
        ? { status: "matches", difference: diff }
        : { status: diff > 0 ? "statement_higher" : "statement_lower", difference: diff };
  }

  let cap: CamResult["cap"] = { status: "not_checked" };
  if (isNum(input.priorYearTenantTotal) && input.priorYearTenantTotal > 0 && isNum(input.capPercent)) {
    const allowedMax = cents(input.priorYearTenantTotal * (1 + input.capPercent / 100));
    const excess = computeCamCapExcess({ currentTotal: tenantShare, priorYearTotal: input.priorYearTenantTotal, capPercent: input.capPercent });
    cap = excess > 0
      ? { status: "above_cap", allowedMax, difference: excess }
      : { status: "within_cap", allowedMax, difference: cents(tenantShare - allowedMax) };
    steps.push({
      label: "Highest total under the cap",
      formula: `${fmtMoney(cents(input.priorYearTenantTotal))} x (1 + ${fmtPct(input.capPercent)})`,
      value: fmtMoney(allowedMax),
    });
  }

  return {
    ok: true,
    warnings,
    result: { steps, feeAmount, pool, sharePercentUsed: share, tenantShare, expectedBalance, comparison, cap, notes },
  };
}
