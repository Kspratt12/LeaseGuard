import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Triple Net Lease Audit | Review NNN Charges",
  description:
    "Audit triple net lease expenses including CAM, insurance, and property taxes.",
  keywords: [
    "triple net lease audit",
    "NNN lease audit",
    "NNN charges",
    "triple net lease expenses",
    "NNN lease overcharges",
    "commercial lease audit",
    "NNN billing review",
  ],
};

export default function TripleNetLeaseAudit() {
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
            Triple Net Lease Audit for Tenants
          </h1>
          <div className="mt-4 flex items-center gap-3 text-sm text-gray-500">
            <time>March 2026</time>
            <span className="text-gray-300">&middot;</span>
            <span>7 min read</span>
          </div>
        </div>
      </div>

      {/* Article body */}
      <article className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
        <div className="prose prose-gray prose-lg max-w-none [&>h2]:text-2xl [&>h2]:font-semibold [&>h2]:text-gray-900 [&>h2]:mt-10 [&>h2]:mb-4 [&>h3]:text-xl [&>h3]:font-semibold [&>h3]:text-gray-800 [&>h3]:mt-8 [&>h3]:mb-3 [&>p]:text-gray-600 [&>p]:leading-relaxed [&>p]:mb-5 [&>ul]:text-gray-600 [&>ul]:leading-relaxed [&>ul]:mb-5 [&>ul]:space-y-2 [&>ol]:text-gray-600 [&>ol]:leading-relaxed [&>ol]:mb-5 [&>ol]:space-y-2 [&_li]:pl-1">
          <p>
            Triple net leases &mdash; commonly referred to as NNN leases &mdash;
            require tenants to pay their share of property taxes, insurance, and
            common area maintenance on top of base rent. These additional charges
            can represent a significant portion of total occupancy costs, and
            errors in how they are calculated or billed are common.
          </p>

          <h2>What Is a Triple Net Lease?</h2>
          <p>
            A triple net lease is a commercial lease structure where the tenant
            is responsible for three categories of property expenses in addition
            to base rent:
          </p>
          <ul>
            <li>
              <strong>Property taxes</strong> &mdash; The tenant&apos;s pro rata
              share of real estate taxes assessed on the property
            </li>
            <li>
              <strong>Insurance</strong> &mdash; The tenant&apos;s share of
              property insurance premiums, including liability and casualty
              coverage
            </li>
            <li>
              <strong>Common area maintenance (CAM)</strong> &mdash; Operating
              expenses for shared areas including landscaping, cleaning,
              security, and repairs
            </li>
          </ul>
          <p>
            NNN leases are standard in retail and commercial real estate. While
            they offer landlords predictable cost recovery, they shift financial
            risk to tenants &mdash; making it critical for tenants to verify that
            each charge complies with their lease terms. For a deeper look at how{" "}
            <Link
              href="/resources/cam-charges-explained"
              className="text-blue-600 hover:underline"
            >
              CAM charges
            </Link>{" "}
            work, see our detailed guide.
          </p>

          <h2>Common NNN Billing Issues</h2>
          <p>
            Because NNN leases cover multiple expense categories, there are more
            opportunities for billing errors and overcharges. Some of the most
            common issues tenants encounter include:
          </p>

          <h3>CAM Discrepancies</h3>
          <ul>
            <li>
              Management fees exceeding the lease-defined cap percentage
            </li>
            <li>
              <Link
                href="/resources/can-landlords-charge-capital-expenses"
                className="text-blue-600 hover:underline"
              >
                Capital improvements
              </Link>{" "}
              classified as maintenance and passed through as CAM
            </li>
            <li>
              Expenses excluded by the lease appearing on reconciliation
              statements
            </li>
            <li>
              Year-over-year CAM increases that exceed contractual escalation
              caps
            </li>
          </ul>

          <h3>Tax Discrepancies</h3>
          <ul>
            <li>
              Property tax bills allocated using incorrect square footage or pro
              rata share percentages
            </li>
            <li>
              Tax reassessments passed through without adjusting for exemptions
              or appeals
            </li>
            <li>
              Tenants billed for tax increases related to landlord improvements
              the lease excludes
            </li>
          </ul>

          <h3>Insurance Discrepancies</h3>
          <ul>
            <li>
              Insurance premiums increasing significantly without explanation or
              documentation
            </li>
            <li>
              Coverage types not required by the lease included in tenant
              pass-throughs
            </li>
            <li>
              Insurance costs for landlord-owned improvements billed to tenants
            </li>
          </ul>
          <p>
            Many of these issues are documented in our guide to{" "}
            <Link
              href="/resources/common-cam-overcharges"
              className="text-blue-600 hover:underline"
            >
              common CAM overcharges tenants miss
            </Link>{" "}
            and our overview of{" "}
            <Link
              href="/resources/hidden-costs-in-nnn-leases"
              className="text-blue-600 hover:underline"
            >
              hidden costs in NNN leases
            </Link>
            .
          </p>

          <h2>How LeaseGuard Helps Audit NNN Charges</h2>
          <p>
            LeaseGuard is designed to help commercial tenants review their lease
            charges quickly and identify potential discrepancies. While the
            platform focuses on CAM clause analysis and reconciliation statement
            review, these are typically the largest and most error-prone
            components of NNN lease expenses.
          </p>
          <p>The audit process works as follows:</p>
          <ol>
            <li>
              Upload your commercial lease PDF along with one or more annual CAM
              reconciliation statements from your landlord
            </li>
            <li>
              LeaseGuard extracts key provisions &mdash; CAM caps, admin fee
              limits, excluded expenses, and pro rata share terms
            </li>
            <li>
              The system compares billed charges against your lease terms and
              flags potential discrepancies
            </li>
            <li>
              Review findings and download a detailed audit report with
              source-level evidence
            </li>
          </ol>
          <p>
            For a complete walkthrough of the audit process, see our guide on{" "}
            <Link
              href="/resources/how-to-audit-cam-charges"
              className="text-blue-600 hover:underline"
            >
              how to audit CAM charges
            </Link>
            . You can also review our{" "}
            <Link
              href="/resources/cam-reconciliation-guide"
              className="text-blue-600 hover:underline"
            >
              CAM reconciliation guide
            </Link>{" "}
            for details on how reconciliation statements work.
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
