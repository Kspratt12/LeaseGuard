/**
 * The amount of findings that are locked until purchase is ALREADY part of the total shown on the page and in the PDF
 * (the total is the sum of every finding). This sentence says so; it must never read as an amount on top of the total.
 */
export function lockedAmountNote(amount: string): string {
  return `Already included in the total shown: ${amount}, from these findings.`;
}
