/**
 * Two safeguards that sit between extraction and the audit arithmetic. Both are pure and deterministic, so a prompt
 * change cannot weaken them.
 *
 * 1. Source-line ledger. The same statement line can reach the audit under several names (the pattern reader's label plus
 *    one or more labels from the AI step). Every dollar amount must be backed by its OWN line of the statement text: an
 *    item that can only be matched to a line already backing another item is the same charge under another name and
 *    contributes nothing. Two genuine lines with identical wording and amount are two lines of text, so both count.
 *
 * 2. Prior-year baseline. A year-over-year comparison needs a figure the statement itself labels as a prior or base year
 *    total. A number that merely follows a year (for example "estimated payments received during 2025") is not one.
 */

export interface LedgerItem {
  category: string;
  amount: string;
  rawLine: string;
}

const toNumber = (raw: string): number => parseFloat(raw.replace(/[$,%\s]/g, ""));
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function numbersIn(line: string): number[] {
  const out: number[] = [];
  for (const m of line.matchAll(/(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g)) out.push(parseFloat(m[1].replace(/,/g, "")));
  return out;
}

/** Rows that summarise or settle the statement; an equal number there is a coincidence, not the source of a charge. */
const SUMMARY_LINE = /\b(total|subtotal|balance|estimated|payments?|received|due)\b/i;

const words = (s: string) => new Set((s.toLowerCase().match(/[a-z]{3,}/g) ?? []));

export interface LedgerResult {
  /** Items that each stand on their own line of the statement, in the original order. */
  kept: LedgerItem[];
  /** Items that repeat a charge already counted, or whose amount is not in the statement text at all. */
  dropped: Array<{ item: LedgerItem; why: "same_line_already_counted" | "amount_not_in_statement" }>;
}

export function dedupeBySourceLine<T extends LedgerItem>(items: T[], statementText: string): { kept: T[]; dropped: Array<{ item: T; why: "same_line_already_counted" | "amount_not_in_statement" }> } {
  const lines = statementText.split(/\r?\n|\f/).map((l) => l.trim());
  const lineNumbers = lines.map(numbersIn);
  const lineWords = lines.map(words);
  const claimed = new Set<number>();
  const kept: T[] = [];
  const dropped: Array<{ item: T; why: "same_line_already_counted" | "amount_not_in_statement" }> = [];

  for (const item of items) {
    const amount = toNumber(item.amount);
    if (!(amount > 0)) { kept.push(item); continue; } // nothing to count; leave as is

    // 1) The exact line the item was read from, when its text is verbatim in the statement.
    const raw = squash(item.rawLine);
    let idx = raw.length >= 6 ? lines.findIndex((l, i) => !claimed.has(i) && squash(l) === raw) : -1;

    // 2) Otherwise an unclaimed line that carries the amount, preferring the one that shares the most words with the label.
    if (idx < 0) {
      const w = words(item.category);
      let best = -1;
      let bestScore = -1;
      let anyLineHasAmount = false;
      lineNumbers.forEach((nums, i) => {
        if (!nums.some((n) => Math.abs(n - amount) < 0.005)) return;
        anyLineHasAmount = true;
        if (claimed.has(i) || SUMMARY_LINE.test(lines[i])) return; // a total, balance or payment row never backs an expense
        let score = 0;
        for (const t of w) if (lineWords[i].has(t)) score++;
        if (score > 0 && score > bestScore) { bestScore = score; best = i; } // an equal amount alone is not support
      });
      if (best < 0) {
        dropped.push({ item, why: anyLineHasAmount ? "same_line_already_counted" : "amount_not_in_statement" });
        continue;
      }
      idx = best;
    }
    claimed.add(idx);
    kept.push(item);
  }
  return { kept, dropped };
}

/** Words that mean a figure is a payment, estimate or balance of the CURRENT year, never a prior-year expense total. */
const NOT_A_BASELINE = /\b(estimated|estimate|payments?|paid|deposits?|budget(?:ed)?|balance|due|billed|current|share)\b/i;
const PRIOR_WORDING = /\b(?:prior|previous|preceding|last)\s+year|\bbase\s*year\b/i;

/**
 * Returns the raw prior-year figure only when the statement's own text labels that figure as a prior-year, previous-year
 * or base-year total, or as an earlier calendar year's total. Anything else returns null: no baseline, no cap comparison.
 */
export function supportedPriorYearTotal(raw: string | null | undefined, statementText: string, reconciliationYear: number | null | undefined): string | null {
  if (!raw) return null;
  const value = toNumber(raw);
  if (!(value > 0)) return null;
  for (const line of statementText.split(/\r?\n|\f/)) {
    if (!numbersIn(line).some((n) => Math.abs(n - value) < 0.005)) continue;
    if (NOT_A_BASELINE.test(line)) continue;
    if (PRIOR_WORDING.test(line)) return raw;
    const years = [...line.matchAll(/\b(20\d{2}|19\d{2})\b/g)].map((m) => Number(m[1]));
    if (reconciliationYear && years.some((y) => y < reconciliationYear)) return raw;
  }
  return null;
}
