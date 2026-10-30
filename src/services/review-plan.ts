/**
 * CAM Review Plan: an organised, plain-language view of a paid audit's EXISTING findings.
 *
 * Built only from data the paid report already holds (findings, excluded-expense breakdown rows, lease
 * clauses, confidence). No database access and no AI calls. Rules enforced by tests:
 *  - nothing is called a confirmed overcharge, and nothing says money is owed or that conduct is unlawful;
 *  - findings flagged "insufficient data" never get a dollar amount;
 *  - no deadlines, legal citations or legal conclusions: time limits are left for the tenant to check in the lease;
 *  - every finding category the audit engine can produce has a template (the test scans the engine source);
 *  - classification is shared with the dispute letter (finding-classification.ts), so the two agree.
 */
import type { Finding, LeaseClauseSummary, OverchargeLineItem, SourceEvidence } from "@/services/audit-logic";
import { coverageOf, coverageSentence, isAiTruncated } from "@/lib/analysis-coverage";
import { findingKind, isExcludedCategoryFinding } from "@/services/finding-classification";

export type PlanTier = "calculated" | "judgment" | "needs-data" | "match";

export const TIER_ORDER: PlanTier[] = ["calculated", "judgment", "needs-data", "match"];
export const TIER_LABEL: Record<PlanTier, string> = {
  calculated: "Calculated from your documents",
  judgment: "Needs your judgment",
  "needs-data": "Needs more information",
  match: "Matches or no action needed",
};

export const PLAN_CAUTION =
  "This plan is informational. It organizes the findings in your report so you can review them. Findings are potential discrepancies to review, not confirmed overcharges, and the plan is not legal or accounting advice. It does not replace reading your lease or getting advice from a qualified professional.";

export const RANKING_RULE =
  "Items are ordered by (1) how they were reached: calculated first, then items that depend on judgment, then items that need more information, then matches; (2) the dollar amount in question, largest first; (3) the severity the report assigned; (4) whether source text and a page were found.";

export interface PlanEvidence {
  document: string;
  page: number | null;
  quote: string;
}

export type EvidenceStrength = "text-and-page" | "text-only" | "none";

export interface PlanItem {
  id: string;
  rank: number;
  tier: PlanTier;
  tierLabel: string;
  title: string;
  /** Amount in question. Null when none was worked out, and ALWAYS null for needs-data and match items. */
  amount: number | null;
  evidenceStrength: EvidenceStrength;
  evidenceLabel: string;
  whyRanked: string;
  /** The report's own description of the finding, unchanged. */
  whatWeFound: string;
  /** Plain-language steps. Empty when the report does not hold the figures needed. */
  calculation: string[];
  evidence: PlanEvidence[];
  questions: string[];
  documents: string[];
}

export interface PlanChecklistGroup {
  title: string;
  steps: string[];
}

export interface ReviewPlan {
  items: PlanItem[];
  tierCounts: Record<PlanTier, number>;
  /** Sums of amounts in question, kept separate because they are different kinds of items. */
  calculatedTotal: number;
  judgmentTotal: number;
  checklist: PlanChecklistGroup[];
  /** Up to three short next steps for the one-page action summary. */
  topActions: string[];
  confidenceNote: string | null;
  /** What the lease text yielded, so the customer can see what the checks were based on. */
  reviewed: { found: string[]; notFound: string[]; /** the AI step read only part of a long document */ aiCoverageLimited?: boolean } | null;
  caution: string;
  rankingRule: string;
  empty: boolean;
}

// ───────────────────────────── templates ─────────────────────────────

type LeaseKey = keyof LeaseClauseSummary;
interface Rule {
  topic: string;
  /** Plain description of what the check compares. */
  explains: string;
  questions: string[];
  documents: string[];
  leaseKeys: LeaseKey[];
}

const RULES: { match: RegExp; rule: Rule }[] = [
  {
    match: /gross-?up|occupancy/i,
    rule: {
      topic: "gross-up",
      explains: "Looks for signs that a variable expense may not have been adjusted for occupancy the way the lease describes.",
      questions: [
        "Were variable expenses adjusted (grossed up) for occupancy, and what occupancy percentage was used?",
        "Which lease clause permits or limits that adjustment?",
      ],
      documents: ["The lease clause on gross-up or occupancy", "The landlord's gross-up calculation (ask for it)", "The occupancy figures used (ask for them)"],
      leaseKeys: [],
    },
  },
  {
    match: /excluded/i,
    rule: {
      topic: "excluded",
      explains: "Compares a charge on your statement with the expenses your lease says may not be passed through.",
      questions: [
        "What was this charge for, and which lease provision allows it to be passed through?",
        "Was the work a routine repair or a capital improvement, and if capital, over what period is the cost spread?",
        "Can you provide the invoices and the expense detail behind this line?",
      ],
      documents: [
        "The lease list of excluded expenses",
        "Invoices and contracts for this charge (ask for them)",
        "General ledger or expense detail for this line (ask for it)",
      ],
      leaseKeys: ["excludedCategories"],
    },
  },
  {
    match: /allocation/i,
    rule: {
      topic: "allocation",
      explains: "Checks whether your share of an expense category looks consistent with the lease.",
      questions: [
        "How was my share of this expense category determined?",
        "Does this category include costs for areas or tenants outside my allocation under the lease?",
      ],
      documents: ["The lease clause that defines how expenses are allocated", "The landlord's allocation schedule (ask for it)"],
      leaseKeys: ["tenantProRataShare"],
    },
  },
  {
    match: /pro-?rata|proportionate/i,
    rule: {
      topic: "share",
      explains: "Compares the share applied on your statement with the share or square footage in your lease.",
      questions: [
        "How was my share calculated (my area divided by which total area)?",
        "Has the building's total area, or my space's measured area, changed since the lease was signed?",
      ],
      documents: [
        "The lease clause that states your share or square footage",
        "The statement lines that show the share applied",
        "The landlord's schedule of building area (ask for it)",
      ],
      leaseKeys: ["tenantProRataShare", "tenantSquareFootage", "buildingSquareFootage"],
    },
  },
  {
    match: /admin(istrative)? fee|management fee/i,
    rule: {
      topic: "fee",
      explains: "Compares the fee billed on your statement with the limit found in your lease.",
      questions: [
        "Which section of the lease sets the limit on this fee, and how was the percentage applied on the statement?",
        "What total was the fee calculated on, and does that total include or exclude the fee itself and any excluded costs?",
        "Can you provide the calculation of the fee for this year?",
      ],
      documents: [
        "The lease section on the administrative or management fee",
        "The statement lines showing the fee and the amount it was applied to",
        "The landlord's fee calculation (ask for it)",
      ],
      leaseKeys: ["adminFeeCap", "managementFeeCap"],
    },
  },
  {
    match: /cap|year-over-year|escalation/i,
    rule: {
      topic: "cap",
      explains: "Compares this year's charges with prior years and with the cap on increases in your lease.",
      questions: [
        "Which expenses does the cap apply to, and which are outside it?",
        "Is the cap measured against the prior year or a fixed base year, and does unused room carry forward?",
        "Which prior-year amounts were used to test the cap?",
      ],
      documents: [
        "The lease clause that sets the cap",
        "The prior-year CAM reconciliation statement(s)",
        "The landlord's cap calculation (ask for it)",
      ],
      leaseKeys: ["camCap"],
    },
  },
  {
    match: /reconciliation totals/i,
    rule: {
      topic: "totals",
      explains: "Looks for a total on the statement to test the other figures against.",
      questions: ["Can you provide a reconciliation summary that shows the total operating expenses?"],
      documents: ["A reconciliation summary page that shows the total (ask for it)"],
      leaseKeys: [],
    },
  },
  {
    match: /expense category review/i,
    rule: {
      topic: "category",
      explains: "Notes an expense category that may be worth asking about.",
      questions: ["Can you explain how this expense category is defined and what it includes?"],
      documents: ["The expense detail for this category (ask for it)"],
      leaseKeys: [],
    },
  },
  {
    match: /document review summary/i,
    rule: {
      topic: "documents",
      explains: "The audit could not read enough from the documents to run its checks.",
      questions: [],
      documents: ["Clearer copies of the lease and the statement (text PDFs rather than photos, where possible)"],
      leaseKeys: [],
    },
  },
];

/** Used when a category has no specific template. Kept deliberately plain. */
const FALLBACK_RULE: Rule = {
  topic: "general",
  explains: "An item the audit noted from your documents.",
  questions: ["Can you explain how this item was calculated and which lease provision applies?"],
  documents: ["The lease section and the statement lines this item refers to"],
  leaseKeys: [],
};

export function ruleFor(category: string): { rule: Rule; specific: boolean } {
  for (const r of RULES) if (r.match.test(category)) return { rule: r.rule, specific: true };
  return { rule: FALLBACK_RULE, specific: false };
}

/** Findings whose dollar amount depends on how the lease is read, even though an amount was worked out. */
const JUDGMENT_CATEGORY = /gross-?up|occupancy|allocation/i;

// ───────────────────────────── helpers ─────────────────────────────

export function reviewedSentence(r: { found: string[]; notFound: string[]; aiCoverageLimited?: boolean } | null): string | null {
  if (!r) return null;
  const list = (a: string[]) => a.join(", ");
  const found = r.found.length ? `What we read in your lease: ${list(r.found)}.` : "We could not read any of the lease terms these checks use.";
  // When the AI step read only the start of a long document, "not found" is only "not detected": the provision may be in
  // the part it did not read. Never suggest the lease omits it.
  const missing = r.notFound.length && r.aiCoverageLimited ? ` Not detected: ${list(r.notFound)}. These may be in the part of the document the AI step did not read, so not detecting a provision does not show that your lease omits it; check the lease itself.` : r.notFound.length ? ` Not found in the text we could read: ${list(r.notFound)}. That can mean the lease does not say, or that the page was unclear; check the lease itself before concluding either.` : "";
  return found + missing;
}

export function planMoney(n: number): string {
  const whole = Number.isInteger(n);
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

const SEVERITY_WEIGHT = { high: 3, medium: 2, low: 1 } as const;

function toEvidence(list: SourceEvidence[] | SourceEvidence | undefined): PlanEvidence[] {
  const arr = Array.isArray(list) ? list : list ? [list] : [];
  return arr
    .filter((e) => e && (e.extractedText || e.document))
    .map((e) => ({ document: e.document, page: e.page ?? null, quote: (e.extractedText ?? "").trim() }));
}

function uniqueEvidence(list: PlanEvidence[]): PlanEvidence[] {
  const seen = new Set<string>();
  return list.filter((e) => {
    const k = `${e.document}|${e.page}|${e.quote}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function strengthOf(ev: PlanEvidence[]): EvidenceStrength {
  if (ev.some((e) => e.quote && e.page != null)) return "text-and-page";
  if (ev.some((e) => e.quote)) return "text-only";
  return "none";
}

const STRENGTH_LABEL: Record<EvidenceStrength, string> = {
  "text-and-page": "Source text and page found",
  "text-only": "Source text found, page not located",
  none: "No source text located: check the lease and statement yourself",
};

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/** "4,200 sq ft" -> 4200; null if there is no usable number. */
const num = (v: string | null | undefined) => {
  const m = /([\d,]+(?:\.\d+)?)/.exec(v ?? "");
  const n = m ? parseFloat(m[1].replace(/,/g, "")) : NaN;
  return Number.isFinite(n) ? n : null;
};

const LEASE_LABEL: Partial<Record<LeaseKey, string>> = {
  adminFeeCap: "Administrative fee limit found in your lease",
  managementFeeCap: "Management fee limit found in your lease",
  camCap: "CAM cap on increases found in your lease",
  tenantProRataShare: "Your share found in your lease",
  tenantSquareFootage: "Your square footage found in your lease",
  buildingSquareFootage: "Building square footage found in your lease",
};

function leaseTermLines(keys: LeaseKey[], lcs: LeaseClauseSummary | null | undefined): string[] {
  if (!lcs) return [];
  const out: string[] = [];
  for (const k of keys) {
    const v = lcs[k];
    if (k === "excludedCategories") {
      if (Array.isArray(v) && v.length) out.push(`Expense categories your lease lists as excluded: ${v.slice(0, 8).join(", ")}`);
    } else if (typeof v === "string" && v.trim() && LEASE_LABEL[k]) out.push(`${LEASE_LABEL[k]}: ${v.trim()}`);
  }
  // share arithmetic only when both areas were found
  if (keys.includes("tenantSquareFootage") && keys.includes("buildingSquareFootage")) {
    const a = num(lcs.tenantSquareFootage), b = num(lcs.buildingSquareFootage);
    if (a && b && b > 0) out.push(`${a.toLocaleString("en-US")} sq ft divided by ${b.toLocaleString("en-US")} sq ft is ${((a / b) * 100).toFixed(2)}%. Compare this with the share on your statement.`);
  }
  return out;
}

interface Entry {
  key: string;
  title: string;
  tier: PlanTier;
  amount: number | null;
  severity: "high" | "medium" | "low";
  evidence: PlanEvidence[];
  category: string;
  description: string;
  row?: OverchargeLineItem;
}

// ───────────────────────────── builder ─────────────────────────────

export interface PlanInput {
  findings: Finding[];
  overchargeBreakdown: OverchargeLineItem[];
  leaseClausesSummary: LeaseClauseSummary | null | undefined;
  confidence?: "high" | "medium" | "low" | null;
}

export function buildReviewPlan(input: PlanInput): ReviewPlan {
  const { findings, overchargeBreakdown, leaseClausesSummary: lcs } = input;
  const entries: Entry[] = [];

  // Only the LEASE wording is attached to each excluded line: the finding's statement snippet is a loose slice of the
  // statement that may not contain the charged line, and the exact statement line comes from the breakdown row itself.
  const exclusionEvidence = uniqueEvidence(
    findings.filter(isExcludedCategoryFinding).flatMap((f) => toEvidence(f.sourceEvidence)).filter((e) => /lease/i.test(e.document)),
  );

  // Excluded expenses: one item per statement line, with the lease exclusion wording as extra evidence.
  overchargeBreakdown.forEach((row, i) => {
    entries.push({
      key: `row-${i}`,
      title: `Excluded expense: ${row.category}`,
      tier: "judgment",
      amount: Number.isFinite(row.tenant_charge) ? row.tenant_charge : null,
      severity: "high",
      evidence: uniqueEvidence([...toEvidence(row.sourceEvidence), ...exclusionEvidence]),
      category: "Excluded Category Billed",
      description: `This statement line was matched to a category your lease lists as excluded (reason given in the report: ${row.reason}).`,
      row,
    });
  });

  findings.forEach((f, i) => {
    const kind = findingKind(f);
    if (kind === "excluded") {
      if (overchargeBreakdown.length > 0) return; // the breakdown rows carry it
      entries.push({ key: `f-${i}`, title: f.category, tier: "judgment", amount: null, severity: f.severity, evidence: toEvidence(f.sourceEvidence), category: f.category, description: f.description });
      return;
    }
    let tier: PlanTier;
    let amount: number | null = null;
    if (kind === "adjustment") {
      tier = JUDGMENT_CATEGORY.test(f.category) ? "judgment" : "calculated";
      amount = f.potential_savings;
    } else if (kind === "clarify") {
      tier = f.insufficientData ? "needs-data" : "judgment";
    } else {
      tier = "match";
    }
    entries.push({ key: `f-${i}`, title: f.category, tier, amount, severity: f.severity, evidence: toEvidence(f.sourceEvidence), category: f.category, description: f.description });
  });

  // ── rank ──
  const sorted = entries
    .map((e) => ({ e, strength: strengthOf(e.evidence) }))
    .sort((a, b) => {
      const t = TIER_ORDER.indexOf(a.e.tier) - TIER_ORDER.indexOf(b.e.tier);
      if (t) return t;
      const am = (b.e.amount ?? -1) - (a.e.amount ?? -1);
      if (am) return am;
      const sv = SEVERITY_WEIGHT[b.e.severity] - SEVERITY_WEIGHT[a.e.severity];
      if (sv) return sv;
      const ev = ["text-and-page", "text-only", "none"].indexOf(a.strength) - ["text-and-page", "text-only", "none"].indexOf(b.strength);
      if (ev) return ev;
      return a.e.title.localeCompare(b.e.title);
    });

  const tierCounts: Record<PlanTier, number> = { calculated: 0, judgment: 0, "needs-data": 0, match: 0 };
  for (const { e } of sorted) tierCounts[e.tier]++;
  const seenInTier: Record<PlanTier, number> = { calculated: 0, judgment: 0, "needs-data": 0, match: 0 };

  const items: PlanItem[] = sorted.map(({ e, strength }, idx) => {
    const { rule } = ruleFor(e.category);
    const pos = ++seenInTier[e.tier];
    const inTier = tierCounts[e.tier];

    // why it sits here
    const amountPart =
      e.amount != null && e.amount > 0
        ? inTier === 1
          ? ` Amount in question: ${planMoney(e.amount)}.`
          : pos === 1
            ? ` It has the largest amount in question in this group (${planMoney(e.amount)}).`
            : ` Amount in question: ${planMoney(e.amount)}, ${ordinal(pos)} of ${inTier} in this group by amount.`
        : "";
    const base: Record<PlanTier, string> = {
      calculated: "Worked out from the figures in your documents, so it is listed before items that depend on interpretation.",
      judgment: "Depends on how your lease is worded or on facts you or your landlord would need to confirm, so it follows the calculated items.",
      "needs-data": "The audit could not complete this check with the documents provided, so no amount is shown. Adding the missing document would let it run.",
      match: "No discrepancy was reported for this check. It is listed for completeness.",
    };
    const sevPart = e.tier === "match" || e.tier === "needs-data" ? "" : ` The report rates it ${e.severity} severity.`;
    const whyRanked = `${base[e.tier]}${amountPart}${sevPart} ${STRENGTH_LABEL[strength]}.`;

    // calculation steps: only when the report holds the figures
    const calculation: string[] = [];
    if (e.row) {
      const r = e.row;
      calculation.push(`Your statement bills ${planMoney(r.total_expense)} for ${r.category}.`);
      calculation.push(`Your share of operating expenses is ${r.tenant_share_percent}%.`);
      const computed = Math.round(r.total_expense * (r.tenant_share_percent / 100) * 100) / 100;
      if (Math.abs(computed - r.tenant_charge) <= 1) {
        calculation.push(`${planMoney(r.total_expense)} x ${r.tenant_share_percent}% = ${planMoney(computed)}, your portion of this charge.`);
      } else {
        calculation.push(`The report shows your portion as ${planMoney(r.tenant_charge)}.`);
      }
    }
    calculation.push(...leaseTermLines(rule.leaseKeys, lcs));
    if (e.amount != null && e.amount > 0 && e.tier !== "needs-data" && e.tier !== "match") {
      calculation.push(`Amount in question: ${planMoney(e.amount)}. This is a potential discrepancy to review, not a confirmed overcharge.`);
    }
    const hasRealSteps = e.row != null || calculation.length > 1 || (calculation.length === 1 && !calculation[0].startsWith("Amount in question"));

    // documents to review: the template list plus the exact pages the report quoted
    const docs = [...rule.documents];
    for (const ev of e.evidence.filter((x) => x.page != null).slice(0, 3)) docs.push(`Re-read ${ev.document}, page ${ev.page}, where the report found this text`);

    const questions = e.tier === "match" ? [] : e.tier === "needs-data" && rule.questions.length === 0 ? [] : rule.questions;

    return {
      id: e.key,
      rank: idx + 1,
      tier: e.tier,
      tierLabel: TIER_LABEL[e.tier],
      title: e.title,
      amount: e.tier === "needs-data" || e.tier === "match" ? null : e.amount,
      evidenceStrength: strength,
      evidenceLabel: STRENGTH_LABEL[strength],
      whyRanked,
      whatWeFound: e.description.trim(),
      calculation: hasRealSteps ? calculation : [],
      evidence: e.evidence,
      questions,
      documents: e.tier === "match" ? [] : docs,
    };
  });

  const sum = (t: PlanTier) => items.filter((i) => i.tier === t).reduce((s, i) => s + (i.amount ?? 0), 0);
  const raise = items.filter((i) => i.tier === "calculated" || i.tier === "judgment");
  const needData = items.filter((i) => i.tier === "needs-data");

  // ── one-page checklist ──
  const refs = Array.from(new Set(items.flatMap((i) => i.evidence.filter((e) => e.page != null).map((e) => `${e.document}, page ${e.page}`)))).slice(0, 6);
  const checklist: PlanChecklistGroup[] = [
    {
      title: "Before you contact your landlord",
      steps: [
        refs.length
          ? `Read the parts of your documents this plan points to: ${refs.join("; ")}.`
          : "Read the lease sections on operating expenses, fees, your share, any cap, and excluded expenses.",
        `Have your lease and your reconciliation statement${needData.length ? " (and the missing documents listed below)" : ""} in front of you.`,
        "Check your lease for any notice or audit-request time limits before you act. This plan does not state any, because they depend on your lease.",
      ],
    },
    {
      title: "Items to raise, in this order",
      steps: raise.length
        ? raise.slice(0, 5).map((i) => `${i.rank}. ${i.title}${i.amount ? ` (${planMoney(i.amount)} in question)` : ""}: ${i.tierLabel.toLowerCase()}`)
        : ["The report did not flag items to raise. You can still compare the statement against your lease yourself."],
    },
    ...(needData.length
      ? [{ title: "Information that would complete the checks", steps: needData.slice(0, 4).map((i) => `${i.title}: ${i.documents.find((d) => /prior-year|summary page|clearer copies/i.test(d)) ?? i.documents[0] ?? "see the item below"}`) }]
      : []),
    {
      title: "Keep a record",
      steps: ["Keep copies of anything you send and anything you receive, with dates.", "Write down the answers you are given and who gave them."],
    },
    {
      title: "Optional next steps",
      steps: [
        "Use the dispute letter draft to organize your questions. Edit it and fill in the bracketed placeholders first.",
        "Consider having a qualified professional review the lease and these items before you send anything.",
      ],
    },
  ];

  const topActions = [
    ...raise.slice(0, 3).map((i) => `Ask about "${i.title}"${i.amount ? ` (${planMoney(i.amount)} in question)` : ""}.`),
    ...(raise.length === 0 && needData.length ? [`Add the missing information for "${needData[0].title}" so the check can run.`] : []),
  ].slice(0, 3);

  const coverage = coverageOf(lcs);
  const aiLimited = isAiTruncated(coverage);
  const confidenceNote = aiLimited
    ? `${input.confidence ? `The confidence level (${input.confidence}) reflects the data our checks could extract. It is not confidence that the whole document was analyzed. ` : ""}${coverageSentence(coverage)} Check each item against your own documents before relying on it.`
    : input.confidence
      ? `Overall confidence in this audit is ${input.confidence}. Check each item against your own documents before relying on it.`
      : null;

  const reviewed = lcs
    ? (() => {
        const rows: Array<[string, boolean]> = [
          ["CAM cap", !!lcs.camCap],
          ["administrative or management fee cap", !!(lcs.adminFeeCap || lcs.managementFeeCap)],
          ["your pro-rata share", !!lcs.tenantProRataShare],
          ["your premises and the building's square footage", !!(lcs.tenantSquareFootage && lcs.buildingSquareFootage)],
          ["expense categories the lease excludes", (lcs.excludedCategories?.length ?? 0) > 0],
        ];
        return { found: rows.filter((r) => r[1]).map((r) => r[0]), notFound: rows.filter((r) => !r[1]).map((r) => r[0]), aiCoverageLimited: aiLimited };
      })()
    : null;

  return {
    items,
    tierCounts,
    calculatedTotal: sum("calculated"),
    judgmentTotal: sum("judgment"),
    checklist,
    topActions,
    confidenceNote,
    reviewed,
    caution: PLAN_CAUTION,
    rankingRule: RANKING_RULE,
    empty: items.length === 0,
  };
}
