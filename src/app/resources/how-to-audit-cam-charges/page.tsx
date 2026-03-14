import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

export const metadata: Metadata = {
  title: "How to Audit Your CAM Charges: A Step-by-Step Guide | LeaseGuard",
  description:
    "Step-by-step guide for commercial tenants who want to audit their CAM charges. Learn what to look for, common red flags, and how to exercise your audit rights.",
  keywords: [
    "CAM audit",
    "audit CAM charges",
    "commercial lease audit",
    "CAM statement review",
    "tenant audit rights",
    "operating expense audit",
    "triple net lease expenses",
    "commercial lease overcharges",
  ],
};

export default function HowToAuditCamCharges() {
  return (
    <ArticleLayout
      title="How to Audit Your CAM Charges"
      publishedDate="March 2026"
      readTime="10 min read"
      description="Step-by-step guide for commercial tenants who want to audit their CAM charges. Learn what to look for, common red flags, and how to exercise your audit rights."
    >
      <p>
        For commercial tenants — whether you operate a retail store, a medical
        office, a franchise location, or a professional services firm — CAM
        charges represent a significant and often unpredictable expense. Studies
        consistently show that a meaningful percentage of CAM reconciliation
        statements contain errors, and those errors almost always result in
        tenants paying more than they should.
      </p>
      <p>
        Whether you&apos;re spending $5,000 or $50,000 per year on CAM, a
        systematic review of your charges can uncover billing mistakes that
        directly affect your bottom line. Here&apos;s how to approach it.
      </p>

      <h2>Step 1: Know Your Lease</h2>
      <p>
        Before you can audit your{" "}
        <Link href="/resources/cam-charges-explained" className="text-blue-600 hover:underline">
          CAM charges
        </Link>, you need to understand what your lease says about them.
        Pull out your lease and look for sections that cover:
      </p>
      <ul>
        <li>
          <strong>Definitions of operating expenses</strong> — What costs does
          the lease allow the landlord to pass through? Broad definitions give
          landlords more latitude. Narrow, specific definitions protect tenants.
        </li>
        <li>
          <strong>Exclusions</strong> — What costs are explicitly excluded from
          CAM? Common exclusions include capital expenditures, leasing
          commissions, and costs covered by insurance proceeds.
        </li>
        <li>
          <strong>CAM caps</strong> — Does your lease limit annual CAM
          increases? If so, is the cap{" "}
          <Link href="/resources/cam-cap-commercial-lease" className="text-blue-600 hover:underline">
            cumulative or non-cumulative
          </Link>?
        </li>
        <li>
          <strong>Audit rights</strong> — Almost every commercial lease grants
          tenants the right to inspect the landlord&apos;s books. Look for the
          specific process, deadlines, and any limitations.
        </li>
        <li>
          <strong>Base year or expense stop</strong> — Some leases only charge
          tenants for CAM increases above a base year amount.
        </li>
      </ul>
      <p>
        Pay particular attention to vague language. Phrases like &quot;including
        but not limited to&quot; in the operating expense definition give
        landlords broad discretion to include costs you may not have
        anticipated.
      </p>

      <h2>Step 2: Gather Your Documents</h2>
      <p>You&apos;ll need:</p>
      <ul>
        <li>Your signed lease (including all amendments)</li>
        <li>The most recent annual{" "}
          <Link href="/resources/cam-reconciliation-guide" className="text-blue-600 hover:underline">
            CAM reconciliation statement
          </Link>
        </li>
        <li>Prior years&apos; reconciliation statements for comparison</li>
        <li>Monthly CAM payment records</li>
      </ul>
      <p>
        Having your lease and reconciliation statement side by side is critical.
        The whole point of a CAM audit is comparing what the landlord charged
        against what the lease allows.
      </p>

      <h2>Step 3: Verify Your Proportionate Share</h2>
      <p>
        Check that the pro rata share percentage on your statement matches what
        your lease specifies. This step is critical because a proportionate
        share error affects every single expense category on your statement.
        Common errors include:
      </p>
      <ul>
        <li>Using the wrong square footage for your space</li>
        <li>Using the wrong total building square footage</li>
        <li>Not adjusting for vacant space when the lease requires gross-up provisions</li>
        <li>Applying different share percentages to different expense categories without lease basis</li>
      </ul>
      <p>
        Even a small error — say, 4.2% instead of 4.0% — compounds across
        every expense category and every year of the lease.
      </p>

      <h2>Step 4: Review Each Expense Category</h2>
      <p>
        Go line by line through the reconciliation statement and ask these
        questions for each expense:
      </p>
      <ol>
        <li>Is this expense category permitted under the lease?</li>
        <li>Does the amount seem reasonable compared to prior years?</li>
        <li>Are there any year-over-year spikes that aren&apos;t explained?</li>
        <li>Could this be a capital expenditure that shouldn&apos;t be passed through?</li>
        <li>Are management fees being calculated at the correct percentage?</li>
      </ol>

      <h3>Red Flags to Watch For</h3>
      <ul>
        <li>A single expense category jumping 20% or more in one year</li>
        <li>New line items that didn&apos;t appear in previous years</li>
        <li>Roof repairs, parking lot resurfacing, or HVAC replacements charged as operating expenses instead of capital items</li>
        <li>Administrative fees charged on top of management fees</li>
        <li>Insurance premiums increasing faster than market rates</li>
        <li>Management fees applied to expenses the lease excludes from the fee calculation</li>
      </ul>

      <h2>Step 5: Check for Excluded Costs</h2>
      <p>
        Compare the reconciliation statement against the exclusions listed in
        your lease. Be aware that reconciliation statements don&apos;t always
        use the same terminology as the lease — a cost your lease excludes under
        one name might appear on the statement under a different label.
        Common costs that leases typically exclude but that sometimes appear on
        statements:
      </p>
      <ul>
        <li>Costs to prepare space for a new tenant (buildout, TI work)</li>
        <li>Marketing or advertising for the property</li>
        <li>Leasing commissions and broker fees</li>
        <li>Depreciation or debt service payments</li>
        <li>Costs covered by insurance proceeds or warranties</li>
        <li>Legal fees for disputes with other tenants</li>
      </ul>

      <h2>Step 6: Verify CAM Cap Compliance</h2>
      <p>
        If your lease includes a CAM cap, verify that the year-over-year
        increase doesn&apos;t exceed the cap. This requires knowing:
      </p>
      <ul>
        <li>Which expenses the cap applies to (controllable expenses only, or all CAM?)</li>
        <li>Whether the cap is cumulative (compounds from a base year) or non-cumulative (applies year to year)</li>
        <li>Whether taxes and insurance are included in or excluded from the cap</li>
      </ul>
      <p>
        CAM cap calculations are one of the most commonly misapplied provisions
        in commercial leases. For a deeper look at how caps work, see our{" "}
        <Link href="/resources/cam-cap-commercial-lease" className="text-blue-600 hover:underline">
          guide to CAM caps
        </Link>.
      </p>

      <h2>Step 7: Exercise Your Formal Audit Rights</h2>
      <p>
        If you find issues, your lease likely gives you the right to formally
        inspect the landlord&apos;s books. Most leases require you to notify the
        landlord in writing within a specific timeframe (often 60-120 days after
        receiving the reconciliation).
      </p>
      <p>
        For larger discrepancies, consider hiring a professional CAM auditor.
        Many work on a contingency basis — they only get paid if they find
        savings.
      </p>

      <h2>How LeaseGuard Helps</h2>
      <p>
        Before committing to a formal audit, it&apos;s valuable to do a
        preliminary review to determine whether a deeper look is warranted.
        LeaseGuard lets you upload your lease and CAM reconciliation statement,
        then automatically cross-references the two documents to flag potential
        issues — from excluded cost pass-throughs to pro rata share errors to
        CAM cap violations. This kind of initial screening can help you decide
        whether to exercise your formal audit rights and gives you specific
        items to investigate further.
      </p>

      <h2>Key Takeaways</h2>
      <ul>
        <li>Start every audit by reading your lease&apos;s CAM provisions carefully</li>
        <li>Verify your proportionate share before reviewing individual expenses</li>
        <li>Compare each expense category against prior years and against lease permissions</li>
        <li>Check that excluded costs haven&apos;t been included</li>
        <li>Don&apos;t overlook CAM cap compliance — it&apos;s commonly misapplied</li>
        <li>Exercise your audit rights when the numbers don&apos;t add up</li>
      </ul>
    </ArticleLayout>
  );
}
