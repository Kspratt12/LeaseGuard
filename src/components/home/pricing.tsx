import Link from "next/link";
import { Check } from "lucide-react";

/**
 * Pricing, with the one-year ($49) and two-to-five-year ($149) options given equal weight.
 * Source of truth for amounts is the payments module (4900 / 14900 cents); these strings must match it.
 * Which price applies is decided by how many years of statements the audit covers, never by the browser.
 */

const PLANS = [
  {
    name: "One Year Review",
    price: "$49",
    who: "For reviewing one year of CAM charges",
    note: "Choose this when you upload a single year.",
    features: [
      "All findings, with source text and page numbers where available",
      "The calculation behind each dollar amount",
      "Downloadable PDF report",
      "Editable dispute letter draft, exported to PDF or Word",
    ],
    featured: false,
  },
  {
    name: "Two to Five Year Review",
    price: "$149",
    who: "For reviewing two to five years of CAM charges",
    note: "Applies automatically when you upload two to five years.",
    features: [
      "Everything in the one-year report",
      "Year-over-year comparison across your statements",
      "Escalation compared with your lease cap, when your lease has one",
      "Covers up to five years in one audit",
    ],
    featured: true,
  },
] as const;

export function Pricing() {
  return (
    <section id="pricing" className="bg-paper py-14 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">Pricing</h2>
          <p className="mt-3 text-base text-ink-muted sm:text-lg">See the free preview first. Unlock the full report with a one-time payment. No subscription.</p>
        </div>

        {/* free preview strip */}
        <div className="mt-10 flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-3xl font-semibold tabular-nums tracking-tight text-ink">$0</span>
              <span className="text-lg font-semibold text-ink">Free preview</span>
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              Create a free account, upload your lease and statement, and see the total of potential billing discrepancies, the lease clauses we
              found, and the first findings. No payment details needed.
            </p>
          </div>
          <Link
            href="/upload"
            className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-lg border border-ink px-6 text-sm font-semibold text-ink transition-colors hover:bg-ink hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Start free preview
          </Link>
        </div>

        <p className="mt-8 text-center text-sm font-medium text-ink-muted">To unlock the full report, choose one:</p>

        {/* the two paid options, equal weight */}
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {PLANS.map((p) => (
            <article
              key={p.name}
              className={`flex flex-col rounded-2xl border bg-white p-6 sm:p-8 ${
                "border-line shadow-[0_8px_24px_-18px_rgba(11,27,51,0.3)]"
              }`}
              aria-label={`${p.name}: ${p.price}, one-time`}
            >
              <h3 className="text-lg font-semibold text-ink sm:text-xl">{p.name}</h3>
              <p className="mt-1 text-sm text-ink-muted">{p.who}</p>
              <p className="mt-5 flex items-baseline gap-2">
                <span className="text-5xl font-semibold tabular-nums tracking-tight text-ink">{p.price}</span>
                <span className="text-sm font-medium text-ink-muted">one-time</span>
              </p>
              <p className="mt-2 text-sm text-ink-soft">{p.note}</p>
              <ul className="mt-6 flex-1 space-y-3 text-sm text-ink-soft">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-verified" aria-hidden />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/upload"
                className={`mt-8 inline-flex min-h-12 items-center justify-center rounded-lg px-6 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                  "bg-ink text-white hover:bg-ink-soft"
                }`}
              >
                Start free preview
              </Link>
            </article>
          ))}
        </div>

        <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-relaxed text-ink-muted sm:text-sm">
          You see the price before you pay, after the free preview. The price follows the number of years of statements in your audit. Findings
          are items to review, not confirmed overcharges, and this is not legal or accounting advice.
        </p>
      </div>
    </section>
  );
}
