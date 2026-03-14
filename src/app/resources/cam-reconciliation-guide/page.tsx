import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

export const metadata: Metadata = {
  title: "CAM Reconciliation: What Tenants Need to Know | LeaseGuard",
  description:
    "Understand the annual CAM reconciliation process, how year-end adjustments work, and where discrepancies commonly arise for commercial tenants.",
  keywords: [
    "CAM reconciliation",
    "annual reconciliation",
    "commercial lease reconciliation",
    "CAM year-end adjustment",
    "operating expense reconciliation",
    "tenant reconciliation",
    "triple net lease expenses",
    "commercial lease CAM charges",
  ],
};

export default function CamReconciliationGuide() {
  return (
    <ArticleLayout
      title="CAM Reconciliation: What Tenants Need to Know"
      publishedDate="March 2026"
      readTime="9 min read"
      description="Understand the annual CAM reconciliation process, how year-end adjustments work, and where discrepancies commonly arise for commercial tenants."
    >
      <p>
        The annual CAM reconciliation statement is one of the most financially
        significant documents a commercial tenant receives — and one of the
        most frequently ignored. This statement determines whether you owe your
        landlord additional money or are owed a credit, and errors in the
        reconciliation can cost retail tenants, office tenants, medical
        practices, and franchise operators thousands of dollars per year.
      </p>
      <p>
        Understanding how reconciliation works — and knowing where mistakes
        commonly occur — is essential for any tenant who wants to verify
        they&apos;re being charged fairly.
      </p>

      <h2>How CAM Reconciliation Works</h2>
      <p>
        During the lease year, tenants pay monthly{" "}
        <Link href="/resources/cam-charges-explained" className="text-blue-600 hover:underline">
          CAM estimates
        </Link>{" "}
        based on the landlord&apos;s projected operating costs. These estimates
        are typically set at the beginning of the year based on the prior
        year&apos;s actual expenses plus any anticipated increases.
      </p>
      <p>
        After the year ends, the landlord tallies the actual operating expenses,
        calculates each tenant&apos;s proportionate share, and compares that
        amount against what the tenant already paid. This comparison is the
        reconciliation.
      </p>
      <h3>The Reconciliation Timeline</h3>
      <ul>
        <li>
          <strong>Year ends</strong> — The fiscal year for CAM calculations
          closes (usually December 31, but this varies by lease).
        </li>
        <li>
          <strong>Landlord compiles actuals</strong> — The property management
          team gathers invoices, tallies expenses, and prepares the
          reconciliation.
        </li>
        <li>
          <strong>Statement delivered</strong> — Most leases require the
          landlord to deliver the reconciliation within 90-120 days after
          year-end.
        </li>
        <li>
          <strong>Tenant review period</strong> — The tenant has a window
          (typically 30-120 days) to review the statement and raise any
          objections.
        </li>
      </ul>

      <h2>What the Reconciliation Statement Should Include</h2>
      <p>
        A well-prepared reconciliation statement breaks expenses into categories
        that correspond to the lease&apos;s definition of operating expenses.
        You should see:
      </p>
      <ul>
        <li>Itemized actual expenses by category</li>
        <li>Your proportionate share percentage and how it was calculated</li>
        <li>Total CAM estimates you paid during the year</li>
        <li>The resulting credit or additional charge</li>
        <li>Comparison to prior year actuals (not always included, but helpful)</li>
      </ul>
      <p>
        If your reconciliation statement is just a single number with no
        breakdown, that&apos;s a red flag. You&apos;re entitled to understand
        what you&apos;re being charged for.
      </p>

      <h2>Common Reconciliation Issues</h2>

      <h3>Late Delivery</h3>
      <p>
        Many leases specify a deadline for delivering the reconciliation. If the
        landlord misses it, some leases waive the tenant&apos;s obligation to
        pay the additional charge. Even if your lease doesn&apos;t have this
        provision, a late statement limits your ability to verify the charges
        while the information is still fresh.
      </p>

      <h3>Estimated vs. Actual Expense Gaps</h3>
      <p>
        If the landlord consistently underestimates monthly CAM charges, tenants
        face large year-end true-up bills. This can create serious cash flow
        problems, especially for small business owners and franchise operators.
        Some leases limit how much the landlord can increase estimates year
        over year to prevent this.
      </p>

      <h3>Gross-Up Adjustments</h3>
      <p>
        In buildings that aren&apos;t fully occupied, variable expenses (like
        cleaning or utilities) may be lower than they would be at full
        occupancy. A gross-up provision adjusts these expenses to simulate full
        occupancy, preventing current tenants from subsidizing vacant space. The
        issue arises when landlords apply gross-up incorrectly — either
        applying it to fixed costs, applying it to the wrong expense
        categories, or using the wrong occupancy percentage.
      </p>

      <h3>Incorrect Proportionate Share</h3>
      <p>
        The reconciliation should use the proportionate share specified in your
        lease. If the building&apos;s total rentable area has changed (due to
        renovations or remeasurement), the landlord may adjust your share
        without updating you. Always verify the square footage figures on your
        statement — even a small error here affects every expense category.
      </p>

      <h3>Inflated Management Fees</h3>
      <p>
        Management fees are typically calculated as a percentage of total
        operating expenses. If other costs on the reconciliation are inflated —
        whether through errors or the inclusion of expenses the lease excludes
        — the management fee is automatically inflated too. This compounding
        effect can add up to a meaningful overcharge, particularly in
        properties with higher management fee percentages.
      </p>

      <h3>Year-Over-Year Comparisons</h3>
      <p>
        One of the most effective ways to spot issues is comparing this
        year&apos;s reconciliation to prior years. If a category like
        &quot;repairs and maintenance&quot; increased 40% with no obvious
        explanation (like a known building issue), it warrants a closer look.
        Similarly, watch for new line items that didn&apos;t exist in prior
        years.
      </p>

      <h2>How to Review Your Reconciliation Statement</h2>
      <ol>
        <li>Check the math — verify that line items add up to the stated totals</li>
        <li>Verify your proportionate share percentage against the lease</li>
        <li>Compare each category to the prior year</li>
        <li>Cross-reference against your lease&apos;s definition of permitted expenses</li>
        <li>Look for excluded costs that may have been included</li>
        <li>Check if{" "}
          <Link href="/resources/cam-cap-commercial-lease" className="text-blue-600 hover:underline">
            CAM cap provisions
          </Link>{" "}
          have been applied correctly
        </li>
        <li>Confirm the reconciliation was delivered within the required timeframe</li>
      </ol>
      <p>
        For a complete step-by-step process, see our guide on{" "}
        <Link href="/resources/how-to-audit-cam-charges" className="text-blue-600 hover:underline">
          how to audit your CAM charges
        </Link>.
      </p>

      <h2>How LeaseGuard Helps</h2>
      <p>
        Cross-referencing your lease clauses against every line item on a
        reconciliation statement is exactly the kind of detailed work that
        tools are good at. LeaseGuard lets you upload both your lease and your
        reconciliation statement, then analyzes them together to identify areas
        where the charges may not align with your lease terms — including pro
        rata share errors, excluded cost pass-throughs, management fee
        calculations, and CAM cap compliance. Results are delivered in about 60
        seconds, giving you a clear starting point for any follow-up review.
      </p>

      <h2>Key Takeaways</h2>
      <ul>
        <li>CAM reconciliation compares your monthly estimates against actual expenses</li>
        <li>Review the statement promptly — you may have a limited window to object</li>
        <li>Always compare year over year to spot unusual changes</li>
        <li>Verify your proportionate share and the building&apos;s total square footage</li>
        <li>Gross-up provisions are commonly misapplied — understand how yours works</li>
        <li>A summary-only statement without line-item detail is a red flag</li>
      </ul>
    </ArticleLayout>
  );
}
