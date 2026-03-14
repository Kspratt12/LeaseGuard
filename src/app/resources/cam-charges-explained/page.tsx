import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

export const metadata: Metadata = {
  title: "What Are CAM Charges in Commercial Leases? | LeaseGuard",
  description:
    "Learn how CAM charges work in commercial leases, how reconciliation statements are calculated, and how tenants can detect potential overcharges.",
  keywords: [
    "CAM charges",
    "common area maintenance",
    "commercial lease",
    "CAM fees",
    "triple net lease",
    "operating expenses",
    "commercial lease CAM charges",
    "CAM charges explained",
  ],
};

export default function CamChargesExplained() {
  return (
    <ArticleLayout
      title="What Are CAM Charges in Commercial Leases?"
      publishedDate="March 2026"
      readTime="8 min read"
    >
      <p>
        CAM charges are one of the largest variable costs in any commercial
        lease — and one of the most misunderstood. For retail tenants, office
        tenants, medical practices, and franchise operators, these charges can
        add thousands of dollars per year to occupancy costs. When they&apos;re
        calculated incorrectly or include expenses your lease doesn&apos;t
        permit, the financial impact compounds year after year.
      </p>
      <p>
        Understanding what CAM charges are, how they&apos;re calculated, and
        where overcharges commonly occur is the first step toward protecting
        your business.
      </p>

      <h2>The Basics of CAM Charges</h2>
      <p>
        CAM charges are fees that a landlord passes through to tenants to cover
        the costs of maintaining shared or common areas in a commercial property.
        Common areas are the parts of a building or complex that every tenant
        (and their customers) use but that no single tenant exclusively
        occupies.
      </p>
      <p>Typical common areas include:</p>
      <ul>
        <li>Parking lots and garages</li>
        <li>Lobbies, hallways, and elevators</li>
        <li>Restrooms in shared spaces</li>
        <li>Landscaping and outdoor walkways</li>
        <li>Building security systems and lighting</li>
        <li>Shared HVAC systems</li>
      </ul>

      <h2>What Costs Do CAM Charges Cover?</h2>
      <p>
        The specific costs included in CAM vary by lease, but they generally
        fall into several categories:
      </p>
      <h3>Maintenance and Repairs</h3>
      <p>
        This includes routine upkeep like cleaning, snow removal, landscaping,
        elevator maintenance, and general building repairs. These are the costs
        most tenants expect to see in their CAM bills.
      </p>
      <h3>Insurance and Taxes</h3>
      <p>
        In many lease structures — particularly triple net (NNN) leases — the
        landlord&apos;s property insurance premiums and real estate taxes are
        passed through as part of operating expenses. Some leases bundle these
        with CAM; others list them separately.
      </p>
      <h3>Management Fees</h3>
      <p>
        Landlords frequently charge a property management fee as a percentage of
        total operating costs. This fee compensates for the administrative work
        of managing the property, coordinating vendors, and handling tenant
        relations. Management fees typically range from 3% to 8% of total
        operating costs. If the underlying expenses are inflated, the management
        fee — calculated as a percentage — is automatically inflated too.
      </p>
      <h3>Capital Expenditures</h3>
      <p>
        This is where things get complicated. Capital expenditures — like a new
        roof, parking lot repaving, or HVAC system replacement — are sometimes
        included in CAM charges, depending on lease language. Many leases
        require capital costs to be amortized over their useful life rather than
        charged in a single year, but not all leases are clear about this.
        When capital expenses are passed through improperly, the overcharge can
        be substantial — sometimes tens of thousands of dollars in a single
        reconciliation period.
      </p>

      <h2>How CAM Charges Are Calculated</h2>
      <p>
        Most CAM charges are allocated to tenants based on their proportionate
        share (pro rata share) of the total leasable area. For example, if you
        lease 2,000 square feet in a 50,000-square-foot building, your pro rata
        share would be 4%. If the total CAM expenses for the year are $200,000,
        your share would be $8,000.
      </p>
      <p>
        However, the calculation isn&apos;t always this simple. Factors that
        affect your share include:
      </p>
      <ul>
        <li>Whether the building is fully occupied or has vacancies</li>
        <li>Whether your lease uses a &quot;gross-up&quot; provision to adjust for occupancy</li>
        <li>Whether certain tenants (like anchor tenants) have negotiated exclusions</li>
        <li>
          Whether your lease has a{" "}
          <Link href="/resources/cam-cap-commercial-lease" className="text-blue-600 hover:underline">
            CAM cap
          </Link>{" "}
          limiting annual increases
        </li>
      </ul>
      <p>
        Even small errors in the pro rata share calculation — say, 4.2% instead
        of 4.0% — compound across every expense category on your statement.
        This is why verifying your proportionate share is one of the first steps
        in any{" "}
        <Link href="/resources/how-to-audit-cam-charges" className="text-blue-600 hover:underline">
          CAM audit
        </Link>.
      </p>

      <h2>Why CAM Charges Create Problems for Tenants</h2>
      <p>
        CAM charges are often a source of disputes between landlords and
        tenants. The most common issues include:
      </p>
      <ul>
        <li>
          <strong>Vague lease language</strong> — When the lease doesn&apos;t clearly define
          which expenses are included, landlords may pass through costs that
          tenants didn&apos;t anticipate. This is particularly common with
          older leases or leases drafted with broad operating expense
          definitions.
        </li>
        <li>
          <strong>Billing errors</strong> — With dozens of expense categories and multiple
          tenants, mistakes in allocation happen more often than you might
          think.
        </li>
        <li>
          <strong>Capital expense disputes</strong> — Disagreements about whether a cost is a
          routine maintenance expense (passable to tenants) or a capital
          improvement (the landlord&apos;s responsibility) are extremely common.
        </li>
        <li>
          <strong>Management fee overcharges</strong> — If the management fee is calculated as
          a percentage of total costs, inflated base costs lead to inflated
          fees.
        </li>
      </ul>

      <h2>Reviewing Your Annual Reconciliation Statement</h2>
      <p>
        Each year, your landlord should provide a{" "}
        <Link href="/resources/cam-reconciliation-guide" className="text-blue-600 hover:underline">
          CAM reconciliation statement
        </Link>{" "}
        that compares your monthly estimates against actual expenses. This
        statement determines whether you owe additional money or are due a
        credit. Reviewing it carefully is one of the most important things a
        commercial tenant can do.
      </p>
      <p>
        Look for unexplained year-over-year increases, new expense categories
        that weren&apos;t on prior statements, and costs that your lease
        explicitly excludes. If anything looks wrong, most leases give tenants
        the right to request supporting documentation.
      </p>

      <h2>How to Protect Yourself</h2>
      <p>
        The single most important thing a commercial tenant can do is read and
        understand the CAM provisions in their lease. Pay attention to:
      </p>
      <ul>
        <li>The definition of &quot;operating expenses&quot; or &quot;CAM costs&quot;</li>
        <li>Any exclusions or carve-outs</li>
        <li>CAM cap provisions and how they&apos;re structured</li>
        <li>Your audit rights (most leases grant them)</li>
        <li>How your proportionate share is calculated</li>
      </ul>

      <h2>How LeaseGuard Helps</h2>
      <p>
        Comparing your lease clauses against your CAM reconciliation statement
        line by line is time-consuming — but it&apos;s essential for catching
        overcharges. LeaseGuard allows commercial tenants to upload their lease
        and CAM reconciliation statements, then cross-references the two
        documents to flag potential discrepancies. The platform checks for
        excluded cost pass-throughs, pro rata share errors, management fee
        issues, and CAM cap compliance, delivering results in about 60 seconds.
      </p>

      <h2>Key Takeaways</h2>
      <ul>
        <li>CAM charges cover shared building maintenance costs allocated across tenants</li>
        <li>Your lease defines exactly what can and can&apos;t be included — read it carefully</li>
        <li>Billing errors and vague lease language are the most common sources of overcharges</li>
        <li>Annual reconciliation statements should be reviewed every year, not just filed away</li>
        <li>Tenants typically have the right to audit CAM charges — exercise it</li>
      </ul>
    </ArticleLayout>
  );
}
