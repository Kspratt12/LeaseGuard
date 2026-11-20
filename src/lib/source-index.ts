/**
 * "Where to look": every quotation the audit took from the customer's documents, grouped by document and page, so the
 * customer can open their own copy and check each item. Pure: no I/O.
 *
 * Only what the audit actually recorded is listed: document name, page when the text had page breaks, and the quoted
 * excerpt. There are no text coordinates, so nothing claims a position on the page, and the source files are not read
 * back from storage (src/lib/__tests__/privacy-guards.test.ts), so there is no link to them.
 */
import type { Finding, OverchargeLineItem, SourceEvidence } from "@/services/audit-logic";

export interface SourceQuote { item: string; quote: string }
export interface SourcePage { page: number | null; quotes: SourceQuote[] }
export interface SourceDocument { document: string; pages: SourcePage[] }

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export function buildSourceIndex(findings: Finding[], breakdown: OverchargeLineItem[]): SourceDocument[] {
  const docs = new Map<string, Map<number | null, SourceQuote[]>>();
  const add = (item: string, e: SourceEvidence | undefined) => {
    if (!e || typeof e.document !== "string" || typeof e.extractedText !== "string" || !clean(e.extractedText)) return;
    const page = typeof e.page === "number" && Number.isInteger(e.page) && e.page > 0 ? e.page : null;
    const doc = clean(e.document) || "Document";
    const pages = docs.get(doc) ?? new Map();
    const list = pages.get(page) ?? [];
    const quote = clean(e.extractedText).slice(0, 300);
    if (!list.some((q: SourceQuote) => q.quote === quote && q.item === item)) list.push({ item, quote });
    pages.set(page, list);
    docs.set(doc, pages);
  };
  for (const f of findings) if (f && Array.isArray(f.sourceEvidence)) for (const e of f.sourceEvidence) add(f.category, e);
  for (const r of breakdown) if (r) add(`Excluded expense: ${r.category}`, r.sourceEvidence);
  return [...docs.entries()].map(([document, pages]) => ({
    document,
    // numbered pages in order, then quotes whose page was not recorded
    pages: [...pages.entries()].sort(([a], [b]) => (a == null ? 1 : b == null ? -1 : a - b)).map(([page, quotes]) => ({ page, quotes })),
  }));
}
