import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calculator, Check, ChevronRight, ClipboardCheck, FileSearch, Lock, ScrollText, Tag, Upload } from "lucide-react";
import { HeroDemo } from "@/components/home/hero-demo";
import { SampleReport } from "@/components/home/sample-report";
import { Pricing } from "@/components/home/pricing";
import { AppPreview } from "@/components/home/app-preview";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Matches the visible pricing section: one-time $49 (one year) and $149 (two to five years).
const softwareAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "LeaseGuard",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "CAM audit tool for commercial tenants that compares a lease with a CAM reconciliation statement to identify potential billing discrepancies.",
  offers: [
    { "@type": "Offer", name: "One-year CAM audit report", price: "49", priceCurrency: "USD" },
    { "@type": "Offer", name: "Two-to-five-year CAM audit report", price: "149", priceCurrency: "USD" },
  ],
};

const faqItems = [
  {
    q: "What files do I upload?",
    a: "Upload your commercial lease and one or more annual CAM reconciliation statements from your landlord. For the lease, include the CAM or operating-expense provisions, the definitions that affect the calculation, relevant schedules and exhibits, and any amendments that change them. An excerpt may support only a limited review. PDFs and clear photos both work.",
  },
  {
    q: "Can I upload multiple CAM reconciliation PDFs?",
    a: "Yes. Uploading two to five years of reconciliation statements enables year-over-year comparison, which can reveal escalation patterns, inconsistent charges, and additional discrepancies across billing periods.",
  },
  {
    q: "Is this legal advice?",
    a: "No. LeaseGuard provides AI-powered analysis for informational purposes only. It is not a substitute for legal, accounting, or professional advice. We recommend having a qualified professional review the findings before taking action.",
  },
  {
    q: "What does the free preview include?",
    a: "The free preview includes a total of potential billing discrepancies, the lease clauses detected (CAM caps, admin fee limits, excluded expenses), a breakdown table, and the first findings. A free account is required so your documents stay private.",
  },
  {
    q: "What does the full report include, and what does it cost?",
    a: "The full report is a one-time purchase: $49 for a one-year audit, or $149 for an audit covering two to five years of statements. It adds the remaining findings, source references with page numbers where available, a downloadable multi-page PDF report, and an editable dispute-letter draft built from your findings.",
  },
  {
    q: "How accurate are the results?",
    a: "Accuracy depends on the clarity and structure of your uploaded documents. LeaseGuard uses text extraction and AI analysis to identify discrepancies, and each audit shows an overall confidence level. Findings are items to review, not confirmed overcharges, and should be reviewed by a qualified professional.",
  },
  {
    q: "What are CAM charges in commercial leases?",
    a: "CAM charges are common area maintenance expenses that commercial tenants share with other tenants in a property. These can include maintenance, landscaping, security, insurance, and other operating costs related to shared areas of the property.",
  },
  {
    q: "What is a CAM reconciliation statement?",
    a: "A CAM reconciliation statement compares estimated CAM expenses paid during the year to the actual costs incurred by the landlord. If the actual costs are higher, tenants may receive an additional bill.",
  },
  {
    q: "Can commercial tenants dispute CAM charges?",
    a: "Yes. Many commercial leases include audit rights that allow tenants to review CAM reconciliation statements and challenge expenses that do not comply with the lease terms.",
  },
  {
    q: "How does a CAM audit work?",
    a: "A CAM audit reviews lease clauses and reconciliation statements to identify discrepancies such as improper expenses, incorrect pro rata share calculations, or charges that exceed lease limits.",
  },
  {
    q: "How long does a CAM audit take with LeaseGuard?",
    a: "The analysis is automatic. How long it takes depends on the size and quality of your documents, and scanned or photographed pages take longer. The results page updates by itself when your audit is ready, so you can keep it open.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

const STEPS = [
  { icon: Upload, title: "Upload your lease and CAM statement", text: "Add your lease (the CAM provisions, definitions, exhibits and amendments; an excerpt may support only a limited review) and one to five years of reconciliation statements. PDFs or phone photos." },
  { icon: FileSearch, title: "Compare charges with lease requirements", text: "Fees, shares, caps and exclusions on the statement are checked against the terms found in your lease." },
  { icon: ClipboardCheck, title: "Review discrepancies, evidence and your report", text: "See the free preview first. Unlock the full report for every finding, with its source text and page where available, a PDF, and an editable dispute letter." },
];

const CALCULATED = [
  { title: "Management and admin fees", text: "The fee percentage and dollar amount on the statement against the cap in the lease." },
  { title: "Tenant share", text: "The share on the statement against the square footage and share in the lease." },
  { title: "Expense totals", text: "Whether the statement's own totals and reconciliation add up." },
  { title: "Annual increase cap and year-over-year change", text: "This year against prior years, when you upload more than one statement." },
];

const JUDGMENT = [
  { title: "Excluded and capital expenses", text: "Statement lines that may fall under a category your lease excludes. Whether they do depends on the lease wording." },
  { title: "Gross-up and occupancy adjustments", text: "Signs a variable expense may not have been adjusted as the lease requires." },
  { title: "Tenant allocation", text: "Whether your share of a category looks consistent with the lease." },
  { title: "Lease-specific terms", text: "Anything else the lease says that needs a person to interpret it." },
];

const TRUST = [
  { icon: Lock, title: "Private to your account", text: "Other customers cannot open your documents or results. Our privacy policy explains which services process them." },
  { icon: ScrollText, title: "Findings show their source", text: "The lease and statement text, and the page, behind each item where it can be located." },
  { icon: Tag, title: "One-time pricing", text: "$49 for one year or $149 for two to five years. No subscription." },
];

export default function Home() {
  return (
    <main className="bg-paper text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppJsonLd) }} />

      {/* ── Hero ── */}
      <section className="bg-ink text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-12 lg:pb-20 lg:pt-16">
          <div>
            <p className="inline-flex rounded-full border border-accent-bright/40 px-3 py-1 text-xs font-semibold text-accent-bright">
              CAM audit software for commercial tenants
            </p>
            <h1 className="mt-4 text-[2.1rem] font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
              Check your CAM charges against your lease.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-white/80 sm:mt-5 sm:text-lg">
              Upload your commercial lease and CAM reconciliation statement. LeaseGuard compares billed expenses with your lease terms, calculates
              potential discrepancies, and organizes the supporting evidence so you can review the results before deciding what to do next.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/upload"
                className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-accent-bright px-5 text-base font-semibold text-ink transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Start Free Preview <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/sample-cam-audit-report"
                className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-white/40 px-5 text-base font-semibold text-white transition-colors hover:border-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                View Sample Audit Report
              </Link>
            </div>
            <ul className="mt-6 hidden gap-x-6 gap-y-1.5 text-sm text-white/75 sm:flex sm:flex-wrap">
              {["Free preview, no payment details", "One-time $49 or $149", "Private to your account"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-accent-bright" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <HeroDemo />
        </div>
      </section>

      {/* ── What you can rely on (facts about the product only) ── */}
      <section className="border-b border-line bg-white">
        <ul className="mx-auto grid max-w-6xl gap-5 px-4 py-6 sm:px-6 md:grid-cols-3">
          {TRUST.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-ink">{title}</p>
                <p className="mt-0.5 text-sm text-ink-muted">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="max-w-2xl text-2xl font-semibold leading-tight tracking-tight sm:text-4xl">How an audit works</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-line bg-white p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white"><s.icon className="h-5 w-5" aria-hidden /></span>
                  <span className="font-figures text-xs font-medium text-ink-muted">Step {i + 1}</span>
                </div>
                <h3 className="mt-3 text-base font-semibold text-ink">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── What LeaseGuard checks ── */}
      <section id="features" className="bg-ink py-14 text-white sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="text-sm font-semibold text-accent-bright">What LeaseGuard checks</p>
          <h2 className="mt-2 max-w-2xl text-2xl font-bold leading-tight tracking-tight sm:text-4xl">Arithmetic it can verify. Judgment it flags for you.</h2>
          <p className="mt-3 max-w-2xl text-base text-white/75">
            Some results are calculated directly from your documents. Others depend on how your lease is worded, so we say which is which. An audit
            may find nothing to review, and results are never legal advice.
          </p>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <div className="rounded-xl border border-white/15 bg-white/[0.04] p-5">
              <p className="inline-block rounded-full bg-verified-soft px-2.5 py-0.5 text-xs font-semibold text-verified">Calculated from your documents</p>
              <ul className="mt-4 space-y-4">
                {CALCULATED.map((c) => (
                  <li key={c.title}>
                    <p className="text-sm font-semibold text-white">{c.title}</p>
                    <p className="mt-0.5 text-sm text-white/70">{c.text}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/[0.04] p-5">
              <p className="inline-block rounded-full bg-review-soft px-2.5 py-0.5 text-xs font-semibold text-review">Flagged for your judgment</p>
              <ul className="mt-4 space-y-4">
                {JUDGMENT.map((c) => (
                  <li key={c.title}>
                    <p className="text-sm font-semibold text-white">{c.title}</p>
                    <p className="mt-0.5 text-sm text-white/70">{c.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Sample report ── */}
      <section id="sample-report" className="py-14 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="text-2xl font-semibold leading-tight tracking-tight sm:text-4xl">See an audit report before you upload anything</h2>
          <p className="mt-3 max-w-2xl text-base text-ink-muted">
            Open the findings table, the evidence behind it, the calculations and a sample dispute letter. It is an invented example that shows
            the format.
          </p>
          <div className="mt-8">
            <SampleReport />
          </div>
          <p className="mt-4 text-sm text-ink-muted">
            Prefer the full page?{" "}
            <Link href="/sample-cam-audit-report" className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4">
              Open the sample report
            </Link>
            .
          </p>
        </div>
      </section>

      {/* ── The application ── */}
      <section className="border-y border-line bg-white py-14 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-12">
          <div>
            <h2 className="text-2xl font-semibold leading-tight tracking-tight sm:text-4xl">Every audit in one place</h2>
            <p className="mt-3 text-base text-ink-muted">
              Your account keeps each audit with its documents, its progress, the findings to review, and clear next steps. Documents and results
              can be opened only by your account.
            </p>
          </div>
          <AppPreview />
        </div>
      </section>

      {/* ── Pricing ── */}
      <Pricing />

      {/* ── Calculator ── */}
      <section className="border-b border-line bg-paper py-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex gap-4">
            <Calculator className="mt-1 h-6 w-6 shrink-0 text-ink-soft" aria-hidden />
            <div>
              <h2 className="text-lg font-semibold text-ink">Only want to check the arithmetic?</h2>
              <p className="mt-1 text-sm text-ink-muted">The free CAM calculator shows the formula and your balance. No upload, nothing stored.</p>
            </div>
          </div>
          <Link href="/cam-calculator" className={buttonClass("secondary", "shrink-0")}>
            Open the calculator
          </Link>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-2xl font-semibold leading-tight tracking-tight sm:text-4xl">Frequently asked questions</h2>
          <div className="mt-8 divide-y divide-line rounded-2xl border border-line bg-white">
            {faqItems.map(({ q, a }) => (
              <details key={q} className="group">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-base font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {q}
                  <ChevronRight className="h-5 w-5 shrink-0 text-ink-muted transition-transform group-open:rotate-90" aria-hidden />
                </summary>
                <p className="px-5 pb-5 text-sm leading-relaxed text-ink-muted">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final call to action (dark) ── */}
      <section className="bg-ink py-14 text-white sm:py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Find out what your statement says about your lease.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/70">
            The preview is free. If you want the full report, it is a one-time $49 for one year or $149 for two to five years.
          </p>
          <Link
            href="/upload"
            className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-paper px-8 text-base font-semibold text-ink transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Start Free Preview <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </main>
  );
}
