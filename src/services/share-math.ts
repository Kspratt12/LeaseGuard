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

/** Tolerance for "pool x share = charge": the larger of one dollar and 0.05% of the charge (statement rounding). */
export const POOL_MATCH_TOLERANCE = (charge: number) => Math.max(1, charge * 0.0005);

/**
 * Finds the pool the statement applied the billed share to, from the statement's own figures. Each candidate tenant
 * charge (the extracted totals) is tested against every other amount on the statement; the first exact-to-tolerance
 * match wins, preferring the closest. Returns null when the figures do not show it.
 */
export function findSharePool(i: {
  statementText: string;
  billedShare: number;
  candidateCharges: Array<number | null | undefined>;
}): SharePool | null {
  const s = i.billedShare;
  if (!(s > 0 && s < 100)) return null;
  const amounts = amountsIn(i.statementText);
  let best: { pool: number; charge: number; err: number } | null = null;
  for (const charge of i.candidateCharges) {
    if (charge == null || !(charge > 0)) continue;
    for (const pool of amounts) {
      if (pool <= charge) continue;
      const err = Math.abs((pool * s) / 100 - charge);
      if (err <= POOL_MATCH_TOLERANCE(charge) && (!best || err < best.err)) best = { pool, charge, err };
    }
  }
  if (!best) return null;
  return {
    pool: best.pool,
    tenantCharge: best.charge,
    poolLine: lineWith(i.statementText, best.pool),
    chargeLine: lineWith(i.statementText, best.charge),
  };
}

/**
 * Dollar effect of a share difference on a known pool: pool x (billed - expected) / 100, to the cent. Zero when the
 * tenant is billed at or below the expected share, or when an input is missing.
 */
export function computeShareMisallocation(i: { pool: number | null; billedShare: number | null; expectedShare: number | null }): number {
  const { pool, billedShare, expectedShare } = i;
  if (pool == null || billedShare == null || expectedShare == null) return 0;
  if (!(pool > 0) || !(billedShare > expectedShare)) return 0;
  return round2((pool * (billedShare - expectedShare)) / 100);
}
