/**
 * Scanned (image-only) PDF check on FICTIONAL documents.
 *
 * The invented lease and statement fixtures are drawn onto page images and wrapped in PDFs that contain NO text layer
 * (the test proves that first). They then go through the real pipeline: OCR fallback, validator, audit engine. Page
 * references and quotes are compared with the pages we drew. Unreadable inputs (malformed, blank image) must end in a
 * clear error, and nothing from the documents may reach the logs.
 *
 * This proves the OCR path on clean, synthetic page images that we generated. It does not prove anything about real
 * scans (skew, noise, stamps, fax artefacts, low resolution, handwriting) or about other OCR conditions in production.
 * The first run may download the OCR language data, so it needs network access.
 *
 * Run: npx tsx src/services/__tests__/scanned-pdf.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument, StandardFonts } from "pdf-lib";

const FIX = path.join(__dirname, "fixtures");
let n = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  await fn();
  n++;
  process.stdout.write(`  ✓ ${name}\n`);
}

const wrap = (lines: string[], width = 88): string[] =>
  lines.flatMap((l) => {
    const t = l.replace(/\r/g, "").replace(/[^\x20-\x7E]/g, "-");
    if (t.length <= width) return [t];
    const out: string[] = [];
    for (let i = 0; i < t.length; i += width) out.push(t.slice(i, i + width));
    return out;
  });
const chunk = <T,>(a: T[], size: number): T[][] => Array.from({ length: Math.ceil(a.length / size) }, (_, i) => a.slice(i * size, (i + 1) * size));

/** An image-only PDF: one page image per page, no text layer. */
async function scannedPdf(pages: string[][]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  for (const lines of pages) {
    const canvas = createCanvas(1700, 2200); // about 200 dpi, US letter
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 1700, 2200);
    ctx.fillStyle = "#000";
    ctx.font = "34px sans-serif";
    lines.forEach((l, i) => ctx.fillText(l, 100, 120 + i * 50));
    const img = await pdf.embedPng(canvas.toBuffer("image/png"));
    pdf.addPage([612, 792]).drawImage(img, { x: 0, y: 0, width: 612, height: 792 });
  }
  return Buffer.from(await pdf.save());
}

async function textPdf(pages: string[][]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Courier);
  for (const lines of pages) {
    const page = pdf.addPage([612, 792]);
    lines.slice(0, 66).forEach((l, i) => page.drawText(l, { x: 36, y: 756 - i * 10.8, size: 8.5, font }));
  }
  return Buffer.from(await pdf.save());
}

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

(async () => {
  // Capture console output for the whole run so we can prove no document text is logged.
  const logged: string[] = [];
  for (const m of ["log", "warn", "error", "info"] as const) {
    const orig = console[m].bind(console);
    console[m] = (...a: unknown[]) => {
      logged.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
      if (process.env.VERBOSE) orig(...a);
    };
  }
  const say = (s: string) => process.stdout.write(s + "\n");

  const { validateDocuments, extractTextFromPdf, UnreadableDocumentError } = await import("../document-validator");
  const { runAudit } = await import("../audit-logic");
  const { extractText } = await import("unpdf");

  const leaseLines = wrap(fs.readFileSync(path.join(FIX, "lease-high-confidence.txt"), "utf8").split("\n")).filter((l, i, a) => !(l.trim() === "" && a[i - 1]?.trim() === ""));
  const reconLines = wrap(fs.readFileSync(path.join(FIX, "recon-high-confidence.txt"), "utf8").split("\n")).filter((l, i, a) => !(l.trim() === "" && a[i - 1]?.trim() === ""));
  const leasePages = chunk(leaseLines, 40);
  const reconPages = chunk(reconLines, 40);
  say(`scanned fixtures: lease ${leasePages.length} page(s), statement ${reconPages.length} page(s)`);

  const leaseScan = await scannedPdf(leasePages);
  const reconScan = await scannedPdf(reconPages);

  await test("the scanned PDFs genuinely have no text layer", async () => {
    for (const buf of [leaseScan, reconScan]) {
      const { text } = await extractText(new Uint8Array(buf), { mergePages: true });
      assert.equal((text as string).replace(/\s/g, "").length, 0, "the image-only PDF unexpectedly contains text");
    }
  });

  await test("OCR reads each scanned page, keeps page breaks, and reports nothing left unread", async () => {
    const r = await extractTextFromPdf(leaseScan);
    assert.equal(r.method, "ocr");
    const pages = r.text.split("\f");
    assert.equal(pages.length, leasePages.length, "page count after OCR");
    assert.equal(r.ocrPagesNotRead, 0);
    assert.ok(squash(pages[0]).includes("premises") || squash(pages.join(" ")).includes("premises"));
    // wording from each drawn page shows up on that page (a distinctive line per page)
    leasePages.forEach((p, i) => {
      const line = p.map(squash).find((l) => l.length > 30) ?? "";
      assert.ok(squash(pages[i]).includes(line.slice(0, 18)), `page ${i + 1} text not found on OCR page ${i + 1}`);
    });
  });

  // ── the whole pipeline on the scans, compared with the same documents as text PDFs ──
  const scanned = await validateDocuments(leaseScan, reconScan);
  const baseline = await validateDocuments(await textPdf(leasePages), await textPdf(reconPages));

  await test("the validator treats the scans as OCR documents and finds the same key fields as the text versions", () => {
    assert.equal(scanned.leaseExtractionMethod, "ocr");
    assert.equal(scanned.reconExtractionMethod, "ocr");
    assert.equal(baseline.leaseExtractionMethod, "pdf_text");
    for (const f of ["camCapPercentage", "proRataShare"] as const) {
      assert.equal(scanned.leaseFields[f], baseline.leaseFields[f], `lease field ${f}: scan=${scanned.leaseFields[f]} text=${baseline.leaseFields[f]}`);
    }
    assert.ok(scanned.reconFields.lineItems.length >= 3, "statement line items were found in the scan");
  });

  // inject the AI-supplied fields the same way the other end-to-end tests do (no API key in tests)
  for (const v of [scanned, baseline]) {
    v.leaseFields.adminFeePercentage = "15";
    v.reconFields.adminFeePercentage = "18";
    if (!v.reconFields.lineItems.some((i) => /management fee/i.test(i.category))) {
      v.reconFields.lineItems.push({ category: "Management Fee", amount: "100,897.20", rawLine: "Management Fee (18%)  $91,080.00  $100,897.20" });
    }
  }
  const result = await runAudit(scanned);
  const baseResult = await runAudit(baseline);

  const evidence = [
    ...[...result.free_findings, ...result.paid_findings].flatMap((f) => (f.sourceEvidence ?? []).map((e) => ({ ...e, from: f.category }))),
    ...result.overcharge_breakdown.flatMap((r) => (r.sourceEvidence ? [{ ...r.sourceEvidence, from: `row:${r.category}` }] : [])),
  ];

  await test("the audit on the scans finds the same issues as on the text versions", () => {
    const cats = (r: typeof result) => [...r.free_findings, ...r.paid_findings].map((f) => f.category).sort().join("|");
    assert.equal(cats(result), cats(baseResult));
    assert.ok(result.free_findings.length + result.paid_findings.length >= 3);
  });

  await test("evidence from the scans carries a page reference that matches the page the text is on", () => {
    assert.ok(evidence.length >= 3);
    let located = 0;
    for (const e of evidence) {
      const l = pagesOfQuote(e.extractedText, leasePages);
      const t = l.size ? l : pagesOfQuote(e.extractedText, reconPages);
      if (t.size === 0) continue; // OCR noise inside the quote; cannot be matched either way
      located++;
      assert.notEqual(e.page, null, `no page reference for a quote that sits on page(s) ${[...t].join(", ")}`);
      assert.ok(t.has(e.page as number), `quote sits on page(s) ${[...t].join(", ")} but the report says ${e.page}`);
    }
    process.stdout.write(`    (${located} of ${evidence.length} quotes matched to a drawn page; reported pages: ${evidence.map((e) => e.page).join(",")})\n`);
    assert.ok(located >= Math.ceil(evidence.length * 0.6),`only ${located} of ${evidence.length} quotes could be matched to a drawn page`);
  });

  // ── mixed documents: some pages have text, some are images ──
  const mixedPdf = async (spec: Array<{ kind: "text" | "scan" | "blank"; lines?: string[] }>): Promise<Buffer> => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Courier);
    for (const p of spec) {
      if (p.kind === "scan") {
        const canvas = createCanvas(1700, 2200);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 1700, 2200); ctx.fillStyle = "#000"; ctx.font = "34px sans-serif";
        (p.lines ?? []).forEach((l, i) => ctx.fillText(l, 100, 120 + i * 50));
        const img = await pdf.embedPng(canvas.toBuffer("image/png"));
        pdf.addPage([612, 792]).drawImage(img, { x: 0, y: 0, width: 612, height: 792 });
      } else {
        const page = pdf.addPage([612, 792]);
        (p.lines ?? []).slice(0, 66).forEach((l, i) => page.drawText(l, { x: 36, y: 756 - i * 10.8, size: 8.5, font }));
      }
    }
    return Buffer.from(await pdf.save());
  };
  const AMEND = ["AMENDMENT NO. 2 (FICTIONAL TEST DOCUMENT)", "", "The administrative fee shall not exceed 15% of operating expenses.", "All other terms of the lease remain in effect."];
  const mixed = await mixedPdf([{ kind: "text", lines: leasePages[0] }, { kind: "scan", lines: AMEND }, { kind: "text", lines: leasePages[1] }]);

  await test("mixed document: the scanned page is read with OCR in the right position and the text pages are untouched", async () => {
    const r = await extractTextFromPdf(mixed);
    const pages = r.text.split("\f");
    assert.equal(pages.length, 3);
    assert.equal(r.method, "pdf_text");
    assert.deepEqual(r.ocrPagesAdded, [2]);
    assert.deepEqual(r.pagesWithoutText, []);
    assert.ok(squash(pages[1]).includes("administrativefeeshallnotexceed15"), "scanned page text is on page 2");
    assert.ok(!squash(pages[0]).includes("administrativefeeshallnotexceed15") && !squash(pages[2]).includes("amendmentno2"));
    assert.ok(squash(pages[0]).includes(squash(leasePages[0].find((l) => l.trim().length > 30) ?? "")));
  });

  await test("mixed document: a page with nothing readable is reported by number, and the audit still runs on the rest", async () => {
    const withBlank = await mixedPdf([{ kind: "text", lines: leasePages[0] }, { kind: "blank" }, { kind: "text", lines: leasePages[1] }]);
    const r = await extractTextFromPdf(withBlank);
    assert.deepEqual(r.pagesWithoutText, [2]);
    const v = await validateDocuments(withBlank, reconScan);
    assert.ok(v.issues.some((i) => i.field === "pages_unreadable" && /Page 2 of your lease had no readable text/.test(i.message)), "the warning names the page");
  });

  await test("a scan longer than the OCR page limit says how many pages were not read", async () => {
    const long = await scannedPdf(Array.from({ length: 10 }, (_, i) => [`Page ${i + 1} of a long invented lease. The cap is 5% per year.`, "Tenant pays its pro rata share of operating expenses."]));
    const r = await extractTextFromPdf(long);
    assert.equal(r.method, "ocr");
    assert.equal(r.ocrPagesTotal, 10);
    assert.equal(r.ocrPagesNotRead, 2);
    const v = await validateDocuments(long, reconScan);
    assert.ok(v.issues.some((i) => i.field === "ocr_partial" && /2 of 10 pages were not processed/.test(i.message)), "the partial read is disclosed");
  });

  // ── unreadable inputs must fail clearly, never produce an audit ──
  const blankScan = await scannedPdf([[""], [""]]);
  const garbage = Buffer.from("this is not a pdf at all, just some bytes ".repeat(40));
  const truncated = leaseScan.subarray(0, Math.floor(leaseScan.length / 3));
  const goodText = await textPdf(leasePages);

  await test("a blank scanned page fails with the scan message, not an empty audit", async () => {
    await assert.rejects(() => validateDocuments(blankScan, reconScan), (e: unknown) => e instanceof UnreadableDocumentError && /scanned or image-only/.test(e.message) && /lease/.test(e.message));
  });
  await test("a malformed file fails with a clear message", async () => {
    await assert.rejects(() => validateDocuments(garbage, reconScan), (e: unknown) => e instanceof UnreadableDocumentError && /lease/.test((e as Error).message));
  });
  await test("a truncated PDF fails with a clear message", async () => {
    await assert.rejects(() => validateDocuments(goodText, truncated), (e: unknown) => e instanceof UnreadableDocumentError && /reconciliation statement/.test((e as Error).message));
  });
  await test("the error messages contain no document text and no file names", () => {
    const m = new UnreadableDocumentError("lease", true).message + new UnreadableDocumentError("lease", false).message;
    assert.ok(!/\.pdf|Suite|Tenant/i.test(m));
  });

  await test("a normal single-page text PDF still goes through the text path (no OCR)", async () => {
    const r = await extractTextFromPdf(await textPdf([leaseLines.slice(0, 40)]));
    assert.equal(r.method, "pdf_text");
    assert.equal(r.ocrTriggered, false);
  });

  await test("nothing from the documents was written to the logs", () => {
    const needles = [...new Set([...leaseLines, ...reconLines].map((l) => l.trim()).filter((l) => l.length >= 28))].slice(0, 400);
    const blob = logged.join("\n");
    const hit = needles.find((x) => blob.includes(x));
    assert.equal(hit, undefined, "a line of document text appeared in the logs");
  });

  say(`scanned-pdf: ${n} passed, 0 failed`);
  process.exit(0);
})().catch((e) => {
  process.stdout.write(String(e instanceof Error ? e.stack : e) + "\n");
  process.exit(1);
});
