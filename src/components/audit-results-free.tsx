import { CheckCircle, AlertCircle } from "lucide-react";
import type { Finding } from "@/services/audit-logic";

export function AuditResultsFree({
  findings,
}: {
  findings: Finding[];
}) {
  if (findings.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500">
        <p>No free findings to display yet.</p>
        <p className="text-sm mt-1">
          Check back once the audit has been processed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Free Findings</h2>
      <ul className="space-y-4">
        {findings.map((f, i) => (
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
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
