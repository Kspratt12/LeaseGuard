/**
 * Pro-rata share arithmetic, kept apart from extraction so every step can be tested on its own. Pure: no I/O.
 *
 * Why this exists. The earlier share checks (four of them) each multiplied "the statement total" by the percentage-point
 * difference between the billed and expected share, and each added its result to the headline. Two defects followed:
 *   1. The same discrepancy was counted up to four times.
 *   2. The "statement total" is frequently the TENANT's charge (the extractor's `totalCamCharges` is documented as the
 *      tenant's total, though its patterns also match building totals and balances). The tenant's charge multiplied by a
 *      percentage-point difference is not a meaningful amount: for a $66,143.72 charge billed at 10.00% instead of
 *      8.08%, it gave $1,270 where the statement's own arithmetic gives $12,699.59.
 *
 * The rule now:
 *   - The dollar effect is calculated only when the statement's OWN figures show which pool the share was applied to:
 *     an amount P on the statement with P x billed% = the tenant charge (to the cent, or within 0.05%). That pool is
 *     quoted as evidence, and the result is P x (billed% - expected%) / 100.
 *   - Otherwise no amount is calculated. The share difference is still reported as an item to raise.
 *   - Only an overbilled share produces an amount. An underbilled share is never presented as savings.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "8.08", "8.08%", " 10 " -> number; anything else -> null. */
export function parsePercent(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const n = parseFloat(String(raw).replace(/[%\s]/g, ""));
  return Number.isFinite(n) && n > 0 && n < 100 ? n : null;
}

/** "$66,143.72" -> 66143.72; anything else -> null. */
export function parseMoney(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const n = parseFloat(String(raw).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type ShareBasis = "stated" | "square-footage";

export interface ExpectedShare {
  /** The share the lease supports, in percent. Null when the lease gives none, or gives two that disagree. */
  value: number | null;
  basis: ShareBasis | null;
  stated: number | null;
  /** tenant sq ft / building sq ft x 100, unrounded. */
  fromSquareFootage: number | null;
  /** Set when the lease states a percentage AND its square footage gives a materially different one. */
  conflict: boolean;
}

/** Above this many percentage points, a stated share and the square-footage ratio are treated as different figures. */
export const STATED_VS_SQFT_TOLERANCE = 0.5;

/**
 * Which share the lease supports. A percentage the lease states is preferred (it is the contract's own figure; square
 * footage is usually "approximately"). Square footage is used only when no percentage is stated. If both exist and
 * disagree by more than STATED_VS_SQFT_TOLERANCE points, which one governs is a lease-interpretation question, so no
 * single expected share is returned.
 */
export function resolveExpectedShare(i: {
  statedPercent: string | null | undefined;
  tenantSqFt: number | null | undefined;
  buildingSqFt: number | null | undefined;
}): ExpectedShare {
  const stated = parsePercent(i.statedPercent);
  const t = i.tenantSqFt ?? null;
  const b = i.buildingSqFt ?? null;
  const fromSquareFootage = t != null && b != null && t > 0 && b > 0 && t < b ? (t / b) * 100 : null;
  if (stated != null && fromSquareFootage != null && Math.abs(stated - fromSquareFootage) > STATED_VS_SQFT_TOLERANCE) {
    return { value: null, basis: null, stated, fromSquareFootage, conflict: true };
  }
  if (stated != null) return { value: stated, basis: "stated", stated, fromSquareFootage, conflict: false };
  if (fromSquareFootage != null) return { value: fromSquareFootage, basis: "square-footage", stated, fromSquareFootage, conflict: false };
  return { value: null, basis: null, stated, fromSquareFootage, conflict: false };
}

/**
 * Smallest difference, in percentage points, that counts as a mismatch. A stated percentage is compared exactly (beyond
 * a hundredth of a point). A square-footage ratio is an approximation, so it keeps the existing half-point tolerance.
 */
export function shareMismatchThreshold(basis: ShareBasis): number {
  return basis === "stated" ? 0.01 : STATED_VS_SQFT_TOLERANCE;
}

export interface SharePool {
  /** The amount on the statement the billed share was applied to. */
  pool: number;
  /** The tenant charge that equals pool x billed share. */
  tenantCharge: number;
  /** The statement line holding the pool amount, when one is found (for evidence). */
  poolLine: string | null;
  /** The statement line holding the tenant charge, when one is found (for evidence). */
  chargeLine: string | null;
}

const MONEY_IN_TEXT = /\$?\s?(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{4,}(?:\.\d{2})?|\d{1,3}\.\d{2})/g;

function amountsIn(text: string): number[] {
  const out = new Set<number>();
  for (const m of text.matchAll(MONEY_IN_TEXT)) {
    const n = parseFloat(m[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) out.add(n);
  }
  return [...out];
}

function lineWith(text: string, value: number): string | null {
  const fixed = value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  for (const line of text.split(/\r?\n|\f/)) {
    const l = line.trim();
    if (!l) continue;
    if (l.includes(fixed) || amountsIn(l).some((n) => Math.abs(n - value) < 0.005)) return l.replace(/\s+/g, " ");
  }
  return null;
}

/** Decimal places the share is printed with ("10.00" -> 2, "8.5" -> 1, "10" -> 0). */
export function shareDecimals(raw: string | null | undefined): number {
  const m = /\.(\d+)/.exec(String(raw ?? "").replace(/[%\s]/g, ""));
  return m ? m[1].length : 0;
}

/**
 * Tolerance for "pool x printed share = charge". A share printed to d decimals can be off by half a unit in the last
 * place, so the charge can differ from pool x printed share by up to pool x 0.5 x 10^-d / 100. The tolerance follows
 * that, with a $1 floor for cent rounding and a ceiling of 0.2% of the charge: a share printed too coarsely to check
 * (for example "10%") is not matched at all rather than matched loosely.
 */
export function poolMatchTolerance(charge: number, billedShare: number, decimals: number): number {
  const rel = Math.min(0.002, Math.max(0.0005, (0.5 * Math.pow(10, -decimals)) / billedShare));
  return Math.max(1, charge * rel);
}

/** Lines that state a total or an expense pool. A coincidental amount on an expense line or a payment line is never a pool. */
const POOL_LINE = /\b(total|subtotal|operating expenses|expense pool|recoverable|building expenses|cam expenses|common area)\b/i;
const NOT_POOL_LINE = /\b(budget|estimated|payments?|paid|received|balance|due|credit|prior|previous)\b/i;

/**
 * Finds the pool the statement applied the billed share to, from the statement's own figures: an amount on a total line
 * such that pool x billed share = a candidate tenant charge, within poolMatchTolerance. Returns null when no pool matches,
 * AND when two different pools match (ambiguous: the software cannot tell which one the share was applied to).
 */
export function findSharePool(i: {
  statementText: string;
  billedShare: number;
  /** Decimal places the billed share is printed with; defaults to 2. */
  billedShareDecimals?: number;
  candidateCharges: Array<number | null | undefined>;
}): SharePool | null {
  const s = i.billedShare;
  if (!(s > 0 && s < 100)) return null;
  const decimals = i.billedShareDecimals ?? 2;
  if (decimals === 0) return null; // a whole-number share is too coarse to verify a pool against
  const pools = new Map<number, string>();
  for (const line of i.statementText.split(/\r?\n|\f/)) {
    const l = line.trim();
    if (!POOL_LINE.test(l) || NOT_POOL_LINE.test(l)) continue;
    for (const n of amountsIn(l)) if (!pools.has(n)) pools.set(n, l.replace(/\s+/g, " "));
  }
  const matches: Array<{ pool: number; charge: number; err: number; line: string }> = [];
  for (const charge of new Set(i.candidateCharges.filter((c): c is number => c != null && c > 0))) {
    for (const [pool, line] of pools) {
      if (pool <= charge) continue;
      const err = Math.abs((pool * s) / 100 - charge);
      if (err <= poolMatchTolerance(charge, s, decimals)) matches.push({ pool, charge, err, line });
    }
  }
  if (matches.length === 0) return null;
  if (new Set(matches.map((m) => m.pool)).size > 1) return null; // ambiguous
  const best = matches.sort((a, b) => a.err - b.err)[0];
  return { pool: best.pool, tenantCharge: best.charge, poolLine: best.line, chargeLine: lineWith(i.statementText, best.charge) };
}

/**
 * Dollar effect of a share difference on a known pool: the charge actually billed minus the charge the expected share
 * gives on the same pool, to the cent. Using the billed charge (not pool x printed share) keeps the result exact when the
 * statement prints a rounded share. Zero when the tenant is billed at or below the expected share, or an input is missing.
 */
export function computeShareMisallocation(i: { pool: number | null; tenantCharge: number | null; billedShare: number | null; expectedShare: number | null }): number {
  const { pool, tenantCharge, billedShare, expectedShare } = i;
  if (pool == null || tenantCharge == null || billedShare == null || expectedShare == null) return 0;
  if (!(pool > 0) || !(tenantCharge > 0) || !(billedShare > expectedShare)) return 0;
  const atExpected = round2((pool * expectedShare) / 100);
  return tenantCharge > atExpected ? round2(tenantCharge - atExpected) : 0;
}

/** The charge the expected share gives on the pool, to the cent (shown in the finding). */
export const chargeAtShare = (pool: number, share: number) => round2((pool * share) / 100);

// ───────────────────────────── the finding ─────────────────────────────

/** Structured identity of the share check. Stored on its findings so later code never has to match on wording. */
export const SHARE_CHECK_ID = "pro-rata-share";

/** The inputs of an overbilled-share finding, stored with it so the amount can be reproduced (and recomputed). */
export interface ShareCalc {
  kind: "share";
  billedShare: number;
  expectedShare: number;
  expectedBasis: ShareBasis;
  /** The pool the statement's figures show the share was applied to; null when not shown. */
  pool: number | null;
  /** The tenant charge that equals pool x billed share; null when the pool is not shown. */
  tenantCharge: number | null;
}

const pctText = (n: number) => `${parseFloat(n.toFixed(4))}%`;
const usd = (n: number) => {
  const c = Math.round(n * 100);
  return c % 100 === 0 ? `$${(c / 100).toLocaleString("en-US")}` : `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * The overbilled-share finding for a set of inputs. With a pool: one amount, the charge billed minus the charge at the
 * expected share, rounded to the dollar. Without one: the same discrepancy as a question with no amount.
 * `expectedSentence` says where the expected share came from (the lease text, its square footage, or a value the
 * customer confirmed).
 */
export function shareFinding(c: ShareCalc, ctx: { expectedSentence: string; sqftText?: string | null }) {
  const head = `The statement applies a tenant share of ${pctText(c.billedShare)}. ${ctx.expectedSentence}`.trim();
  if (c.pool != null && c.tenantCharge != null) {
    const at = chargeAtShare(c.pool, c.expectedShare);
    const exact = computeShareMisallocation({ pool: c.pool, tenantCharge: c.tenantCharge, billedShare: c.billedShare, expectedShare: c.expectedShare });
    const amount = Math.round(exact);
    return {
      category: "Tenant Allocation Discrepancy",
      checkId: SHARE_CHECK_ID,
      calc: c,
      description:
        `${head} The statement's own figures show the share was applied to ${usd(c.pool)} ` +
        `(${usd(c.pool)} x ${pctText(c.billedShare)} = ${usd(c.tenantCharge)}, the charge billed). ` +
        `At ${pctText(c.expectedShare)} the same amount gives ${usd(at)}. ` +
        `Calculation: ${usd(c.tenantCharge)} - ${usd(at)} = ${usd(exact)}, rounded to ${usd(amount)}. ` +
        `This is a calculation from the documents, not a confirmed overcharge. It assumes the lease share applies to the same expenses the statement applied its share to, ` +
        `and that no other lease provision (for example a different share for some expense groups, or an occupancy adjustment) changes it.`,
      potential_savings: amount,
      severity: "high" as const,
    };
  }
  const leaseSide = c.expectedBasis === "stated" ? `states ${pctText(c.expectedShare)}` : `square footage gives ${ctx.sqftText ?? pctText(c.expectedShare)}`;
  return {
    category: "Tenant Allocation Discrepancy",
    checkId: SHARE_CHECK_ID,
    calc: c,
    description:
      `${head} That is ${parseFloat((c.billedShare - c.expectedShare).toFixed(4))} percentage points higher. ` +
      `The statement's figures did not show which total the share was applied to, so no dollar amount is calculated and nothing is counted in any total. ` +
      `Ask the landlord how the share was determined and which total it was applied to.`,
    potential_savings: 0,
    letterText:
      `The statement applies a tenant share of ${pctText(c.billedShare)}, while the lease ${leaseSide}. ` +
      `Please explain how my share was determined, identify the total it was applied to, and provide the calculation.`,
    severity: "high" as const,
  };
}
