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
  ],
};

export default function CamChargesExplained() {
  return (
    <ArticleLayout
      title="What Are CAM Charges in Commercial Leases?"
      publishedDate="March 2026"
      readTime="7 min read"
    >
      <p>
        If you lease commercial space — whether it&apos;s a retail storefront, an
        office suite, or a warehouse unit — there&apos;s a good chance your lease
        includes Common Area Maintenance (CAM) charges. These charges are one of
        the most significant variable costs in a commercial lease, yet many
        tenants don&apos;t fully understand what they cover or how they&apos;re
        calculated.
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
        operating costs.
      </p>
      <h3>Capital Expenditures</h3>
      <p>
        This is where things get complicated. Capital expenditures — like a new
        roof, parking lot repaving, or HVAC system replacement — are sometimes
        included in CAM charges, depending on lease language. Many leases
        require capital costs to be amortized over their useful life rather than
        charged in a single year, but not all leases are clear about this.
      </p>

      <h2>How CAM Charges Are Calculated</h2>
      <p>
        Most CAM charges are allocated to tenants based on their proportionate
        share of the total leasable area. For example, if you lease 2,000 square
        feet in a 50,000-square-foot building, your pro rata share would be 4%.
        If the total CAM expenses for the year are $200,000, your share would be
        $8,000.
      </p>
      <p>
        However, the calculation isn&apos;t always this simple. Factors that
        affect your share include:
      </p>
      <ul>
        <li>Whether the building is fully occupied or has vacancies</li>
        <li>Whether your lease uses a &quot;gross-up&quot; provision to adjust for occupancy</li>
        <li>Whether certain tenants (like anchor tenants) have negotiated exclusions</li>
        <li>Whether your lease has a CAM cap limiting annual increases</li>
      </ul>

      <h2>Why CAM Charges Create Problems for Tenants</h2>
      <p>
        CAM charges are often a source of disputes between landlords and
        tenants. The most common issues include:
      </p>
      <ul>
        <li>
          <strong>Vague lease language</strong> — When the lease doesn&apos;t clearly define
          which expenses are included, landlords may pass through costs that
          tenants didn&apos;t anticipate.
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

      <h2>How to Protect Yourself</h2>
      <p>
        The single most important thing a commercial tenant can do is read and
        understand the CAM provisions in their lease before signing. Pay
        attention to:
      </p>
      <ul>
        <li>The definition of &quot;operating expenses&quot; or &quot;CAM costs&quot;</li>
        <li>Any exclusions or carve-outs</li>
        <li>CAM cap provisions and how they&apos;re structured</li>
        <li>Your audit rights (most leases grant them)</li>
        <li>How your proportionate share is calculated</li>
      </ul>
      <p>
        Once you&apos;re in a lease, review your annual reconciliation statement
        carefully. Compare it against prior years and against what your lease
        says should (and shouldn&apos;t) be included. Tools like{" "}
        <Link href="/" className="text-blue-600 hover:underline">
          LeaseGuard
        </Link>{" "}
        can help you cross-reference your lease clauses against your CAM
        statements to flag potential discrepancies — something that would
        otherwise take hours of manual review.
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
