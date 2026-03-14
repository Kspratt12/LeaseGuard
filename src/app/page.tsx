import Link from "next/link";
import {
  FileSearch,
  BarChart3,
  ShieldCheck,
  Download,
  FileText,
  ChevronRight,
  Upload,
  Search,
  ClipboardCheck,
  AlertTriangle,
  Percent,
  Ban,
  Check,
  Star,
  Clock,
  Gift,
  FileDown,
} from "lucide-react";
import { AnimateOnScroll } from "@/components/animate-on-scroll";

const faqItems = [
  {
    q: "What files do I upload?",
    a: "Upload one PDF of your commercial lease (specifically the CAM or operating expense section) and one or more annual CAM reconciliation statement PDFs from your landlord.",
  },
  {
    q: "Can I upload multiple CAM reconciliation PDFs?",
    a: "Yes. Uploading multiple years of reconciliation statements enables year-over-year comparison, which can reveal escalation patterns, inconsistent charges, and additional discrepancies across billing periods.",
  },
  {
    q: "Is this legal advice?",
    a: "No. LeaseGuard provides AI-powered analysis for informational purposes only. It is not a substitute for legal, accounting, or professional advice. We recommend having a qualified professional review the findings before taking action.",
  },
  {
    q: "What does the free audit include?",
    a: "The free audit preview includes a basic findings summary, estimated potential savings, lease clause detection (CAM caps, admin fee limits, excluded expenses), and an overcharge breakdown table.",
  },
  {
    q: "What does the $49 report include?",
    a: "The full evidence report is a one-time purchase that adds premium discrepancy findings, source-level evidence references with page numbers, and a downloadable multi-page PDF report with complete analysis.",
  },
  {
    q: "How accurate are the results?",
    a: "Accuracy depends on the clarity and structure of your uploaded documents. LeaseGuard uses text extraction and AI analysis to identify discrepancies, and each finding includes a confidence indicator. Results should always be reviewed by a qualified professional.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: {
      "@type": "Answer",
      text: a,
    },
  })),
};

export default function Home() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {/* ── Hero (dark gradient) ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-gray-950 via-blue-950 to-gray-900">
        {/* Subtle radial glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(59,130,246,0.12)_0%,_transparent_70%)]" />

        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-24 sm:py-32 text-center relative z-10">
          <p className="animate-fade-in-up inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm font-medium text-blue-300 mb-8">
            AI-powered CAM audit &middot; Results in 60 seconds
          </p>
          <h1 className="animate-fade-in-up animate-delay-100 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.1]">
            Stop Overpaying
            <br />
            <span className="text-blue-400">Your Landlord.</span>
          </h1>
          <p className="animate-fade-in-up animate-delay-200 mx-auto mt-6 max-w-2xl text-lg sm:text-xl text-gray-400 leading-relaxed">
            Upload your commercial lease and CAM reconciliation statements.
            LeaseGuard compares them line-by-line and flags potential overcharges
            in about 60 seconds.
          </p>
          <p className="animate-fade-in-up animate-delay-200 mt-4 text-sm text-blue-300/70 font-medium">
            Lease clause analysis and CAM reconciliation review — built for
            commercial tenants.
          </p>
          <div className="animate-fade-in-up animate-delay-300 mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-7 py-3.5 text-lg font-semibold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-500 hover:shadow-blue-500/30 hover:-translate-y-0.5 transition-all duration-200"
            >
              Run 60-Second Audit
              <ChevronRight className="h-5 w-5" />
            </Link>
            <a
              href="#report-preview"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-600 bg-white/5 px-7 py-3.5 text-lg font-semibold text-gray-200 hover:bg-white/10 hover:border-gray-500 transition-all duration-200"
            >
              See Sample Report
            </a>
          </div>
        </div>

        {/* Stats bar */}
        <div className="animate-fade-in-up animate-delay-400 relative z-10 border-t border-white/10">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
            <div className="grid grid-cols-3 gap-6 sm:gap-8 text-center">
              <div className="flex flex-col items-center gap-2">
                <div className="rounded-full bg-blue-500/10 p-2.5 mb-1">
                  <Clock className="h-5 w-5 text-blue-400" />
                </div>
                <p className="text-3xl sm:text-4xl font-bold text-white">
                  60s
                </p>
                <p className="text-sm text-gray-400">Typical audit time</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="rounded-full bg-blue-500/10 p-2.5 mb-1">
                  <Gift className="h-5 w-5 text-blue-400" />
                </div>
                <p className="text-3xl sm:text-4xl font-bold text-white">$0</p>
                <p className="text-sm text-gray-400">
                  Free preview, no upfront cost
                </p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="rounded-full bg-blue-500/10 p-2.5 mb-1">
                  <FileDown className="h-5 w-5 text-blue-400" />
                </div>
                <p className="text-3xl sm:text-4xl font-bold text-white">
                  PDF
                </p>
                <p className="text-sm text-gray-400">
                  Downloadable audit report
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Audit Preview ── */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <AnimateOnScroll>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 text-center mb-3">
              Sample Findings
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-center text-gray-900 mb-4">
              See What LeaseGuard Finds in Your Lease
            </h2>
            <p className="text-center text-gray-500 mb-16 max-w-2xl mx-auto">
              LeaseGuard analyzes commercial lease clauses and CAM reconciliation
              statements to identify potential billing discrepancies, caps, and
              overcharges.
            </p>
          </AnimateOnScroll>

          <div className="grid sm:grid-cols-2 gap-6 mb-16">
            {[
              {
                icon: ShieldCheck,
                title: "CAM Cap Clause Detected",
                desc: "Lease includes CAM expense limitations.",
                status: "Detected",
                statusType: "detected" as const,
              },
              {
                icon: AlertTriangle,
                title: "Potential Overcharge",
                desc: "CAM reconciliation shows management fees exceeding lease terms.",
                status: "Review Recommended",
                statusType: "review" as const,
              },
              {
                icon: Percent,
                title: "Pro Rata Share Review",
                desc: "Tenant share percentage appears higher than expected.",
                status: "Review Recommended",
                statusType: "review" as const,
              },
              {
                icon: Ban,
                title: "Excluded Expenses Flagged",
                desc: "Certain capital expenses may not be permitted under lease terms.",
                status: "Review Recommended",
                statusType: "review" as const,
              },
            ].map(({ icon: Icon, title, desc, status, statusType }) => (
              <AnimateOnScroll key={title}>
                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200 h-full">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 shrink-0">
                      <Icon className="h-5 w-5 text-blue-700" />
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${
                        statusType === "detected"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {statusType === "detected" ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5" />
                      )}
                      {status}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 mb-2">
                    {title}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {desc}
                  </p>
                </div>
              </AnimateOnScroll>
            ))}
          </div>

          <AnimateOnScroll>
            <div className="text-center">
              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">
                Run Your LeaseGuard CAM Audit
              </h3>
              <Link
                href="/upload"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-7 py-3.5 text-lg font-semibold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-500 hover:shadow-blue-500/30 hover:-translate-y-0.5 transition-all duration-200"
              >
                Run 60-Second Audit
                <ChevronRight className="h-5 w-5" />
              </Link>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── Trust Bar ── */}
      <AnimateOnScroll>
        <section className="border-b border-gray-100 bg-white py-10">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 text-center mb-6">
              Built for commercial tenants
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              {[
                { icon: FileSearch, text: "Clause-aware CAM audit" },
                {
                  icon: BarChart3,
                  text: "Multi-year reconciliation comparison",
                },
                { icon: ShieldCheck, text: "Source-backed findings" },
                { icon: Download, text: "Downloadable PDF reports" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex flex-col items-center gap-3">
                  <div className="rounded-xl bg-blue-50 p-3">
                    <Icon className="h-5 w-5 text-blue-700" />
                  </div>
                  <p className="text-sm font-medium text-gray-600">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </AnimateOnScroll>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-20 sm:py-28 bg-white">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <AnimateOnScroll>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 text-center mb-3">
              Simple by Design
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-center text-gray-900 mb-4">
              How Your Commercial Lease Audit Works
            </h2>
            <p className="text-center text-gray-500 mb-16 max-w-xl mx-auto">
              Three steps to uncover potential CAM overcharges and billing
              discrepancies in your lease.
            </p>
          </AnimateOnScroll>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                icon: Upload,
                title: "Upload Your Documents",
                desc: "Upload your commercial lease PDF and one or more annual CAM reconciliation statements. Multiple years enable year-over-year comparison.",
              },
              {
                step: "02",
                icon: Search,
                title: "AI-Powered Analysis",
                desc: "LeaseGuard extracts lease clauses — CAM caps, admin fee limits, excluded expenses — and compares them against your billed charges line by line.",
              },
              {
                step: "03",
                icon: ClipboardCheck,
                title: "Review Your Results",
                desc: "Review estimated overcharges, clause-level findings, and download a detailed audit report with source evidence references.",
              },
            ].map(({ step, icon: Icon, title, desc }) => (
              <AnimateOnScroll key={step}>
                <div className="relative text-center">
                  <div className="mx-auto mb-6 flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-white text-sm font-bold">
                    {step}
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
                      <Icon className="h-6 w-6 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {title}
                    </h3>
                    <p className="text-sm text-gray-500 leading-relaxed">
                      {desc}
                    </p>
                  </div>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-20 sm:py-28 bg-gray-50">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <AnimateOnScroll>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 text-center mb-3">
              Capabilities
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-center text-gray-900 mb-4">
              Purpose-Built Commercial Lease Audit Checks
            </h2>
            <p className="text-center text-gray-500 mb-16 max-w-xl mx-auto">
              Every audit runs targeted checks against your lease clauses and
              reconciliation charges.
            </p>
          </AnimateOnScroll>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: FileText,
                title: "Lease Clause Detection",
                desc: "Automatically extracts CAM caps, admin fee caps, excluded expense categories, and other key provisions from your lease.",
              },
              {
                icon: Percent,
                title: "CAM Cap Analysis",
                desc: "Detects when billed CAM charges exceed the cap or escalation limits defined in your commercial lease agreement.",
              },
              {
                icon: Ban,
                title: "Excluded Expense Detection",
                desc: "Identifies when expense categories your lease explicitly excludes from CAM are being billed to you anyway.",
              },
              {
                icon: AlertTriangle,
                title: "Administrative Fee Cap Review",
                desc: "Flags administrative or management fees that exceed the percentage cap specified in your lease terms.",
              },
              {
                icon: Star,
                title: "Premium Evidence Findings",
                desc: "Deep-dive findings with source-level evidence references, page numbers, and detailed discrepancy analysis.",
              },
              {
                icon: Download,
                title: "Downloadable PDF Reports",
                desc: "Professional multi-page audit reports with overcharge breakdowns, clause summaries, and source evidence.",
              },
            ].map(({ icon: Icon, title, desc }) => (
              <AnimateOnScroll key={title}>
                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200 h-full">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50">
                    <Icon className="h-5 w-5 text-blue-700" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 mb-2">
                    {title}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {desc}
                  </p>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ── Report Preview ── */}
      <section id="report-preview" className="py-20 sm:py-28 bg-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <AnimateOnScroll>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 text-center mb-3">
              Sample Output
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-center text-gray-900 mb-4">
              What Your Audit Report Reveals
            </h2>
            <p className="text-center text-gray-500 mb-16 max-w-xl mx-auto">
              Example findings from a LeaseGuard CAM audit. Each finding
              includes the discrepancy type, severity, and estimated savings.
            </p>
          </AnimateOnScroll>
          <AnimateOnScroll>
            <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-6 sm:p-8 shadow-sm space-y-4">
              {[
                {
                  label: "CAM Cap Exceeded",
                  detail:
                    "Billed CAM charges exceed the annual cap defined in lease Section 4.2.",
                  severity: "High",
                  savings: "$4,800",
                  color: "red" as const,
                },
                {
                  label: "Administrative Fee Cap Exceeded",
                  detail:
                    "Management fee of 8% exceeds the 5% cap in lease Section 6.1.",
                  severity: "High",
                  savings: "$2,100",
                  color: "red" as const,
                },
                {
                  label: "Excluded Expense Category Billed",
                  detail:
                    "Capital improvements billed to tenant despite lease exclusion clause.",
                  severity: "Medium",
                  savings: "$1,300",
                  color: "amber" as const,
                },
              ].map((finding) => (
                <div
                  key={finding.label}
                  className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:shadow-sm transition-shadow"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-gray-900">
                        {finding.label}
                      </h4>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          finding.color === "red"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {finding.severity}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">{finding.detail}</p>
                  </div>
                  <p className="text-xl font-bold text-green-700 whitespace-nowrap">
                    {finding.savings}
                  </p>
                </div>
              ))}
              <div className="text-center pt-4 pb-2">
                <p className="text-2xl font-bold text-green-700">
                  Total estimated savings: $8,200
                </p>
                <p className="text-sm text-gray-400 mt-2">
                  Based on sample lease and reconciliation data.
                </p>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 sm:py-28 bg-gray-50">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <AnimateOnScroll>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 text-center mb-3">
              Simple Pricing
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-center text-gray-900 mb-4">
              Pay Once, Not Monthly
            </h2>
            <p className="text-center text-gray-500 mb-4 max-w-lg mx-auto">
              Start with a free audit preview. Only pay if you want the full
              evidence report. No subscriptions, no hidden fees.
            </p>
            <p className="text-center text-sm text-gray-400 mb-16">
              One-time purchase per audit &mdash; $49 for the complete report.
            </p>
          </AnimateOnScroll>
          <div className="grid sm:grid-cols-2 gap-8 max-w-3xl mx-auto items-start">
            {/* Free tier */}
            <AnimateOnScroll>
              <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm hover:shadow-md transition-shadow duration-200 h-full">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
                  Free Preview
                </p>
                <h3 className="text-xl font-bold text-gray-900 mb-1">
                  Audit Preview
                </h3>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-bold text-gray-900">$0</span>
                  <span className="text-sm text-gray-400 ml-1">
                    no credit card required
                  </span>
                </div>
                <ul className="space-y-3.5 text-sm text-gray-600 mb-8">
                  {[
                    "Basic findings summary",
                    "Estimated potential savings",
                    "Lease clause detection",
                    "Overcharge breakdown table",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/upload"
                  className="block w-full rounded-xl border border-gray-300 py-3 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all"
                >
                  Start Free Audit
                </Link>
              </div>
            </AnimateOnScroll>

            {/* Paid tier */}
            <AnimateOnScroll>
              <div className="relative rounded-2xl border-2 border-blue-600 bg-white p-8 shadow-lg hover:shadow-xl transition-shadow duration-200 h-full">
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-4 py-1 text-xs font-semibold text-white shadow-sm">
                  Recommended
                </div>
                <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-3">
                  Full Report
                </p>
                <h3 className="text-xl font-bold text-gray-900 mb-1">
                  Full Evidence Report
                </h3>
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-4xl font-bold text-gray-900">$49</span>
                  <span className="text-sm text-gray-400 ml-1">one-time</span>
                </div>
                <p className="text-sm text-gray-500 mb-6">
                  Per audit, no recurring charges
                </p>
                <ul className="space-y-3.5 text-sm text-gray-600 mb-8">
                  {[
                    "Everything in the free preview",
                    "Premium discrepancy findings",
                    "Source evidence references",
                    "Downloadable full PDF report",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/upload"
                  className="block w-full rounded-xl bg-blue-600 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-blue-500 hover:shadow-md transition-all"
                >
                  Run Audit & Unlock Report
                </Link>
              </div>
            </AnimateOnScroll>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-20 sm:py-28 bg-white">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <AnimateOnScroll>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 text-center mb-3">
              FAQ
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-center text-gray-900 mb-16">
              Frequently Asked Questions
            </h2>
          </AnimateOnScroll>
          <div className="space-y-5">
            {faqItems.map(({ q, a }) => (
              <AnimateOnScroll key={q}>
                <div className="rounded-xl border border-gray-200 bg-white p-6 hover:shadow-sm transition-shadow">
                  <h3 className="font-semibold text-gray-900 mb-2">{q}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{a}</p>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-20 bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <AnimateOnScroll>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              Ready to audit your CAM charges?
            </h2>
            <p className="text-blue-100 mb-10 text-lg">
              Upload your lease and reconciliation documents. Get results in
              about 60 seconds.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/upload"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-lg font-semibold text-blue-600 shadow-lg hover:bg-blue-50 hover:-translate-y-0.5 transition-all duration-200"
              >
                Run 60-Second Audit
                <ChevronRight className="h-5 w-5" />
              </Link>
            </div>
          </AnimateOnScroll>
        </div>
      </section>
    </main>
  );
}
