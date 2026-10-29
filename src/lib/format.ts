/** Display helpers shared by the interface. Pure, so they can be tested. */

/** 4900 -> "$49", 14950 -> "$149.50". Returns null when there is no price. */
export function formatUsdFromCents(cents: number | null | undefined): string | null {
  if (cents == null || !Number.isFinite(cents) || cents < 0) return null;
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars.toLocaleString("en-US")}`
    : `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatYears(years: number | null | undefined): string | null {
  if (years == null || !Number.isInteger(years) || years < 1) return null;
  return years === 1 ? "1 year" : `${years} years`;
}
