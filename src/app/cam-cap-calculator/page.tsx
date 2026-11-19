import type { Metadata } from "next";
import Link from "next/link";
import { CamCapCalculator } from "@/components/cam-cap-calculator";

export const metadata: Metadata = {
  alternates: { canonical: "/cam-cap-calculator" },
  title: "CAM Cap & Base Year Calculator | LeaseGuard",
  description:
    "Free calculator for commercial tenants: apply a cumulative or non-cumulative CAM cap year by year, or a base year or expense stop, and see every formula. Runs in your browser.",
};

const faqs = [
  {
    q: "What is the difference between a cumulative and a non-cumulative CAM cap?",
    a: "A non-cumulative cap compares each year with the year before. A cumulative cap grows the base year by the cap percentage for each year that has passed, so room not used in an early year can be used later. Some cumulative caps compound (the base is multiplied by 1 plus the cap once per year) and some do not (the base is increased by the cap times the number of years). The same expenses can give different results under each, which is why the calculator shows all of them side by side.",
  },
  {
    q: "Which expenses go under the cap?",
    a: "Only the ones your lease caps. Many caps apply to controllable expenses and leave out items such as taxes, insurance or utilities, but leases define this differently. Enter the capped expenses in the first amount for each year and everything else in the second. The calculator does not sort expenses by name.",
  },
  {
    q: "Does a result above the cap mean I was overcharged?",
    a: "No. It means the figures you entered are above the allowed amount under the method you selected. Whether that is a billing error depends on your lease wording, any amendments, and the expenses the landlord placed under the cap. It is a question to raise with your landlord, with the calculation attached.",
  },
  {
    q: "What is a base year or expense stop?",
    a: "Instead of a cap, some leases have the tenant pay its share of the increase in operating expenses over a base year, or over a fixed amount called an expense stop. The calculator applies your share to the increase over that base. If your lease requires expenses to be grossed up for occupancy, enter grossed-up figures for both years.",
  },
];

export default function CamCapCalculatorPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <main className="bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="border-b border-gray-100 bg-gray-50/60">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-gray-900 sm:text-4xl">CAM Cap and Base-Year Calculator</h1>
          <p className="mt-4 text-lg leading-relaxed text-gray-600">
            Apply your lease&apos;s cap on CAM increases year by year, or work out your share of the increase over a base year or
            expense stop. You choose how the lease measures the cap and which expenses it covers; the calculator shows every
            formula. It runs in your browser: nothing you type is sent or stored.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <CamCapCalculator />

        <section className="mt-12">
          <h2 className="text-2xl font-semibold text-gray-900">How each cap method is calculated</h2>
          <p className="mt-3 text-gray-600">
            In each formula, &quot;base&quot; is the base year&apos;s capped expenses, &quot;cap&quot; is the percentage and
            &quot;n&quot; is the number of years after the base year.
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-gray-600">
            <li>
              <strong>Non-cumulative, against the prior year&apos;s allowed amount:</strong> allowed this year = the lower of last
              year&apos;s actual and last year&apos;s allowed amount, x (1 + cap). A year above the cap lowers the next year&apos;s base.
            </li>
            <li>
              <strong>Non-cumulative, against the prior year&apos;s actual expenses:</strong> allowed this year = last year&apos;s
              actual x (1 + cap).
            </li>
            <li><strong>Cumulative, compounding:</strong> allowed = base x (1 + cap)<sup>n</sup>.</li>
            <li><strong>Cumulative, non-compounding:</strong> allowed = base x (1 + cap x n).</li>
            <li>Amount above the cap = the larger of zero and (capped expenses - allowed). Expenses outside the cap are not limited.</li>
          </ul>
          <p className="mt-4 text-gray-600">
            Example (fictional): with a 5% cap, a $100,000 base year and capped expenses of $103,000, $112,000 and $115,000 in
            the next three years, the total above the cap is $5,292.50, $3,850, $1,750 or $2,000 depending on the method. Use
            &quot;Load a fictional example&quot; above to see each step.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-semibold text-gray-900">What the calculator does not decide</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-gray-600">
            <li>Which method your lease uses. Read the cap clause; if it is unclear, compare the readings shown with the result.</li>
            <li>Which expenses are controllable or capped. That is defined by your lease, not by an expense&apos;s name.</li>
            <li>
              Whether an amendment changed the cap, the base year or the covered expenses. If one did, calculate each period under
              the terms that applied to it rather than merging them.
            </li>
            <li>Whether a base year must be grossed up for occupancy, and whether a missing year can be estimated. It refuses gaps.</li>
            <li>It is not legal or accounting advice, and it does not say whether you have a right or a deadline to dispute a charge.</li>
          </ul>
        </section>

        <section className="mt-10 rounded-2xl border border-blue-100 bg-blue-50/60 p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-gray-900">Checking the rest of your statement</h2>
          <p className="mt-2 text-gray-700">
            For the share, fee and pool arithmetic of a single statement, use the{" "}
            <Link href="/cam-calculator" className="text-blue-700 underline">CAM reconciliation calculator</Link>. A LeaseGuard audit
            reads your lease and statement and checks exclusions, fee limits and the share applied, with the source text for each
            item. The preview is free; the full report is a one-time $49 for one year or $149 for two to five years.
          </p>
          <Link href="/upload" className="mt-4 inline-flex items-center rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-500">
            Upload your lease and statement
          </Link>
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
          <Link href="/resources/cam-cap-commercial-lease" className="text-blue-700 underline">CAM caps explained</Link>,{" "}
          <Link href="/resources/management-fees-and-cam-caps" className="text-blue-700 underline">management fees and CAM caps</Link>,{" "}
          <Link href="/resources/cam-reconciliation-guide" className="text-blue-700 underline">reading a CAM reconciliation</Link>.
        </p>
      </div>
    </main>
  );
}
