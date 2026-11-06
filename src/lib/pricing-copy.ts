/**
 * The pricing and year-comparison disclosure, worded in ONE place so every surface that states it says the same thing.
 * It changes no price and no rule: the tier is still chosen by the number of distinct statement years found
 * (recon_year_count -> tierForYearCount in payments.ts), and the amounts still come from the payments module.
 */

/** What the $149 option is based on. */
export const TIER_YEARS_SENTENCE = "The $149 option applies when your statements cover two to five distinct years.";

/** What a year-over-year comparison is, and when it can run. */
export const COMPARISON_SENTENCE =
  "Year-over-year comparison runs only between consecutive years. A completed comparison reports the change in total charges as an observation; it is not a calculated cap claim.";

/** Why the price is not a promise that a comparison will run. */
export const PRICE_NOT_COMPARISON_SENTENCE = "The price follows the number of distinct years found, not how many comparisons could run.";

/** The full statement, for the pricing page and the terms. */
export const PRICING_DISCLOSURE = `${TIER_YEARS_SENTENCE} ${COMPARISON_SENTENCE} ${PRICE_NOT_COMPARISON_SENTENCE}`;
