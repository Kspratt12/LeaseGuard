/**
 * Dispute-letter draft generated ONLY from stored, verified audit output.
 *
 * Rules (each is enforced by tests):
 *  - every amount comes from a finding or an excluded-category breakdown row;
 *  - every quotation is the exact text extracted from the customer's own documents,
 *    with its document name and page when known;
 *  - items that are only questions (no proven dollar amount) go under "clarify",
 *    never under "adjustment";
 *  - no legal citations, no statutory claims, no deadlines, no recovery guarantees:
 *    anything the system cannot know is a [bracketed placeholder] for the customer;
 *  - the letter total equals the audit's headline total (savings_estimate).
 */
import type { Finding, OverchargeLineItem, LeaseClauseSummary, SourceEvidence } from "@/services/audit-logic";
import { totalSavings } from "@/services/savings-math";

export interface LetterItem {
  kind: "adjustment" | "clarify";
  title: string;
  amount: number | null;
  /** Plain-language, system-computed explanation (figures come from the audit). */
  explanation: string;
  evidence: { document: string; page: number | null; quote: string }[];
}

export interface DisputeLetter {
  text: string;
  items: LetterItem[];
  /** Equals the audit's savings_estimate when built from the same inputs. */
  total: number;
  placeholders: string[];
}

const money = (n: number, cents = false) =>
  "$" + n.toLocaleString("en-US", cents ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 });

function evidenceOf(list: SourceEvidence[] | SourceEvidence | undefined) {
  const arr = Array.isArray(list) ? list : list ? [list] : [];
  return arr
    .filter((e) => e.extractedText && e.extractedText.trim())
    .map((e) => ({
      document: e.document,
      page: e.page ?? null,
      quote: e.extractedText.trim().replace(/\s+/g, " ").slice(0, 300),
    }));
}

/** The same quotation twice adds nothing: keep the first occurrence. */
const uniqueEvidence = <T extends { quote: string }>(list: T[]): T[] => {
  const seen = new Set<string>();
  return list.filter((e) => (seen.has(e.quote) ? false : (seen.add(e.quote), true)));
};

const isExcludedCategoryFinding = (f: Finding) => /excluded category/i.test(f.category);

export function buildDisputeLetter(input: {
  findings: Finding[];
  overchargeBreakdown: OverchargeLineItem[];
  leaseClausesSummary: LeaseClauseSummary | null;
}): DisputeLetter {
  const { findings, overchargeBreakdown, leaseClausesSummary } = input;
  const items: LetterItem[] = [];

  // Evidence for excluded categories lives on the "Excluded Category Billed" finding(s)
  // (lease exclusion wording) and on each breakdown row (the statement line).
  const exclusionEvidence = evidenceOf(
    findings.filter(isExcludedCategoryFinding).flatMap((f) => f.sourceEvidence ?? []),
  );

  // A. Calculation-backed items
  for (const row of overchargeBreakdown) {
    items.push({
      kind: "adjustment",
      title: `Excluded expense: ${row.category}`,
      amount: row.tenant_charge,
      explanation:
        `The statement bills ${money(row.total_expense, true)} for ${row.category}. ` +
        `At my pro-rata share of ${row.tenant_share_percent}%, my portion is ${money(row.tenant_charge, true)}. ` +
        `This category appears to fall within the lease's excluded expenses, so I ask that you confirm whether it was properly charged.`,
      evidence: uniqueEvidence([...evidenceOf(row.sourceEvidence), ...exclusionEvidence]),
    });
  }
  for (const f of findings) {
    if (f.insufficientData || isExcludedCategoryFinding(f) || !(f.potential_savings > 0)) continue;
    items.push({
      kind: "adjustment",
      title: f.category,
      amount: f.potential_savings,
      explanation: f.description.trim(),
      evidence: evidenceOf(f.sourceEvidence),
    });
  }

  // B. Questions: needs review, but no proven dollar amount. Low-severity $0 findings are
  //    compliance/informational notes and are left out of the letter.
  for (const f of findings) {
    if (isExcludedCategoryFinding(f)) continue;
    const isQuestion = f.insufficientData || (f.potential_savings === 0 && f.severity !== "low");
    if (!isQuestion) continue;
    items.push({
      kind: "clarify",
      title: f.category,
      amount: null,
      explanation: f.description.trim(),
      evidence: evidenceOf(f.sourceEvidence),
    });
  }

  const adjustments = items.filter((i) => i.kind === "adjustment");
  const clarifications = items.filter((i) => i.kind === "clarify");

  // Same arithmetic as the audit headline: listed findings + rounded excluded-category overcharge.
  const findingPart = adjustments.filter((i) => !i.title.startsWith("Excluded expense:"));
  const excludedPart = adjustments.filter((i) => i.title.startsWith("Excluded expense:"));
  const total = totalSavings(
    findingPart.map((i) => ({ potential_savings: i.amount ?? 0 })),
    excludedPart.reduce((s, i) => s + (i.amount ?? 0), 0),
  );

  const L: string[] = [];
  const src = (e: { document: string; page: number | null; quote: string }) =>
    `   Source: ${e.document}${e.page != null ? `, page ${e.page}` : ""}: "${e.quote}"`;

  L.push("[Date]", "", "[Landlord or property manager name]", "[Address]", "");
  L.push("Re: [Premises address / suite] - CAM reconciliation for [period or year]");
  L.push("    Lease dated [lease date]", "");
  L.push("Dear [Name]:", "");
  L.push(
    "I have reviewed the common area maintenance (CAM) reconciliation statement for [period or year] " +
      "against my lease. I am writing to ask for an explanation and, where indicated below, an adjustment. " +
      "The figures below are taken from the statement and from the lease terms identified in my review.",
    "",
  );

  if (adjustments.length) {
    L.push("ITEMS WHERE MY CALCULATION INDICATES A POSSIBLE ADJUSTMENT", "");
    adjustments.forEach((it, i) => {
      L.push(`${i + 1}. ${it.title} - ${money(it.amount ?? 0, it.title.startsWith("Excluded expense:"))}`);
      L.push(`   ${it.explanation}`);
      for (const e of it.evidence.slice(0, 3)) L.push(src(e));
      L.push("");
    });
    L.push(`Total of the items above: ${money(total)}`, "");
  }

  if (clarifications.length) {
    L.push("ITEMS I ASK YOU TO CLARIFY", "");
    clarifications.forEach((it, i) => {
      L.push(`${String.fromCharCode(65 + (i % 26))}. ${it.title}`);
      L.push(`   ${it.explanation}`);
      for (const e of it.evidence.slice(0, 3)) L.push(src(e));
      L.push("");
    });
  }

  const hasAuditClause = leaseClausesSummary?.additionalClauses?.some((c) => /audit rights/i.test(c));
  L.push("REQUEST", "");
  L.push(
    "Please send me a written response and the supporting documents for each item above (invoices, " +
      "allocation workpapers, and the calculation used) by [response date]. If any item is confirmed as " +
      "an error, please credit the amount to my account and send a corrected statement.",
  );
  L.push(
    hasAuditClause
      ? "My lease contains tenant audit-rights language; I reserve the right to review the underlying books and records under the lease."
      : "I reserve all rights under the lease, including any right to review the underlying books and records.",
    "",
  );
  L.push("Sincerely,", "", "[Your name]", "[Company]", "[Phone / email]");

  const text = L.join("\n");
  const placeholders = Array.from(new Set(text.match(/\[[^\]\n]{2,60}\]/g) ?? []));
  return { text, items, total, placeholders };
}

// ---------------------------------------------------------------------------
// Export helpers (pure, so they can be tested without a server)
// ---------------------------------------------------------------------------

/** Standard PDF fonts only encode WinAnsi; map common characters and drop the rest. */
export function toWinAnsi(input: string): string {
  return input
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\n\x20-\x7E¡-ÿ]/g, "?");
}

/**
 * A real Word document (.docx) built with the `docx` library. Each line becomes a paragraph;
 * ALL-CAPS section headings are bold. Text is passed as data, never as markup, so edited
 * text cannot inject anything.
 */
export async function letterToDocx(text: string): Promise<Uint8Array> {
  const { Document, Packer, Paragraph, TextRun } = await import("docx");
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const isHeading = (l: string) => {
    const t = l.trim();
    return t.length >= 6 && t === t.toUpperCase() && /^[A-Z]/.test(t) && !/^\s/.test(l) && /[A-Z]{3}/.test(t);
  };
  const children = lines.map(
    (line) =>
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: line, bold: isHeading(line), font: "Calibri", size: 22 })],
      }),
  );
  const doc = new Document({
    creator: "LeaseGuard",
    title: "Dispute letter draft",
    sections: [{ properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children }],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

export async function letterToPdf(text: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const size = 11;
  const lineHeight = 15;
  const margin = 64;
  const width = 612 - margin * 2;

  const wrapped: string[] = [];
  for (const raw of toWinAnsi(text).split("\n")) {
    const indent = /^\s+/.exec(raw)?.[0] ?? "";
    const words = raw.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { wrapped.push(""); continue; }
    let line = indent;
    for (const w of words) {
      const candidate = line.trim() ? `${line} ${w}` : `${indent}${w}`;
      if (font.widthOfTextAtSize(candidate, size) > width && line.trim()) {
        wrapped.push(line);
        line = `${indent}${w}`;
      } else {
        line = candidate;
      }
    }
    wrapped.push(line);
  }

  let page = pdf.addPage([612, 792]);
  let y = 792 - margin;
  for (const l of wrapped) {
    if (y < margin) { page = pdf.addPage([612, 792]); y = 792 - margin; }
    if (l) page.drawText(l, { x: margin, y, size, font });
    y -= lineHeight;
  }
  return pdf.save();
}
