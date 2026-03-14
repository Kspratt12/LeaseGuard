import { Lock, ShieldCheck, FileSearch, ArrowRight, FileText, AlertTriangle, Scale } from "lucide-react";
import type { Finding, OverchargeLineItem, LeaseClauseSummary } from "@/services/audit-logic";
import { getLeaseClauseEvidence } from "@/lib/lease-clause-evidence";

const lockedPlaceholders: Finding[] = [
  {
    category: "Pro Rata Share Calculation Issue",
    description:
      "Tenant proportionate share calculation uses incorrect building square footage, resulting in a higher allocation across all expense categories.",
    potential_savings: 1900,
    severity: "medium",
  },
  {
    category: "Capital Improvement Charge Passed Through",
    description:
      "Roof replacement costs classified as routine maintenance rather than amortized capital improvement per lease section 5.4.",
    potential_savings: 3400,
    severity: "high",
  },
  {
    category: "Insurance Allocation Discrepancy",
    description:
      "Property insurance premium increase allocated to tenants at full amount rather than proportionate share defined in lease.",
    potential_savings: 1200,
    severity: "medium",
  },
];

export function AuditResultsPaid({
  findings,
  premiumSavings,
  overchargeBreakdown,
  leaseClausesSummary,
}: {
  findings: Finding[];
  premiumSavings: number;
  overchargeBreakdown?: OverchargeLineItem[];
  leaseClausesSummary?: LeaseClauseSummary | null;
}) {
  const count = findings.length;
  // Use real findings if available, otherwise placeholders
  const lockedFindings =
    count > 0 ? findings.slice(0, 3) : lockedPlaceholders;
  const evidenceItems =
    overchargeBreakdown?.filter((r) => r.sourceEvidence) ?? [];

  // Only show real savings from actual findings — never from placeholders
  const totalLockedSavings =
    premiumSavings > 0
      ? premiumSavings
      : count > 0
        ? lockedFindings.reduce((s, f) => s + f.potential_savings, 0)
        : 0;

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-blue-50">
          <ShieldCheck className="h-5 w-5 text-blue-700" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Additional Findings
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {count > 0
              ? `${count} more finding${count !== 1 ? "s" : ""} identified — unlock to view details`
              : "Additional analysis available in the full report"}
          </p>
        </div>
      </div>

      {/* Locked finding cards */}
      <div className="space-y-3">
        {lockedFindings.map((f, i) => (
          <div
            key={i}
            className="relative rounded-xl border border-gray-200 bg-white p-5 overflow-hidden"
          >
            {/* Blur overlay */}
            <div className="absolute inset-0 backdrop-blur-[5px] bg-white/60 z-10 flex items-center justify-center">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 border border-gray-200">
                <Lock className="h-3.5 w-3.5 text-gray-500" />
                <span className="text-xs font-medium text-gray-500">
                  Unlock to view
                </span>
              </div>
            </div>

            {/* Content (visible but obscured) */}
            <div className="flex items-start gap-4">
              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
              <div className="space-y-2 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900">{f.category}</p>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      f.severity === "high"
                        ? "bg-red-50 text-red-700"
                        : f.severity === "medium"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {f.severity}
                  </span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {f.description}
                </p>
                {f.potential_savings > 0 && (
                  <p className="text-sm font-semibold text-green-700">
                    Potential savings: ${f.potential_savings.toLocaleString()}
                  </p>
                )}

                {/* Lease Clause Evidence */}
                {(() => {
                  const clause = getLeaseClauseEvidence(f, leaseClausesSummary);
                  if (!clause) return null;
                  return (
                    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Scale className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                        <p className="text-xs font-semibold text-blue-800">
                          Lease Clause Evidence
                        </p>
                      </div>
                      <p className="text-xs font-medium text-blue-700 mb-1">
                        {clause.section}
                      </p>
                      <p className="text-xs text-gray-600 italic leading-relaxed pl-3 border-l-2 border-blue-200">
                        &ldquo;{clause.text}&rdquo;
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Conversion CTA */}
      <div className="rounded-xl border border-blue-200 bg-gradient-to-b from-blue-50 to-white p-5 sm:p-8 text-center">
        <div className="flex items-center justify-center h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-blue-100 mx-auto mb-4 sm:mb-5">
          <Lock className="h-5 w-5 sm:h-6 sm:w-6 text-blue-700" />
        </div>

        <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-3">
          Unlock Your Full CAM Audit Report
        </h3>

        <p className="text-sm text-gray-600 leading-relaxed mb-5 sm:mb-6 max-w-sm mx-auto">
          Upgrade to view all discrepancies, see clause references, and
          download the full evidence report.
          {totalLockedSavings > 0 && (
            <>
              {" "}
              Up to{" "}
              <span className="font-semibold text-gray-900">
                ${totalLockedSavings.toLocaleString()}
              </span>{" "}
              in additional potential savings identified.
            </>
          )}
        </p>

        {/* Feature bullets */}
        <ul className="flex flex-col gap-2.5 sm:gap-3 text-left text-sm text-gray-600 mb-6 sm:mb-8 w-full max-w-xs mx-auto">
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
            <span>Full discrepancy analysis with clause references</span>
          </li>
        </ul>

        <button
          disabled
          className="group inline-flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-3.5 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-500 hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed text-sm sm:text-base"
        >
          Unlock Full Report – $49
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>

        <p className="text-xs text-gray-400 mt-3 sm:mt-4">
          One-time purchase · Instant access · PDF download included
        </p>
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
                +{evidenceItems.length - 2} more source references available in
                the full report
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
