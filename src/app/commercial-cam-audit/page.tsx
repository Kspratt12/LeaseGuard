import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Commercial CAM Audit | Detect CAM Overcharges",
  description:
    "Run a commercial CAM audit in seconds. Upload your lease and CAM reconciliation statement to identify potential billing discrepancies.",
  keywords: [
    "commercial CAM audit",
    "CAM overcharges",
    "CAM audit for tenants",
    "common area maintenance audit",
    "commercial lease audit",
    "CAM billing discrepancies",
  ],
};

export default function CommercialCamAudit() {
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
            Commercial CAM Audit for Tenants
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
            Commercial tenants pay thousands of dollars each year in common area
            maintenance charges. A CAM audit is the process of reviewing those
            charges against your lease terms to identify billing errors,
            unauthorized expenses, and calculation mistakes that could be costing
            your business money.
          </p>

          <h2>What Is a Commercial CAM Audit?</h2>
          <p>
            A commercial CAM audit compares the expenses listed on your
            landlord&apos;s{" "}
            <Link
              href="/resources/cam-reconciliation-guide"
              className="text-blue-600 hover:underline"
            >
              CAM reconciliation statement
            </Link>{" "}
            against the terms defined in your lease agreement. The goal is to
            verify that every charge passed through to you is permitted under
            your lease, calculated correctly, and properly allocated.
          </p>
          <p>
            Most commercial leases include provisions governing what expenses
            landlords can include in{" "}
            <Link
              href="/resources/cam-charges-explained"
              className="text-blue-600 hover:underline"
            >
              CAM charges
            </Link>
            , how those expenses are shared among tenants, and what limits or
            caps apply. An audit checks whether the landlord&apos;s billing
            aligns with those provisions.
          </p>

          <h2>Common CAM Overcharges</h2>
          <p>
            CAM overcharges are more common than most tenants realize. Without a
            systematic review, these discrepancies often go undetected year after
            year. Here are some of the most frequent issues identified in{" "}
            <Link
              href="/resources/common-cam-overcharges"
              className="text-blue-600 hover:underline"
            >
              commercial CAM audits
            </Link>
            :
          </p>
          <ul>
            <li>
              <strong>Inflated management fees</strong> &mdash; Landlords may
              charge administrative or management fees that exceed the percentage
              cap defined in the lease. A fee listed at 8% when the lease caps
              it at 5% results in a direct overcharge.
            </li>
            <li>
              <strong>Incorrect pro rata share calculations</strong> &mdash; If
              your tenant share percentage is calculated using the wrong square
              footage or an incorrect total leasable area, every expense line
              item will be inflated.
            </li>
            <li>
              <strong>Capital expenses billed improperly</strong> &mdash; Lease
              agreements often exclude capital improvements from CAM charges.
              When landlords include items like roof replacements or parking lot
              resurfacing, tenants may be paying for{" "}
              <Link
                href="/resources/can-landlords-charge-capital-expenses"
                className="text-blue-600 hover:underline"
              >
                expenses their lease does not permit
              </Link>
              .
            </li>
            <li>
              <strong>Maintenance vs. capital confusion</strong> &mdash; There
              is often a gray area between routine maintenance and capital
              expenditures. Landlords may categorize capital work as maintenance
              to pass costs through to tenants under CAM provisions.
            </li>
          </ul>

          <h2>How LeaseGuard Performs a CAM Audit</h2>
          <p>
            LeaseGuard automates the CAM audit process so commercial tenants can
            review their charges without hiring a consultant or spending weeks on
            manual analysis. Here is how the process works:
          </p>
          <ol>
            <li>
              <strong>Upload your lease and CAM reconciliation statement</strong>{" "}
              &mdash; Upload a PDF of your commercial lease (specifically the
              CAM or operating expense section) along with one or more annual CAM
              reconciliation statements from your landlord.
            </li>
            <li>
              <strong>LeaseGuard analyzes clauses and expenses</strong> &mdash;
              The system extracts key lease provisions including CAM caps, admin
              fee limits, excluded expense categories, and pro rata share terms.
              It then compares each billed expense against those provisions.
            </li>
            <li>
              <strong>The system flags potential discrepancies</strong> &mdash;
              You receive a report identifying charges that may exceed lease
              limits, expenses that appear to be excluded under your lease terms,
              and calculation inconsistencies.
            </li>
          </ol>
          <p>
            Learn more about the full audit process in our{" "}
            <Link
              href="/resources/how-to-audit-cam-charges"
              className="text-blue-600 hover:underline"
            >
              guide to auditing CAM charges
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
