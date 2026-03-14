import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "CAM Reconciliation Audit | Identify Overcharges",
  description:
    "Analyze CAM reconciliation statements and detect potential lease overcharges using LeaseGuard.",
  keywords: [
    "CAM reconciliation audit",
    "CAM reconciliation statement",
    "CAM overcharges",
    "commercial lease reconciliation",
    "CAM expense audit",
    "reconciliation statement review",
  ],
};

export default function CamReconciliationAudit() {
  return (
    <main className="bg-white">
      {/* Header */}
      <div className="border-b border-gray-100 bg-gray-50/60">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
          <Link
            href="/resources"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors mb-6"
          >
            &larr; All Resources
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight tracking-tight">
            CAM Reconciliation Audit Guide
          </h1>
          <div className="mt-4 flex items-center gap-3 text-sm text-gray-500">
            <time>March 2026</time>
            <span className="text-gray-300">&middot;</span>
            <span>6 min read</span>
          </div>
        </div>
      </div>

      {/* Article body */}
      <article className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
        <div className="prose prose-gray prose-lg max-w-none [&>h2]:text-2xl [&>h2]:font-semibold [&>h2]:text-gray-900 [&>h2]:mt-10 [&>h2]:mb-4 [&>h3]:text-xl [&>h3]:font-semibold [&>h3]:text-gray-800 [&>h3]:mt-8 [&>h3]:mb-3 [&>p]:text-gray-600 [&>p]:leading-relaxed [&>p]:mb-5 [&>ul]:text-gray-600 [&>ul]:leading-relaxed [&>ul]:mb-5 [&>ul]:space-y-2 [&>ol]:text-gray-600 [&>ol]:leading-relaxed [&>ol]:mb-5 [&>ol]:space-y-2 [&_li]:pl-1">
          <p>
            Every year, commercial landlords send tenants a CAM reconciliation
            statement that adjusts estimated charges against actual expenses.
            These statements often contain discrepancies that go unnoticed
            &mdash; costing tenants thousands of dollars annually. A CAM
            reconciliation audit is the process of reviewing those statements to
            verify accuracy and identify potential overcharges.
          </p>

          <h2>What Is CAM Reconciliation?</h2>
          <p>
            CAM reconciliation is the annual process where a landlord compares
            the estimated{" "}
            <Link
              href="/resources/cam-charges-explained"
              className="text-blue-600 hover:underline"
            >
              CAM charges
            </Link>{" "}
            a tenant paid during the year to the actual operating expenses
            incurred for the property. If actual costs exceeded the estimates,
            the tenant receives a bill for the difference. If the estimates were
            higher, the tenant may receive a credit.
          </p>
          <p>
            The landlord issues a{" "}
            <Link
              href="/resources/cam-reconciliation-guide"
              className="text-blue-600 hover:underline"
            >
              CAM reconciliation statement
            </Link>{" "}
            that details each expense category, the total actual cost, the
            tenant&apos;s pro rata share, and the resulting adjustment. These
            statements can be complex and are frequently a source of billing
            errors.
          </p>

          <h2>Why Tenants Audit CAM Reconciliation</h2>
          <p>
            Reconciliation statements are prepared by the landlord or their
            property management company, and tenants rarely have visibility into
            the underlying expense records. This creates an environment where
            errors &mdash; whether intentional or accidental &mdash; can persist
            for years without being caught.
          </p>
          <p>Common risks include:</p>
          <ul>
            <li>
              Expenses that are excluded under the lease being included in the
              reconciliation
            </li>
            <li>
              Management fees calculated at a higher percentage than the lease
              permits
            </li>
            <li>
              Pro rata share percentages based on incorrect square footage
              figures
            </li>
            <li>
              <Link
                href="/resources/can-landlords-charge-capital-expenses"
                className="text-blue-600 hover:underline"
              >
                Capital expenditures
              </Link>{" "}
              passed through as operating expenses
            </li>
            <li>
              Year-over-year increases that exceed contractual escalation caps
            </li>
          </ul>
          <p>
            Many tenants do not realize they have the right to audit these
            statements. Most commercial leases include an audit clause that
            allows tenants to review the landlord&apos;s books and records
            related to CAM charges. Understanding{" "}
            <Link
              href="/resources/common-cam-overcharges"
              className="text-blue-600 hover:underline"
            >
              common CAM overcharges
            </Link>{" "}
            is the first step toward protecting your business.
          </p>

          <h2>How LeaseGuard Helps</h2>
          <p>
            LeaseGuard automates the reconciliation audit process. Instead of
            hiring consultants or manually cross-referencing documents, tenants
            can upload their lease and reconciliation statements and receive an
            automated analysis in about 60 seconds.
          </p>
          <p>The system works by:</p>
          <ul>
            <li>
              Extracting key lease provisions &mdash; CAM caps, admin fee
              limits, excluded expense categories, and pro rata share terms
            </li>
            <li>
              Parsing each line item on the reconciliation statement and
              comparing it against the lease terms
            </li>
            <li>
              Flagging charges that appear to exceed lease limits, include
              excluded categories, or contain calculation inconsistencies
            </li>
            <li>
              Supporting multi-year uploads for year-over-year comparison to
              detect escalation patterns
            </li>
          </ul>
          <p>
            For a step-by-step walkthrough, see our guide on{" "}
            <Link
              href="/resources/how-to-audit-cam-charges"
              className="text-blue-600 hover:underline"
            >
              how to audit CAM charges
            </Link>
            .
          </p>

          <h2>Related Resources</h2>
          <ul>
            <li>
              <Link
                href="/resources/cam-charges-explained"
                className="text-blue-600 hover:underline"
              >
                CAM Charges Explained
              </Link>
            </li>
            <li>
              <Link
                href="/resources/cam-reconciliation-guide"
                className="text-blue-600 hover:underline"
              >
                CAM Reconciliation Guide
              </Link>
            </li>
            <li>
              <Link
                href="/resources/how-to-audit-cam-charges"
                className="text-blue-600 hover:underline"
              >
                How to Audit CAM Charges
              </Link>
            </li>
            <li>
              <Link
                href="/resources/common-cam-overcharges"
                className="text-blue-600 hover:underline"
              >
                Common CAM Overcharges Tenants Miss
              </Link>
            </li>
          </ul>
        </div>
      </article>

      {/* CTA */}
      <section className="border-t border-gray-100 bg-gray-50/60">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 sm:py-18 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            Run Your CAM Audit
          </h2>
          <p className="text-gray-600 mb-8 max-w-xl mx-auto leading-relaxed">
            Upload your lease and CAM reconciliation statement. LeaseGuard
            identifies potential billing discrepancies in about 60 seconds.
          </p>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-7 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-500 hover:shadow-md transition-all"
          >
            Run 60-Second Audit
            <ArrowRight className="h-4 w-4" />
          </Link>
          <div className="mt-6 flex items-center justify-center gap-6 text-sm text-gray-500">
            <Link
              href="/resources"
              className="hover:text-blue-600 transition-colors"
            >
              More Resources
            </Link>
            <span className="text-gray-300">&middot;</span>
            <Link
              href="/#pricing"
              className="hover:text-blue-600 transition-colors"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
