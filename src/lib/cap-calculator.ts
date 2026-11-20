/**
 * CAM cap and base-year arithmetic for figures the TENANT enters (pure: no UI, no network, no document reading).
 *
 * Why it exists. Caps are written in different ways, and the method changes the answer far more than rounding does. With a
 * 5% cap and the same expenses, a non-cumulative cap, a compounding cumulative cap and a simple cumulative cap can produce
 * different allowed amounts and different excesses (see the known-answer tests). This module does the arithmetic for the
 * method the tenant selects. It does NOT decide which method the lease uses, which expenses are "controllable", whether
 * an amendment changes the cap, or whether a base year must be grossed up: those are readings of the lease, so the tenant
 * supplies them and every result says which choices it rests on.
 *
 * Nothing here labels anything an overcharge. An "amount above the cap" is the difference between the figures entered
 * and the allowed amount under the method selected.
 */

export type CapMethod = "non-cumulative" | "cumulative-compounded" | "cumulative-simple";
/** Non-cumulative caps only: is year N limited by year N-1's ACTUAL expenses, or by the amount allowed (capped) for N-1? */
export type PriorBasis = "capped" | "actual";

export const CAP_METHOD_LABEL: Record<CapMethod, string> = {
  "non-cumulative": "Non-cumulative (each year compared with the year before)",
  "cumulative-compounded": "Cumulative, compounding (base year grown by the cap each year)",
  "cumulative-simple": "Cumulative, non-compounding (base year plus the cap x number of years)",
};

export interface CapYearInput {
  year: number | null;
  /** Expenses SUBJECT to the cap for this year (for example controllable expenses), as the tenant classifies them. */
  capped: number | null;
  /** Expenses NOT subject to the cap (for example taxes, insurance, utilities if the lease excludes them). Optional. */
  uncapped: number | null;
}

export interface CapInput {
  method: CapMethod;
  capPercent: number | null;
  /** Used only by the non-cumulative method. */
  priorBasis: PriorBasis;
  /** First row is the base (first) year. Years must be consecutive. */
  years: CapYearInput[];
  /** Whether the amounts are building-level pools or already the tenant's share. */
  amountsAre: "building" | "tenant";
  /** Required when amountsAre is "building": converts amounts above the cap into the tenant's share. */
  sharePercent: number | null;
}

export interface CapYearResult {
  year: number;
  /** Years after the base year (0 for the base year). */
  n: number;
  capped: number;
  uncapped: number;
  /** Highest amount of capped expenses allowed this year. Null for the base year (it sets the baseline). */
  allowedCapped: number | null;
  /** max(0, capped - allowedCapped). */
  aboveCap: number;
  /** aboveCap in the tenant's share (equals aboveCap when the amounts are already the tenant's). */
  tenantAboveCap: number;
  formula: string;
}

export interface CapResult {
  rows: CapYearResult[];
  totalAboveCap: number;
  totalTenantAboveCap: number;
  /** Plain statements of what the result rests on. Always shown with the result. */
  assumptions: string[];
  notes: string[];
}

export type CapOutcome = { ok: true; result: CapResult } | { ok: false; errors: string[]; missing: string[] };

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export const money = (n: number) =>
  (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${Number(n.toFixed(4))}%`;

export const MAX_CAP_YEARS = 10;

export function calculateCap(input: CapInput): CapOutcome {
  const errors: string[] = [];
  const missing: string[] = [];
  const c = input.capPercent;

  if (!isNum(c)) missing.push("the cap percentage");
  else if (c < 0 || c > 100) errors.push("The cap percentage must be between 0% and 100%.");

  if (input.amountsAre === "building") {
    if (!isNum(input.sharePercent)) missing.push("your pro-rata share (the amounts are building totals)");
    else if (input.sharePercent <= 0 || input.sharePercent > 100) errors.push("Your pro-rata share must be above 0% and at most 100%.");
  }

  const rows = input.years.filter((y) => y.year != null || y.capped != null || y.uncapped != null);
  if (rows.length < 2) missing.push("at least two years (the base year and one later year)");
  if (rows.length > MAX_CAP_YEARS) errors.push(`Enter at most ${MAX_CAP_YEARS} years.`);

  rows.forEach((y, i) => {
    const label = y.year != null ? `${y.year}` : `row ${i + 1}`;
    if (!isNum(y.year)) missing.push(`the year for row ${i + 1}`);
    else if (!Number.isInteger(y.year) || y.year < 1900 || y.year > 2200) errors.push(`Row ${i + 1}: enter a four-digit year.`);
    if (!isNum(y.capped)) missing.push(`expenses subject to the cap for ${label}`);
    else if (y.capped < 0) errors.push(`${label}: expenses subject to the cap must be zero or more.`);
    if (y.uncapped != null && (!isNum(y.uncapped) || y.uncapped < 0)) errors.push(`${label}: expenses outside the cap must be zero or more.`);
  });
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1].year, b = rows[i].year;
    if (isNum(a) && isNum(b) && b - a !== 1) {
      errors.push(
        `Years must be consecutive, one row per year, starting with the base year (${a} is followed by ${b}). ` +
          `A missing year changes every later allowed amount, so the calculation does not guess it.`,
      );
      break;
    }
  }
  if (isNum(rows[0]?.capped) && rows[0].capped === 0) {
    errors.push("The base year's expenses subject to the cap are $0, so a percentage cap on them cannot be applied.");
  }

  if (errors.length || missing.length) return { ok: false, errors, missing };

  const cap = (c as number) / 100;
  const share = input.amountsAre === "building" ? (input.sharePercent as number) / 100 : 1;
  const base = rows[0].capped as number;
  const out: CapYearResult[] = [];
  let priorAllowed: number | null = null; // non-cumulative "capped" basis: the amount allowed (payable) for the prior year

  rows.forEach((y, n) => {
    const capped = cents(y.capped as number);
    const uncapped = cents(y.uncapped ?? 0);
    if (n === 0) {
      out.push({ year: y.year as number, n, capped, uncapped, allowedCapped: null, aboveCap: 0, tenantAboveCap: 0, formula: "Base year: sets the starting amount; no cap applies to it." });
      priorAllowed = capped;
      return;
    }
    let allowed: number;
    let formula: string;
    const prev = out[n - 1];
    if (input.method === "non-cumulative") {
      const prior = input.priorBasis === "actual" ? prev.capped : (priorAllowed as number);
      allowed = cents(prior * (1 + cap));
      formula = `${input.priorBasis === "actual" ? `${prev.year} actual` : `${prev.year} amount allowed`} ${money(prior)} x (1 + ${pct(c as number)}) = ${money(allowed)}`;
    } else if (input.method === "cumulative-compounded") {
      // computed from the base each year (not from the rounded prior year) so rounding does not accumulate
      allowed = cents(base * Math.pow(1 + cap, n));
      formula = `Base ${money(base)} x (1 + ${pct(c as number)})^${n} = ${money(allowed)}`;
    } else {
      allowed = cents(base * (1 + cap * n));
      formula = `Base ${money(base)} x (1 + ${pct(c as number)} x ${n}) = ${money(allowed)}`;
    }
    const aboveCap = capped > allowed ? cents(capped - allowed) : 0;
    priorAllowed = Math.min(capped, allowed);
    out.push({ year: y.year as number, n, capped, uncapped, allowedCapped: allowed, aboveCap, tenantAboveCap: cents(aboveCap * share), formula });
  });

  const totalAboveCap = cents(out.reduce((s, r) => s + r.aboveCap, 0));
  const totalTenantAboveCap = cents(out.reduce((s, r) => s + r.tenantAboveCap, 0));

  const assumptions = [
    `Cap method selected: ${CAP_METHOD_LABEL[input.method]}${input.method === "non-cumulative" ? `, measured against the prior year's ${input.priorBasis === "actual" ? "actual expenses" : "amount allowed under the cap"}` : ""}.`,
    `The base year is ${out[0].year}, and the expenses entered as subject to the cap are the ones your lease caps. This calculator does not decide which expenses are controllable.`,
    "No amendment changes the cap, the base year or the covered expenses for these years. If one does, recalculate each period under the terms that applied to it.",
    input.amountsAre === "building"
      ? `Amounts are building totals; amounts above the cap are converted to your share at ${pct(input.sharePercent as number)}.`
      : "Amounts are already your share, so no pro-rata conversion is applied.",
  ];
  const notes: string[] = [
    "Each allowed amount is rounded to the cent. A cumulative cap is computed from the base year each time, so rounding does not build up.",
  ];
  if (out.some((r) => r.uncapped > 0)) notes.push("Expenses outside the cap are shown for completeness and are not limited by it.");
  if (input.method === "non-cumulative") {
    notes.push(
      input.priorBasis === "capped"
        ? "Measured against the prior year's allowed amount: a year above the cap lowers the base for the next year."
        : "Measured against the prior year's actual expenses: a year above the cap does not lower the base for the next year.",
    );
  }
  return { ok: true, result: { rows: out, totalAboveCap, totalTenantAboveCap, assumptions, notes } };
}

// ───────────────────────────── base year / expense stop ─────────────────────────────

export type StopMode = "base-year" | "expense-stop-total" | "expense-stop-psf";

export interface BaseYearInput {
  mode: StopMode;
  /** Operating expenses for the year being billed (building level). */
  currentExpenses: number | null;
  /** base-year mode: building expenses for the base year. */
  baseYearExpenses: number | null;
  /** expense-stop-total mode: the stop as a building-level dollar amount. */
  stopAmount: number | null;
  /** expense-stop-psf mode: the stop in dollars per square foot per year. */
  stopPerSqFt: number | null;
  /** expense-stop-psf mode: the area the per-foot figures are measured on. */
  buildingSqFt: number | null;
  sharePercent: number | null;
}

export interface StopStep { label: string; formula: string; value: string }
export type BaseYearOutcome =
  | { ok: true; steps: StopStep[]; tenantAmount: number; increaseOverBase: number; assumptions: string[] }
  | { ok: false; errors: string[]; missing: string[] };

export function calculateBaseYear(i: BaseYearInput): BaseYearOutcome {
  const errors: string[] = [];
  const missing: string[] = [];
  const need = (v: number | null, label: string) => {
    if (!isNum(v)) missing.push(label);
    else if (v < 0) errors.push(`${label[0].toUpperCase()}${label.slice(1)} must be zero or more.`);
  };
  need(i.currentExpenses, "this year's operating expenses");
  if (!isNum(i.sharePercent)) missing.push("your pro-rata share");
  else if (i.sharePercent <= 0 || i.sharePercent > 100) errors.push("Your pro-rata share must be above 0% and at most 100%.");
  if (i.mode === "base-year") need(i.baseYearExpenses, "the base year's operating expenses");
  if (i.mode === "expense-stop-total") need(i.stopAmount, "the expense stop amount");
  if (i.mode === "expense-stop-psf") {
    need(i.stopPerSqFt, "the expense stop per square foot");
    need(i.buildingSqFt, "the building square footage");
    if (isNum(i.buildingSqFt) && i.buildingSqFt === 0) errors.push("The building square footage must be above zero.");
  }
  if (errors.length || missing.length) return { ok: false, errors, missing };

  const current = cents(i.currentExpenses as number);
  const share = i.sharePercent as number;
  const steps: StopStep[] = [{ label: "This year's operating expenses", formula: "input", value: money(current) }];
  let threshold: number;
  if (i.mode === "base-year") {
    threshold = cents(i.baseYearExpenses as number);
    steps.push({ label: "Base-year operating expenses", formula: "input", value: money(threshold) });
  } else if (i.mode === "expense-stop-total") {
    threshold = cents(i.stopAmount as number);
    steps.push({ label: "Expense stop", formula: "input", value: money(threshold) });
  } else {
    threshold = cents((i.stopPerSqFt as number) * (i.buildingSqFt as number));
    steps.push({
      label: "Expense stop for the building",
      formula: `${money(i.stopPerSqFt as number)} per sq ft x ${(i.buildingSqFt as number).toLocaleString("en-US")} sq ft`,
      value: money(threshold),
    });
  }
  const increaseOverBase = current > threshold ? cents(current - threshold) : 0;
  steps.push({ label: "Increase over the base", formula: `max(0, ${money(current)} - ${money(threshold)})`, value: money(increaseOverBase) });
  const tenantAmount = cents(increaseOverBase * (share / 100));
  steps.push({ label: "Your share of the increase", formula: `${money(increaseOverBase)} x ${pct(share)}`, value: money(tenantAmount) });

  const assumptions = [
    "Both years' expenses cover the same categories. Leases often exclude items from the base year (or from later years) that this calculation cannot see.",
    "If your lease requires variable expenses to be grossed up to a stated occupancy, enter grossed-up figures for both years; this calculation does not adjust for occupancy.",
    "Your share is the same in both years. A change in the building's area or your space changes the result.",
  ];
  if (current <= threshold) assumptions.unshift("This year's expenses are at or below the base, so under these figures no increase is passed through.");
  return { ok: true, steps, tenantAmount, increaseOverBase, assumptions };
}
