import { CheckCircle, AlertCircle, Scale } from "lucide-react";
import type { Finding, LeaseClauseSummary } from "@/services/audit-logic";
import { getLeaseClauseEvidence } from "@/lib/lease-clause-evidence";

export function AuditResultsFree({
  findings,
  leaseClausesSummary,
}: {
  findings: Finding[];
  leaseClausesSummary?: LeaseClauseSummary | null;
}) {
  if (findings.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500">
        <p>No overcharges detected in the free preview.</p>
        <p className="text-sm mt-1">
          The uploaded documents did not trigger any free-tier audit flags.
          Additional checks may be available in the full report below.
        </p>
      </div>
    );
  }

  // Show up to 3 visible findings
  const visibleFindings = findings.slice(0, 3);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Audit Findings</h2>
      <ul className="space-y-4">
        {visibleFindings.map((f, i) => (
          <li
            key={i}
            className={`flex items-start gap-4 rounded-xl border p-5 ${
              f.insufficientData
                ? "border-amber-200 bg-amber-50"
                : "border-gray-200 bg-white"
            }`}
          >
            {f.insufficientData ? (
              <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            ) : (
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
            )}
            <div className="space-y-2 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-gray-900">{f.category}</p>
                {f.insufficientData && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    Insufficient Data
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{f.description}</p>
              {f.potential_savings > 0 ? (
                <p className="text-sm font-semibold text-green-700">
                  Potential savings: ${f.potential_savings.toLocaleString()}
                </p>
              ) : f.insufficientData ? (
                <p className="text-xs text-amber-600">
                  Manual review recommended
                </p>
              ) : (
                <p className="text-xs text-gray-500">
                  Review recommended to confirm compliance
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
          </li>
        ))}
      </ul>
    </div>
  );
}
