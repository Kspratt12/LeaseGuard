import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

export const metadata: Metadata = {
  alternates: { canonical: "/resources/can-landlords-charge-capital-expenses" },
  title: "Can Landlords Charge Tenants for Capital Costs? | LeaseGuard",
  description:
    "When landlords can pass capital expenditures to commercial tenants, how repairs differ from capital improvements, and how amortization works.",
  keywords: [
    "capital expenses commercial lease",
    "capital expenditures tenant",
    "landlord capital improvements",
    "repair vs capital improvement",
    "CAM capital expenses",
    "amortized capital expenses",
    "commercial lease capital costs",
    "tenant capital expense responsibility",
  ],
};

export default function CanLandlordsChargeCapitalExpenses() {
  return (
    <ArticleLayout
      title="Can Landlords Charge Capital Expenses to Tenants?"
      publishedDate="March 14, 2026"
      modifiedDate="October 29, 2026"
      readTime="9 min read"
      description="When landlords can pass capital expenditures to commercial tenants, how repairs differ from capital improvements, and how amortization works."
    >
      <p>
        An issue that can lead to disputes in commercial leasing is whether a
        landlord can pass capital expenditures through to tenants as part of
        their{" "}
        <Link
          href="/resources/cam-charges-explained"
          className="text-blue-600 hover:underline"
        >
          CAM charges
        </Link>{" "}
        or operating expenses. The short answer is: it depends entirely on your
        lease language. Capital expenses are another item to check against your
        lease.
      </p>
      <p>
        For the wider list of what a lease can pass through, see <Link href="/resources/what-landlords-can-include-in-cam" className="text-blue-600 hover:underline">what landlords can include in CAM charges</Link>.
      </p>

      <h2>What Counts as a Capital Expenditure?</h2>
      <p>
        A capital expenditure (CapEx) is a cost that adds value to the property,
        extends its useful life, or creates a new asset. This is distinguished
        from an operating expense (OpEx), which covers the routine cost of
        maintaining and operating the property.
      </p>
      <p>
        Here are some practical examples to illustrate the difference:
      </p>
      <ul>
        <li>
          <strong>Operating expense:</strong> Patching potholes in the parking
          lot, repairing a section of roof, servicing an HVAC unit, replacing a
          broken window.
        </li>
        <li>
          <strong>Capital expenditure:</strong> Repaving the entire parking lot,
          installing a new roof, replacing the HVAC system, renovating the
          building lobby.
        </li>
      </ul>
      <p>
        The key distinction is between <em>maintaining</em> an existing asset
        (operating) and <em>replacing or substantially improving</em> it
        (capital). While this distinction seems clear in theory, the line is
        often blurry in practice, which is why disputes arise frequently.
      </p>

      <h2>What Most Leases Say About Capital Expenses</h2>
      <p>
        Commercial lease agreements typically handle capital expenditures in one
        of four ways:
      </p>

      <h3>1. Full Exclusion</h3>
      <p>
        The lease explicitly states that capital expenditures are excluded from
        operating expenses and cannot be passed through to tenants. This is the
        most tenant-friendly position and is common in well-negotiated leases.
      </p>

      <h3>2. Amortization Over Useful Life</h3>
      <p>
        The lease allows capital expenditures to be passed through, but only if
        they are amortized over their useful life. For example, a $150,000 roof
        replacement with a 20-year useful life would be amortized at $7,500 per
        year (often with interest). The tenant only pays their proportionate
        share of the annual amortized amount, not the full cost in a single
        year.
      </p>
      <p>
        When reviewing amortized capital expenses, verify:
      </p>
      <ul>
        <li>The useful life period is reasonable for the type of improvement</li>
        <li>The interest rate (if applicable) is specified in the lease or is reasonable</li>
        <li>The amortization stops when the useful life period ends</li>
        <li>Your lease actually authorizes amortized pass-throughs (don&apos;t assume)</li>
      </ul>

      <h3>3. Limited Pass-Through</h3>
      <p>
        Some leases allow only certain categories of capital expenditures to be
        passed through, typically those that are required by law (such as ADA
        compliance upgrades) or those that reduce operating costs (such as
        energy-efficient equipment that lowers utility bills). Even in these
        cases, the expense is usually required to be amortized.
      </p>

      <h3>4. Broad Pass-Through</h3>
      <p>
        Less common in modern leases but still encountered, some leases use
        broad language that effectively allows all building costs, including
        capital improvements, to be passed through. Tenants negotiating new
        leases should be cautious of vague definitions like &quot;all costs
        associated with the ownership, operation, and maintenance of the
        property.&quot;
      </p>

      <h2>Common Capital Expense Problems</h2>
      <p>
        Even when the lease language is clear, capital expenses create problems
        for tenants in practice:
      </p>

      <h3>Misclassification of Capital Work as Repairs</h3>
      <p>
        A major project may be classified as a &quot;repair&quot; and passed
        through in full as an operating expense, rather than amortized if your
        lease requires amortization. For example:
      </p>
      <ul>
        <li>A complete parking lot resurface billed as &quot;parking lot repairs&quot;</li>
        <li>A full HVAC system replacement billed as &quot;HVAC maintenance&quot;</li>
        <li>A roof replacement billed as &quot;roof repair&quot;</li>
        <li>A lobby renovation billed as &quot;building maintenance&quot;</li>
      </ul>
      <p>
        If you see a large one-time charge in a maintenance or repair category,
        request the underlying invoices. The scope of work will often reveal
        whether the project was truly a repair or a capital improvement.
      </p>

      <h3>Incorrect Amortization Calculations</h3>
      <p>
        When capital expenses are properly amortized, errors can still occur in
        the calculation:
      </p>
      <ul>
        <li>Useful life period is too short, increasing annual charges</li>
        <li>Interest rate is higher than what the lease permits</li>
        <li>Amortization continues beyond the useful life period</li>
        <li>The full cost is used as the basis rather than the net cost (after warranties, insurance, or rebates)</li>
      </ul>

      <h3>Capital Expenses Inflating Management Fees</h3>
      <p>
        If capital expenses are improperly included in operating expenses, and
        the management fee is calculated as a percentage of total operating
        expenses, the management fee is also inflated. This creates a
        compounding overcharge.
      </p>

      <h2>How to Protect Yourself</h2>
      <ol>
        <li>
          <strong>Review your lease language.</strong> Find the section defining
          operating expenses and look specifically for how capital expenditures
          are addressed, are they excluded, amortized, or broadly included?
        </li>
        <li>
          <strong>Compare year-over-year expenses.</strong> Sudden spikes in
          repair or maintenance categories may indicate capital work being
          classified as operating expenses.
        </li>
        <li>
          <strong>Request invoices for large charges.</strong> Any single charge
          that represents a significant portion of a category total deserves
          scrutiny.
        </li>
        <li>
          <strong>Verify amortization schedules.</strong> If your landlord is
          amortizing capital expenses, request the amortization schedule
          showing the total cost, useful life, interest rate, and annual charge.
        </li>
        <li>
          <strong>Check your{" "}
          <Link
            href="/resources/cam-cap-commercial-lease"
            className="text-blue-600 hover:underline"
          >
            CAM cap
          </Link>.</strong> If your lease has a CAM cap, confirm whether capital
          expenses are inside or outside the cap, and whether the cap is being
          applied correctly.
        </li>
      </ol>
      <p>
        For a complete framework for reviewing your charges, see our{" "}
        <Link
          href="/resources/commercial-lease-audit-checklist"
          className="text-blue-600 hover:underline"
        >
          commercial lease audit checklist
        </Link>.
      </p>

      <h2>How LeaseGuard Helps</h2>
      <p>
        When you upload your lease and{" "}
        <Link
          href="/resources/cam-reconciliation-guide"
          className="text-blue-600 hover:underline"
        >
          CAM reconciliation statement
        </Link>, LeaseGuard flags statement lines whose labels look like capital
        items (for example, a roof replacement) or fall under a category your
        lease excludes, so you can ask the landlord about them. These are
        possible issues for your review, not conclusions. LeaseGuard does not
        read invoices, decide whether work was a repair or a capital
        improvement, or check amortization schedules, useful lives or interest.
        Whether a cost can be passed through depends on your lease and
        applicable law.
      </p>

      <h2>Key Takeaways</h2>
      <ul>
        <li>Whether capital expenses can be passed to tenants depends on your specific lease language</li>
        <li>Leases differ: some exclude capital expenses, some require amortization over useful life, and some use broad language that may include them</li>
        <li>Capital work classified as a repair can be passed through in a single year, which may be an overcharge if your lease does not allow it</li>
        <li>Always request invoices for large one-time charges in repair or maintenance categories</li>
        <li>Capital expenses improperly included in operating costs also inflate percentage-based management fees</li>
      </ul>
    </ArticleLayout>
  );
}
