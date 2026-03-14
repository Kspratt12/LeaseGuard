import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

export const metadata: Metadata = {
  title: "What Landlords Can Include in CAM Charges | LeaseGuard",
  description:
    "Learn what expenses landlords are allowed to include in CAM charges, what is typically excluded, and how to verify your charges against your lease agreement.",
  keywords: [
    "what is included in CAM charges",
    "CAM charge inclusions",
    "landlord CAM charges",
    "permitted CAM expenses",
    "CAM exclusions",
    "common area maintenance costs",
    "commercial lease CAM",
    "operating expense pass-throughs",
  ],
};

export default function WhatLandlordsCanIncludeInCam() {
  return (
    <ArticleLayout
      title="What Landlords Can Include in CAM Charges"
      publishedDate="March 2026"
      readTime="10 min read"
    >
      <p>
        One of the most common questions commercial tenants ask is: &quot;What
        exactly am I paying for?&quot; When you receive a{" "}
        <Link
          href="/resources/cam-reconciliation-guide"
          className="text-blue-600 hover:underline"
        >
          CAM reconciliation statement
        </Link>{" "}
        with dozens of line items, it can be difficult to determine which
        charges are legitimate pass-throughs and which may not be authorized
        under your lease. The answer depends almost entirely on the specific
        language in your lease agreement — but there are general categories
        that most commercial leases follow.
      </p>

      <h2>Expenses Typically Included in CAM</h2>
      <p>
        Most commercial leases allow landlords to pass through the costs of
        maintaining and operating common areas — the shared spaces that benefit
        all tenants. These typically include:
      </p>

      <h3>Grounds and Exterior Maintenance</h3>
      <ul>
        <li>Landscaping, irrigation, and tree maintenance</li>
        <li>Parking lot sweeping, restriping, and minor repairs</li>
        <li>Sidewalk maintenance and pressure washing</li>
        <li>Snow and ice removal</li>
        <li>Exterior lighting maintenance and electricity</li>
        <li>Signage maintenance for common area directional signs</li>
      </ul>

      <h3>Building Systems and Repairs</h3>
      <ul>
        <li>HVAC maintenance and repair for shared systems</li>
        <li>Plumbing repairs in common areas</li>
        <li>Elevator and escalator maintenance</li>
        <li>Fire safety and sprinkler system maintenance</li>
        <li>Roof repairs (not replacement — see capital expenses below)</li>
        <li>General building repairs and maintenance</li>
      </ul>

      <h3>Services</h3>
      <ul>
        <li>Janitorial services for lobbies, hallways, and restrooms</li>
        <li>Trash collection and recycling</li>
        <li>Security personnel or patrol services</li>
        <li>Pest control</li>
        <li>Window cleaning for common areas</li>
      </ul>

      <h3>Utilities and Insurance</h3>
      <ul>
        <li>Common area electricity, water, and gas</li>
        <li>Property insurance premiums</li>
        <li>General liability insurance for common areas</li>
      </ul>

      <h3>Administrative Costs</h3>
      <ul>
        <li>
          Property management fees — usually calculated as a percentage (3% to
          8%) of total operating expenses. Verify that your lease specifies the
          percentage and that the{" "}
          <Link
            href="/resources/cam-reconciliation-guide"
            className="text-blue-600 hover:underline"
          >
            reconciliation statement
          </Link>{" "}
          applies it correctly.
        </li>
        <li>Property tax (in NNN leases)</li>
      </ul>

      <h2>Expenses Typically Excluded from CAM</h2>
      <p>
        Well-drafted commercial leases include an exclusion list — specific
        categories that the landlord cannot pass through to tenants. Even if
        your lease doesn&apos;t explicitly list every exclusion, certain costs
        are widely understood to be the landlord&apos;s responsibility:
      </p>

      <h3>Capital Expenditures</h3>
      <p>
        Major improvements that extend the life of the property or add value —
        such as a new roof, parking lot replacement, or building facade
        renovation — are generally not passable as{" "}
        <Link
          href="/resources/cam-charges-explained"
          className="text-blue-600 hover:underline"
        >
          CAM charges
        </Link>. Some leases allow capital expenses to be amortized over their
        useful life, but they should never be charged in full during a single
        year. For more on this topic, see our article on{" "}
        <Link
          href="/resources/can-landlords-charge-capital-expenses"
          className="text-blue-600 hover:underline"
        >
          whether landlords can charge capital expenses to tenants
        </Link>.
      </p>

      <h3>Landlord&apos;s Own Costs</h3>
      <ul>
        <li>Mortgage payments, debt service, or refinancing costs</li>
        <li>Ground rent payments</li>
        <li>Depreciation on the building or its systems</li>
        <li>Income taxes owed by the landlord</li>
        <li>Costs of maintaining the landlord&apos;s own office space</li>
      </ul>

      <h3>Leasing and Tenant-Related Costs</h3>
      <ul>
        <li>Leasing commissions and brokerage fees</li>
        <li>Tenant improvement or build-out costs</li>
        <li>Marketing, advertising, or promotional expenses for the property</li>
        <li>Legal fees for lease negotiations or tenant disputes</li>
        <li>Costs of negotiating or enforcing other tenants&apos; leases</li>
      </ul>

      <h3>Reimbursed or Covered Costs</h3>
      <ul>
        <li>Costs covered by insurance proceeds or settlements</li>
        <li>Expenses covered under contractor or manufacturer warranties</li>
        <li>Costs for which the landlord receives a refund, rebate, or credit</li>
      </ul>

      <h3>Corrections and Penalties</h3>
      <ul>
        <li>Fines or penalties imposed on the landlord for code violations</li>
        <li>Costs of correcting construction defects</li>
        <li>Environmental remediation costs (unless caused by the tenant)</li>
      </ul>

      <h2>The Gray Areas</h2>
      <p>
        Many CAM disputes arise from expenses that fall somewhere between
        clearly included and clearly excluded. These gray areas are where
        careful lease language matters most:
      </p>
      <ul>
        <li>
          <strong>Repair vs. replacement:</strong> Patching a section of the
          parking lot is typically a CAM expense. Repaving the entire lot is a
          capital expenditure. But where exactly does &quot;repair&quot; end and
          &quot;replacement&quot; begin? This is one of the most{" "}
          <Link
            href="/resources/common-cam-overcharges"
            className="text-blue-600 hover:underline"
          >
            common sources of CAM overcharges
          </Link>.
        </li>
        <li>
          <strong>Above-standard services:</strong> If the landlord upgrades
          landscaping or adds premium amenities, should the increased cost be
          part of CAM?
        </li>
        <li>
          <strong>Shared vs. exclusive expenses:</strong> If an expense benefits
          only certain tenants (like a loading dock used by one tenant), should
          it be allocated to all tenants?
        </li>
        <li>
          <strong>Technology and upgrades:</strong> New security cameras,
          building automation systems, or energy-efficient upgrades may fall
          into a gray area depending on your lease language.
        </li>
      </ul>

      <h2>How to Verify What Your Lease Permits</h2>
      <p>
        The best way to verify your charges is to read the operating expense
        and CAM sections of your lease carefully. Here is what to look for:
      </p>
      <ol>
        <li>
          <strong>Find the expense definition.</strong> Look for the section
          that defines &quot;Operating Expenses,&quot; &quot;Common Area
          Maintenance,&quot; or &quot;Additional Rent.&quot; This section lists
          what the landlord can include.
        </li>
        <li>
          <strong>Find the exclusion list.</strong> Most leases include a
          separate section listing specific exclusions. Cross-reference this
          list against your reconciliation line items.
        </li>
        <li>
          <strong>Check for caps.</strong> If your lease includes a{" "}
          <Link
            href="/resources/cam-cap-commercial-lease"
            className="text-blue-600 hover:underline"
          >
            CAM cap
          </Link>, verify that controllable expenses are not exceeding the
          permitted annual increase.
        </li>
        <li>
          <strong>Request invoices for questionable charges.</strong> If a line
          item doesn&apos;t clearly fall within the permitted expenses, ask the
          landlord for the underlying invoices and a written explanation of how
          the charge qualifies under your lease.
        </li>
      </ol>

      <h2>How LeaseGuard Helps</h2>
      <p>
        LeaseGuard automates the comparison between your lease language and your
        reconciliation statement. The platform reads both documents and flags
        charges that may not be authorized — including expenses that appear on
        your lease&apos;s exclusion list, capital expenditures classified as
        operating costs, management fee miscalculations, and CAM cap
        violations. This analysis is delivered in about 60 seconds, giving you a
        clear picture of which charges warrant further investigation.
      </p>

      <h2>Key Takeaways</h2>
      <ul>
        <li>What landlords can include in CAM is defined by your specific lease — not by general practice</li>
        <li>Most leases include both an inclusion list and an exclusion list — review both carefully</li>
        <li>Gray areas around repairs vs. replacements and above-standard services are the most common source of disputes</li>
        <li>Always cross-reference reconciliation line items against your lease language</li>
        <li>Request supporting invoices for any charge you cannot clearly match to a permitted expense category</li>
      </ul>
    </ArticleLayout>
  );
}
