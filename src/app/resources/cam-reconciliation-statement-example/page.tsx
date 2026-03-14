import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

export const metadata: Metadata = {
  title: "CAM Reconciliation Statement Example | LeaseGuard",
  description:
    "See a practical example of a CAM reconciliation statement with line-by-line explanations. Learn how to read and verify each section of your annual reconciliation.",
  keywords: [
    "CAM reconciliation statement example",
    "CAM reconciliation sample",
    "how to read CAM reconciliation",
    "CAM statement explained",
    "annual reconciliation statement",
    "operating expense reconciliation",
    "commercial lease reconciliation",
    "CAM charges breakdown",
  ],
};

export default function CamReconciliationStatementExample() {
  return (
    <ArticleLayout
      title="CAM Reconciliation Statement Example"
      publishedDate="March 2026"
      readTime="11 min read"
      description="See a practical example of a CAM reconciliation statement with line-by-line explanations. Learn how to read and verify each section of your annual reconciliation."
    >
      <p>
        A{" "}
        <Link
          href="/resources/cam-reconciliation-guide"
          className="text-blue-600 hover:underline"
        >
          CAM reconciliation statement
        </Link>{" "}
        is the annual document your landlord sends showing actual common area
        maintenance costs compared to the monthly estimates you paid during the
        year. For many commercial tenants — retail operators, franchise owners,
        medical practices, and small businesses — this statement is the only
        window into how their{" "}
        <Link
          href="/resources/cam-charges-explained"
          className="text-blue-600 hover:underline"
        >
          CAM charges
        </Link>{" "}
        are being calculated.
      </p>
      <p>
        This article walks through a practical example of a CAM reconciliation
        statement, section by section, so you know exactly what to look for and
        where errors commonly hide.
      </p>

      <h2>What a Typical Reconciliation Statement Includes</h2>
      <p>
        While formats vary by landlord and property management company, most
        reconciliation statements contain the same core sections:
      </p>
      <ol>
        <li>Property and tenant identification</li>
        <li>Summary of total operating expenses by category</li>
        <li>Your proportionate share calculation</li>
        <li>Your share of each expense category</li>
        <li>Total estimated payments made during the year</li>
        <li>Net amount due (or credit owed)</li>
      </ol>

      <h2>Example: Line-by-Line Breakdown</h2>
      <p>
        Below is a simplified example of what a reconciliation statement might
        look like for a tenant leasing 3,000 square feet in a 60,000-square-foot
        retail center. The tenant&apos;s proportionate share is 5.00%.
      </p>

      <h3>Section 1: Property and Tenant Information</h3>
      <p>
        The top of the statement identifies the property, the tenant, the
        suite number, the lease square footage, and the reconciliation period
        (typically January 1 through December 31). Verify that your suite
        number and square footage match your lease. Errors here affect every
        calculation that follows.
      </p>

      <h3>Section 2: Total Property Operating Expenses</h3>
      <p>
        This section lists every expense category and the total amount spent on
        the entire property. A typical breakdown might include:
      </p>
      <ul>
        <li><strong>Landscaping and grounds:</strong> $42,000</li>
        <li><strong>Parking lot maintenance:</strong> $28,500</li>
        <li><strong>Snow and ice removal:</strong> $15,200</li>
        <li><strong>Janitorial — common areas:</strong> $36,800</li>
        <li><strong>Trash removal:</strong> $18,400</li>
        <li><strong>Security:</strong> $24,000</li>
        <li><strong>Common area utilities:</strong> $31,600</li>
        <li><strong>Repairs and maintenance:</strong> $22,300</li>
        <li><strong>Property management fee:</strong> $14,600</li>
        <li><strong>Insurance:</strong> $38,000</li>
        <li><strong>Property taxes:</strong> $92,000</li>
      </ul>
      <p>
        <strong>Total property operating expenses: $363,400</strong>
      </p>

      <h3>Section 3: Your Proportionate Share</h3>
      <p>
        The statement applies your proportionate share percentage to each
        expense total. At 5.00%, your share of the $363,400 total would be
        $18,170.
      </p>
      <p>
        This is where you should verify two things: (1) your square footage is
        correct, and (2) the total building area used in the denominator hasn&apos;t
        changed without lease authorization. Even a small error — 3,000 sq ft
        recorded as 3,200 sq ft, for example — inflates every expense on the
        statement.
      </p>

      <h3>Section 4: Estimated Payments and True-Up</h3>
      <p>
        The final section compares your actual share to what you already paid in
        monthly estimates:
      </p>
      <ul>
        <li><strong>Your share of actual expenses:</strong> $18,170</li>
        <li><strong>Total estimated payments (12 months × $1,450):</strong> $17,400</li>
        <li><strong>Amount due from tenant:</strong> $770</li>
      </ul>
      <p>
        In this example, the tenant underpaid by $770 during the year and owes
        an additional payment. If the estimates had exceeded actuals, the tenant
        would receive a credit.
      </p>

      <h2>Red Flags to Watch For</h2>
      <p>
        When reviewing your reconciliation statement, pay close attention to
        these common issues:
      </p>

      <h3>Large Year-Over-Year Increases</h3>
      <p>
        Compare this year&apos;s statement to last year&apos;s. If any single
        expense category has increased by more than 10-15%, ask the landlord for
        an explanation and supporting invoices. Sudden jumps in &quot;repairs and
        maintenance&quot; may indicate that{" "}
        <Link
          href="/resources/common-cam-overcharges"
          className="text-blue-600 hover:underline"
        >
          capital expenditures are being classified as operating expenses
        </Link>.
      </p>

      <h3>New Line Items</h3>
      <p>
        If a new expense category appears that wasn&apos;t on prior
        reconciliations, review your lease to confirm it is a permitted
        pass-through. Landlords occasionally add charges that may not be
        authorized under the original lease terms.
      </p>

      <h3>Management Fee Percentage</h3>
      <p>
        Verify that the management fee is calculated at the percentage specified
        in your lease. A management fee listed as a flat dollar amount (rather
        than a percentage of operating expenses) should be checked against your
        lease language.
      </p>

      <h3>Missing Gross-Up Adjustment</h3>
      <p>
        If the building was not fully occupied during the year, variable
        expenses should be &quot;grossed up&quot; to reflect what they would
        cost at full occupancy. Without this adjustment, tenants in partially
        occupied buildings effectively subsidize the landlord&apos;s vacant
        space.
      </p>

      <h3>CAM Cap Not Applied</h3>
      <p>
        If your lease includes a{" "}
        <Link
          href="/resources/cam-cap-commercial-lease"
          className="text-blue-600 hover:underline"
        >
          CAM cap
        </Link>, verify that the total controllable expenses on your statement do
        not exceed the capped amount. Cap violations are one of the most
        frequently missed overcharges.
      </p>

      <h2>How to Request Supporting Documentation</h2>
      <p>
        If anything on the reconciliation looks questionable, most commercial
        leases give you the right to request supporting documentation. Here is
        how to approach it:
      </p>
      <ol>
        <li>
          <strong>Identify the specific charges</strong> you want to verify —
          don&apos;t request &quot;everything.&quot; Targeted requests get
          faster responses.
        </li>
        <li>
          <strong>Send a written request</strong> referencing your lease&apos;s
          audit provision and specifying the expense categories and supporting
          documents you need (invoices, contracts, vendor agreements).
        </li>
        <li>
          <strong>Note your deadline.</strong> Many leases require audit
          requests within 90 to 180 days of receiving the reconciliation.
          Missing this window can waive your rights for that year.
        </li>
      </ol>
      <p>
        For a complete walkthrough of how to audit your charges, see our{" "}
        <Link
          href="/resources/how-to-audit-cam-charges"
          className="text-blue-600 hover:underline"
        >
          step-by-step CAM audit guide
        </Link>.
      </p>

      <h2>How LeaseGuard Helps</h2>
      <p>
        Instead of manually reviewing each line item against your lease,
        LeaseGuard automates the comparison. Upload your lease agreement and
        reconciliation statement, and the platform identifies potential
        discrepancies — including excluded expenses, proportionate share errors,
        management fee miscalculations, capital expense misclassification, and
        CAM cap violations. The analysis is delivered in about 60 seconds,
        giving you a clear starting point for any follow-up with your landlord.
      </p>

      <h2>Key Takeaways</h2>
      <ul>
        <li>Always verify your square footage and proportionate share at the top of the statement</li>
        <li>Compare every reconciliation to the prior year — look for spikes and new line items</li>
        <li>Check that excluded expenses under your lease are not appearing on the statement</li>
        <li>Confirm the management fee percentage matches your lease terms</li>
        <li>Request supporting invoices for any charges that seem unusual or unexplained</li>
        <li>Exercise your audit rights within the deadline your lease specifies</li>
      </ul>
    </ArticleLayout>
  );
}
