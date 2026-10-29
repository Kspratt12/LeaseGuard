import { Check, FileText, Lock } from "lucide-react";
import { StatusBadge } from "@/components/ui";
import { SAMPLE_REVIEW_COUNT, SAMPLE_TOTAL_LABEL } from "./sample-data";

/** A fictional My Audits card, built from the same patterns as the real /account page. */
export function AppPreview() {
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-white shadow-[0_12px_32px_-18px_rgba(11,27,51,0.3)]" aria-label="Fictional example of the My Audits dashboard">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper px-4 py-2.5">
        <span className="text-xs font-semibold text-ink">My audits</span>
        <span className="rounded-full bg-review-soft px-2.5 py-0.5 text-[11px] font-semibold text-review">Fictional example</span>
      </figcaption>
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-ink">Suite 210, Riverside Plaza (example)</p>
            <p className="text-xs text-ink-muted">2025 CAM reconciliation · started 3 days ago</p>
          </div>
          <StatusBadge status="review">Preview ready</StatusBadge>
        </div>

        <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-3" aria-label="Audit progress">
          {["Documents uploaded", "Analysis complete", "Full report"].map((s, i) => (
            <li key={s} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${i < 2 ? "border-verified/30 bg-verified-soft/50 text-ink" : "border-line text-ink-muted"}`}>
              {i < 2 ? <Check className="h-4 w-4 shrink-0 text-verified" aria-hidden /> : <Lock className="h-4 w-4 shrink-0" aria-hidden />}
              <span>{s}{i === 2 ? ": locked" : ""}</span>
            </li>
          ))}
        </ol>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-line p-3">
            <p className="text-xs font-semibold text-ink-muted">Uploaded documents</p>
            <ul className="mt-1.5 space-y-1 text-[13px] text-ink-soft">
              <li className="flex items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />lease.pdf</li>
              <li className="flex items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />cam-statement-2025.pdf</li>
            </ul>
          </div>
          <div className="rounded-lg border border-line p-3">
            <p className="text-xs font-semibold text-ink-muted">Findings requiring review</p>
            <p className="font-figures mt-1 text-xl font-semibold tabular-nums text-ink">{SAMPLE_TOTAL_LABEL}</p>
            <p className="text-xs text-ink-muted">{SAMPLE_REVIEW_COUNT} items · not confirmed overcharges</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-paper px-3 py-2.5">
          <p className="text-sm text-ink-soft"><span className="font-semibold text-ink">Next step:</span> review the preview, then unlock the full report and dispute letter.</p>
          <span className="inline-flex min-h-9 items-center rounded-lg bg-ink px-4 text-sm font-semibold text-white" aria-hidden>View preview</span>
        </div>
      </div>
    </figure>
  );
}
