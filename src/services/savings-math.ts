/**
 * Deterministic savings arithmetic, kept separate from extraction so it can be
 * tested on its own. Every function returns 0 when an input needed to PROVE an
 * amount is missing: a questionable charge is never turned into a dollar figure
 * by assumption.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Dollar amount by which the current year exceeds the lease CAM cap.
 * Requires a prior-year baseline: without one there is nothing to measure an
 * increase against, so the answer is 0 (review item, not a savings figure).
 */
export function computeCamCapExcess(input: {
  currentTotal: number | null;
  priorYearTotal: number | null;
  capPercent: number | null;
}): number {
  const { currentTotal, priorYearTotal, capPercent } = input;
  if (
    currentTotal == null || priorYearTotal == null || capPercent == null ||
    !(currentTotal > 0) || !(priorYearTotal > 0) || !(capPercent >= 0)
  ) {
    return 0;
  }
  const allowedMax = priorYearTotal * (1 + capPercent / 100);
  return currentTotal > allowedMax ? round2(currentTotal - allowedMax) : 0;
}

/**
 * Tenant's share of the management/admin fee charged above the lease cap.
 *
 * The statement's fee line is the building-level amount, billed at
 * `statedPercent` of its base. The portion above the cap is
 * fee x (stated - cap) / stated; the tenant bears `tenantSharePercent` of it.
 */
export function computeAdminFeeTenantOvercharge(input: {
  feeAmountBuilding: number | null;
  statedPercent: number | null;
  capPercent: number | null;
  tenantSharePercent: number | null;
}): number {
  const { feeAmountBuilding, statedPercent, capPercent, tenantSharePercent } = input;
  if (
    feeAmountBuilding == null || statedPercent == null || capPercent == null ||
    tenantSharePercent == null ||
    !(feeAmountBuilding > 0) || !(statedPercent > 0) || !(tenantSharePercent > 0) ||
    !(statedPercent > capPercent)
  ) {
    return 0;
  }
  const excessBuilding = feeAmountBuilding * ((statedPercent - capPercent) / statedPercent);
  return round2(excessBuilding * (tenantSharePercent / 100));
}

/**
 * Total shown to the customer = sum of the savings of the findings that are
 * actually listed + the excluded-category overcharge (itemised separately in
 * the breakdown; excluded-category findings carry $0 so nothing is counted
 * twice). Summed exactly, rounded once to cents. Findings flagged insufficientData never contribute.
 */
export function totalSavings(
  findings: { potential_savings: number; insufficientData?: boolean }[],
  excludedCategoryOvercharge: number,
): number {
  const fromFindings = findings
    .filter((f) => !f.insufficientData)
    .reduce((sum, f) => sum + f.potential_savings, 0);
  // Exact to the cent: the headline must equal the sum of the amounts shown beneath it, never a rounded variant.
  return round2(fromFindings + excludedCategoryOvercharge);
}
