import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { StatusBadge } from "@/components/ui";
import { SAMPLE_REVIEW_COUNT, SAMPLE_ROWS, SAMPLE_TOTAL_LABEL } from "./sample-data";

/**
 * A realistic, static look at an audit report: summary figures, then the findings table with the
 * lease requirement, the statement amount, the variance, the status and the page references.
 * Fictional, and says so. Rows come from the shared sample data, so the figures agree with the
 * sample report and the dashboard preview.
 */
export function HeroDemo() {
  const rows = SAMPLE_ROWS.slice(0, 3);
  return (
    <figure
      className="w-full overflow-hidden rounded-xl border border-white/10 bg-white text-ink shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]"
      aria-label="Fictional example of a CAM audit report"
    >
      <figcaption className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line bg-paper px-4 py-3">
        <span className="flex items-center gap-2 text-xs font-semibold text-ink">
          <FileText className="h-4 w-4 text-accent" aria-hidden />
          CAM audit report · Suite 210, Riverside Plaza · 2025
        </span>
        <span className="rounded-full bg-review-soft px-2.5 py-0.5 text-[11px] font-semibold text-review">Fictional example</span>
      </figcaption>

      <dl className="grid grid-cols-3 divide-x divide-line border-b border-line text-center sm:text-left">
        <div className="px-3 py-3 sm:px-4">
          <dt className="text-[11px] font-medium text-ink-muted sm:text-xs">To review</dt>
          <dd className="font-figures text-lg font-semibold tabular-nums text-ink sm:text-2xl">{SAMPLE_TOTAL_LABEL}</dd>
        </div>
        <div className="px-3 py-3 sm:px-4">
          <dt className="text-[11px] font-medium text-ink-muted sm:text-xs">Items flagged</dt>
          <dd className="font-figures text-lg font-semibold tabular-nums text-ink sm:text-2xl">{SAMPLE_REVIEW_COUNT}</dd>
        </div>
        <div className="px-3 py-3 sm:px-4">
          <dt className="text-[11px] font-medium text-ink-muted sm:text-xs">Checks matched</dt>
          <dd className="font-figures text-lg font-semibold tabular-nums text-verified sm:text-2xl">1</dd>
        </div>
      </dl>

      {/* wide: a real table */}
      <div className="hidden px-4 pt-3 md:block">
        <table className="w-full table-fixed text-left text-[13px]">
          <caption className="sr-only">Fictional audit findings</caption>
          <thead className="text-[11px] uppercase tracking-wider text-ink-muted">
            <tr className="border-b border-line">
              <th scope="col" className="w-[21%] pb-2 pr-2 font-medium">Item</th>
              <th scope="col" className="w-[27%] pb-2 pr-2 font-medium">Lease says</th>
              <th scope="col" className="w-[32%] pb-2 pr-2 font-medium">Statement</th>
              <th scope="col" className="w-[20%] pb-2 text-right font-medium">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line align-top">
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row" className="py-2.5 pr-2 font-semibold text-ink">
                  {r.item}
                  <span className="mt-1 block"><StatusBadge status={r.status}>{r.statusLabel}</StatusBadge></span>
                </th>
                <td className="py-2.5 pr-2 text-ink-soft">
                  {r.lease}
                  <span className="mt-0.5 block text-[11px] text-ink-muted">{r.leaseRef}</span>
                </td>
                <td className="font-figures py-2.5 pr-2 text-ink-soft">
                  {r.statement}
                  <span className="mt-0.5 block text-[11px] text-ink-muted">{r.statementRef}</span>
                </td>
                <td className="font-figures py-2.5 text-right text-base font-semibold tabular-nums text-ink">{r.variance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* narrow: the same rows as cards */}
      <ul className="divide-y divide-line md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-ink">{r.item}</p>
              <StatusBadge status={r.status}>{r.statusLabel}</StatusBadge>
            </div>
            <dl className="mt-2 grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1 text-[13px]">
              <dt className="text-ink-muted">Lease</dt>
              <dd className="text-ink-soft">{r.lease} <span className="text-ink-muted">· {r.leaseRef}</span></dd>
              <dt className="text-ink-muted">Statement</dt>
              <dd className="font-figures text-ink-soft">{r.statement}</dd>
              <dt className="text-ink-muted">Variance</dt>
              <dd className="font-figures font-semibold tabular-nums text-ink">{r.variance}</dd>
            </dl>
          </li>
        ))}
      </ul>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-line bg-paper px-4 py-3 text-xs">
        <span className="text-ink-muted">Variance is the tenant&apos;s 8.08% share. Items to review, not confirmed overcharges. All figures invented.</span>
        <Link href="/sample-cam-audit-report#example-findings" className="inline-flex min-h-8 items-center gap-1 font-semibold text-ink underline underline-offset-4">
          Open the full sample <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </figure>
  );
}
