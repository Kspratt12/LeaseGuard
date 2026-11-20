/**
 * Supporting-document request draft: a letter asking the landlord for the records behind the items the review raised.
 *
 * Built from the CAM Review Plan's own items (src/services/review-plan.ts), so the plan, the dispute letter and this
 * request cannot disagree about which items exist. Rules (enforced by src/services/__tests__/document-request.test.ts):
 *  - One numbered request per item to raise (calculated, judgment or needs-information), naming that item and the
 *    documents the plan lists for it. Matches and notes are left out. Nothing is requested for no reason.
 *  - The lease is cited only by quoting an audit-rights sentence actually found in it. Even then the letter does not
 *    claim the clause entitles the tenant to copies: it quotes the clause and asks. Without one, it is a plain request.
 *  - No deadlines, no statutes, no amounts, no accusations. Anything the software cannot know is a [placeholder].
 *  - It is a draft for the customer to edit. Nothing is sent.
 * Pure: no I/O.
 */
import type { Finding, LeaseClauseSummary, OverchargeLineItem } from "@/services/audit-logic";
import { buildReviewPlan } from "@/services/review-plan";
import { parseAuditRights, type AuditRightsClause } from "@/lib/audit-rights";

export interface DocumentRequestItem {
  title: string;
  documents: string[];
}

export interface DocumentRequest {
  text: string;
  items: DocumentRequestItem[];
  /** The audit-rights sentence quoted in the letter, when one was found. */
  citedClause: AuditRightsClause | null;
  placeholders: string[];
}

/** "Invoices for this charge (ask for them)" -> "Invoices for this charge". Lease and statement items are the tenant's own. */
const cleanDoc = (d: string) => d.replace(/\s*\((ask for (it|them))\)\s*$/i, "").trim();
const isTenantOwn = (d: string) => /^the lease\b|^the statement\b|^your\b|the prior-year cam reconciliation|clearer copies/i.test(d);

export function buildDocumentRequest(input: {
  findings: Finding[];
  overchargeBreakdown: OverchargeLineItem[];
  leaseClausesSummary: LeaseClauseSummary | null;
}): DocumentRequest {
  const plan = buildReviewPlan({ findings: input.findings, overchargeBreakdown: input.overchargeBreakdown, leaseClausesSummary: input.leaseClausesSummary });
  const items: DocumentRequestItem[] = [];
  for (const it of plan.items) {
    if (it.tier === "match") continue;
    // Only what the landlord holds: the tenant already has its lease and statement.
    const docs = it.documents.filter((d) => !isTenantOwn(d)).map(cleanDoc);
    const generic = "The invoices, general ledger detail and calculation behind this item";
    items.push({ title: it.title, documents: docs.length ? Array.from(new Set(docs)) : [generic] });
  }

  const clauses = parseAuditRights((input.leaseClausesSummary as { auditRights?: unknown } | null)?.auditRights);
  const cited = clauses.find((c) => c.kind === "audit") ?? null;

  const L: string[] = [];
  L.push("[Date]", "", "[Landlord or property manager name]", "[Address]", "");
  L.push("Re: [Premises address / suite] - Request for supporting documents, CAM reconciliation for [period or year]");
  L.push("    Lease dated [lease date]", "");
  L.push("Dear [Name]:", "");
  L.push(
    "I am reviewing the common area maintenance (CAM) reconciliation statement for [period or year]. " +
      "To complete that review, I would appreciate copies of the records listed below.",
    "",
  );
  if (cited) {
    L.push(
      `My lease contains the following provision${cited.page != null ? ` (page ${cited.page} of my copy)` : ""}:`,
      `   "${cited.quote}"`,
      "I am making this request in connection with that provision. If you consider any item outside it, please say which and why.",
      "",
    );
  }

  if (items.length === 0) {
    L.push("REQUESTED RECORDS", "");
    L.push("1. The general ledger detail for the operating expenses included in the statement.");
    L.push("2. The calculation of my share, including the total it was applied to.", "");
  } else {
    L.push("REQUESTED RECORDS", "");
    items.forEach((it, i) => {
      L.push(`${i + 1}. ${it.title}`);
      for (const d of it.documents) L.push(`   - ${d}`);
      L.push("");
    });
  }

  L.push(
    "Electronic copies are fine. If some records are available only for inspection, please let me know where and when they " +
      "can be reviewed. Please send the records, or a reply, by [response date].",
    "",
  );
  L.push("This request is not a waiver of any right under the lease.", "");
  L.push("Sincerely,", "", "[Your name]", "[Company]", "[Phone / email]");

  const text = L.join("\n");
  const placeholders = Array.from(new Set(text.match(/\[[^\]\n]{2,60}\]/g) ?? []));
  return { text, items, citedClause: cited, placeholders };
}
