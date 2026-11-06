import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { HEADLINE_UNAVAILABLE_SENTENCE, NO_CAP_ONLY_IDENTIFIED, NO_CAP_ONLY_LABEL, NO_CAP_ONLY_NO_CAP } from "@/lib/quantification";
import type { OverchargeLineItem, SourceEvidence } from "@/services/audit-logic";

/** $1,979.60 (always cents) for statement-line amounts. */
const money2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function SourceEvidenceCard({
  category,
  evidence,
  totalExpense,
  tenantShare,
  tenantCharge,
}: {
  category: string;
  evidence: SourceEvidence;
  totalExpense: number;
  tenantShare: number;
  tenantCharge: number;
}) {
  return (
    <div className="rounded-lg bg-white/60 border border-red-100 p-4">
      <div className="flex items-start gap-3 mb-2">
        <FileText className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-900 capitalize">
            {category}
          </p>
          {evidence.findingCategory && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-50 text-red-600">
              {evidence.findingCategory}
            </span>
          )}
        </div>
      </div>
      <div className="ml-7 text-xs text-gray-500 space-y-1.5">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <p>
            <span className="font-medium text-gray-700">Document:</span>{" "}
            {evidence.document}
          </p>
          {evidence.page != null && (
            <p>
              <span className="font-medium text-gray-700">Page:</span>{" "}
              {evidence.page}
            </p>
          )}
        </div>
        {evidence.extractedText && (
          <div className="mt-2 pl-3 border-l-2 border-red-200">
            <p className="text-xs text-gray-600 italic leading-relaxed">
              &ldquo;{evidence.extractedText}&rdquo;
            </p>
          </div>
        )}
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          <span>
            <span className="font-medium text-gray-700">Detected Amount:</span>{" "}
            <span className="tabular-nums">
              {formatMoney(totalExpense)}
            </span>
          </span>
          <span>
            <span className="font-medium text-gray-700">Tenant Share:</span>{" "}
            <span className="tabular-nums">{tenantShare}%</span>
          </span>
          <span>
            <span className="font-medium text-ink">Potential discrepancy:</span>{" "}
            <span className="tabular-nums font-semibold text-ink">
              {formatMoney(tenantCharge)}
            </span>
          </span>
        </p>
      </div>
    </div>
  );
}

/** The excluded-expense rows (table, then the source evidence for each). Moved out of the audit page unchanged. */
export function ExcludedBreakdown({ rows }: { rows: OverchargeLineItem[] }) {
  return (
    <>
      <div className="mt-6 sm:mt-8 overflow-x-auto -mx-2 sm:mx-0" role="region" aria-label="Breakdown table, scrolls sideways" tabIndex={0}>
        <table className="w-full text-xs sm:text-sm border-separate min-w-[480px]" style={{ borderSpacing: "0 0" }}>
          <thead>
            <tr className="border-b-2 border-review/25">
              <th className="pb-2 sm:pb-3 pr-3 sm:pr-4 font-semibold text-ink text-left w-[28%]">Category</th>
              <th className="pb-2 sm:pb-3 px-2 sm:px-3 font-semibold text-ink text-right w-[18%]">Total Expense</th>
              <th className="pb-2 sm:pb-3 px-2 sm:px-3 font-semibold text-ink text-center w-[14%]">Tenant Share</th>
              <th className="pb-2 sm:pb-3 px-2 sm:px-3 font-semibold text-ink text-right w-[18%]">Tenant Charge</th>
              <th className="pb-2 sm:pb-3 pl-3 sm:pl-4 font-semibold text-ink text-left w-[22%]">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-review/15 last:border-0">
                <td className="py-3 pr-4 text-gray-800 capitalize">{row.category}</td>
                <td className="py-3 px-3 text-gray-800 text-right tabular-nums">${money2(row.total_expense)}</td>
                <td className="py-3 px-3 text-gray-800 text-center tabular-nums">{row.tenant_share_percent}%</td>
                <td className="py-3 px-3 font-semibold text-ink text-right tabular-nums">${money2(row.tenant_charge)}</td>
                <td className="py-3 pl-4 text-gray-500 text-sm">{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.some((r) => r.sourceEvidence) && (
        <div className="mt-8 pt-6 border-t border-review/25">
          <p className="font-figures text-[11px] font-medium text-review uppercase tracking-widest mb-4">
            Source Evidence
          </p>
          <div className="space-y-3">
            {rows
              .filter((r) => r.sourceEvidence)
              .map((row, i) => (
                <SourceEvidenceCard
                  key={i}
                  category={row.category}
                  evidence={row.sourceEvidence!}
                  totalExpense={row.total_expense}
                  tenantShare={row.tenant_share_percent}
                  tenantCharge={row.tenant_charge}
                />
              ))}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * The last box of the headline chain: nothing was flagged. `noCapOnly` is true only for an audit whose every finding is a
 * no-cap observation (isNoCapObservationOnly); only then does the wording say that no cap was available to compare with.
 */
export function NoDiscrepancyBox({ noCapOnly }: { noCapOnly: boolean }) {
  return (
    <div className="rounded-xl bg-gray-50 border border-gray-200 p-5 sm:p-8 text-center space-y-2 sm:space-y-3" data-testid={noCapOnly ? "no-discrepancy-nocap" : "no-discrepancy"}>
      <p className="text-xs text-gray-600 font-semibold uppercase tracking-widest">
        {noCapOnly ? NO_CAP_ONLY_LABEL : "No Clear Discrepancies Detected"}
      </p>
      <p className="text-sm text-gray-500 leading-relaxed max-w-md mx-auto">
        {noCapOnly ? `${NO_CAP_ONLY_IDENTIFIED} ${NO_CAP_ONLY_NO_CAP}` : "The uploaded documents did not show a clear billing discrepancy based on current audit checks."}
      </p>
    </div>
  );
}

/**
 * The audit page's headline area. The unavailable-total notice is kept SEPARATE from the excluded-expense rows: when an
 * earlier audit's total could not be reconciled, the rows stay visible as individual items, with wording that says they
 * are not an overall total. No figure is computed here: every number is passed in.
 * `children` is the remainder of the page's existing headline chain (incomplete analysis, discrepancies, none detected).
 */
export function AuditHeadline({
  unavailable,
  hasOvercharge,
  savingsEstimate,
  breakdown,
  children,
}: {
  unavailable: boolean;
  hasOvercharge: boolean;
  savingsEstimate: number;
  breakdown: OverchargeLineItem[];
  children?: ReactNode;
}) {
  if (unavailable) {
    return (
      <>
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-5 sm:p-8 text-center space-y-2 sm:space-y-3" data-testid="headline-unavailable">
          <p className="text-xs text-gray-600 font-semibold uppercase tracking-widest">Overall total not available</p>
          <p className="text-sm text-gray-500 leading-relaxed max-w-md mx-auto">{HEADLINE_UNAVAILABLE_SENTENCE}</p>
        </div>
        {breakdown.length > 0 && (
          <section className="rounded-xl border border-review/25 bg-review-soft p-5 sm:p-8" aria-labelledby="excluded-lines-title" data-testid="excluded-breakdown">
            <p id="excluded-lines-title" className="font-figures text-[11px] text-review font-medium uppercase tracking-widest">
              Excluded-expense lines, as stored
            </p>
            <p className="mt-2 text-sm text-ink-soft leading-relaxed">
              These lines are listed individually. They are not an overall total and do not establish one. They are items to review with your landlord, not confirmed overcharges.
            </p>
            <ExcludedBreakdown rows={breakdown} />
          </section>
        )}
      </>
    );
  }
  if (hasOvercharge) {
    return (
      <div className="rounded-xl bg-review-soft border border-review/25 p-5 sm:p-8">
        <div className="text-center space-y-2 sm:space-y-3">
          <p className="font-figures text-[11px] text-review font-medium uppercase tracking-widest">
            Potential Billing Discrepancies
          </p>
          <p className="text-4xl sm:text-5xl font-semibold tracking-tight text-ink tabular-nums">
            {formatMoney(savingsEstimate)}
          </p>
          <p className="text-sm text-ink-soft leading-relaxed max-w-md mx-auto">
            Calculated from your uploaded lease and CAM documents. These are items to review with your landlord, not confirmed overcharges. Professional review is recommended.
          </p>
        </div>
        <ExcludedBreakdown rows={breakdown} />
      </div>
    );
  }
  if (savingsEstimate > 0) {
    return (
      <div className="rounded-xl bg-review-soft border border-review/25 p-5 sm:p-8 text-center space-y-2 sm:space-y-3">
        <p className="font-figures text-[11px] text-review font-medium uppercase tracking-widest">
          Potential Billing Discrepancies
        </p>
        <p className="text-4xl sm:text-5xl font-semibold tracking-tight text-ink tabular-nums">
          {formatMoney(savingsEstimate)}
        </p>
        <p className="text-sm text-ink-soft leading-relaxed max-w-md mx-auto">
          Calculated from your uploaded lease and CAM documents. These are items to review with your landlord, not confirmed overcharges. Professional review is recommended.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
