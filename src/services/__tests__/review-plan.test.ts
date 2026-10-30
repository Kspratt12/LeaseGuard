/** CAM Review Plan. Run: npx tsx src/services/__tests__/review-plan.test.ts */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import React from "react";
// @ts-expect-error the react-dom type package is not installed; the module itself is
import { renderToStaticMarkup } from "react-dom/server";
import { PDFDocument } from "pdf-lib";
import type { Finding, OverchargeLineItem } from "../audit-logic";
import { buildReviewPlan, planMoney, ruleFor, PLAN_CAUTION, RANKING_RULE, TIER_ORDER } from "../review-plan";
import { buildDisputeLetter } from "../dispute-letter";
import { generateReportPdf } from "../report-pdf";
import { ReviewPlanPanel } from "../../components/review-plan";
import {
  SAMPLE_PLAN_BREAKDOWN, SAMPLE_PLAN_CLAUSES, SAMPLE_PLAN_FINDINGS, SAMPLE_TOTAL, SAMPLE_ROWS,
} from "../../components/home/sample-data";

let n = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  await fn();
  n++;
  console.log("  ✓", name);
}

const F = (o: Partial<Finding> & { category: string }): Finding => ({ description: "d", potential_savings: 0, severity: "medium", ...o });
const ROW = (o: Partial<OverchargeLineItem> = {}): OverchargeLineItem => ({ category: "roof repair", total_expense: 24500, tenant_share_percent: 8.08, tenant_charge: 1979.6, reason: "Excluded Expense", ...o });
const EV = (page: number | null, text = "quoted text") => [{ document: "lease.pdf", page, extractedText: text }];

/** Every sentence the plan composes itself (not the engine's own description or the customer's quotes). */
function ownText(plan: ReturnType<typeof buildReviewPlan>): string {
  return [
    plan.caution, plan.rankingRule, plan.confidenceNote ?? "", ...plan.topActions,
    ...plan.checklist.flatMap((g) => [g.title, ...g.steps]),
    ...plan.items.flatMap((i) => [i.tierLabel, i.whyRanked, i.evidenceLabel, ...i.calculation, ...i.questions, ...i.documents]),
  ].join("\n");
}
const BANNED = /\b(owed|you owe|illegal|unlawful|fraud\w*|breach(es|ed)?|entitled|guarantee[ds]?|will (recover|receive|get back)|must (pay|refund|reimburse)|lawsuit|sue|violat\w*|deadlines?|statutes?|law requires|required by law|waive[sd]?)\b/i;

(async () => {
  const SAMPLE = buildReviewPlan({ findings: SAMPLE_PLAN_FINDINGS, overchargeBreakdown: SAMPLE_PLAN_BREAKDOWN, leaseClausesSummary: SAMPLE_PLAN_CLAUSES, confidence: "high" });

  await t("ordering: calculated, then judgment, then needs-information, then matches; larger amounts first", () => {
    const plan = buildReviewPlan({
      findings: [
        F({ category: "Tenant share (matches lease)", severity: "low" }),
        F({ category: "CAM Cap Review: Prior-Year Data Needed", insufficientData: true }),
        F({ category: "Admin Fee Above Lease Cap", potential_savings: 500, sourceEvidence: EV(2).map((e) => ({ ...e })) }),
        F({ category: "Pro-Rata Share Mismatch", potential_savings: 900, severity: "high", sourceEvidence: EV(1) }),
        F({ category: "Possible Gross-Up / Occupancy Adjustment", potential_savings: 5000 }),
      ],
      overchargeBreakdown: [ROW()],
      leaseClausesSummary: null,
    });
    assert.deepEqual(plan.items.map((i) => i.tier), ["calculated", "calculated", "judgment", "judgment", "needs-data", "match"]);
    assert.deepEqual(plan.items.slice(0, 2).map((i) => i.title), ["Pro-Rata Share Mismatch", "Admin Fee Above Lease Cap"]);
    assert.deepEqual(plan.items.slice(2, 4).map((i) => i.title), ["Possible Gross-Up / Occupancy Adjustment", "Excluded expense: roof repair"]);
    assert.deepEqual(plan.items.map((i) => i.rank), [1, 2, 3, 4, 5, 6]);
    assert.ok(plan.items[0].whyRanked.includes("largest amount"));
    assert.ok(plan.items[1].whyRanked.includes("2nd of 2"));
    assert.equal(plan.rankingRule, RANKING_RULE);
  });

  await t("ties break by severity, then by whether source text and a page were found, then by title", () => {
    const plan = buildReviewPlan({
      findings: [
        F({ category: "Admin Fee Above Lease Cap", potential_savings: 100, severity: "medium" }),
        F({ category: "Pro-Rata Share Mismatch", potential_savings: 100, severity: "high" }),
        F({ category: "Potential CAM Cap Exceedance", potential_savings: 100, severity: "high", sourceEvidence: EV(3) }),
      ],
      overchargeBreakdown: [],
      leaseClausesSummary: null,
    });
    assert.deepEqual(plan.items.map((i) => i.title), ["Potential CAM Cap Exceedance", "Pro-Rata Share Mismatch", "Admin Fee Above Lease Cap"]);
  });

  await t("every finding category the audit engine can produce has a specific template (the engine source is scanned)", () => {
    const src = fs.readFileSync(path.join(__dirname, "../audit-logic.ts"), "utf8");
    const cats = new Set<string>();
    // finding categories only: "findingCategory" values are evidence labels, not findings
    for (const m of src.matchAll(/^\s+category:\s*"([^"]+)"/gm)) cats.add(m[1]);
    assert.ok(cats.size >= 15, `expected many categories, found ${cats.size}`);
    const expected: Record<string, string> = {
      "Admin Fee Above Lease Cap": "fee", "Admin Fee Compliance": "fee", "Admin Fee Review": "fee", "Administrative Fee Cap Exceeded": "fee",
      "CAM Cap Review: Prior-Year Data Needed": "cap", "Potential CAM Cap Exceedance": "cap", "CAM Cap Within Limit": "cap", "CAM Cap Exceeded": "cap", "CAM Cap Compliance": "cap",
      "Year-over-Year CAM Increase Detected": "cap", "Year-over-Year CAM Escalation Exceeds Lease Cap": "cap", "Year-over-Year CAM Change (Multi-Year)": "cap",
      "Pro-Rata Share Mismatch": "share", "Pro-Rata Share Review": "share",
      "CAM Allocation Discrepancy": "allocation", "Tenant Allocation Discrepancy": "allocation",
      "Excluded Category Billed": "excluded", "Expense Category Review": "category", "Reconciliation Totals": "totals",
      "Possible Gross-Up / Occupancy Adjustment": "gross-up", "Document Review Summary": "documents",
    };
    for (const c of cats) {
      const r = ruleFor(c);
      assert.ok(r.specific, `no template for engine category: ${c}`);
      if (expected[c]) assert.equal(r.rule.topic, expected[c], `${c} mapped to ${r.rule.topic}`);
    }
    for (const c of Object.keys(expected)) if (!cats.has(c)) console.log(`    note: "${c}" is in the expectation table but no longer in the engine`);
  });

  await t("an unknown category still gets a safe, plain fallback and a tier from the data, not a guess", () => {
    const plan = buildReviewPlan({ findings: [F({ category: "Something New", potential_savings: 0, severity: "low" })], overchargeBreakdown: [], leaseClausesSummary: null });
    assert.equal(plan.items[0].tier, "match");
    assert.equal(ruleFor("Something New").specific, false);
    assert.equal(plan.items[0].questions.length, 0);
  });

  await t("insufficient-data items never carry a dollar amount, even if the data says otherwise", () => {
    const plan = buildReviewPlan({
      findings: [F({ category: "Pro-Rata Share Review", insufficientData: true, potential_savings: 777 })],
      overchargeBreakdown: [],
      leaseClausesSummary: null,
    });
    assert.equal(plan.items[0].tier, "needs-data");
    assert.equal(plan.items[0].amount, null);
    assert.ok(!/777/.test(ownText(plan)));
    assert.equal(plan.calculatedTotal + plan.judgmentTotal, 0);
  });

  await t("matches have no amount, no questions and no documents to request", () => {
    const m = SAMPLE.items.find((i) => i.tier === "match")!;
    assert.equal(m.amount, null);
    assert.deepEqual(m.questions, []);
    assert.deepEqual(m.documents, []);
  });

  await t("calculation steps: excluded expense shows statement line, share and the multiplication when it agrees", () => {
    const roof = SAMPLE.items.find((i) => i.title === "Excluded expense: roof repair")!;
    assert.deepEqual(roof.calculation.slice(0, 3), [
      "Your statement bills $24,500 for roof repair.",
      "Your share of operating expenses is 8.08%.",
      "$24,500 x 8.08% = $1,979.60, your portion of this charge.",
    ]);
    assert.ok(roof.calculation.some((s) => s.includes("potential discrepancy to review, not a confirmed overcharge")));
  });

  await t("calculation steps: if the multiplication does not agree with the reported charge, the plan reports the figure and does not show false arithmetic", () => {
    const p = buildReviewPlan({ findings: [], overchargeBreakdown: [ROW({ tenant_charge: 1500 })], leaseClausesSummary: null });
    assert.ok(p.items[0].calculation.includes("The report shows your portion as $1,500."));
    assert.ok(!p.items[0].calculation.some((s) => s.includes(" x 8.08% = ")));
  });

  await t("calculation steps: lease terms and the share arithmetic appear only when the lease data was found", () => {
    const withData = buildReviewPlan({ findings: [F({ category: "Pro-Rata Share Mismatch", potential_savings: 300 })], overchargeBreakdown: [], leaseClausesSummary: SAMPLE_PLAN_CLAUSES });
    assert.ok(withData.items[0].calculation.some((s) => s.includes("4,200 sq ft divided by 52,000 sq ft is 8.08%")));
    const without = buildReviewPlan({ findings: [F({ category: "Admin Fee Review", severity: "low" })], overchargeBreakdown: [], leaseClausesSummary: null });
    assert.deepEqual(without.items[0].calculation, []);
  });

  await t("every item carries the report's own description unchanged and its evidence", () => {
    const fee = SAMPLE.items.find((i) => i.title === "Admin Fee Above Lease Cap")!;
    assert.equal(fee.whatWeFound, SAMPLE_PLAN_FINDINGS[0].description);
    assert.equal(fee.evidenceStrength, "text-and-page");
    assert.equal(fee.evidence.length, 2);
    assert.ok(fee.documents.some((d) => d.includes("lease.pdf, page 2")));
  });

  await t("questions and documents exist for every item that needs action", () => {
    for (const i of SAMPLE.items.filter((x) => x.tier === "calculated" || x.tier === "judgment")) {
      assert.ok(i.questions.length >= 1, `${i.title}: no questions`);
      assert.ok(i.documents.length >= 1, `${i.title}: no documents`);
    }
  });

  await t("prohibited wording: the plan says nothing is owed, illegal, guaranteed or time-limited, and 'overcharge' only as 'not confirmed'", () => {
    const plans = [SAMPLE, buildReviewPlan({ findings: [], overchargeBreakdown: [], leaseClausesSummary: null })];
    for (const c of ["Admin Fee Above Lease Cap", "Excluded Category Billed", "Pro-Rata Share Mismatch", "Potential CAM Cap Exceedance", "Tenant Allocation Discrepancy", "Possible Gross-Up / Occupancy Adjustment", "Year-over-Year CAM Escalation Exceeds Lease Cap", "Reconciliation Totals", "Expense Category Review", "Document Review Summary", "CAM Cap Review: Prior-Year Data Needed", "Admin Fee Review"]) {
      plans.push(buildReviewPlan({ findings: [F({ category: c, potential_savings: 250, severity: "high", sourceEvidence: EV(4) })], overchargeBreakdown: [ROW()], leaseClausesSummary: SAMPLE_PLAN_CLAUSES, confidence: "low" }));
      plans.push(buildReviewPlan({ findings: [F({ category: c, insufficientData: true })], overchargeBreakdown: [], leaseClausesSummary: SAMPLE_PLAN_CLAUSES }));
    }
    for (const p of plans) {
      const text = ownText(p);
      assert.ok(!BANNED.test(text), `banned wording: ${BANNED.exec(text)?.[0]}`);
      for (const m of text.matchAll(/overcharge\w*/gi)) {
        const before = text.slice(Math.max(0, m.index! - 24), m.index!);
        assert.ok(/not (a )?confirmed $/i.test(before), `"overcharge" used without "not confirmed": ...${before}${m[0]}`);
      }
    }
    assert.ok(/not legal or accounting advice/.test(PLAN_CAUTION) && /not confirmed overcharges/.test(PLAN_CAUTION));
    assert.ok(/does not replace reading your lease/.test(PLAN_CAUTION));
  });

  await t("no deadlines or durations are generated: the checklist tells the tenant to check the lease", () => {
    const text = ownText(SAMPLE);
    assert.ok(/Check your lease for any notice or audit-request time limits/.test(text));
    assert.ok(!/\b\d+\s*(days?|months?|business days)\b/i.test(text));
  });

  await t("sample plan: the same fictional figures as the table, totals reconcile, order is sensible", () => {
    assert.equal(SAMPLE.calculatedTotal, 1358.75);
    assert.equal(SAMPLE.judgmentTotal, 1979.6);
    assert.equal(Math.round((SAMPLE.calculatedTotal + SAMPLE.judgmentTotal) * 100), SAMPLE_TOTAL);
    assert.deepEqual(SAMPLE.items.map((i) => i.title), ["Admin Fee Above Lease Cap", "Excluded expense: roof repair", "CAM Cap Review: Prior-Year Data Needed", "Tenant share (matches lease)"]);
    assert.equal(SAMPLE_ROWS.filter((r) => r.status === "review").length, 2);
    assert.deepEqual(SAMPLE.tierCounts, { calculated: 1, judgment: 1, "needs-data": 1, match: 1 });
  });

  await t("consistent with the dispute letter: same adjustments, same questions", () => {
    const letter = buildDisputeLetter({ findings: SAMPLE_PLAN_FINDINGS, overchargeBreakdown: SAMPLE_PLAN_BREAKDOWN, leaseClausesSummary: SAMPLE_PLAN_CLAUSES });
    const adj = letter.items.filter((i) => i.kind === "adjustment");
    const qs = letter.items.filter((i) => i.kind === "clarify");
    const withAmount = SAMPLE.items.filter((i) => (i.tier === "calculated" || i.tier === "judgment") && i.amount != null && i.amount > 0);
    assert.equal(adj.length, withAmount.length);
    assert.equal(qs.length, SAMPLE.items.filter((i) => i.tier === "needs-data").length);
    for (const a of adj) assert.ok(withAmount.some((i) => i.amount === a.amount), `letter amount ${a.amount} missing from the plan`);
  });

  await t("empty and single-item inputs behave", () => {
    const empty = buildReviewPlan({ findings: [], overchargeBreakdown: [], leaseClausesSummary: null });
    assert.equal(empty.empty, true);
    assert.deepEqual(empty.items, []);
    assert.deepEqual(empty.tierCounts, { calculated: 0, judgment: 0, "needs-data": 0, match: 0 });
    const one = buildReviewPlan({ findings: [F({ category: "Admin Fee Above Lease Cap", potential_savings: 10 })], overchargeBreakdown: [], leaseClausesSummary: null });
    assert.equal(one.items.length, 1);
    assert.ok(!one.items[0].whyRanked.includes("largest"), "no 'largest' claim for a group of one");
    assert.equal(planMoney(1358.75), "$1,358.75");
    assert.equal(planMoney(1359), "$1,359");
    assert.deepEqual(TIER_ORDER, ["calculated", "judgment", "needs-data", "match"]);
  });

  await t("panel renders the plan, the caution and the checklist, with no banned wording", () => {
    const html = renderToStaticMarkup(React.createElement(ReviewPlanPanel, { plan: SAMPLE, sample: true }));
    assert.ok(html.includes("CAM Review Plan"));
    assert.ok(html.includes("Fictional example"));
    assert.ok(html.includes("not legal or accounting advice"));
    assert.ok(html.includes("One-page checklist and action summary"));
    assert.ok(html.includes("Questions you could ask your landlord"));
    const text = html.replace(/<[^>]+>/g, " ");
    assert.ok(!BANNED.test(text.replace(SAMPLE_PLAN_FINDINGS[1].description, "")), `banned wording in the rendered panel: ${BANNED.exec(text)?.[0]}`);
    const empty = renderToStaticMarkup(React.createElement(ReviewPlanPanel, { plan: buildReviewPlan({ findings: [], overchargeBreakdown: [], leaseClausesSummary: null }) }));
    assert.ok(empty.includes("no findings to organize"));
  });

  const hex = (s: string) => Buffer.from(s, "latin1").toString("hex").toUpperCase();
  /** All page content streams, inflated, as text. pdf-lib writes text as hex strings, so callers search with hex(). */
  const pdfText = (b: Buffer) => {
    const raw = b.toString("latin1");
    let out = raw;
    let from = 0;
    for (;;) {
      const s = raw.indexOf("stream", from);
      if (s < 0) break;
      const start = raw[s + 6] === "\r" ? s + 8 : s + 7;
      const end = raw.indexOf("endstream", start);
      if (end < 0) break;
      try {
        out += "\n" + zlib.inflateSync(Buffer.from(raw.slice(start, end), "latin1")).toString("latin1");
      } catch {
        /* not a compressed stream */
      }
      from = end + 9;
    }
    return out.toUpperCase();
  };
  const base = {
    auditId: "11111111-1111-4111-8111-111111111111", createdAt: "2026-11-01T00:00:00Z", savingsEstimate: 3339,
    freeFindings: SAMPLE_PLAN_FINDINGS, paidFindings: [], estimatedOvercharge: 1979.6,
    overchargeBreakdown: SAMPLE_PLAN_BREAKDOWN, leaseClausesSummary: SAMPLE_PLAN_CLAUSES, confidence: "high" as const, confidenceScore: 82,
  };

  await t("PDF: the paid report contains the review plan pages; the unpaid report does not", async () => {
    const paid = await generateReportPdf({ ...base, isPaid: true });
    const free = await generateReportPdf({ ...base, isPaid: false });
    const pd = await PDFDocument.load(paid), fd = await PDFDocument.load(free);
    assert.ok(pd.getPageCount() > fd.getPageCount(), "the paid PDF should have the extra plan pages");
    const raw = pdfText(paid), rawFree = pdfText(free);
    assert.ok(raw.includes(hex("CAM Review Plan")), "plan title missing from the paid PDF");
    assert.ok(raw.includes(hex("One-page checklist and action summary")));
    assert.ok(raw.includes(hex("Your items, in priority order")));
    assert.ok(!rawFree.includes(hex("CAM Review Plan")), "the unpaid PDF must not contain the plan");
  });

  await t("PDF: survives smart quotes, emoji and an empty plan", async () => {
    const odd = { ...base, isPaid: true, freeFindings: [F({ category: "Admin Fee Above Lease Cap", description: "It’s “quoted” — and has an emoji 🙂", potential_savings: 10 })], overchargeBreakdown: [] };
    const pdf = await generateReportPdf(odd);
    assert.ok((await PDFDocument.load(pdf)).getPageCount() >= 2);
    const none = await generateReportPdf({ ...base, isPaid: true, freeFindings: [], paidFindings: [], overchargeBreakdown: [], estimatedOvercharge: 0, savingsEstimate: 0 });
    assert.ok(pdfText(none).includes(hex("CAM Review Plan")));
  });

  await t("access: the plan adds no route and no data access; it renders only from already-authorised data inside the unlocked branch, and the PDF section sits under isPaid", () => {
    const apiDir = path.join(__dirname, "../../app/api");
    const routes: string[] = [];
    (function walk(d: string) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) walk(f);
        else if (e.name === "route.ts") routes.push(path.relative(apiDir, f).replace(/\\/g, "/"));
      }
    })(apiDir);
    assert.ok(!routes.some((r) => /plan/i.test(r)), "no review-plan route should exist");
    const page = fs.readFileSync(path.join(__dirname, "../../app/audit/[id]/page.tsx"), "utf8");
    assert.ok(/\{unlocked && \(\s*<ReviewPlanPanel/.test(page), "the plan must render only when the report is unlocked");
    const pdfSrc = fs.readFileSync(path.join(__dirname, "../report-pdf.ts"), "utf8");
    assert.ok(/if \(input\.isPaid\) \{\s*drawReviewPlanPages/.test(pdfSrc), "the PDF plan must be inside an isPaid check");
    for (const f of ["../review-plan.ts", "../review-plan-pdf.ts", "../../components/review-plan.tsx"]) {
      const s = fs.readFileSync(path.join(__dirname, f), "utf8");
      assert.ok(!/createServiceClient|supabase|fetch\(|anthropic|\.from\("/i.test(s), `${f}: must not touch the database, network or AI`);
    }
  });

  console.log(`review-plan: ${n} passed, 0 failed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
