import { Lock, ShieldCheck, FileSearch, ArrowRight, FileText } from "lucide-react";
import type { Finding, OverchargeLineItem } from "@/services/audit-logic";

export function AuditResultsPaid({
  findings,
  premiumSavings,
  overchargeBreakdown,
}: {
  findings: Finding[];
  premiumSavings: number;
  overchargeBreakdown?: OverchargeLineItem[];
}) {
  const count = findings.length;
  const displayFindings = count > 0 ? findings : placeholders;
  const evidenceItems = overchargeBreakdown?.filter((r) => r.sourceEvidence) ?? [];

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-blue-50">
          <ShieldCheck className="h-5 w-5 text-blue-700" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Premium Findings
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Source-backed evidence and detailed discrepancy analysis
          </p>
        </div>
      </div>

      {/* Premium locked card */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Top accent bar */}
        <div className="h-1 bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500" />

        {/* Blurred preview peek */}
        <div className="relative">
          <div
            className="px-6 pt-5 pb-2 blur-[6px] select-none pointer-events-none opacity-50"
            aria-hidden
          >
            <ul className="space-y-4">
              {displayFindings.slice(0, 2).map((f, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="h-5 w-5 rounded-full bg-gray-200 mt-0.5 shrink-0" />
                  <div className="flex-1 space-y-1">
                    <p className="font-medium text-gray-800">{f.category}</p>
                    <p className="text-sm text-gray-500">
                      {f.description}
                    </p>
                    {f.sourceEvidence && f.sourceEvidence.length > 0 && (
                      <p className="text-xs text-blue-600">
                        Source: {f.sourceEvidence[0].document}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {/* Fade-out gradient over blurred rows */}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />
        </div>

        {/* CTA content */}
        <div className="flex flex-col items-center px-8 pb-10 pt-4 text-center">
          <div className="flex items-center justify-center h-14 w-14 rounded-full bg-blue-50 mb-5">
            <Lock className="h-6 w-6 text-blue-700" />
          </div>

          <h3 className="text-xl font-bold text-gray-900 mb-3">
            Unlock Full Evidence Report
          </h3>

          <p className="text-sm text-gray-500 leading-relaxed mb-6 max-w-sm">
            {premiumSavings > 0
              ? `${count} additional premium finding${count !== 1 ? "s" : ""} identified with up to $${premiumSavings.toLocaleString()} in additional potential savings.`
              : `${count} additional premium finding${count !== 1 ? "s" : ""} identified. Full report includes source-level evidence and discrepancy analysis.`}
          </p>

          {/* Feature bullets */}
          <ul className="flex flex-col gap-3 text-left text-sm text-gray-600 mb-8 w-full max-w-xs">
            <li className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-blue-600 shrink-0" />
              <span>Document source references with page numbers</span>
            </li>
            <li className="flex items-center gap-3">
              <FileSearch className="h-4 w-4 text-blue-600 shrink-0" />
              <span>Extracted line-item evidence per finding</span>
            </li>
            <li className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0" />
              <span>Premium audit checks with discrepancy support</span>
            </li>
          </ul>

          <button
            disabled
            className="group inline-flex items-center gap-2 px-8 py-3.5 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-500 hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Coming Soon — Unlock for $49
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>

          <p className="text-xs text-gray-400 mt-4">
            One-time purchase · Instant access · PDF download included
          </p>
        </div>
      </div>

      {/* Source evidence preview (visible teaser from overcharge data) */}
      {evidenceItems.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="h-5 w-5 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">
              Source Evidence Preview
            </h3>
          </div>
          <div className="space-y-3">
            {evidenceItems.slice(0, 2).map((item, i) => (
              <div
                key={i}
                className="rounded-lg bg-gray-50 border border-gray-100 p-4"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <p className="text-sm font-semibold text-gray-900 capitalize">
                    {item.category}
                  </p>
                  {item.sourceEvidence!.findingCategory && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                      {item.sourceEvidence!.findingCategory}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                    <p>
                      <span className="font-medium text-gray-700">
                        Document:
                      </span>{" "}
                      {item.sourceEvidence!.document}
                    </p>
                    {item.sourceEvidence!.page != null && (
                      <p>
                        <span className="font-medium text-gray-700">
                          Page:
                        </span>{" "}
                        {item.sourceEvidence!.page}
                      </p>
                    )}
                  </div>
                  {item.sourceEvidence!.extractedText && (
                    <div className="mt-1.5 pl-3 border-l-2 border-blue-200">
                      <p className="text-xs text-gray-600 italic leading-relaxed">
                        &ldquo;{item.sourceEvidence!.extractedText}&rdquo;
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {evidenceItems.length > 2 && (
              <p className="text-xs text-gray-400 text-center pt-1">
                +{evidenceItems.length - 2} more source references available in the full report
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const placeholders: Finding[] = [
  {
    category: "Admin Fee Overcharge",
    description:
      "Management fee percentage exceeds lease-specified limit.",
    potential_savings: 3200,
    severity: "high",
  },
  {
    category: "Pro-Rata Share Mismatch",
    description:
      "Tenant share of operating expenses differs from lease terms.",
    potential_savings: 1800,
    severity: "medium",
  },
  {
    category: "Excluded Category Billed",
    description:
      "Charge category appears excluded per lease terms.",
    potential_savings: 950,
    severity: "low",
  },
];
