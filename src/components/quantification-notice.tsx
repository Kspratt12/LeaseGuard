import { AlertTriangle } from "lucide-react";
import type { QuantificationNotice } from "@/lib/quantification";

/**
 * Says which comparisons did not run and which checks calculate no amount. Driven by the stored comparison record, not
 * by the findings on screen, so it stays visible however many findings there are. Wording comes from one place
 * (src/lib/quantification.ts). `onDark` is for the purchase panel.
 */
export function QuantificationNoticeBlock({ notice, onDark = false }: { notice: QuantificationNotice; onDark?: boolean }) {
  return (
    <div
      role="note"
      data-testid="quantification-notice"
      className={
        onDark
          ? "mt-5 flex items-start gap-3 rounded-lg border border-amber-300/40 bg-amber-100/10 p-3 text-sm leading-relaxed text-white/85"
          : "flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:p-4"
      }
    >
      <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${onDark ? "text-amber-200" : "text-review"}`} aria-hidden />
      <div>
        <p className={onDark ? "font-semibold text-white" : "text-sm font-medium text-amber-900"}>{notice.title}</p>
        <ul className={`mt-1 list-disc space-y-1 pl-5 ${onDark ? "" : "text-xs leading-relaxed text-amber-800"}`}>
          {notice.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
