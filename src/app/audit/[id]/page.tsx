"use client";

import { useEffect, useState, use } from "react";
import { AuditResultsFree } from "@/components/audit-results-free";
import { AuditResultsPaid } from "@/components/audit-results-paid";
import { AuditProgress } from "@/components/audit-progress";
import { Loader2, Download, AlertTriangle, RefreshCw, FileText } from "lucide-react";
import Link from "next/link";
import type { Finding, OverchargeLineItem, SourceEvidence, LeaseClauseSummary } from "@/services/audit-logic";

interface Audit {
  id: string;
  status: string;
  savings_estimate: number | null;
  free_findings: Finding[] | null;
  paid_findings: Finding[] | null;
  error_message: string | null;
  report_pdf_url: string | null;
  confidence: "high" | "medium" | "low" | null;
  confidence_score: number | null;
  validation_warning: string | null;
  was_swapped: boolean | null;
  audit_mode: "full" | "limited" | "rejected" | null;
  estimated_overcharge: number | null;
  overcharge_breakdown: OverchargeLineItem[] | null;
  lease_clauses_summary: LeaseClauseSummary | null;
}

export default function AuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Scroll to top on mount so the user sees the progress from the beginning
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();
    let pollCount = 0;

    // After 3 minutes of polling with no terminal state, show a timeout error
    const MAX_POLL_DURATION_MS = 3 * 60 * 1000;

    async function fetchAudit() {
      try {
        pollCount++;
        // Cache-bust to prevent stale responses from CDN or browser cache
        const res = await fetch(`/api/audit/${id}?_t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!res.ok) {
          // On transient server errors (5xx), keep polling instead of giving up
          if (res.status >= 500 && !cancelled) {
            console.warn(`[poll] audit=${id} got ${res.status}, retrying...`);
            timer = setTimeout(fetchAudit, 3000);
            return;
          }
          setNotFound(true);
          return;
        }
        const data: Audit = await res.json();

        // Data-driven completion: if result data exists, the audit is done
        // regardless of the status string (handles partial status update failures).
        // IMPORTANT: An empty array [] does NOT count as result data — it may be
        // a DB column default. Only treat non-empty findings as completion evidence.
        const hasResultData =
          Array.isArray(data.free_findings) && data.free_findings.length > 0;
        if (hasResultData && data.status !== "completed" && data.status !== "error") {
          console.warn(
            `[poll] audit=${id} has result data but status="${data.status}" — forcing completed`,
          );
          data.status = "completed";
        }

        // Status says "completed" but findings are empty — the DB might have
        // returned a premature "completed" due to a column default or race
        // condition.  Keep polling for up to 15 extra seconds to let the
        // background processor finish writing real data.
        const statusSaysComplete = data.status === "completed";
        const hasZeroFindings =
          (!data.free_findings || data.free_findings.length === 0) &&
          (!data.paid_findings || data.paid_findings.length === 0) &&
          (data.savings_estimate == null || data.savings_estimate === 0);
        const elapsedMs = Date.now() - startedAt;
        const suspiciouslyEmpty = statusSaysComplete && hasZeroFindings && elapsedMs < 15_000;

        const isTerminal =
          (data.status === "completed" && !suspiciouslyEmpty) || data.status === "error";
        console.log(
          `[poll] audit=${id} status=${data.status} terminal=${isTerminal} poll#=${pollCount} hasData=${hasResultData} suspiciouslyEmpty=${suspiciouslyEmpty} keys=[${Object.keys(data).join(",")}]`,
        );

        if (!cancelled) setAudit(data);

        // Keep polling while not terminal
        if (!cancelled && !isTerminal) {
          // Failsafe: if polling exceeds max duration, stop and show timeout
          if (Date.now() - startedAt > MAX_POLL_DURATION_MS) {
            console.error(`[poll] audit=${id} polling timed out after ${MAX_POLL_DURATION_MS / 1000}s`);
            if (!cancelled) {
              setAudit({
                ...data,
                status: "error",
                error_message:
                  "Processing is taking longer than expected. Please refresh the page to check for results, or try uploading again.",
              });
            }
            return;
          }
          // Poll faster during first 30s (every 1.5s), then slow down to every 3s
          const pollInterval = elapsedMs < 30_000 ? 1500 : 3000;
          timer = setTimeout(fetchAudit, pollInterval);
        }
      } catch (err) {
        console.warn(`[poll] audit=${id} fetch error:`, err);
        if (!cancelled) {
          timer = setTimeout(fetchAudit, 3000);
        }
      }
    }

    fetchAudit();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  if (notFound) {
    return (
      <main className="flex flex-col items-center px-4 py-24 text-center">
        <h1 className="text-2xl font-bold mb-2">Audit not found</h1>
        <p className="text-gray-500 mb-6">
          We couldn&apos;t locate this audit. It may have been removed or the
          link is incorrect.
        </p>
        <Link href="/upload" className="text-blue-700 underline">
          Start a new audit
        </Link>
      </main>
    );
  }

  if (!audit) {
    return (
      <main className="flex flex-col items-center justify-center px-4 py-24">
        <Loader2 className="h-8 w-8 animate-spin text-blue-700" />
        <p className="mt-4 text-gray-500">Loading audit…</p>
      </main>
    );
  }

  const status = audit.status;
  const freeFindings = audit.free_findings ?? [];
  const paidFindings = audit.paid_findings ?? [];

  const estimatedOvercharge = audit.estimated_overcharge ?? 0;
  const overchargeBreakdown = audit.overcharge_breakdown ?? [];
  const hasOvercharge = estimatedOvercharge > 0 && overchargeBreakdown.length > 0;

  // Summary must reflect ALL findings, not just preview/free-tier findings.
  // Calculate effective savings from the full findings set so savings are never
  // zeroed out just because preview findings are limited.
  const totalFindings = [...freeFindings, ...paidFindings];
  const totalFindingsCount = totalFindings.length;
  const totalSavingsFromFindings = totalFindings
    .reduce((sum, f) => sum + f.potential_savings, 0);
  const dbSavings = audit.savings_estimate ?? 0;
  const savingsEstimate = Math.max(dbSavings, totalSavingsFromFindings);

  // The summary state is determined by total findings count — if any findings
  // exist (including insufficient-data findings), discrepancies were detected.
  const hasFindings = totalFindingsCount > 0;

  // Data-driven: if non-empty findings exist, the audit is effectively complete.
  // An empty array may be a DB default, not actual results.
  const hasResultData =
    Array.isArray(audit.free_findings) && audit.free_findings.length > 0;
  const isComplete = status === "completed" || (hasResultData && status !== "error");
  const isProcessing =
    (status === "pending" || status === "processing") && !hasResultData;

  return (
    <main className="flex flex-col items-center px-4 py-16 sm:py-24">
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Audit Results</h1>
          <StatusBadge status={isComplete ? "completed" : status} />
        </div>

        {/* Processing state — pass isComplete so progress jumps to 100% when backend finishes */}
        {isProcessing && <AuditProgress isComplete={false} />}

        {/* Error state */}
        {status === "error" && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-6 text-center">
            <p className="text-red-800 font-medium">
              Something went wrong during processing.
            </p>
            {audit.error_message && (
              <p className="text-sm text-red-600 mt-2">
                {audit.error_message}
              </p>
            )}
            <Link
              href="/upload"
              className="inline-block mt-4 text-sm text-blue-700 underline"
            >
              Try again
            </Link>
          </div>
        )}

        {/* Completed state */}
        {isComplete && (
          <>
            {/* Document swap warning */}
            {audit.was_swapped && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
                <RefreshCw className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800">
                  The uploaded documents appeared to be swapped. The system
                  automatically corrected the order for analysis.
                </p>
              </div>
            )}

            {/* Limited audit mode banner */}
            {audit.audit_mode === "limited" && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                <p className="text-sm text-blue-800">
                  Limited Review: Some checks could not be completed due to
                  missing or unclear data.
                </p>
              </div>
            )}

            {/* Validation info (full mode — contextual notes) */}
            {audit.validation_warning &&
              audit.audit_mode !== "limited" && (() => {
                const w = audit.validation_warning;
                // Determine if this is purely informational (derived total / prior year note)
                // vs a real data-gap warning
                const isInfoOnly =
                  !w.includes("limited data") &&
                  !w.includes("could not be completed");
                const bgClass = isInfoOnly
                  ? "bg-blue-50 border-blue-200"
                  : "bg-amber-50 border-amber-200";
                const iconClass = isInfoOnly
                  ? "text-blue-500"
                  : "text-amber-600";
                const textClass = isInfoOnly
                  ? "text-blue-700"
                  : "text-amber-800";
                return (
                  <div className={`rounded-lg ${bgClass} p-4 flex items-start gap-3`}>
                    <AlertTriangle className={`h-5 w-5 ${iconClass} mt-0.5 shrink-0`} />
                    <p className={`text-sm ${textClass}`}>{w}</p>
                  </div>
                );
              })()}

            {/* Confidence indicator */}
            {audit.confidence && (
              <ConfidenceIndicator
                level={audit.confidence}
                score={audit.confidence_score ?? 0}
              />
            )}

            {/* Lease Clauses Detected */}
            {audit.lease_clauses_summary && (
              <LeaseClausesSection summary={audit.lease_clauses_summary} />
            )}

            {/* Savings estimate / Overcharge detected */}
            {hasOvercharge ? (
              <div className="rounded-xl bg-red-50 border border-red-200 p-8">
                <div className="text-center space-y-3">
                  <p className="text-xs text-red-800 font-semibold uppercase tracking-widest">
                    Estimated Recoverable Overcharges
                  </p>
                  <p className="text-5xl font-bold text-red-700">
                    ${estimatedOvercharge.toLocaleString()}
                  </p>
                  <p className="text-sm text-red-600 leading-relaxed max-w-md mx-auto">
                    Based on detected discrepancies across uploaded lease and CAM documents. Professional review recommended to confirm.
                  </p>
                </div>

                {/* Overcharge breakdown table */}
                <div className="mt-8 overflow-x-auto">
                  <table className="w-full text-sm border-separate" style={{ borderSpacing: "0 0" }}>
                    <thead>
                      <tr className="border-b-2 border-red-200">
                        <th className="pb-3 pr-4 font-semibold text-red-800 text-left w-[28%]">Category</th>
                        <th className="pb-3 px-3 font-semibold text-red-800 text-right w-[18%]">Total Expense</th>
                        <th className="pb-3 px-3 font-semibold text-red-800 text-center w-[14%]">Tenant Share</th>
                        <th className="pb-3 px-3 font-semibold text-red-800 text-right w-[18%]">Tenant Charge</th>
                        <th className="pb-3 pl-4 font-semibold text-red-800 text-left w-[22%]">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overchargeBreakdown.map((row, i) => (
                        <tr key={i} className="border-b border-red-100 last:border-0">
                          <td className="py-3 pr-4 text-gray-800 capitalize">{row.category}</td>
                          <td className="py-3 px-3 text-gray-800 text-right tabular-nums">${row.total_expense.toLocaleString()}</td>
                          <td className="py-3 px-3 text-gray-800 text-center tabular-nums">{row.tenant_share_percent}%</td>
                          <td className="py-3 px-3 font-semibold text-red-700 text-right tabular-nums">${row.tenant_charge.toLocaleString()}</td>
                          <td className="py-3 pl-4 text-gray-500 text-sm">{row.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Source Evidence */}
                {overchargeBreakdown.some((r) => r.sourceEvidence) && (
                  <div className="mt-8 pt-6 border-t border-red-200">
                    <p className="text-xs font-semibold text-red-800 uppercase tracking-widest mb-4">
                      Source Evidence
                    </p>
                    <div className="space-y-3">
                      {overchargeBreakdown
                        .filter((r) => r.sourceEvidence)
                        .map((row, i) => (
                          <SourceEvidenceCard
                            key={i}
                            category={row.category}
                            evidence={row.sourceEvidence!}
                            totalExpense={row.total_expense}
                            tenantShare={row.tenant_share_percent}
                            tenantCharge={row.tenant_charge}
                          />
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ) : savingsEstimate > 0 ? (
              <div className="rounded-xl bg-green-50 border border-green-200 p-8 text-center space-y-3">
                <p className="text-xs text-green-800 font-semibold uppercase tracking-widest">
                  Estimated Recoverable Overcharges
                </p>
                <p className="text-5xl font-bold text-green-700">
                  ${savingsEstimate.toLocaleString()}
                </p>
                <p className="text-sm text-green-600 leading-relaxed max-w-md mx-auto">
                  Based on detected discrepancies across uploaded lease and CAM documents. Professional review recommended to confirm.
                </p>
              </div>
            ) : hasFindings ? (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-8 text-center space-y-3">
                <p className="text-xs text-amber-800 font-semibold uppercase tracking-widest">
                  Potential Discrepancies Detected
                </p>
                <p className="text-sm text-amber-700 leading-relaxed max-w-md mx-auto">
                  The audit detected potential discrepancies in your CAM reconciliation that warrant further review.
                  {savingsEstimate > 0 && (
                    <> Estimated recoverable overcharges: <span className="font-semibold">${savingsEstimate.toLocaleString()}</span>.</>
                  )}
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-8 text-center space-y-3">
                <p className="text-xs text-gray-600 font-semibold uppercase tracking-widest">
                  No Clear Overcharges Detected
                </p>
                <p className="text-sm text-gray-500 leading-relaxed max-w-md mx-auto">
                  The uploaded documents did not show a clear recoverable billing discrepancy based on current audit checks.
                </p>
              </div>
            )}

            {/* Download report */}
            {audit.report_pdf_url && (
              <div className="text-center">
                <a
                  href={`/api/audit/${audit.id}/report`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-500 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Download Audit Report
                </a>
              </div>
            )}

            {/* Free findings */}
            <AuditResultsFree
              findings={freeFindings}
              leaseClausesSummary={audit.lease_clauses_summary}
            />

            {/* Locked findings with conversion CTA — always shown */}
            <AuditResultsPaid
              findings={paidFindings}
              premiumSavings={paidFindings
                .filter((f) => !f.insufficientData)
                .reduce((sum, f) => sum + f.potential_savings, 0)}
              overchargeBreakdown={overchargeBreakdown}
              leaseClausesSummary={audit.lease_clauses_summary}
            />
          </>
        )}

        {/* Disclaimer */}
        <p className="text-xs text-gray-400 text-center">
          AI-powered analysis for informational purposes only. Not legal or
          accounting advice.
        </p>

        <div className="text-center space-x-4">
          <Link href="/upload" className="text-sm text-blue-700 underline">
            Back to Upload
          </Link>
          <span className="text-xs text-gray-300">|</span>
          <Link href="/upload" className="text-sm text-gray-500 underline">
            Run another audit
          </Link>
        </div>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: {
      label: "Pending",
      className: "bg-yellow-100 text-yellow-800",
    },
    processing: {
      label: "Processing…",
      className: "bg-yellow-100 text-yellow-800",
    },
    completed: {
      label: "Complete",
      className: "bg-green-100 text-green-800",
    },
    error: {
      label: "Error",
      className: "bg-red-100 text-red-800",
    },
  };

  const { label, className } = map[status] ?? map.pending;

  return (
    <span
      className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full ${className}`}
    >
      {label}
    </span>
  );
}

function ConfidenceIndicator({
  level,
  score,
}: {
  level: "high" | "medium" | "low";
  score: number;
}) {
  const config = {
    high: {
      label: "High",
      color: "text-green-700",
      bg: "bg-green-100",
      barColor: "bg-green-500",
    },
    medium: {
      label: "Medium",
      color: "text-amber-700",
      bg: "bg-amber-100",
      barColor: "bg-amber-500",
    },
    low: {
      label: "Low",
      color: "text-red-700",
      bg: "bg-red-100",
      barColor: "bg-red-500",
    },
  };

  const c = config[level];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">
          Audit Confidence
        </span>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.color}`}
        >
          {c.label}
        </span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${c.barColor} transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 mt-1.5">
        Based on completeness of extracted data and document clarity.
      </p>
    </div>
  );
}

function SourceEvidenceCard({
  category,
  evidence,
  totalExpense,
  tenantShare,
  tenantCharge,
}: {
  category: string;
  evidence: SourceEvidence;
  totalExpense: number;
  tenantShare: number;
  tenantCharge: number;
}) {
  return (
    <div className="rounded-lg bg-white/60 border border-red-100 p-4">
      <div className="flex items-start gap-3 mb-2">
        <FileText className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-900 capitalize">
            {category}
          </p>
          {evidence.findingCategory && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-50 text-red-600">
              {evidence.findingCategory}
            </span>
          )}
        </div>
      </div>
      <div className="ml-7 text-xs text-gray-500 space-y-1.5">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <p>
            <span className="font-medium text-gray-700">Document:</span>{" "}
            {evidence.document}
          </p>
          {evidence.page != null && (
            <p>
              <span className="font-medium text-gray-700">Page:</span>{" "}
              {evidence.page}
            </p>
          )}
        </div>
        {evidence.extractedText && (
          <div className="mt-2 pl-3 border-l-2 border-red-200">
            <p className="text-xs text-gray-600 italic leading-relaxed">
              &ldquo;{evidence.extractedText}&rdquo;
            </p>
          </div>
        )}
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          <span>
            <span className="font-medium text-gray-700">Detected Amount:</span>{" "}
            <span className="tabular-nums">
              ${totalExpense.toLocaleString()}
            </span>
          </span>
          <span>
            <span className="font-medium text-gray-700">Tenant Share:</span>{" "}
            <span className="tabular-nums">{tenantShare}%</span>
          </span>
          <span>
            <span className="font-medium text-red-700">Overcharge:</span>{" "}
            <span className="tabular-nums font-semibold text-red-700">
              ${tenantCharge.toLocaleString()}
            </span>
          </span>
        </p>
      </div>
    </div>
  );
}

function LeaseClausesSection({ summary }: { summary: LeaseClauseSummary }) {
  const clauses: Array<{ label: string; value: string }> = [];

  if (summary.camCap) clauses.push({ label: "CAM Cap", value: summary.camCap });
  if (summary.adminFeeCap) clauses.push({ label: "Admin Fee Cap", value: summary.adminFeeCap });
  if (summary.managementFeeCap) clauses.push({ label: "Management Fee Cap", value: summary.managementFeeCap });
  if (summary.tenantProRataShare) clauses.push({ label: "Tenant Pro-Rata Share", value: summary.tenantProRataShare });
  if (summary.tenantSquareFootage) clauses.push({ label: "Tenant Square Footage", value: summary.tenantSquareFootage });
  if (summary.buildingSquareFootage) clauses.push({ label: "Building Square Footage", value: summary.buildingSquareFootage });

  if (clauses.length === 0 && summary.excludedCategories.length === 0 && summary.additionalClauses.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-center gap-3 mb-4">
        <FileText className="h-5 w-5 text-blue-600" />
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Lease Clauses Detected
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Detected from lease language and extracted clause patterns.
          </p>
        </div>
      </div>

      {clauses.length > 0 && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
          {clauses.map((c, i) => (
            <div key={i} className="flex justify-between items-baseline border-b border-gray-100 pb-2">
              <span className="text-xs text-gray-500">{c.label}</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">{c.value}</span>
            </div>
          ))}
        </div>
      )}

      {summary.excludedCategories.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 mb-1.5">Excluded Categories</p>
          <div className="flex flex-wrap gap-1.5">
            {summary.excludedCategories.map((cat, i) => (
              <span
                key={i}
                className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 capitalize"
              >
                {cat}
              </span>
            ))}
          </div>
        </div>
      )}

      {summary.additionalClauses.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Additional Provisions</p>
          <ul className="space-y-1">
            {summary.additionalClauses.map((clause, i) => (
              <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                <span className="text-blue-400 mt-0.5">&#8226;</span>
                {clause}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
