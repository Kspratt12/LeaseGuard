import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

export const metadata: Metadata = {
  alternates: { canonical: "/resources/how-to-calculate-cam-charges" },
  title: "How to Calculate CAM Charges (With Example) | LeaseGuard",
  description:
    "How a commercial tenant's CAM charges are calculated: the expense pool, management fee, pro-rata share and payments, with a worked fictional example.",
};

const a = "text-blue-600 hover:underline";

export default function HowToCalculateCamChargesPage() {
  return (
    <ArticleLayout
      title="How to Calculate CAM Charges: Step-by-Step With an Example"
      publishedDate="October 29, 2026"
      modifiedDate="October 29, 2026"
      readTime="7 min read"
      description="How a commercial tenant's CAM charges are calculated, with a worked fictional example."
    >
      <p>
        Your CAM charge is not a single rate. It is the result of a short chain of calculations, and each link in the chain
        is defined by your lease. This guide walks through the chain so you can recompute a statement yourself and know
        which numbers to question when yours does not match. To skip the arithmetic, use the{" "}
        <Link href="/cam-calculator" className={a}>
          CAM reconciliation calculator
        </Link>
        .
      </p>
      <p>
        The percentage used in every step below is your pro-rata share; <Link href="/resources/check-your-pro-rata-share" className="text-blue-600 hover:underline">here is how to check it against your lease</Link>.
      </p>
      <p>
        To see these figures laid out on a statement, read the <Link href="/resources/cam-reconciliation-statement-example" className="text-blue-600 hover:underline">CAM reconciliation statement example</Link>.
      </p>

      <h2>The four numbers behind every CAM charge</h2>
      <ol>
        <li><strong>The expense pool:</strong> the building&apos;s operating expenses the lease lets the landlord share.</li>
        <li><strong>Add-ons:</strong> a management or administrative fee, and sometimes a gross-up for variable expenses.</li>
        <li><strong>Your share:</strong> a percentage, usually based on square footage.</li>
        <li><strong>Your payments:</strong> the monthly estimates you paid during the year.</li>
      </ol>
      <p>
        Your annual charge is the pool (with add-ons) times your share. The reconciliation is the difference between that
        charge and what you paid in estimates: a balance due, or a credit.
      </p>

      <h2>Step 1: Establish the expense pool</h2>
      <p>
        The statement lists categories such as landscaping, insurance, snow removal and repairs. The lease decides which
        categories may be included and which are excluded, so the pool on the statement is only the landlord&apos;s
        proposed pool. Checking what belongs in it is a separate task, covered in{" "}
        <Link href="/resources/what-landlords-can-include-in-cam" className={a}>
          what landlords can include in CAM charges
        </Link>{" "}
        and{" "}
        <Link href="/resources/can-landlords-charge-capital-expenses" className={a}>
          capital expenses
        </Link>
        . For the arithmetic in this guide, take the pool as given.
      </p>

      <h2>Step 2: Add the management or administrative fee</h2>
      <p>
        Many leases allow a fee expressed as a percentage of operating expenses. Two things vary from lease to lease: the
        percentage, and what it is a percentage of (the base). Whether the fee sits inside or outside a CAM cap also varies.
        We cover this in detail in{" "}
        <Link href="/resources/management-fees-and-cam-caps" className={a}>
          management fees and CAM caps
        </Link>
        . If the statement shows the fee as its own line, do not add it again.
      </p>

      <h2>Step 3: Apply your pro-rata share</h2>
      <p>
        A common approach is your rentable square footage divided by the building&apos;s rentable square footage. Examples
        of why this needs a close look:
      </p>
      <ul>
        <li>The lease may fix the percentage (for example, &quot;8%&quot;) instead of computing it each year.</li>
        <li>The denominator may be the whole building, or only the space that is leased or occupied. Vacancy then changes your share.</li>
        <li>Some leases use different shares for different cost groups, such as taxes versus common area costs.</li>
        <li>Statements sometimes round the percentage, which moves the result by a few dollars on large pools.</li>
      </ul>

      <h2>Step 4: Adjustments some leases include</h2>
      <p>
        Some leases let the landlord &quot;gross up&quot; variable expenses, such as janitorial or utilities, to what they
        would be at a stated occupancy level. Others have a base year or base amount, so the tenant pays only the increase.
        If your lease has either, the pool in step 1 is adjusted before your share is applied. Neither appears in a simple
        calculator, so if your lease mentions them, ask for the landlord&apos;s workpapers.
      </p>

      <h2>Step 5: Compare with what you paid</h2>
      <p>
        Subtract the estimated payments you made from your annual charge. A positive result is the balance due; a negative
        result is a credit. Many landlords also reset the monthly estimate for the following year based on the new total.
      </p>

      <h2>Worked example (fictional numbers)</h2>
      <p>
        <em>
          This example uses made-up figures to show the method. It does not describe any real lease, building or customer.
        </em>
      </p>
      <ul>
        <li>Operating expenses for the year: $500,000</li>
        <li>Management fee, 10% of expenses, charged on top: $500,000 x 10% = $50,000</li>
        <li>Pool including fee: $500,000 + $50,000 = $550,000</li>
        <li>Your share: 4,000 sq ft / 50,000 sq ft = 8%</li>
        <li>Your annual charge: $550,000 x 8% = $44,000</li>
        <li>Estimated payments: $3,500 per month x 12 = $42,000</li>
        <li>Balance due: $44,000 - $42,000 = $2,000</li>
      </ul>
      <p>
        Suppose the statement shows $2,640 due. The difference is $640. That is a question to ask the landlord, not a
        conclusion. Plausible explanations include a different expense pool, a different fee base, a different share, a
        gross-up, or an estimate that changed mid-year. Each has a different answer in the lease.
      </p>

      <h2>When your number differs from the statement</h2>
      <ol>
        <li>Recompute using the statement&apos;s own pool and share first. If that matches, the difference is in the inputs.</li>
        <li>Check the share: your percentage, the lease definition, and the square footage figures the statement uses.</li>
        <li>Check the fee: the percentage and the base the fee is applied to.</li>
        <li>Ask for the supporting detail behind any category you cannot explain. The lease may set how and when you can ask, and those terms vary.</li>
      </ol>

      <h2>What this guide does not decide</h2>
      <p>
        Arithmetic can only show whether the statement is internally consistent. Whether an expense is allowed, whether a cap
        applies, and what deadlines apply to questioning a statement all depend on your specific lease and on the law where
        the property is located. For legal questions, consult a qualified commercial real estate attorney.
      </p>
      <p>
        If you want the statement compared against your lease, a{" "}
        <Link href="/upload" className={a}>
          LeaseGuard audit
        </Link>{" "}
        reads both documents and shows the source page for each item. See also the{" "}
        <Link href="/resources/commercial-lease-audit-checklist" className={a}>
          commercial lease audit checklist
        </Link>
        .
      </p>
    </ArticleLayout>
  );
}
