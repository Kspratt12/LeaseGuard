import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { SampleReport } from "@/components/home/sample-report";
import { Eyebrow, buttonClass } from "@/components/ui";

export const metadata: Metadata = {
  alternates: { canonical: "/sample-cam-audit-report" },
  title: "Example CAM Audit Report for Commercial Tenants",
  description:
    "Explore a fictional example CAM audit report: findings with calculations, the lease and statement text behind them, and an editable dispute letter draft.",
  keywords: [
    "CAM audit report example",
    "sample CAM audit",
    "CAM reconciliation findings",
    "commercial lease audit report",
    "common area maintenance audit example",
  ],
};

const INCLUDED = [
  "Every finding, with source text and page numbers where available",
  "The calculation behind each dollar amount",
  "A downloadable PDF report",
  "An editable dispute letter draft, exported to PDF or Word",
  "Year-over-year comparison, when you upload two to five years of statements",
];

export default function SampleCamAuditReportPage() {
  return (
    <main className="bg-paper text-ink">
      <section className="border-b border-line">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-20">
          <h1 className="text-3xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">Example CAM Audit Report</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-muted">
            This is the format of a LeaseGuard report: findings with the calculation behind each amount, the lease and statement text they come
            from, and a dispute letter draft you can edit.
          </p>
          <p className="mt-4 max-w-2xl rounded-xl border border-review/30 bg-review-soft p-4 text-sm leading-relaxed text-review">
            <span className="font-semibold">This is a fictional example.</span> The lease terms, amounts and findings were made up for
            illustration. They are not from a real customer or a real audit. Your results depend entirely on your own lease and statement.
          </p>
        </div>
      </section>

      <section id="example-findings" className="scroll-mt-20 py-12 sm:py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Example findings</h2>
          <p className="mt-3 max-w-2xl text-ink-muted">
            Switch between the tabs to see the findings table, the lease and statement text behind it, the calculations, and a sample dispute
            letter. Each row says whether the amount was calculated from the documents or depends on how your lease is worded.
          </p>
          <div className="mt-8">
            <SampleReport />
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-white py-12 sm:py-16">
        <div className="mx-auto grid max-w-4xl gap-8 px-4 sm:px-6 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">What the full report includes</h2>
            <ul className="mt-5 space-y-3 text-sm text-ink-soft">
              {INCLUDED.map((i) => (
                <li key={i} className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-verified" aria-hidden />
                  <span>{i}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-line bg-paper p-6">
            <Eyebrow>Pricing</Eyebrow>
            <p className="mt-2 text-sm text-ink-soft">The preview is free. Unlocking the full report is a one-time payment:</p>
            <p className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <span>
                <span className="text-4xl font-semibold tabular-nums">$49</span> <span className="text-sm text-ink-muted">one year</span>
              </span>
              <span>
                <span className="text-4xl font-semibold tabular-nums">$149</span>{" "}
                <span className="text-sm text-ink-muted">two to five years</span>
              </span>
            </p>
            <p className="mt-3 text-xs text-ink-muted">No subscription. Findings are items to review, not confirmed overcharges.</p>
          </div>
        </div>
      </section>

      <section className="bg-ink py-14 text-white">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Run it on your own documents.</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/70">Upload your lease and statement for a free preview.</p>
          <Link href="/upload" className={buttonClass("inverse", "mt-7 !min-h-12 !px-8 !text-base")}>
            Start Free Preview
          </Link>
        </div>
      </section>
    </main>
  );
}
