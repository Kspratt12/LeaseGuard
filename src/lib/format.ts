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

/**
 * Money for display: whole dollars when there are no cents ("$1,359"), otherwise exactly two decimals ("$1,979.60").
 * It never rounds to whole dollars, so a total always equals the amounts listed beneath it.
 */
export function formatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "$0";
  const cents = Math.round(n * 100);
  const dollars = cents / 100;
  return cents % 100 === 0
    ? `$${dollars.toLocaleString("en-US")}`
    : `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The one explanation of how the amounts in a report add up. Each finding's amount is rounded to the nearest dollar when
 * it is calculated; excluded-expense rows are kept to the cent; the headline total is the exact sum of what is shown
 * (see totalSavings). Shown wherever a total appears, in the same words.
 */
export const ROUNDING_NOTE =
  "How the amounts add up: each finding's amount is rounded to the nearest dollar when it is calculated, while excluded-expense rows are shown to the cent. The total is the exact sum of the amounts shown, so it can include cents.";

/** Shorter form for the dispute letter, which goes to the landlord. */
export const ROUNDING_NOTE_SHORT =
  "Amounts are rounded to the nearest dollar unless cents are shown. The total is the exact sum of the amounts listed.";
