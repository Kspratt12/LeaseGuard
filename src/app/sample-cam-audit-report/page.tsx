import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  DollarSign,
  FileText,
  CheckCircle,
  ArrowRight,
  ClipboardList,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Example CAM Audit Report for Commercial Tenants",
  description:
    "See how LeaseGuard identifies CAM overcharges and billing discrepancies in commercial leases.",
  keywords: [
    "CAM audit report example",
    "sample CAM audit",
    "CAM overcharge report",
    "commercial lease audit report",
    "CAM reconciliation findings",
    "CAM audit discrepancies",
    "common area maintenance audit example",
  ],
};

const findings = [
  {
    type: "CAM Cap Exceeded",
    description:
      "Billed CAM charges exceed the annual cap defined in lease section 4.2. The lease limits annual CAM increases to 5%, but the reconciliation statement reflects a 9.3% year-over-year increase.",
    impact: 4800,
    severity: "high" as const,
  },
  {
    type: "Administrative Fee Cap Exceeded",
    description:
      "The lease limits administrative fees to 5% of total operating expenses (section 7.1), but the reconciliation statement includes a 12% administrative surcharge applied to all expense categories.",
    impact: 3200,
    severity: "high" as const,
  },
  {
    type: "Excluded Expense Category Billed",
    description:
      "Lobby renovation costs of $18,400 were included in the reconciliation statement under general maintenance. Lease section 5.4 explicitly excludes capital improvements and cosmetic upgrades from tenant pass-throughs.",
    impact: 2750,
    severity: "medium" as const,
  },
  {
    type: "Pro Rata Share Calculation Issue",
    description:
      "The reconciliation statement calculates tenant share using 12,500 sq ft against a building total of 48,000 sq ft (26.04%). The lease specifies tenant premises as 12,500 sq ft against 52,000 sq ft total leasable area (24.04%).",
    impact: 1900,
    severity: "medium" as const,
  },
];

const severityColor = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-blue-50 text-blue-700 border-blue-200",
};

const severityIcon = {
  high: "text-red-500",
  medium: "text-amber-500",
  low: "text-blue-500",
};

const reportIncludes = [
  "Lease clause analysis with section-by-section review of expense provisions",
  "CAM reconciliation comparison against lease-defined caps, exclusions, and formulas",
  "Overcharge calculations with estimated dollar impact for each discrepancy",
  "Source evidence references linking each finding to specific lease clauses and statement line items",
  "Downloadable PDF audit report ready to share with your landlord or legal counsel",
];

export default function SampleCamAuditReportPage() {
  const totalImpact = findings.reduce((sum, f) => sum + f.impact, 0);

  return (
    <main className="bg-white">
      {/* Section 1: Hero */}
      <section className="border-b border-gray-100 bg-gray-50/60">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-16 sm:py-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700 mb-6">
            <ClipboardList className="h-4 w-4" />
            Sample Report
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold text-gray-900 tracking-tight leading-tight">
            Example CAM Audit Report
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            This page shows a realistic example of the type of discrepancies
            LeaseGuard identifies when analyzing commercial leases and CAM
            reconciliation statements. Each finding below represents a common
            billing issue that costs tenants thousands of dollars every year.
          </p>
          <p className="mt-4 text-sm text-gray-500 max-w-xl mx-auto">
            The data below is illustrative and based on patterns found across
            real commercial lease audits. Your actual results will vary based on
            your lease terms and reconciliation statement.
          </p>
        </div>
      </section>

      {/* Section 2: Example Findings */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 py-16 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-4">
          Example Findings
        </h2>
        <p className="text-gray-600 text-center max-w-2xl mx-auto mb-12 leading-relaxed">
          A typical{" "}
          <Link
            href="/cam-audit"
            className="text-blue-600 hover:underline"
          >
            CAM audit
          </Link>{" "}
          may surface several discrepancies. Below are four findings from an
          example report with a combined estimated impact of{" "}
          <span className="font-semibold text-gray-900">
            ${totalImpact.toLocaleString()}
          </span>
          .
        </p>

        <div className="space-y-5">
          {findings.map((finding) => (
            <div
              key={finding.type}
              className="rounded-xl border border-gray-200 p-6 hover:shadow-sm transition-all"
            >
              <div className="flex items-start gap-4">
                <div className="shrink-0 mt-0.5">
                  <AlertTriangle
                    className={`h-5 w-5 ${severityIcon[finding.severity]}`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {finding.type}
                    </h3>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${severityColor[finding.severity]}`}
                    >
                      {finding.severity} severity
                    </span>
                  </div>
                  <p className="text-gray-600 leading-relaxed">
                    {finding.description}
                  </p>
                  <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-green-700">
                    <DollarSign className="h-4 w-4" />
                    Estimated impact: ${finding.impact.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-blue-100 bg-blue-50/50 p-5 text-center">
          <p className="text-sm text-blue-800">
            <span className="font-semibold">Total estimated impact:</span>{" "}
            ${totalImpact.toLocaleString()} in potential overcharges identified
            across 4 findings
          </p>
        </div>
      </section>

      {/* Section 3: What the Full Report Includes */}
      <section className="border-t border-b border-gray-100 bg-gray-50/60">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-16 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-4">
            What the Full Report Includes
          </h2>
          <p className="text-gray-600 text-center max-w-2xl mx-auto mb-12 leading-relaxed">
            When you run a LeaseGuard audit, your report covers every aspect of
            your lease&apos;s expense provisions compared against your
            reconciliation statement.
          </p>

          <div className="max-w-2xl mx-auto space-y-4">
            {reportIncludes.map((item) => (
              <div key={item} className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                <p className="text-gray-700 leading-relaxed">{item}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <p className="text-sm text-gray-500">
              Learn more about the audit process on our{" "}
              <Link
                href="/cam-audit"
                className="text-blue-600 hover:underline"
              >
                CAM audit page
              </Link>
              , or explore our{" "}
              <Link
                href="/resources"
                className="text-blue-600 hover:underline"
              >
                resource center
              </Link>{" "}
              for guides on CAM charges and reconciliation.
            </p>
          </div>
        </div>
      </section>

      {/* Section 4: CTA */}
      <section>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16 sm:py-20 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-600 mb-6">
            <FileText className="h-6 w-6" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
            Run Your Own CAM Audit
          </h2>
          <p className="text-gray-600 mb-8 max-w-xl mx-auto leading-relaxed">
            Upload your lease agreement and CAM reconciliation statement to see
            what discrepancies LeaseGuard finds in your actual documents.
            Results are delivered in about 60 seconds.
          </p>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-8 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-blue-500 hover:shadow-md transition-all"
          >
            Run 60-Second Audit <ArrowRight className="h-4 w-4" />
          </Link>
          <div className="mt-6 flex items-center justify-center gap-6 text-sm text-gray-500">
            <Link
              href="/cam-audit"
              className="hover:text-blue-600 transition-colors"
            >
              CAM Audit
            </Link>
            <span className="text-gray-300">&middot;</span>
            <Link
              href="/resources"
              className="hover:text-blue-600 transition-colors"
            >
              Resources
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
