import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

export const metadata: Metadata = {
  title: "5 Common CAM Overcharges Tenants Miss | LeaseGuard",
  description:
    "Discover the most frequently overlooked CAM billing errors that cost commercial tenants thousands of dollars. Learn what to look for in your reconciliation statements.",
  keywords: [
    "CAM overcharges",
    "CAM billing errors",
    "commercial lease overcharges",
    "tenant overcharges",
    "CAM audit findings",
    "operating expense errors",
    "triple net lease expenses",
    "commercial lease CAM charges",
  ],
};

export default function CommonCamOvercharges() {
  return (
    <ArticleLayout
      title="5 Common CAM Overcharges Tenants Miss"
      publishedDate="March 2026"
      readTime="9 min read"
    >
      <p>
        CAM overcharges affect commercial tenants of every type — retail
        operators, office tenants, medical practices, franchise owners, and
        small businesses. These overcharges aren&apos;t usually the result of
        intentional fraud. More often, they stem from administrative errors,
        vague lease language, or disagreements about how certain provisions
        should be interpreted. But regardless of the cause, the financial impact
        is real: tenants who don&apos;t review their{" "}
        <Link href="/resources/cam-reconciliation-guide" className="text-blue-600 hover:underline">
          CAM reconciliation statements
        </Link>{" "}
        may be overpaying by thousands of dollars every year.
      </p>
      <p>
        Here are five of the most commonly overlooked CAM overcharges that
        commercial tenants should watch for.
      </p>

      <h2>1. Capital Expenditures Charged as Operating Expenses</h2>
      <p>
        This is arguably the most common and most costly CAM overcharge.
        There&apos;s an important distinction between a repair (operating
        expense) and a capital improvement (the landlord&apos;s investment in
        the property):
      </p>
      <ul>
        <li>
          <strong>Operating expense:</strong> Fixing a section of the parking
          lot, patching a roof leak, repairing an HVAC unit.
        </li>
        <li>
          <strong>Capital expenditure:</strong> Replacing the entire parking
          lot, installing a new roof, replacing the HVAC system.
        </li>
      </ul>
      <p>
        Most leases either exclude capital expenditures entirely or require them
        to be amortized over their useful life (for example, a $100,000 roof
        replacement amortized over 15 years would be roughly $6,700 per year,
        not $100,000 in a single year).
      </p>
      <p>
        The problem is that the line between &quot;repair&quot; and
        &quot;replacement&quot; is often blurry, and property managers
        sometimes classify major projects as repairs to pass the full cost
        through immediately. If you see a large, one-time charge in categories
        like &quot;building maintenance,&quot; &quot;repairs,&quot; or
        &quot;structural,&quot; dig deeper. Ask for the underlying invoices and
        determine whether the work constitutes a capital improvement.
      </p>

      <h2>2. Management Fee Overcharges</h2>
      <p>
        Property management fees are typically calculated as a percentage of
        total operating expenses — usually between 3% and 8%. The overcharge
        risk comes from multiple angles:
      </p>
      <ul>
        <li>
          <strong>Inflated base costs:</strong> If other{" "}
          <Link href="/resources/cam-charges-explained" className="text-blue-600 hover:underline">
            CAM charges
          </Link>{" "}
          are inflated, the management fee (as a percentage of those charges) is
          automatically inflated too. This creates a compounding effect.
        </li>
        <li>
          <strong>Wrong percentage:</strong> The lease specifies 4%, but the
          reconciliation applies 6%. In a complex reconciliation with dozens of
          line items, this is easy to miss.
        </li>
        <li>
          <strong>Double-charging:</strong> Some landlords charge both a
          management fee and separate administrative charges for functions that
          should be covered by the management fee (like accounting, vendor
          coordination, or supervision).
        </li>
        <li>
          <strong>Fee applied to excluded expenses:</strong> If the lease
          excludes certain costs from CAM, the management fee percentage
          shouldn&apos;t be applied to those costs either — but sometimes it
          is.
        </li>
      </ul>

      <h2>3. Costs That Should Be Excluded Under the Lease</h2>
      <p>
        Most well-drafted commercial leases include a list of expenses that are
        explicitly excluded from CAM pass-throughs. Common exclusions include:
      </p>
      <ul>
        <li>Costs of constructing or renovating the building</li>
        <li>Leasing commissions and advertising costs</li>
        <li>Legal fees related to tenant disputes or lease negotiations</li>
        <li>Costs reimbursed by insurance or warranties</li>
        <li>Depreciation on the building or its systems</li>
        <li>Mortgage payments or debt service</li>
        <li>Costs attributable to the landlord&apos;s own space</li>
      </ul>
      <p>
        The challenge is that reconciliation statements don&apos;t always use
        the same terminology as the lease. A lease might exclude &quot;costs
        of marketing the property,&quot; but the reconciliation might list it
        under &quot;community development&quot; or &quot;property
        promotion.&quot; Identifying these mismatches requires careful
        cross-referencing between your lease language and the statement line
        items.
      </p>

      <h2>4. Incorrect Proportionate Share Calculations</h2>
      <p>
        Your proportionate share of CAM is based on the ratio of your leased
        space to the total leasable area. Errors here affect every single
        expense category on your statement. Common mistakes include:
      </p>
      <ul>
        <li>
          <strong>Wrong tenant square footage:</strong> Your lease says 3,200
          square feet, but the reconciliation uses 3,400.
        </li>
        <li>
          <strong>Wrong building square footage:</strong> The total leasable
          area may have changed due to renovation or remeasurement, but your
          statement wasn&apos;t updated.
        </li>
        <li>
          <strong>Missing gross-up:</strong> When the building isn&apos;t fully
          occupied, variable costs should be adjusted upward to simulate full
          occupancy. If the landlord doesn&apos;t apply this adjustment, you
          may be subsidizing vacant space.
        </li>
        <li>
          <strong>Inconsistent shares:</strong> Some landlords use different
          proportionate shares for different expense pools (for example, a
          building share vs. a complex share) without lease authorization.
        </li>
      </ul>

      <h2>5. CAM Cap Violations</h2>
      <p>
        If your lease includes a{" "}
        <Link href="/resources/cam-cap-commercial-lease" className="text-blue-600 hover:underline">
          CAM cap
        </Link>, it places a ceiling on how much your CAM charges can increase
        year over year. Cap violations are surprisingly common because:
      </p>
      <ul>
        <li>
          Property managers may not be aware of every tenant&apos;s individual
          cap provisions.
        </li>
        <li>
          Cumulative vs. non-cumulative caps are frequently confused in
          calculations.
        </li>
        <li>
          The landlord may apply the cap to the wrong expense categories
          (for example, including uncontrollable expenses that should be outside
          the cap).
        </li>
        <li>
          The wrong base year is used as the starting point.
        </li>
      </ul>
      <p>
        Cap violations tend to get worse over time. A miscalculated base in Year
        1 compounds in every subsequent year, potentially resulting in thousands
        of dollars in cumulative overcharges.
      </p>

      <h2>Why These Overcharges Go Unnoticed</h2>
      <p>
        The reason these issues persist isn&apos;t that tenants are careless —
        it&apos;s that CAM reconciliation statements are dense, technical
        documents, and comparing them line by line against a complex lease
        agreement is time-consuming. Many small business owners, franchise
        operators, and medical practice managers simply don&apos;t have the
        time or expertise to do it every year.
      </p>

      <h2>What to Do If You Find Overcharges</h2>
      <ol>
        <li>
          <strong>Document everything.</strong> Note the specific charges you
          believe are incorrect and the lease provisions they violate.
        </li>
        <li>
          <strong>Contact your landlord or property manager.</strong> Start with
          a written inquiry. Many overcharges are resolved through simple
          communication.
        </li>
        <li>
          <strong>Exercise your audit rights.</strong> If the landlord
          disagrees, your lease likely grants you the right to inspect the
          underlying books and records.
        </li>
        <li>
          <strong>Consider professional help.</strong> For large discrepancies,
          a professional CAM auditor or commercial real estate attorney can help
          you recover the overcharges.
        </li>
      </ol>
      <p>
        For a complete walkthrough of the audit process, see our{" "}
        <Link href="/resources/how-to-audit-cam-charges" className="text-blue-600 hover:underline">
          step-by-step CAM audit guide
        </Link>.
      </p>

      <h2>How LeaseGuard Helps</h2>
      <p>
        LeaseGuard was designed to address exactly these issues. By uploading
        both your lease and your CAM reconciliation statement, the platform
        cross-references the two documents to identify potential discrepancies
        across all five categories described above — from capital expense
        classification to CAM cap compliance to excluded cost pass-throughs to
        management fee calculations. The analysis is delivered in about 60
        seconds, giving you a clear picture of where to focus your review.
      </p>

      <h2>Key Takeaways</h2>
      <ul>
        <li>Capital expenditures disguised as operating expenses are the most costly overcharge</li>
        <li>Management fees compound other overcharges — always verify the percentage</li>
        <li>Cross-reference your reconciliation against your lease&apos;s exclusion list</li>
        <li>Even a small proportionate share error affects every line item on your statement</li>
        <li>CAM cap violations accumulate over time and can cost thousands over a lease term</li>
      </ul>
    </ArticleLayout>
  );
}
