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
  ],
};

export default function CamReconciliationGuide() {
  return (
    <ArticleLayout
      title="CAM Reconciliation: What Tenants Need to Know"
      publishedDate="March 2026"
      readTime="8 min read"
    >
      <p>
        Every year, commercial tenants receive a document that often gets filed
        away without much thought: the CAM reconciliation statement. This
        document reconciles what you paid in monthly CAM estimates against the
        actual expenses incurred by the landlord during the year. The result is
        either a credit (you overpaid) or an additional charge (you underpaid).
      </p>
      <p>
        Understanding how reconciliation works is important because it directly
        affects how much you owe — and whether you&apos;re being charged
        fairly.
      </p>

      <h2>How CAM Reconciliation Works</h2>
      <p>
        During the lease year, tenants pay monthly CAM estimates based on the
        landlord&apos;s projected operating costs. These estimates are typically
        set at the beginning of the year based on the prior year&apos;s actual
        expenses plus any anticipated increases.
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
        face large year-end true-up bills. This can create cash flow problems.
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
        statement.
      </p>

      <h3>Year-Over-Year Comparisons</h3>
      <p>
        One of the most effective ways to spot issues is comparing this
        year&apos;s reconciliation to prior years. If a category like
        &quot;repairs and maintenance&quot; increased 40% with no obvious
        explanation (like a known building issue), it warrants a closer look.
      </p>

      <h2>How to Review Your Reconciliation Statement</h2>
      <ol>
        <li>Check the math — verify that line items add up to the stated totals</li>
        <li>Verify your proportionate share percentage</li>
        <li>Compare each category to the prior year</li>
        <li>Cross-reference against your lease&apos;s definition of permitted expenses</li>
        <li>Look for excluded costs that may have been included</li>
        <li>Check if CAM cap provisions have been applied correctly</li>
        <li>Confirm the reconciliation was delivered within the required timeframe</li>
      </ol>
      <p>
        This kind of cross-referencing between your lease and your
        reconciliation statement is exactly what{" "}
        <Link href="/" className="text-blue-600 hover:underline">
          LeaseGuard
        </Link>{" "}
        is designed to simplify. Rather than spending hours manually comparing
        lease clauses against statement line items, you can upload both
        documents and let the platform identify areas where the charges may not
        align with your lease terms.
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
