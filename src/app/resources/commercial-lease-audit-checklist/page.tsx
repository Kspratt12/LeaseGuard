import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

export const metadata: Metadata = {
  title: "Commercial Lease Audit Checklist | LeaseGuard",
  description:
    "A practical checklist for commercial tenants auditing their lease charges. Covers CAM reconciliation, operating expenses, proportionate share, and lease compliance.",
  keywords: [
    "commercial lease audit checklist",
    "lease audit checklist",
    "CAM audit checklist",
    "commercial tenant audit",
    "lease compliance review",
    "operating expense audit",
    "triple net lease audit",
    "commercial lease review",
  ],
};

export default function CommercialLeaseAuditChecklist() {
  return (
    <ArticleLayout
      title="Commercial Lease Audit Checklist"
      publishedDate="March 2026"
      readTime="10 min read"
    >
      <p>
        A lease audit is one of the most effective ways for commercial tenants to
        verify that they are being billed correctly under their lease agreement.
        Whether you operate a retail store, medical practice, franchise location,
        or office space, conducting a periodic audit of your{" "}
        <Link
          href="/resources/cam-charges-explained"
          className="text-blue-600 hover:underline"
        >
          CAM charges
        </Link>{" "}
        and operating expense pass-throughs can uncover billing errors that
        quietly accumulate over time.
      </p>
      <p>
        This checklist provides a structured framework for reviewing your lease
        charges. You don&apos;t need a background in commercial real estate to
        follow it — each item is explained in plain language so that any
        business operator can use it.
      </p>

      <h2>Before You Start: Gather Your Documents</h2>
      <p>
        Before you begin the audit, collect the following documents. Having
        everything in one place will make the process significantly faster:
      </p>
      <ul>
        <li>
          <strong>Your executed lease agreement</strong> — including all
          amendments, addenda, and side letters.
        </li>
        <li>
          <strong>CAM reconciliation statements</strong> — for the current year
          and at least the prior two years. See our guide on{" "}
          <Link
            href="/resources/cam-reconciliation-guide"
            className="text-blue-600 hover:underline"
          >
            CAM reconciliation
          </Link>{" "}
          for background on what these statements contain.
        </li>
        <li>
          <strong>Monthly rent and CAM invoices</strong> — to compare estimated
          charges against actual reconciliation amounts.
        </li>
        <li>
          <strong>Prior audit reports</strong> — if you have conducted audits in
          previous years.
        </li>
      </ul>

      <h2>Step 1: Verify Your Lease Terms</h2>
      <p>
        Start by confirming the fundamental terms of your lease that affect how
        charges are calculated:
      </p>
      <ul>
        <li>
          <strong>Lease type:</strong> Is your lease a triple net (NNN), modified
          gross, or full-service gross lease? This determines which expenses you
          are responsible for.
        </li>
        <li>
          <strong>Premises square footage:</strong> Confirm the rentable square
          footage stated in your lease matches what is used in the reconciliation
          calculations.
        </li>
        <li>
          <strong>Proportionate share:</strong> Verify the percentage used for
          your share of common area expenses. This is typically your square
          footage divided by total leasable area.
        </li>
        <li>
          <strong>Base year or expense stop:</strong> If applicable, confirm the
          base year amounts being used in your calculations.
        </li>
        <li>
          <strong>Lease commencement and expiration dates:</strong> Ensure
          charges are only billed for periods your lease is active.
        </li>
      </ul>

      <h2>Step 2: Review the CAM Reconciliation Statement</h2>
      <p>
        The annual{" "}
        <Link
          href="/resources/cam-reconciliation-guide"
          className="text-blue-600 hover:underline"
        >
          CAM reconciliation statement
        </Link>{" "}
        is the core document you are auditing. Review it with the following
        questions in mind:
      </p>
      <ul>
        <li>
          Are all expense categories consistent with what your lease allows to be
          passed through?
        </li>
        <li>
          Are there any new line items that did not appear in prior years? If so,
          are they permitted under your lease?
        </li>
        <li>
          Do any individual expense categories show large year-over-year
          increases? Spikes may indicate{" "}
          <Link
            href="/resources/common-cam-overcharges"
            className="text-blue-600 hover:underline"
          >
            common overcharges
          </Link>{" "}
          such as capital expenses being classified as operating costs.
        </li>
        <li>
          Is the management fee calculated at the correct percentage as specified
          in your lease?
        </li>
        <li>
          Does the statement reflect the correct proportionate share for your
          space?
        </li>
      </ul>

      <h2>Step 3: Check for Excluded Expenses</h2>
      <p>
        Most commercial leases include a list of expenses that the landlord
        cannot pass through to tenants. Review your lease&apos;s exclusion list
        and confirm that none of these costs appear on your reconciliation:
      </p>
      <ul>
        <li>Capital expenditures (unless your lease specifically permits them or requires amortization)</li>
        <li>Leasing commissions or tenant improvement costs</li>
        <li>Costs reimbursed by insurance proceeds or warranties</li>
        <li>Marketing, advertising, or promotional expenses</li>
        <li>Legal fees for lease disputes or tenant negotiations</li>
        <li>Mortgage payments, debt service, or ground rent</li>
        <li>Costs attributable to the landlord&apos;s own space or vacant space</li>
        <li>Depreciation or amortization of the building itself</li>
      </ul>

      <h2>Step 4: Validate the Proportionate Share Calculation</h2>
      <p>
        Your proportionate share is the single most impactful number on your
        reconciliation because it affects every expense line item. Verify:
      </p>
      <ul>
        <li>
          <strong>Your square footage</strong> matches the lease — not an
          estimate, not a rounded number.
        </li>
        <li>
          <strong>The total building or project area</strong> used in the
          denominator is correct and hasn&apos;t changed without lease
          authorization.
        </li>
        <li>
          <strong>Gross-up provisions</strong> are applied correctly if the
          building has vacancy. Variable expenses should be adjusted to reflect
          what they would be at full occupancy so that existing tenants are not
          subsidizing empty space.
        </li>
      </ul>

      <h2>Step 5: Review CAM Cap Compliance</h2>
      <p>
        If your lease includes a{" "}
        <Link
          href="/resources/cam-cap-commercial-lease"
          className="text-blue-600 hover:underline"
        >
          CAM cap
        </Link>, verify that it is being applied correctly:
      </p>
      <ul>
        <li>Is the correct base year amount being used?</li>
        <li>Is the cap applied as cumulative or non-cumulative, as your lease specifies?</li>
        <li>Are controllable and uncontrollable expenses separated correctly?</li>
        <li>Does the year-over-year increase stay within the cap percentage?</li>
      </ul>

      <h2>Step 6: Compare Estimates to Actuals</h2>
      <p>
        Compare the monthly CAM estimates you paid during the year against the
        actual reconciliation amount. Look for:
      </p>
      <ul>
        <li>Large true-up charges that suggest estimates were significantly too low</li>
        <li>Patterns of consistently high estimates that result in credits owed back to you — are those credits actually being applied?</li>
        <li>Whether the landlord is adjusting estimates each year to reflect prior actuals</li>
      </ul>

      <h2>Step 7: Exercise Your Audit Rights</h2>
      <p>
        Most commercial leases include audit rights that allow tenants to inspect
        the landlord&apos;s books and records. If your review reveals
        discrepancies:
      </p>
      <ol>
        <li>
          <strong>Send a written request</strong> to the landlord or property
          manager, referencing the specific lease provision that grants audit
          rights.
        </li>
        <li>
          <strong>Request supporting documentation</strong> — invoices,
          contracts, and vendor agreements for any charges you want to verify.
        </li>
        <li>
          <strong>Note the deadline.</strong> Many leases require audit requests
          within 90 to 180 days of receiving the reconciliation. Missing this
          window may waive your rights for that year.
        </li>
      </ol>
      <p>
        For a detailed walkthrough of the audit process, see our{" "}
        <Link
          href="/resources/how-to-audit-cam-charges"
          className="text-blue-600 hover:underline"
        >
          step-by-step CAM audit guide
        </Link>.
      </p>

      <h2>How LeaseGuard Helps</h2>
      <p>
        LeaseGuard automates the most time-consuming parts of this checklist. By
        uploading your lease agreement and CAM reconciliation statement, the
        platform cross-references the two documents to flag potential issues
        across excluded expenses, proportionate share calculations, CAM cap
        compliance, capital expense classification, and management fee
        accuracy — all in about 60 seconds. This gives you a prioritized
        list of items to investigate rather than having to review every line
        manually.
      </p>

      <h2>Key Takeaways</h2>
      <ul>
        <li>Gather your lease, amendments, and at least two years of reconciliation statements before starting</li>
        <li>Verify your proportionate share first — errors there affect every expense category</li>
        <li>Cross-reference reconciliation line items against your lease&apos;s exclusion list</li>
        <li>Check CAM cap compliance if your lease includes annual increase limits</li>
        <li>Exercise your audit rights within the deadline specified in your lease</li>
      </ul>
    </ArticleLayout>
  );
}
