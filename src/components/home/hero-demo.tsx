import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StatusBadge } from "@/components/ui";
import { SAMPLE_REVIEW_COUNT, SAMPLE_ROWS, SAMPLE_TOTAL_LABEL } from "./sample-data";

/**
 * A compact, static look at the audit table. Fictional, and says so. The rows come from the shared
 * sample data so the figures agree with the sample report and the dashboard preview.
 */
export function HeroDemo() {
  const rows = SAMPLE_ROWS.slice(0, 3);
  return (
    <figure className="w-full overflow-hidden rounded-xl border border-line bg-white shadow-[0_12px_32px_-18px_rgba(11,27,51,0.3)]" aria-label="Fictional example of an audit result">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line bg-paper px-4 py-2.5">
        <span className="text-xs font-semibold text-ink">Audit result · 2025 CAM statement</span>
        <span className="rounded-full bg-review-soft px-2.5 py-0.5 text-[11px] font-semibold text-review">Fictional example</span>
      </figcaption>

      <div className="flex flex-col gap-1 border-b border-line px-4 py-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <p className="text-xs text-ink-muted">Potential discrepancies to review</p>
          <p className="font-figures text-2xl font-semibold tabular-nums text-ink sm:text-3xl">{SAMPLE_TOTAL_LABEL}</p>
        </div>
        <p className="text-xs text-ink-muted sm:pb-1 sm:text-right">
          {SAMPLE_REVIEW_COUNT} items
          <br />
          not confirmed overcharges
        </p>
      </div>

      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-ink">{r.item}</p>
              <StatusBadge status={r.status}>{r.statusLabel}</StatusBadge>
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
              <dt className="text-ink-muted">Lease</dt>
              <dd className="min-w-0 text-ink-soft">
                {r.lease} <span className="text-ink-muted">· {r.leaseRef}</span>
              </dd>
              <dt className="text-ink-muted">Statement</dt>
              <dd className="font-figures min-w-0 text-ink-soft">{r.statement}</dd>
              <dt className="text-ink-muted">Variance</dt>
              <dd className="font-figures font-semibold tabular-nums text-ink">{r.variance}</dd>
            </dl>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-paper px-4 py-2.5 text-xs">
        <span className="text-ink-muted">Variance is your 8.08% share. All figures are invented.</span>
        <Link href="/sample-cam-audit-report#example-findings" className="inline-flex min-h-8 items-center gap-1 font-semibold text-ink underline underline-offset-4">
          View evidence <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </figure>
  );
}
