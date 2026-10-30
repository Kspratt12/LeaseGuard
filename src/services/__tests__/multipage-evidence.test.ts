/**
 * Multi-page evidence check on FICTIONAL documents: the fixture lease and statement are spread over several PDF pages
 * (with boilerplate pages in between, so a clause's page number is not trivially 1), run through the real extraction and
 * audit engine, and every page reference the engine reports is compared with the page the quoted text really sits on.
 *
 * This proves the page logic on text-based multi-page PDFs that WE generated. It does not prove anything about real
 * customer documents, other PDF producers, or scanned files (see scripts/local-scanned-pdf-check.ts for the OCR path).
 *
 * Run: npx tsx src/services/__tests__/multipage-evidence.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";

const FIX = path.join(__dirname, "fixtures");
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
let n = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  await fn();
  n++;
  console.log("  ✓", name);
}

const FILLER = [
  "ARTICLE 9. GENERAL PROVISIONS (FICTIONAL TEST DOCUMENT)",
  "",
  "9.1 Notices. All notices shall be in writing and delivered by hand or by certified mail to the",
  "addresses stated on the first page of this Lease.",
  "9.2 Governing law. This invented document is governed by the laws of the fictional State of Test.",
  "9.3 Counterparts. This Lease may be executed in counterparts, each of which is an original.",
  "9.4 Headings. Headings are for convenience only and do not affect interpretation.",
  "9.5 Severability. If any provision is held unenforceable the remainder continues in effect.",
  "9.6 Waiver. A waiver of any default is not a waiver of any other default.",
  "9.7 Entire agreement. This Lease is the entire agreement of the parties on its subject.",
];

async function pdfFromPages(pages: string[][]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Courier);
  for (const lines of pages) {
    const page = pdf.addPage([612, 792]);
    lines.slice(0, 66).forEach((l, i) => page.drawText(l.replace(/[^\x20-\x7E]/g, "-"), { x: 36, y: 756 - i * 10.8, size: 8.5, font }));
  }
  return Buffer.from(await pdf.save());
}

(async () => {
  const { validateDocuments } = await import("../document-validator");
  const { runAudit } = await import("../audit-logic");

  const leaseLines = fs.readFileSync(path.join(FIX, "lease-high-confidence.txt"), "utf8").split("\n");
  const reconLines = fs.readFileSync(path.join(FIX, "recon-high-confidence.txt"), "utf8").split("\n");
  // lease: cover/premises, two boilerplate pages, the operating-expense article, the rest
  const leasePages = [leaseLines.slice(0, 20), FILLER, FILLER, leaseLines.slice(20, 46), leaseLines.slice(46)];
  const reconPages = [reconLines.slice(0, 12), reconLines.slice(12, 36), reconLines.slice(36)];

  const validation = await validateDocuments(await pdfFromPages(leasePages), await pdfFromPages(reconPages));
  validation.leaseFields.adminFeePercentage = "15";
  validation.reconFields.adminFeePercentage = "18";
  if (!validation.reconFields.lineItems.some((i) => /management fee/i.test(i.category))) {
    validation.reconFields.lineItems.push({ category: "Management Fee", amount: "100,897.20", rawLine: "Management Fee (18%)  $91,080.00  $100,897.20" });
  }
  const result = await runAudit(validation);

  if (process.env.DUMP) {
    // the engine's output without page numbers, to compare before and after a change to extraction
    const strip = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (k, x) => (k === "page" ? undefined : x)));
    fs.writeFileSync(
      process.env.DUMP,
      JSON.stringify(strip({ free: result.free_findings, paid: result.paid_findings, breakdown: result.overcharge_breakdown, savings: result.savings_estimate, over: result.estimated_overcharge, clauses: result.leaseClausesSummary, conf: result.confidence, score: result.confidenceScore }), null, 1),
    );
  }

  const evidence = [
    ...[...result.free_findings, ...result.paid_findings].flatMap((f) => (f.sourceEvidence ?? []).map((e) => ({ ...e, from: f.category }))),
    ...result.overcharge_breakdown.flatMap((r) => (r.sourceEvidence ? [{ ...r.sourceEvidence, from: `row:${r.category}` }] : [])),
  ];

  /**
   * The page(s) a quote REALLY sits on, from the pages we generated. A quote is a snippet of context around the item the
   * engine searched for, so it can straddle a page break: probes from its start, middle and end are each located.
   */
  const squash = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
  const pagesOfQuote = (quote: string, pages: string[][]): Set<number> => {
    const q = squash(quote);
    const found = new Set<number>();
    if (q.length < 24) return found;
    const probes = [q.slice(0, 24), q.slice(Math.floor(q.length / 2) - 12, Math.floor(q.length / 2) + 12), q.slice(q.length - 24)];
    pages.forEach((p, i) => {
      const text = squash(p.join(" "));
      if (probes.some((pr) => text.includes(pr))) found.add(i + 1);
    });
    return found;
  };
  const truth = (e: { extractedText: string }) => {
    const l = pagesOfQuote(e.extractedText, leasePages);
    return l.size ? { doc: "lease", pages: l } : { doc: "statement", pages: pagesOfQuote(e.extractedText, reconPages) };
  };

  console.log("\n--- evidence the real engine produced for the multi-page fictional documents ---");
  for (const e of evidence) {
    const t = truth(e);
    console.log("  " + e.from.slice(0, 38).padEnd(38) + " reported page: " + String(e.page).padEnd(5) + " the quote sits on " + t.doc + " page(s): " + ([...t.pages].join(", ") || "not found"));
  }
  console.log("");

  await test("the fictional documents really are multi-page and every quote can be located in them", () => {
    assert.ok(evidence.length >= 3, "expected several evidence quotes");
    for (const e of evidence) assert.ok(truth(e).pages.size > 0, "quote not found in the generated pages: \"" + e.extractedText.slice(0, 60) + "\"");
    assert.ok(leasePages.length >= 4 && reconPages.length >= 3);
  });

  await test("every evidence quote carries a page reference, and it is a page the quoted text really sits on", () => {
    const missing = evidence.filter((e) => e.page == null);
    assert.equal(missing.length, 0, missing.length + " of " + evidence.length + " quotes have no page reference");
    for (const e of evidence) {
      const t = truth(e);
      assert.ok(t.pages.has(e.page as number), "\"" + e.extractedText.slice(0, 50) + "\" sits on " + t.doc + " page(s) " + [...t.pages].join(", ") + " but the report says page " + e.page);
    }
  });

  console.log(`multipage-evidence: ${n} passed, 0 failed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
