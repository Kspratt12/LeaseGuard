"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { StatusBadge } from "@/components/ui";
import { ReviewPlanPanel } from "@/components/review-plan";
import { buildReviewPlan } from "@/services/review-plan";
import { SAMPLE_LETTER, SAMPLE_PLAN_BREAKDOWN, SAMPLE_PLAN_CLAUSES, SAMPLE_PLAN_FINDINGS, SAMPLE_REVIEW_COUNT, SAMPLE_ROWS, SAMPLE_TOTAL_LABEL } from "./sample-data";

/**
 * Interactive preview of a LeaseGuard report. EVERYTHING here is fictional and labelled as such.
 * Rows, totals and the letter come from sample-data.ts so every figure reconciles.
 */

const TABS = ["Findings", "Evidence", "Calculations", "Review plan", "Dispute letter"] as const;

const SAMPLE_PLAN = buildReviewPlan({ findings: SAMPLE_PLAN_FINDINGS, overchargeBreakdown: SAMPLE_PLAN_BREAKDOWN, leaseClausesSummary: SAMPLE_PLAN_CLAUSES, confidence: "high" });
type Tab = (typeof TABS)[number];

export function SampleReport() {
  const [tab, setTab] = useState<Tab>("Findings");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent, i: number) => {
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const n = (next + TABS.length) % TABS.length;
    setTab(TABS[n]);
    refs.current[n]?.focus();
  };

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-[0_12px_32px_-18px_rgba(11,27,51,0.3)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper px-4 py-2.5">
        <p className="text-xs font-semibold text-ink">Sample audit report · 2025 CAM reconciliation</p>
        <span className="rounded-full bg-review-soft px-2.5 py-0.5 text-[11px] font-semibold text-review">Fictional example, not a real customer</span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line px-4 py-4 sm:px-6">
        <div>
          <p className="text-xs text-ink-muted">Potential billing discrepancies</p>
          <p className="font-figures text-3xl font-semibold tabular-nums text-ink sm:text-4xl">{SAMPLE_TOTAL_LABEL}</p>
        </div>
        <p className="max-w-sm text-xs leading-relaxed text-ink-muted">
          {SAMPLE_REVIEW_COUNT} items to review with the landlord, calculated from the documents. They are not confirmed overcharges.
        </p>
      </div>

      <div role="tablist" aria-label="Sample report sections" className="flex overflow-x-auto border-b border-line">
        {TABS.map((t, i) => (
          <button
            key={t}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`tab-${i}`}
            aria-selected={tab === t}
            aria-controls="sample-panel"
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
            onKeyDown={(e) => onKey(e, i)}
            className={`min-h-11 shrink-0 flex-1 whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink ${
              tab === t ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="sample-panel" aria-labelledby={`tab-${TABS.indexOf(tab)}`} className="p-4 sm:p-6">
        {tab === "Findings" && (
          <>
            {/* wide screens: a real table */}
            <div className="hidden md:block">
              <table className="w-full table-fixed text-left text-sm">
                <caption className="sr-only">Fictional audit items with the lease requirement, statement amount, variance, status and evidence</caption>
                <thead className="text-xs text-ink-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="w-[15%] pb-2 pr-3 font-medium">Audit item</th>
                    <th scope="col" className="w-[22%] pb-2 pr-3 font-medium">Lease requirement</th>
                    <th scope="col" className="w-[20%] pb-2 pr-3 font-medium">Statement</th>
                    <th scope="col" className="w-[14%] pb-2 pr-3 text-right font-medium">Variance</th>
                    <th scope="col" className="w-[15%] pb-2 pl-3 font-medium">Status</th>
                    <th scope="col" className="w-[14%] pb-2 font-medium">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line align-top">
                  {SAMPLE_ROWS.map((r) => (
                    <tr key={r.id}>
                      <th scope="row" className="py-3 pr-3 font-semibold text-ink">{r.item}</th>
                      <td className="py-3 pr-3 text-ink-soft">{r.lease}</td>
                      <td className="font-figures py-3 pr-3 text-[13px] text-ink-soft">{r.statement}</td>
                      <td className="font-figures py-3 pr-3 text-right font-semibold tabular-nums text-ink">{r.variance}</td>
                      <td className="py-3 pl-3"><StatusBadge status={r.status}>{r.statusLabel}</StatusBadge></td>
                      <td className="py-3 text-xs text-ink-muted">{r.leaseRef}<br />{r.statementRef}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* phones: the same rows as stacked cards, so nothing is shrunk or scrolled sideways */}
            <ul className="space-y-3 md:hidden">
              {SAMPLE_ROWS.map((r) => (
                <li key={r.id} className="rounded-lg border border-line p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">{r.item}</p>
                    <StatusBadge status={r.status}>{r.statusLabel}</StatusBadge>
                  </div>
                  <dl className="mt-2 grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 text-[13px]">
                    <dt className="text-ink-muted">Lease</dt>
                    <dd className="text-ink-soft">{r.lease}</dd>
                    <dt className="text-ink-muted">Statement</dt>
                    <dd className="font-figures text-ink-soft">{r.statement}</dd>
                    <dt className="text-ink-muted">Variance</dt>
                    <dd className="font-figures font-semibold tabular-nums text-ink">{r.variance}</dd>
                    <dt className="text-ink-muted">Evidence</dt>
                    <dd className="text-ink-muted">{r.leaseRef} · {r.statementRef}</dd>
                  </dl>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-ink-muted">
              Variance is your share (8.08%) of the difference. “Needs your judgment” items depend on how the lease is worded; the software cannot decide them. All figures are invented, and are shown to the cent here for illustration: a real report rounds each finding to the nearest dollar and explains how its total adds up.
            </p>
          </>
        )}

        {tab === "Evidence" && (
          <div className="grid gap-4 md:grid-cols-2">
            <blockquote className="rounded-lg border border-line border-l-4 border-l-ink bg-paper p-4">
              <p className="text-xs font-semibold text-ink-muted">Lease, page 2, §3.3</p>
              <p className="mt-1.5 font-serif text-[15px] leading-relaxed text-ink-soft">
                “Landlord may charge an administrative fee <mark className="rounded bg-review-soft px-1 font-semibold text-ink">not to exceed 15%</mark> of total operating expenses.”
              </p>
            </blockquote>
            <blockquote className="rounded-lg border border-line border-l-4 border-l-review bg-paper p-4">
              <p className="text-xs font-semibold text-ink-muted">Statement, page 1</p>
              <p className="font-figures mt-1.5 text-[13px] leading-relaxed text-ink-soft">
                Management Fee (18%)<br />Total operating expenses&nbsp;&nbsp;$560,540.00<br />Fee charged&nbsp;&nbsp;<mark className="rounded bg-review-soft px-1 font-semibold text-ink">$100,897.20</mark>
              </p>
            </blockquote>
            <p className="text-sm text-ink-muted md:col-span-2">Every finding in a real report shows the text it came from and the page, so you can check it against your own documents.</p>
          </div>
        )}

        {tab === "Calculations" && (
          <ul className="space-y-3">
            {SAMPLE_ROWS.map((r) => (
              <li key={r.id} className="rounded-lg border border-line p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{r.item}</p>
                  <span className="text-xs font-medium text-ink-muted">{r.basis}</span>
                </div>
                <p className="mt-1.5 text-[13px] text-ink-soft">{r.explanation}</p>
                <p className="font-figures mt-1.5 break-words text-xs leading-relaxed text-ink-muted">{r.calc}</p>
              </li>
            ))}
          </ul>
        )}

        {tab === "Review plan" && <ReviewPlanPanel plan={SAMPLE_PLAN} sample />}

        {tab === "Dispute letter" && (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              A sample draft with [placeholders]. It has not been sent to anyone. In a real report you edit it, fill in the blanks, and export to PDF or Word.
            </p>
            <div className="rounded-lg border border-line bg-paper p-4 font-serif text-[14px] leading-relaxed text-ink-soft sm:p-5 sm:text-[15px]">
              <p>{SAMPLE_LETTER.re}</p>
              <p className="mt-3 font-semibold">{SAMPLE_LETTER.items[0]}</p>
              <p>{SAMPLE_LETTER.items[1]}</p>
              <p className="mt-1 text-[13px] italic text-ink-muted">{SAMPLE_LETTER.source}</p>
              <p className="mt-3">{SAMPLE_LETTER.close}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
