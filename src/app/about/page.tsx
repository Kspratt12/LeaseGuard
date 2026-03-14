import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Upload, Search, FileText } from "lucide-react";

export const metadata: Metadata = {
  title: "About LeaseGuard | Commercial Lease CAM Audit Platform",
  description:
    "LeaseGuard helps commercial tenants detect CAM overcharges by analyzing lease clauses and reconciliation statements.",
  keywords: [
    "about LeaseGuard",
    "CAM audit platform",
    "commercial lease audit software",
    "commercial tenant tools",
    "CAM overcharge detection",
  ],
};

export default function AboutPage() {
  return (
    <main className="bg-white">
      {/* Section 1: About */}
      <section className="border-b border-gray-100 bg-gray-50/60">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h1 className="text-3xl sm:text-5xl font-bold text-gray-900 tracking-tight leading-tight">
            About LeaseGuard
          </h1>
          <p className="mt-6 text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
            LeaseGuard is a software platform built to help commercial tenants
            review their CAM charges and reconciliation statements to identify
            potential billing discrepancies. The platform cross-references your
            lease agreement against your annual reconciliation to flag charges
            that may not be authorized, accurately calculated, or properly
            allocated.
          </p>
          <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
            LeaseGuard is designed for the tenants who need it most — retail
            operators, office tenants, medical practices, franchise operators,
            and small business owners leasing commercial space. These tenants
            often lack the time or specialized expertise to manually audit
            complex reconciliation statements, even though billing errors can
            cost thousands of dollars per year.
          </p>
        </div>
      </section>

      {/* Section 2: Why CAM Audits Matter */}
      <section className="mx-auto max-w-3xl px-4 sm:px-6 py-16 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
          Why CAM Audits Matter
        </h2>
        <p className="text-gray-600 leading-relaxed mb-5">
          CAM reconciliation statements are the annual documents landlords send
          to show how common area maintenance costs were allocated across
          tenants. These statements can contain billing discrepancies that are
          difficult to catch without careful review:
        </p>
        <ul className="space-y-3 text-gray-600 leading-relaxed mb-5">
          <li className="flex items-start gap-2.5">
            <span className="text-blue-600 mt-1.5 shrink-0">&bull;</span>
            <span>
              <strong>Inflated management fees</strong> — calculated as a
              percentage of total operating expenses, these fees compound any
              other overcharges on the statement.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="text-blue-600 mt-1.5 shrink-0">&bull;</span>
            <span>
              <strong>Incorrect pro rata calculations</strong> — errors in your
              square footage or the total building area inflate every expense
              line item.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="text-blue-600 mt-1.5 shrink-0">&bull;</span>
            <span>
              <strong>Capital expenses billed to tenants</strong> — major
              improvements like roof replacements or parking lot repaving
              classified as routine maintenance.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="text-blue-600 mt-1.5 shrink-0">&bull;</span>
            <span>
              <strong>Expenses that should be excluded</strong> — costs your
              lease explicitly prohibits from being passed through, such as
              marketing, legal fees, or leasing commissions.
            </span>
          </li>
        </ul>
        <p className="text-gray-600 leading-relaxed">
          Reviewing these statements manually is difficult and time-consuming.
          It requires comparing dozens of expense line items against complex
          lease language, checking proportionate share calculations, verifying
          CAM cap compliance, and cross-referencing exclusion lists. Most small
          business tenants simply don&apos;t have the bandwidth to do this every
          year — which is why billing errors often go undetected for the
          duration of a lease.
        </p>
      </section>

      {/* Section 3: How LeaseGuard Works */}
      <section className="border-t border-b border-gray-100 bg-gray-50/60">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-10 text-center">
            How LeaseGuard Works
          </h2>
          <div className="grid sm:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-600 mb-5">
                <Upload className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Upload Documents
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Upload your commercial lease agreement and one or more annual CAM
                reconciliation statements. The platform accepts PDFs, scanned
                documents, and image files.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-600 mb-5">
                <Search className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Analyze Clauses and Expenses
              </h3>
              <p className="text-gray-600 leading-relaxed">
                LeaseGuard reads both documents and cross-references each
                reconciliation line item against your lease&apos;s expense
                definitions, exclusions, caps, and proportionate share
                provisions.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-600 mb-5">
                <FileText className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Review Audit Report
              </h3>
              <p className="text-gray-600 leading-relaxed">
                The platform identifies potential discrepancies and generates a
                detailed audit report highlighting overcharges, excluded expense
                violations, and CAM cap issues — in about 60 seconds.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Our Mission */}
      <section className="mx-auto max-w-3xl px-4 sm:px-6 py-16 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
          Our Mission
        </h2>
        <p className="text-gray-600 leading-relaxed mb-5">
          Our mission is straightforward: help commercial tenants better
          understand their lease expenses and identify potential overcharges.
        </p>
        <p className="text-gray-600 leading-relaxed mb-5">
          We believe that every tenant — whether they operate a single retail
          location or manage a portfolio of franchise spaces — should have
          access to the tools needed to verify that their CAM charges are
          accurate. Traditionally, CAM audits have been expensive, slow, and
          accessible only to tenants with large enough portfolios to justify the
          cost. LeaseGuard changes that by making audit analysis fast,
          affordable, and available to businesses of any size.
        </p>
        <p className="text-gray-600 leading-relaxed">
          We are not a law firm and we do not provide legal or accounting
          advice. LeaseGuard is an analysis tool that gives tenants a clear
          starting point for reviewing their charges and, when needed, engaging
          with their landlord or a qualified professional.
        </p>
      </section>

      {/* CTA */}
      <section className="border-t border-gray-100 bg-gray-50/60">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 sm:py-18 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            Run a LeaseGuard CAM Audit
          </h2>
          <p className="text-gray-600 mb-8 max-w-xl mx-auto leading-relaxed">
            Upload your lease and CAM reconciliation statement to identify
            potential billing discrepancies. Results are delivered in about 60
            seconds.
          </p>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-7 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-500 hover:shadow-md transition-all"
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
