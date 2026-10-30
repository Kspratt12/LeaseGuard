/**
 * Dispute-letter tests. Run: npx tsx src/services/__tests__/dispute-letter.test.ts
 *
 * The letter is built from the REAL audit engine output on the fictional fixtures and
 * checked for the properties that matter: no invented amounts, quotations, legal
 * citations, deadlines or guarantees; consistent totals; paid-only access.
 */
delete process.env.ANTHROPIC_API_KEY;
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service";

import assert from "node:assert";
import { formatMoney } from "../../lib/format";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { unzipSync, strFromU8 } from "fflate";
import { buildDisputeLetter, letterToDocx, letterToPdf, toWinAnsi } from "../dispute-letter";

const FIX = path.join(__dirname, "fixtures");
let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

async function textToPdf(text: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Courier);
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 68) {
    const page = pdf.addPage([612, 792]);
    lines.slice(i, i + 68).forEach((l, j) =>
      page.drawText(l.replace(/[^\x20-\x7E]/g, "-"), { x: 36, y: 756 - j * 10.5, size: 8, font }),
    );
  }
  return Buffer.from(await pdf.save());
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const QUOTED = /: "([^"\n]+)"/g;

async function main() {
  const { validateDocuments, extractTextFromPdf } = await import("../document-validator");
  const { runAudit } = await import("../audit-logic");

  const lease = await textToPdf(fs.readFileSync(path.join(FIX, "lease-high-confidence.txt"), "utf-8"));
  const recon = await textToPdf(fs.readFileSync(path.join(FIX, "recon-high-confidence.txt"), "utf-8"));
  const validation = await validateDocuments(lease, recon);
  // Values the AI extraction step supplies in production (see savings.test.ts)
  validation.leaseFields.adminFeePercentage = "15";
  validation.reconFields.adminFeePercentage = "18";
  if (!validation.reconFields.lineItems.some((i) => /management fee/i.test(i.category))) {
    validation.reconFields.lineItems.push({ category: "Management Fee", amount: "100,897.20", rawLine: "Management Fee (18%)  $91,080.00  $100,897.20" });
  }
  validation.reconFields.lineItems = validation.reconFields.lineItems.filter((i) => !/roof repair/i.test(i.category));
  validation.reconFields.lineItems.push({ category: "Roof Repair", amount: "24,500.00", rawLine: "Roof Repair   $0.00   $24,500.00" });
  const result = await runAudit(validation);
  const all = [...result.free_findings, ...result.paid_findings];

  const letter = buildDisputeLetter({
    findings: all,
    overchargeBreakdown: result.overcharge_breakdown,
    leaseClausesSummary: result.leaseClausesSummary,
  });
  console.log("\n--- generated letter (fictional fixture) ---\n" + letter.text + "\n--- end ---\n");

  await test("letter total equals the audit headline total (savings_estimate)", () => {
    assert.strictEqual(letter.total, result.savings_estimate);
    assert.ok(letter.text.includes(`Total of the items above: $${result.savings_estimate.toLocaleString("en-US")}`));
  });

  await test("every quotation is verbatim text extracted from the customer's documents", () => {
    const evidence = [
      ...all.flatMap((f) => f.sourceEvidence ?? []),
      ...result.overcharge_breakdown.flatMap((r) => (r.sourceEvidence ? [r.sourceEvidence] : [])),
    ].map((e) => norm(e.extractedText));
    const quotes = [...letter.text.matchAll(QUOTED)].map((m) => m[1]);
    assert.ok(quotes.length > 0, "expected at least one quotation");
    for (const q of quotes) {
      assert.ok(evidence.some((e) => e.includes(q) || q.includes(e.slice(0, 300))), `quotation not found in evidence: ${q.slice(0, 80)}`);
    }
  });

  await test("every dollar amount traces to a finding, a statement line, or the total", () => {
    const descriptions = all.map((f) => f.description).join(" ");
    const money = (n: number, cents = false) =>
      "$" + n.toLocaleString("en-US", cents ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 });
    const allowed = new Set<string>([money(result.savings_estimate), formatMoney(result.savings_estimate)]);
    for (const f of all) { allowed.add(money(f.potential_savings)); allowed.add(formatMoney(f.potential_savings)); }
    for (const r of result.overcharge_breakdown) { allowed.add(money(r.total_expense, true)); allowed.add(money(r.tenant_charge, true)); }
    const lettersWithoutQuotes = letter.text.replace(QUOTED, ": ");
    for (const m of lettersWithoutQuotes.matchAll(/\$[\d,]+(?:\.\d{2})?/g)) {
      assert.ok(allowed.has(m[0]) || descriptions.includes(m[0]), `unexplained amount ${m[0]}`);
    }
  });

  await test("no legal citations, statutes, deadlines or guarantees are invented", () => {
    const body = letter.text.replace(QUOTED, ": ");
    for (const bad of [/U\.S\.C/i, /§/, /\bstatute/i, /\bcase law\b/i, /\bCivil Code\b/i, /within \d+ (calendar |business )?days/i, /\bguarantee/i, /\bwill recover\b/i, /\bentitled to\b/i, /\blegally (required|obligated)\b/i]) {
      assert.ok(!bad.test(body), `forbidden wording: ${bad}`);
    }
  });

  await test("the letter never calls amounts recoverable or confirmed overcharges", () => {
    assert.ok(!/recoverable|(?<!not a )confirmed overcharge/i.test(letter.text.replace(QUOTED, ": ")));
  });

  await test("unknown facts are placeholders for the customer, not guesses", () => {
    for (const p of ["[Date]", "[Your name]", "[response date]", "[period or year]", "[lease date]"]) {
      assert.ok(letter.text.includes(p), `missing placeholder ${p}`);
    }
    assert.ok(letter.placeholders.length >= 5);
  });

  await test("questions without a proven amount are under 'clarify', never 'adjustment'", () => {
    for (const it of letter.items.filter((i) => i.kind === "clarify")) assert.strictEqual(it.amount, null);
    const capFinding = all.find((f) => f.category === "CAM Cap Review: Prior-Year Data Needed");
    assert.ok(capFinding, "expected the data-needed CAM cap finding");
    assert.ok(letter.items.some((i) => i.kind === "clarify" && i.title === capFinding!.category));
    const adjustmentSection = letter.text.split("ITEMS I ASK YOU TO CLARIFY")[0];
    assert.ok(!adjustmentSection.includes("CAM Cap"));
  });

  await test("excluded-category dollars are listed once (breakdown row), not also as a finding", () => {
    const roofItems = letter.items.filter((i) => /roof/i.test(i.title));
    assert.strictEqual(roofItems.length, 1);
    assert.strictEqual(roofItems[0].amount, 1979.6);
  });

  await test("an audit with no findings still yields a safe letter with total 0", () => {
    const empty = buildDisputeLetter({ findings: [], overchargeBreakdown: [], leaseClausesSummary: null });
    assert.strictEqual(empty.total, 0);
    assert.ok(!empty.text.includes("POSSIBLE ADJUSTMENT"));
  });

  await test("audit-rights wording appears only when the lease actually contains it", () => {
    const base = { findings: [], overchargeBreakdown: [] };
    const without = buildDisputeLetter({ ...base, leaseClausesSummary: null });
    const withClause = buildDisputeLetter({
      ...base,
      leaseClausesSummary: { camCap: null, adminFeeCap: null, managementFeeCap: null, tenantProRataShare: null, tenantSquareFootage: null, buildingSquareFootage: null, excludedCategories: [], additionalClauses: ["Tenant audit rights provision"] },
    });
    assert.ok(!without.text.includes("audit-rights language"));
    assert.ok(withClause.text.includes("audit-rights language"));
  });

  // --- exports ---
  await test("PDF export contains the edited text and survives smart quotes and emoji", async () => {
    const edited = "Dear Ms. Alvarez — “quoted” text … 😀\nSecond line";
    const pdf = await letterToPdf(edited);
    assert.strictEqual(Buffer.from(pdf).subarray(0, 5).toString(), "%PDF-");
    const text = (await extractTextFromPdf(Buffer.from(pdf))).text;
    assert.ok(text.includes("Dear Ms. Alvarez") && text.includes("Second line"));
    assert.strictEqual(toWinAnsi("‘a’"), "'a'");
  });
  await test("long letters wrap and paginate", async () => {
    const long = Array.from({ length: 200 }, (_, i) => `Line ${i} ${"word ".repeat(30)}`).join("\n");
    const doc = await PDFDocument.load(await letterToPdf(long));
    assert.ok(doc.getPageCount() > 3);
  });
  await test("DOCX export is a valid Word package containing the edited text", async () => {
    const edited = "RE: Test letter\n\nITEMS I ASK YOU TO CLARIFY\n   indented line with \u201Csmart quotes\u201D & ampersand\nEdited by customer.";
    const bytes = await letterToDocx(edited);
    assert.deepStrictEqual(Array.from(bytes.subarray(0, 2)), [0x50, 0x4b], "zip signature PK");
    const files = unzipSync(bytes);
    for (const required of ["[Content_Types].xml", "word/document.xml", "_rels/.rels"]) {
      assert.ok(files[required], `missing ${required}`);
    }
    const xml = strFromU8(files["word/document.xml"]);
    assert.ok(xml.includes("Edited by customer."), "edited text is in the document");
    assert.ok(xml.includes("&amp; ampersand"), "ampersand is XML-escaped");
    assert.ok(/<w:b\/>/.test(xml), "all-caps heading is bold");
    assert.ok(/xml:space="preserve"/.test(xml), "leading spaces preserved");
  });
  await test("DOCX export treats markup in the text as plain text", async () => {
    const xml = strFromU8(unzipSync(await letterToDocx('<script>alert(1)</script> <w:p>'))["word/document.xml"]);
    assert.ok(!xml.includes("<script>") && xml.includes("&lt;script&gt;"));
  });
  await test("the EDITED text (not the original draft) is what the DOCX and PDF contain", async () => {
    const original = letter.text;
    const edited = original.replace("[Your name]", "Pat Tenant") + "\nPS: customer edit 7731";
    const docxXml = strFromU8(unzipSync(await letterToDocx(edited))["word/document.xml"]);
    assert.ok(docxXml.includes("Pat Tenant") && docxXml.includes("customer edit 7731"));
    const pdfText = (await extractTextFromPdf(Buffer.from(await letterToPdf(edited)))).text;
    assert.ok(pdfText.includes("Pat Tenant") && pdfText.includes("customer edit 7731"));
    assert.ok(!docxXml.includes("[Your name]"));
  });

  // --- access control ---
  const ID = "123e4567-e89b-12d3-a456-426614174000";
  const { GET, POST } = await import("../../app/api/audit/[id]/letter/route");
  const ctx = { params: Promise.resolve({ id: ID }) };
  await test("letter draft: no credentials => 401", async () => {
    assert.strictEqual((await GET(new NextRequest("http://localhost/x"), ctx)).status, 401);
  });
  await test("letter draft: forged token => 401 and no content", async () => {
    const res = await GET(new NextRequest("http://localhost/x", { headers: { authorization: "Bearer forged" } }), ctx);
    assert.strictEqual(res.status, 401);
    assert.ok(!(await res.text()).includes("Dear"));
  });
  await test("letter export: no credentials => 401 (not a free PDF converter)", async () => {
    const res = await POST(new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify({ text: "hi", format: "pdf" }) }), ctx);
    assert.strictEqual(res.status, 401);
  });

  console.log(`\n${passed} passed, 0 failed`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
