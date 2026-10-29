import type { Metadata } from "next";
import Link from "next/link";
import { CamCalculator } from "@/components/cam-calculator";

export const metadata: Metadata = {
  alternates: { canonical: "/cam-calculator" },
  title: "CAM Reconciliation Calculator for Commercial Tenants | LeaseGuard",
  description:
    "Free CAM reconciliation calculator. Enter the expense pool, your pro-rata share and your payments to see the formula and the balance, then compare it with your statement. No upload needed.",
};

const faqs = [
  {
    q: "Does this calculator tell me if I was overcharged?",
    a: "No. It shows the arithmetic a CAM reconciliation normally follows and compares the result with the balance on your statement. A difference means the numbers do not match; it does not show the landlord is wrong. What counts as an operating expense, how the share is defined, and whether fees sit inside a cap all depend on your lease.",
  },
  {
    q: "Where do I find the numbers?",
    a: "The expense pool, any management fee and your share are usually on the reconciliation statement. Your pro-rata share or square footage is usually in your lease. Your estimated payments are your monthly CAM estimate times the months in the period.",
  },
  {
    q: "How is this different from a LeaseGuard audit?",
    a: "The calculator only does arithmetic on the numbers you type and cannot see your lease. A LeaseGuard audit reads your lease and your reconciliation statement, checks the statement against lease terms such as exclusions, caps and fee limits, and shows the source page for each item.",
  },
];

export default function CamCalculatorPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <main className="bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="border-b border-gray-100 bg-gray-50/60">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-gray-900 sm:text-4xl">
            CAM Reconciliation Calculator
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-gray-600">
            Work out your share of the year&apos;s common area costs and the balance you would expect, then compare it with
            the number on your statement. It runs in your browser: nothing you type is sent or stored, and no upload is needed.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <CamCalculator />

        <section className="mt-12">
          <h2 className="text-2xl font-semibold text-gray-900">How the calculation works</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-gray-600">
            <li>Start with the operating expenses for the year (the pool).</li>
            <li>Add the management or admin fee if it is charged on top of the pool: pool = expenses + expenses x fee %.</li>
            <li>
              Apply your share: your share = pool x your pro-rata %. If your lease defines the share by area, the percentage is
              your square feet divided by the building&apos;s.
            </li>
            <li>Subtract your estimated payments: balance = your share - payments. Positive means you owe; negative is a credit.</li>
          </ol>
          <p className="mt-4 text-gray-600">
            Amounts are rounded to the cent at each step. Statements sometimes round the share percentage, which can move the
            result by a few dollars on large pools.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-semibold text-gray-900">What this calculator assumes</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-gray-600">
            <li>The expense total you enter is the amount your lease allows to be shared. It does not check which expenses belong in it.</li>
            <li>Your share is a fixed percentage for the whole year. Leases with gross-ups, caps on specific categories, base years, or occupancy adjustments need more than this.</li>
            <li>The optional cap check compares totals only. Many caps apply to controllable expenses, and some are cumulative.</li>
            <li>It is not legal or accounting advice. Deadlines and rights to question a statement depend on your lease and applicable law.</li>
          </ul>
        </section>

        <section className="mt-10 rounded-2xl border border-blue-100 bg-blue-50/60 p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-gray-900">When the numbers do not match, or you cannot check them</h2>
          <p className="mt-2 text-gray-700">
            A calculator cannot tell whether a line item is allowed under your lease. A LeaseGuard audit compares your
            reconciliation statement with your lease: exclusions, management-fee limits, caps and the share definition,
            with the source page for each item. The preview is free; the full report is a one-time $49 for one year or $149
            for two to five years, and includes an editable dispute-letter draft.
          </p>
          <Link
            href="/upload"
            className="mt-4 inline-flex items-center rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-500"
          >
            Upload your lease and statement
          </Link>
          <p className="mt-3 text-sm text-gray-600">
            Not sure what an audit includes? See a{" "}
            <Link href="/sample-cam-audit-report" className="text-blue-700 underline">fictional sample report</Link> or read how{" "}
            <Link href="/resources/commercial-lease-audit-services" className="text-blue-700 underline">automated lease audits work</Link>.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-semibold text-gray-900">Questions</h2>
          <dl className="mt-4 space-y-5">
            {faqs.map((f) => (
              <div key={f.q}>
                <dt className="font-semibold text-gray-900">{f.q}</dt>
                <dd className="mt-1 text-gray-600">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="mt-10 text-sm text-gray-500">
          Related guides:{" "}
          <Link href="/resources/how-to-calculate-cam-charges" className="text-blue-700 underline">how CAM charges are calculated</Link>,{" "}
          <Link href="/resources/how-to-audit-cam-charges" className="text-blue-700 underline">how to audit CAM charges</Link>,{" "}
          <Link href="/resources/dispute-cam-charges" className="text-blue-700 underline">how to dispute CAM charges</Link>.{" "}
         
        </p>
      </div>
    </main>
  );
}
