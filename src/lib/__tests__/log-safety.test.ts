/**
 * Application logs must not contain what the customer uploaded or what we calculated from it: dollar amounts,
 * expense categories, document text, file names, AI output, or the text of an exception.
 *
 * Three layers:
 *  1. errorInfo/stackFrames never reproduce an exception message.
 *  2. A static scan of every server-side console call in the code.
 *  3. A real run (extraction, validation, audit, OCR failure paths, PDF) on fictional documents, with ALL console
 *     output captured and searched for the documents' amounts, categories and sentences.
 *
 * Run: npx tsx src/lib/__tests__/log-safety.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { errorInfo, stackFrames } from "../safe-log";

const SRC = path.join(__dirname, "../..");
let n = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  await fn();
  n++;
  process.stdout.write(`  ✓ ${name}\n`);
}

(async () => {
  await t("errorInfo and stackFrames keep the error type and code but never the message", () => {
    const secret = "Key (stripe_session_id)=(cs_live_ABC) $24,500 Roof Repair tenant@example.invalid";
    const e = Object.assign(new Error(secret), { code: "23505", status: 409 });
    const info = errorInfo(e);
    assert.equal(info, "Error code=23505 status=409");
    assert.ok(!info.includes("24,500") && !info.includes("Roof") && !info.includes("tenant"));
    const frames = stackFrames(e);
    assert.ok(!frames.includes("24,500") && !frames.includes("Roof") && !frames.includes("tenant"), "the stack's first line is the message");
    assert.ok(frames === "" || /^at /.test(frames));
    // hostile "code" and "name" values are not echoed
    assert.equal(errorInfo(Object.assign(new Error("x"), { code: "has spaces and $24,500", name: "Roof Repair!" })), "Error");
    assert.equal(errorInfo("a string with $5,000"), "non-error value");
    assert.equal(errorInfo(null), "unknown error");
  });

  await t("static scan: no server-side console call prints a message, raw error, amount, file name or JSON of data", () => {
    const walk = (d: string, out: string[] = []) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== "__tests__") walk(f, out); }
        else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(f);
      }
      return out;
    };
    const offenders: string[] = [];
    for (const f of walk(SRC)) {
      const src = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
      if (/^\s*["']use client["']/.test(src)) continue; // runs in the customer's own browser, not in our logs
      if (f.endsWith(path.join("lib", "safe-log.ts"))) continue;
      for (const m of src.matchAll(/console\.(?:log|warn|error|info)\(([\s\S]*?)\);/g)) {
        const call = m[1];
        const uses = (re: RegExp) => re.test(call.replace(/errorInfo\([^)]*\)/g, "").replace(/stackFrames\([^)]*\)/g, ""));
        const bad =
          uses(/\.message\b/) ||
          uses(/\.stack\b/) ||
          uses(/,\s*(err|error|e|\w+Err|\w+Error|\w+Exception)\s*$/) ||
          uses(/,\s*(err|error|e|\w+Err|\w+Error)\s*,?\s*$/) ||
          uses(/\.toLocaleString|\$\$\{|\bformatMoney\(/) ||
          uses(/\b(lease|recon|extra|file|f|doc)\.name\b/) ||
          (/JSON\.stringify/.test(call) && !/bufferSize/.test(call) && !/validation\.issues/.test(call));
        if (bad) offenders.push(`${path.relative(SRC, f).replace(/\\/g, "/")}: console.${m[0].slice(8, 12)}… ${call.replace(/\s+/g, " ").slice(0, 90)}`);
      }
    }
    assert.deepEqual(offenders, [], "a console call can leak document or financial data");
  });

  // ── a real run on fictional documents, capturing every console line ──
  const logged: string[] = [];
  for (const m of ["log", "warn", "error", "info"] as const) {
    console[m] = (...a: unknown[]) => {
      logged.push(a.map((x) => (typeof x === "string" ? x : x instanceof Error ? `${x.name}: ${x.message}` : JSON.stringify(x))).join(" "));
    };
  }
  const FIX = path.join(__dirname, "../../services/__tests__/fixtures");
  const clean = (l: string) => l.replace(/\r/g, "").replace(/[^\x20-\x7E]/g, "-");
  const leaseLines = fs.readFileSync(path.join(FIX, "lease-high-confidence.txt"), "utf8").split("\n").map(clean);
  const reconLines = fs.readFileSync(path.join(FIX, "recon-high-confidence.txt"), "utf8").split("\n").map(clean);
  const textPdf = async (lines: string[]) => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Courier);
    for (let i = 0; i < lines.length; i += 60) {
      const page = pdf.addPage([612, 792]);
      lines.slice(i, i + 60).forEach((l, k) => page.drawText(l, { x: 36, y: 756 - k * 10.8, size: 8.5, font }));
    }
    return Buffer.from(await pdf.save());
  };

  const { validateDocuments } = await import("../../services/document-validator");
  const { runAudit } = await import("../../services/audit-logic");
  const { generateReportPdf } = await import("../../services/report-pdf");
  const leaseBuf = await textPdf(leaseLines);
  const reconBuf = await textPdf(reconLines);
  const validation = await validateDocuments(leaseBuf, reconBuf);
  validation.leaseFields.adminFeePercentage = "15";
  validation.reconFields.adminFeePercentage = "18";
  if (!validation.reconFields.lineItems.some((i) => /management fee/i.test(i.category))) {
    validation.reconFields.lineItems.push({ category: "Management Fee", amount: "100,897.20", rawLine: "Management Fee (18%)  $91,080.00  $100,897.20" });
  }
  // the AI step (off in tests) supplies this row; inject it so the excluded-expense path, which used to log categories and amounts, runs
  validation.reconFields.lineItems = validation.reconFields.lineItems.filter((i) => !/roof repair/i.test(i.category));
  validation.reconFields.lineItems.push({ category: "Roof Repair", amount: "24,500.00", rawLine: "Roof Repair   $0.00   $24,500.00" });
  const result = await runAudit(validation);
  assert.ok(result.overcharge_breakdown.length > 0, "the run must include an excluded-expense row");
  await generateReportPdf({
    auditId: "11111111-2222-3333-4444-555555555555", createdAt: "2026-11-01T00:00:00Z", savingsEstimate: result.savings_estimate,
    freeFindings: result.free_findings, paidFindings: result.paid_findings, isPaid: true, confidence: result.confidence, confidenceScore: result.confidenceScore,
    validationWarning: result.validationWarning, estimatedOvercharge: result.estimated_overcharge, overchargeBreakdown: result.overcharge_breakdown, leaseClausesSummary: result.leaseClausesSummary,
  });
  // paths that used to log exception text and statement lines
  await validateDocuments(Buffer.from("%PDF-1.4 not really a pdf $24,500 Roof Repair"), reconBuf).catch(() => undefined);
  await validateDocuments(leaseBuf, Buffer.from("garbage Management Fee (18%) 100,897.20")).catch(() => undefined);
  const { extractTextWithOcrDetailed } = await import("../../services/ocr-extractor");
  await extractTextWithOcrDetailed(Buffer.from("%PDF-1.4 broken Roof Repair $24,500")).catch(() => undefined);

  await t("the run produced log output to inspect", () => {
    assert.ok(logged.length > 20, `only ${logged.length} log lines captured`);
  });

  await t("no dollar amount from the documents or the results appears in the logs", () => {
    const blob = logged.join("\n");
    const amounts = ["100,897", "91,080", "597,080", "661,437", "53,444", "24,500", "1,979", "1979", "1,359", "1359", "40,883", "12,560", "560,540", "506,000", "11,500", "9,000"];
    for (const a of amounts) assert.ok(!blob.includes(a), `amount ${a} appears in a log line`);
    assert.ok(!/\$\s?\d/.test(blob), "a dollar figure appears in a log line");
  });

  await t("no expense category or finding name from the statement appears in the logs", () => {
    const blob = logged.join("\n").toLowerCase();
    for (const c of ["roof repair", "parking lot", "window cleaning", "management fee", "security", "landscap", "snow", "elevator", "excluded category", "admin fee above"]) {
      assert.ok(!blob.includes(c), `"${c}" appears in a log line`);
    }
  });

  await t("no sentence from the lease or statement appears in the logs", () => {
    const blob = logged.join("\n");
    const sentences = [...leaseLines, ...reconLines].map((l) => l.trim()).filter((l) => l.length >= 24);
    const hit = sentences.find((s) => blob.includes(s));
    assert.equal(hit, undefined, "a line of document text appears in the logs");
    for (const needle of ["not really a pdf", "garbage Management", "broken Roof"]) assert.ok(!blob.includes(needle), `bytes of a rejected upload appear in the logs: ${needle}`);
  });

  await t("extracted values (percentages, square footage) are logged only as found / not found", () => {
    const blob = logged.join("\n");
    assert.ok(!/8\.08|\b8\.00\b|15%|18%|\b5%/.test(blob), "a rate or share from the documents appears in the logs");
  });

  process.stdout.write(`log-safety: ${n} passed, 0 failed\n`);
  process.exit(0);
})().catch((e) => {
  process.stdout.write(String(e instanceof Error ? e.stack : e) + "\n");
  process.exit(1);
});
