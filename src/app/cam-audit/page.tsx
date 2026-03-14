import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle, Upload, Search, FileText, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Commercial CAM Audit | Detect CAM Overcharges in Your Lease",
  description:
    "Run a commercial CAM audit in seconds. Upload your lease and CAM reconciliation statement to identify overcharges, caps, and billing discrepancies.",
  keywords: [
    "commercial lease audit",
    "CAM audit",
    "CAM reconciliation audit",
    "commercial lease overcharges",
    "CAM overcharges",
    "common area maintenance audit",
    "lease billing discrepancies",
    "CAM audit tool",
  ],
};

export default function CamAuditPage() {
  return (
    <main className="bg-white">
      {/* Section 1: Hero */}
      <section className="border-b border-gray-100 bg-gray-50/60">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h1 className="text-3xl sm:text-5xl font-bold text-gray-900 tracking-tight leading-tight">
            Commercial CAM Audit for Tenants
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            A CAM audit is a review of your{" "}
            <Link
              href="/resources/cam-charges-explained"
              className="text-blue-600 hover:underline"
            >
              common area maintenance charges
            </Link>{" "}
            to verify that your landlord is billing you accurately under the
            terms of your lease. Commercial tenants use CAM audits to catch
            overcharges, confirm that excluded expenses aren&apos;t being passed
            through, and ensure their{" "}
            <Link
              href="/resources/cam-reconciliation-guide"
              className="text-blue-600 hover:underline"
            >
              reconciliation statements
            </Link>{" "}
            are calculated correctly.
          </p>
          <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Most tenants overpay because reconciliation statements are dense,
            technical documents — and manually comparing them against a complex
            lease agreement takes hours. LeaseGuard automates that comparison in
            about 60 seconds.
          </p>
          <div className="mt-10">
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-8 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-blue-500 hover:shadow-md transition-all"
            >
              Run 60-Second Audit <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Section 2: Common Overcharges */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 py-16 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-4">
          Common CAM Overcharges Tenants Miss
        </h2>
        <p className="text-gray-600 text-center max-w-2xl mx-auto mb-12 leading-relaxed">
          CAM billing errors are rarely intentional — but they are surprisingly
          common. These are the issues that a{" "}
          <Link
            href="/resources/how-to-audit-cam-charges"
            className="text-blue-600 hover:underline"
          >
            thorough CAM audit
          </Link>{" "}
          is designed to catch.
        </p>

        <div className="grid sm:grid-cols-2 gap-6">
          <div className="rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Inflated Management Fees
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Property management fees are calculated as a percentage of total
              operating expenses. If other charges are inflated, the management
              fee compounds the overcharge. Some landlords also add separate
              administrative fees for functions the management fee should
              already cover.
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Capital Expenses Billed as Operating Costs
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Replacing a roof or repaving a parking lot is a capital
              improvement — not a routine operating expense. When these costs
              are classified as repairs, tenants pay the full amount in a single
              year instead of an amortized share over the asset&apos;s useful life.
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Incorrect Proportionate Share
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Your pro rata share is based on your square footage relative to
              the total leasable area. Even a small error in either number
              affects every expense category on your reconciliation statement,
              potentially costing thousands over a lease term.
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Maintenance vs. Capital Confusion
            </h3>
            <p className="text-gray-600 leading-relaxed">
              The line between a repair (passable operating expense) and a
              replacement (capital improvement) is often subjective. Vague lease
              language makes it easier for property managers to classify major
              projects as routine maintenance.
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 p-6 sm:col-span-2">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Vague Lease Language Exploited
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Broad definitions like &quot;all costs associated with the
              operation of the property&quot; give landlords wide discretion
              over what they pass through. Without clear exclusion lists,
              tenants may be charged for marketing, legal fees, or other costs
              that should be the landlord&apos;s responsibility. Review our guide on{" "}
              <Link
                href="/resources/common-cam-overcharges"
                className="text-blue-600 hover:underline"
              >
                common CAM overcharges
              </Link>{" "}
              for more examples.
            </p>
          </div>
        </div>
      </section>

      {/* Section 3: How It Works */}
      <section className="border-t border-b border-gray-100 bg-gray-50/60">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-16 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-4">
            How LeaseGuard Runs a CAM Audit
          </h2>
          <p className="text-gray-600 text-center max-w-2xl mx-auto mb-14 leading-relaxed">
            LeaseGuard replaces the manual, hours-long process of cross-referencing
            your lease against your reconciliation statement with an automated
            analysis that delivers results in about 60 seconds.
          </p>

          <div className="grid sm:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-600 mb-5">
                <Upload className="h-6 w-6" />
              </div>
              <div className="text-sm font-semibold text-blue-600 mb-2">
                Step 1
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Upload Your Documents
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Upload your executed lease agreement and your annual CAM
                reconciliation statement. LeaseGuard accepts PDF, scanned
                documents, and image files.
              </p>
            </div>

            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-600 mb-5">
                <Search className="h-6 w-6" />
              </div>
              <div className="text-sm font-semibold text-blue-600 mb-2">
                Step 2
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                AI Compares Charges to Lease Terms
              </h3>
              <p className="text-gray-600 leading-relaxed">
                The platform reads both documents and cross-references each
                reconciliation line item against your lease&apos;s expense
                definitions, exclusions, caps, and proportionate share
                provisions.
              </p>
            </div>

            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-600 mb-5">
                <FileText className="h-6 w-6" />
              </div>
              <div className="text-sm font-semibold text-blue-600 mb-2">
                Step 3
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Identify Potential Discrepancies
              </h3>
              <p className="text-gray-600 leading-relaxed">
                You receive a clear report highlighting potential overcharges,
                excluded expenses being passed through, CAM cap violations, and
                proportionate share errors — with references to the relevant
                lease provisions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Who Uses CAM Audits */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 py-16 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-4">
          Who Uses CAM Audits
        </h2>
        <p className="text-gray-600 text-center max-w-2xl mx-auto mb-12 leading-relaxed">
          CAM audits benefit any commercial tenant paying operating expense
          pass-throughs. The tenants who benefit most are those who lack the
          time or specialized expertise to review reconciliation statements
          manually.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              title: "Retail Tenants",
              desc: "Shopping center and strip mall tenants who pay CAM on shared parking, landscaping, and common areas.",
            },
            {
              title: "Medical Practices",
              desc: "Physicians and dental offices in medical office buildings with complex operating expense structures.",
            },
            {
              title: "Franchise Operators",
              desc: "Multi-location franchise owners managing CAM charges across several leases simultaneously.",
            },
            {
              title: "Office Tenants",
              desc: "Businesses in multi-tenant office buildings paying proportionate shares of building operating costs.",
            },
            {
              title: "Small Business Owners",
              desc: "Independent businesses leasing commercial space who need to protect their margins from billing errors.",
            },
            {
              title: "Restaurant Operators",
              desc: "Food service businesses in retail centers where CAM charges can represent a significant operating cost.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="flex items-start gap-3 rounded-lg border border-gray-200 p-5"
            >
              <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <h3 className="font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-1 text-sm text-gray-600 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 5: CTA */}
      <section className="border-t border-gray-100 bg-gray-50/60">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16 sm:py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
            Run a LeaseGuard CAM Audit
          </h2>
          <p className="text-gray-600 mb-8 max-w-xl mx-auto leading-relaxed">
            Upload your lease agreement and CAM reconciliation statement to
            quickly identify potential billing discrepancies, excluded cost
            pass-throughs, and CAM cap violations. Results are delivered in
            about 60 seconds.
          </p>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-8 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-blue-500 hover:shadow-md transition-all"
          >
            Run 60-Second Audit <ArrowRight className="h-4 w-4" />
          </Link>
          <div className="mt-6 flex items-center justify-center gap-6 text-sm text-gray-500">
            <Link
              href="/resources"
              className="hover:text-blue-600 transition-colors"
            >
              Resources
            </Link>
            <span className="text-gray-300">·</span>
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
