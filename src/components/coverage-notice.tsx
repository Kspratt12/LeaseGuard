import { AlertTriangle } from "lucide-react";
import { coverageSentence, type AnalysisCoverage } from "@/lib/analysis-coverage";

/**
 * Shown whenever the AI step read only the start of a long document. It is driven by the stored coverage record, not by
 * the warning text, so it appears in every audit mode. The wording comes from one place (analysis-coverage.ts).
 */
export function CoverageNotice({ coverage }: { coverage: AnalysisCoverage }) {
  return (
    <div role="note" className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:p-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-review" aria-hidden />
      <div>
        <p className="text-sm font-medium text-amber-900">This review does not cover your whole document</p>
        <p className="mt-0.5 text-xs leading-relaxed text-amber-800">{coverageSentence(coverage)}</p>
      </div>
    </div>
  );
}
