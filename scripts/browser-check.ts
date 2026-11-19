/**
 * LOCAL-ONLY browser check of the production build, with fictional documents.
 *
 * The app runs unchanged (`next start`, no server secrets). This harness intercepts the BROWSER's calls to /api/* inside
 * Playwright and answers them with the app's own server-side pure functions (engine, containment, corrections, letters,
 * PDF) over an in-memory fictional audit, so no database, storage, payment, email or AI service exists or is contacted.
 * The "signed-in" session is a fake token placed only in the test browser's localStorage; requests to the placeholder
 * Supabase URL are answered locally. Nothing here is reachable from, or shipped with, the application.
 *
 * Run (after `next build` and `next start -p 3100` with placeholder NEXT_PUBLIC_* values):
 *   PLAYWRIGHT_BROWSERS_PATH=<dir> LG_PW=<playwright install dir> npx tsx scripts/browser-check.ts
 */
delete process.env.ANTHROPIC_API_KEY;
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";

const BASE = process.env.LG_BASE ?? "http://127.0.0.1:3100";
const SUPA = "http://127.0.0.1:59999";
const OUT = process.env.LG_SHOTS ?? path.join(process.cwd(), "..", "browser-shots");
const AUDIT_ID = "4b7f0c2e-9d1a-4c3b-8e5f-0a1b2c3d4e5f";
const USER = { id: "11111111-1111-4111-8111-111111111111", email: "tenant@example.invalid" };
const pwReq = createRequire(path.join(process.env.LG_PW ?? "", "node_modules", "_"));
// Playwright is NOT a project dependency (installed separately), so it is typed loosely here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Page = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { chromium } = pwReq("playwright") as { chromium: any };

const results: Array<{ name: string; ok: boolean; note?: string }> = [];
async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, note: e instanceof Error ? e.message.split("\n")[0] : String(e) });
    console.log(`  ✗ ${name}: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  }
}

async function textToPdf(text: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Courier);
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 68) {
    const page = pdf.addPage([612, 792]);
    lines.slice(i, i + 68).forEach((l, j) => page.drawText(l.replace(/[^\x20-\x7E]/g, "-"), { x: 36, y: 756 - j * 10.5, size: 8, font }));
  }
  return Buffer.from(await pdf.save());
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const FIX = path.join(process.cwd(), "src", "services", "__tests__", "fixtures");
  const { validateDocuments } = await import("../src/services/document-validator");
  const { runAudit } = await import("../src/services/audit-logic");
  const { containLegacyAudit } = await import("../src/lib/legacy-containment");
  const { applyInputOverrides, listCorrectableInputs, mergeOverrides, validateCorrections } = await import("../src/lib/input-overrides");
  const { toPublicAudit } = await import("../src/lib/audit-access");
  const { decidePurchase, purchaseInputFromRow, publicPurchase } = await import("../src/lib/purchase-eligibility");
  const { buildDisputeLetter, letterToDocx, letterToPdf } = await import("../src/services/dispute-letter");
  const { buildDocumentRequest } = await import("../src/services/document-request");
  const { parseAuditRights } = await import("../src/lib/audit-rights");
  const { generateReportPdf } = await import("../src/services/report-pdf");
  const { extractTextFromPdf } = await import("../src/services/document-validator");

  // ── the fictional audit: statement bills 10.00% against a lease share of 8.08% ──
  const recon = fs.readFileSync(path.join(FIX, "recon-high-confidence.txt"), "utf-8")
    .replace("Tenant's Pro-Rata Share: 8.08%", "Tenant's Pro-Rata Share: 10.00%")
    .replace("Tenant's Share (8.08%)                                 $53,444.13", "Tenant's Share (10.00%)                                $66,143.72")
    .replace("Total CAM charges for your suite: $53,444.13", "Total CAM charges for your suite: $66,143.72");
  const r = await runAudit(await validateDocuments(await textToPdf(fs.readFileSync(path.join(FIX, "lease-high-confidence.txt"), "utf-8")), await textToPdf(recon)), { leaseDocName: "Fictional-Lease.pdf", reconDocName: "Fictional-Statement-2024.pdf" });
  const stored: Record<string, unknown> = {
    id: AUDIT_ID, owner_id: USER.id, status: "completed", created_at: "2026-11-19T12:00:00Z",
    savings_estimate: r.savings_estimate, free_findings: r.free_findings, paid_findings: r.paid_findings,
    estimated_overcharge: r.estimated_overcharge, overcharge_breakdown: r.overcharge_breakdown,
    lease_clauses_summary: r.leaseClausesSummary, confidence: r.confidence, confidence_score: r.confidenceScore,
    validation_warning: r.validationWarning, audit_mode: r.auditMode, was_swapped: false, recon_year_count: 1,
  };
  const state = { unlocked: false, overrides: null as import("../src/lib/input-overrides").InputOverrides | null, failInputs: false, failLetter: 0 };
  const seen: Array<{ url: string; body: string }> = [];

  const shown = () => {
    const c = containLegacyAudit({ ...stored });
    return state.unlocked && state.overrides ? applyInputOverrides(c, state.overrides) : c;
  };
  const auditJson = () => {
    const row = shown();
    const pub = toPublicAudit(row, row.paid_findings, { unlocked: state.unlocked, tier: "single", amountCents: 4900, reportAvailable: true });
    return { ...pub, purchase: publicPurchase(decidePurchase(purchaseInputFromRow(stored))), payment_review: null };
  };
  const inputsJson = () => {
    const base = containLegacyAudit({ ...stored });
    const s = applyInputOverrides(base, state.overrides);
    return { available: true, inputs: listCorrectableInputs(base, state.overrides), savings_estimate: s.savings_estimate, corrections: (s.lease_clauses_summary as { inputCorrections?: unknown }).inputCorrections ?? null };
  };

  const browser = await chromium.launch();
  const newPage = async (viewport: { width: number; height: number }) => {
    const ctx = await browser.newContext({ viewport, acceptDownloads: true });
    await ctx.addInitScript(([key, session]: string[]) => { try { localStorage.setItem(key, session); } catch {} }, [
      "sb-127-auth-token",
      JSON.stringify({ access_token: "fake-local-token", refresh_token: "fake", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id: USER.id, email: USER.email, aud: "authenticated", role: "authenticated" } }),
    ]);
    // Block everything that is not the local app (fonts are self-hosted by next/font at build time).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.route("**/*", async (route: any) => {
      const u = new URL(route.request().url());
      if (u.origin === SUPA) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: USER.id, email: USER.email, aud: "authenticated" }) });
      if (u.origin !== new URL(BASE).origin) return route.fulfill({ status: 204, body: "" });
      if (!u.pathname.startsWith("/api/")) return route.continue();
      const method = route.request().method();
      const json = (status: number, body: unknown) => { const b = JSON.stringify(body); seen.push({ url: `${method} ${u.pathname}`, body: b }); return route.fulfill({ status, contentType: "application/json", body: b }); };
      if (u.pathname === `/api/audit/${AUDIT_ID}` && method === "GET") return json(200, auditJson());
      if (u.pathname === "/api/audits") return json(200, [{ id: AUDIT_ID, created_at: stored.created_at, status: "completed", savings_estimate: shown().savings_estimate, headline_unavailable: false, years: 1, price_cents: 4900, unlocked: state.unlocked, purchasable: true }]);
      if (u.pathname === `/api/audit/${AUDIT_ID}/inputs`) {
        if (!state.unlocked) return json(402, { error: "Payment required" });
        if (state.failInputs) return json(500, { error: "boom" });
        if (method === "GET") return json(200, inputsJson());
        const body = route.request().postDataJSON() as { values: Record<string, unknown> };
        const base = containLegacyAudit({ ...stored });
        const inputs = listCorrectableInputs(base, state.overrides);
        const checked = validateCorrections(inputs, body.values);
        if (!checked.ok) return json(400, { error: checked.errors.join(" ") });
        state.overrides = mergeOverrides(state.overrides, inputs, checked.changes, new Date().toISOString());
        return json(200, inputsJson());
      }
      if (u.pathname === `/api/audit/${AUDIT_ID}/letter`) {
        if (!state.unlocked) return json(402, { error: "Payment required" });
        if (state.failLetter > 0) { state.failLetter--; return json(500, { error: "Failed" }); }
        const a = shown();
        const findings = [...(a.free_findings as never[]), ...(a.paid_findings as never[])];
        if (method === "GET") {
          const l = buildDisputeLetter({ findings, overchargeBreakdown: a.overcharge_breakdown as never, leaseClausesSummary: a.lease_clauses_summary as never });
          const req = buildDocumentRequest({ findings, overchargeBreakdown: a.overcharge_breakdown as never, leaseClausesSummary: a.lease_clauses_summary as never });
          return json(200, { text: l.text, total: l.total, totalNote: l.totalNote, headlineTotal: a.savings_estimate, placeholders: l.placeholders, items: l.items, coverageNote: null, auditRights: parseAuditRights((a.lease_clauses_summary as { auditRights?: unknown }).auditRights), documentRequest: { text: req.text, items: req.items, placeholders: req.placeholders, citesLeaseClause: req.citedClause != null } });
        }
        const b = route.request().postDataJSON() as { text: string; format: string; kind?: string };
        const bytes = b.format === "docx" ? await letterToDocx(b.text) : await letterToPdf(b.text);
        const name = `LeaseGuard-${b.kind === "documents" ? "Document-Request" : "Dispute-Letter"}-${AUDIT_ID.slice(0, 8)}.${b.format}`;
        return route.fulfill({ status: 200, body: Buffer.from(bytes), headers: { "Content-Type": b.format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf", "Content-Disposition": `attachment; filename="${name}"` } });
      }
      if (u.pathname === `/api/audit/${AUDIT_ID}/report`) {
        if (!state.unlocked) return json(402, { error: "Payment required" });
        const a = shown();
        const pdf = await generateReportPdf({ auditId: AUDIT_ID, createdAt: String(a.created_at), savingsEstimate: a.savings_estimate as number, freeFindings: a.free_findings as never, paidFindings: a.paid_findings as never, isPaid: true, confidence: a.confidence as never, confidenceScore: a.confidence_score as never, validationWarning: a.validation_warning as never, estimatedOvercharge: a.estimated_overcharge as number, overchargeBreakdown: a.overcharge_breakdown as never, leaseClausesSummary: a.lease_clauses_summary as never });
        return route.fulfill({ status: 200, body: Buffer.from(pdf), headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="LeaseGuard-CAM-Audit-${AUDIT_ID.slice(0, 8)}.pdf"` } });
      }
      return json(404, { error: "Not found (local harness)" });
    });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    page.on("console", (m: any) => { if (m.type() === "error") errors.push(m.text()); });
    return { ctx, page, errors };
  };

  const noOverflow = async (page: Page, label: string) => {
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
    assert.ok(o.sw <= o.w + 1, `${label}: page scrolls sideways (${o.sw}px content in a ${o.w}px window)`);
  };
  const labelled = async (page: Page, label: string) => {
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll("input,select,textarea")]
        .filter((el) => (el as HTMLInputElement).type !== "hidden")
        .filter((el) => !(el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) && !el.closest("label") && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby"))
        .map((el) => el.outerHTML.slice(0, 80)),
    );
    assert.deepEqual(bad, [], `${label}: form fields without a label`);
    const dup = await page.evaluate(() => { const ids = [...document.querySelectorAll("[id]")].map((e) => e.id); return ids.filter((x, i) => ids.indexOf(x) !== i); });
    assert.deepEqual(dup, [], `${label}: duplicate ids`);
  };
  const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

  for (const vp of [{ name: "desktop", width: 1280, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
    console.log(`\n[${vp.name} ${vp.width}x${vp.height}]`);
    state.unlocked = false; state.overrides = null;
    const { ctx, page, errors } = await newPage(vp);

    await step(`${vp.name}: homepage names the commercial-tenant CAM purpose, no sideways scroll`, async () => {
      await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
      const h1 = (await page.locator("h1").first().innerText()).toLowerCase();
      assert.ok(/cam|common area|lease/.test(h1), `h1: ${h1}`);
      await noOverflow(page, "home");
      await shot(page, `${vp.name}-home`);
    });

    await step(`${vp.name}: reconciliation calculator example, result and reset`, async () => {
      await page.goto(`${BASE}/cam-calculator`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Load a fictional example" }).click();
      await page.getByText("Your share of the pool").waitFor();
      await noOverflow(page, "cam-calculator");
      await labelled(page, "cam-calculator");
      await shot(page, `${vp.name}-cam-calculator`);
      await page.getByRole("button", { name: "Clear" }).click();
      await page.getByText("Enter your expenses and share to see the calculation.").waitFor();
    });

    await step(`${vp.name}: cap calculator shows the four readings ($5,292.50 / $3,850.00 / $1,750.00 / $2,000.00)`, async () => {
      await page.goto(`${BASE}/cam-cap-calculator`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Load a fictional example" }).first().click();
      const box = page.locator("text=The same figures under each way of measuring").locator("..");
      const t = await box.innerText();
      for (const s of ["$5,292.50", "$3,850.00", "$1,750.00", "$2,000.00"]) assert.ok(t.includes(s), `missing ${s}`);
      await page.getByRole("radio", { name: /Cumulative, compounding/ }).check();
      await page.getByText(/Base \$100,000\.00 x \(1 \+ 5%\)\^2 = \$110,250\.00/).waitFor();
      await noOverflow(page, "cap-calculator");
      await labelled(page, "cap-calculator");
      await shot(page, `${vp.name}-cap-calculator`);
      await page.locator("[aria-live=polite]").first().screenshot({ path: path.join(OUT, `${vp.name}-el-cap-results.png`) });
    });

    await step(`${vp.name}: cap calculator refuses a missing year and an out-of-range cap`, async () => {
      await page.locator("#y-1").fill("2023");
      await page.getByText(/Years must be consecutive/).waitFor();
      await page.locator("#y-1").fill("2022");
      await page.locator("#cap-pct").fill("150");
      await page.getByText(/between 0% and 100%/).waitFor();
      await page.locator("#cap-pct").fill("5");
    });

    await step(`${vp.name}: base-year tab computes $4,964.13 for the example and states its assumptions`, async () => {
      await page.getByRole("tab", { name: "Base year or expense stop" }).click();
      await page.getByRole("button", { name: "Load a fictional example" }).click();
      await page.getByText("$4,964.13").first().waitFor();
      await page.getByText(/enter grossed-up figures for both years; this calculation does not adjust for occupancy/).waitFor();
    });

    await step(`${vp.name}: keyboard can reach and operate the calculator tabs`, async () => {
      await page.goto(`${BASE}/cam-cap-calculator`, { waitUntil: "networkidle" });
      await page.getByRole("tablist", { name: "Calculator" }).waitFor({ state: "visible" });
      const tab = page.getByRole("tab", { name: "Base year or expense stop" });
      try { await tab.focus({ timeout: 10000 }); } catch (e) { await shot(page, `${vp.name}-FAIL-tabs`); throw e; }
      await page.keyboard.press("Enter");
      assert.equal(await tab.getAttribute("aria-selected"), "true");
    });

    await step(`${vp.name}: locked audit preview shows the corrected share amount and no paid-only clause data`, async () => {
      await page.goto(`${BASE}/audit/${AUDIT_ID}`, { waitUntil: "networkidle" });
      await page.getByText("Tenant Allocation Discrepancy").first().waitFor({ timeout: 20000 });
      const body = await page.locator("body").innerText();
      assert.ok(body.includes("$12,700"), "share amount on the preview");
      assert.ok(!body.includes("$5,086"), "old headline must not appear");
      const apiBody = seen.filter((s) => s.url === `GET /api/audit/${AUDIT_ID}`).pop()!.body;
      assert.ok(!apiBody.includes("auditRights"), "paid-only clause data in the unpaid response");
      await noOverflow(page, "audit-locked");
      await shot(page, `${vp.name}-audit-locked`);
    });

    state.unlocked = true;
    await step(`${vp.name}: unlocked audit shows the corrections panel and the source index`, async () => {
      await page.goto(`${BASE}/audit/${AUDIT_ID}`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Check the figures used" }).waitFor({ timeout: 20000 });
      await page.getByRole("heading", { name: "Where to look in your documents" }).waitFor();
      await page.getByText("Fictional-Statement-2024.pdf").first().waitFor();
      await labelled(page, "audit-unlocked");
      await noOverflow(page, "audit-unlocked");
      await shot(page, `${vp.name}-audit-unlocked`);
    });

    await step(`${vp.name}: a bad correction is refused with a message; a valid one recalculates the page`, async () => {
      const field = page.locator('[id="ic-share.expectedShare"]');
      await field.fill("abc");
      await page.getByRole("button", { name: "Save corrections" }).click();
      await page.getByText(/Enter a number for: Your share under the lease/).waitFor();
      await field.fill("9");
      await page.getByRole("button", { name: "Save corrections" }).click();
      await page.getByText("Saved. The results above were recalculated.").waitFor();
      await page.getByText("Results on this page use your corrections.").waitFor();
      await page.waitForFunction(() => document.body.innerText.includes("$6,614"), undefined, { timeout: 20000 });
      const body = await page.locator("body").innerText();
      assert.ok(!/\$12,700(?!\.)/.test(body), "stale share amount still shown after the correction");
      await shot(page, `${vp.name}-audit-corrected`);
      await page.locator('section[aria-labelledby="ic-title"]').screenshot({ path: path.join(OUT, `${vp.name}-el-corrections.png`) });
      await page.locator('section[aria-labelledby="src-title"]').screenshot({ path: path.join(OUT, `${vp.name}-el-sources.png`) });
      await page.getByText("Tenant Allocation Discrepancy").first().locator("xpath=ancestor::*[self::article or self::li or self::div][1]").screenshot({ path: path.join(OUT, `${vp.name}-el-share-finding.png`) });
    });

    await step(`${vp.name}: the downloaded PDF report carries the corrected amounts`, async () => {
      const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF report" }).click()]);
      const file = path.join(OUT, `${vp.name}-report.pdf`);
      await dl.saveAs(file);
      const text = (await extractTextFromPdf(fs.readFileSync(file))).text.replace(/\s+/g, " ");
      assert.ok(text.includes("$6,614"), "corrected share amount in the PDF");
      assert.ok(/Recalculated with figures you corrected/.test(text), "correction notice in the PDF");
    });

    await step(`${vp.name}: letter page tabs, edits survive tab switches, date arithmetic, both exports`, async () => {
      await page.goto(`${BASE}/audit/${AUDIT_ID}/letter`, { waitUntil: "networkidle" });
      const ta = page.locator("#letter");
      await ta.waitFor({ timeout: 20000 });
      assert.ok((await ta.inputValue()).includes("$6,614"), "the letter uses the corrected amount");
      await ta.fill((await ta.inputValue()).replace("[Date]", "November 20, 2026"));
      await page.getByRole("tab", { name: "Request for documents" }).click();
      assert.ok((await ta.inputValue()).includes("REQUESTED RECORDS"));
      assert.ok((await ta.inputValue()).includes("Tenant shall have the right, at Tenant's expense, to audit"), "audit clause quoted verbatim");
      await page.getByRole("tab", { name: "Dispute letter" }).click();
      assert.ok((await ta.inputValue()).startsWith("November 20, 2026"), "the edit was kept");
      await page.getByText(/Period stated: 120 days, starting from receiving the annual reconciliation statement/).waitFor();
      await page.locator("#ar-start").fill("2025-12-31");
      await page.getByText(/120 days after the date you entered \(December 31, 2025\) is/).waitFor();
      const dateText = await page.getByText(/120 days after the date you entered \(December 31, 2025\) is/).innerText();
      assert.ok(dateText.includes("April 30, 2026"), dateText); // 2025-12-31 + 120 days (2026 not a leap year)
      await page.getByText(/not a determination of your legal deadline/).waitFor();
      for (const [btn, ext] of [["Download PDF", "pdf"], ["Download Word (.docx)", "docx"]] as const) {
        const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: btn }).click()]);
        assert.ok(dl.suggestedFilename().endsWith(`.${ext}`));
        const f = path.join(OUT, `${vp.name}-letter.${ext}`);
        await dl.saveAs(f);
        assert.ok(fs.statSync(f).size > 1000, `${ext} export is empty`);
      }
      await labelled(page, "letter");
      await noOverflow(page, "letter");
      await shot(page, `${vp.name}-letter`);
      await page.locator('section[aria-labelledby="ar-title"]').screenshot({ path: path.join(OUT, `${vp.name}-el-audit-rights.png`) });
    });

    await step(`${vp.name}: failure states: letter load error and figures load error offer a way forward`, async () => {
      state.failLetter = 1;
      await page.goto(`${BASE}/audit/${AUDIT_ID}/letter`, { waitUntil: "networkidle" });
      await page.getByRole("alert").filter({ hasText: "We could not prepare the letter" }).waitFor({ timeout: 20000 });
      state.failInputs = true;
      await page.goto(`${BASE}/audit/${AUDIT_ID}`, { waitUntil: "networkidle" });
      await page.getByText("The figures could not be loaded.").waitFor({ timeout: 20000 });
      state.failInputs = false;
      await page.getByRole("button", { name: "Try again" }).click();
      await page.getByRole("heading", { name: "Check the figures used" }).waitFor();
      await page.locator('[id="ic-share.expectedShare"]').waitFor();
    });

    await step(`${vp.name}: resetting corrections restores the document result`, async () => {
      await page.getByRole("button", { name: "Reset all to the document values" }).click();
      await page.waitForFunction(() => document.body.innerText.includes("$12,700"), undefined, { timeout: 20000 });
      assert.equal(state.overrides, null);
    });

    await step(`${vp.name}: no uncaught page errors`, async () => {
      const real = errors.filter((e) => !/Failed to load resource|status of (402|404|500)|favicon/i.test(e));
      assert.deepEqual(real, []);
    });
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter((x) => !x.ok);
  console.log(`\nbrowser-check: ${results.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
