import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

export const metadata: Metadata = {
  title: "CAM Caps in Commercial Leases Explained | LeaseGuard",
  description:
    "Learn what CAM caps are, how cumulative and non-cumulative caps work, and how to verify your landlord is applying your cap correctly.",
  keywords: [
    "CAM cap",
    "CAM cap commercial lease",
    "cumulative CAM cap",
    "non-cumulative CAM cap",
    "controllable expenses cap",
    "CAM increase limit",
    "commercial lease overcharges",
    "triple net lease expenses",
  ],
};

export default function CamCapCommercialLease() {
  return (
    <ArticleLayout
      title="CAM Caps in Commercial Leases Explained"
      publishedDate="March 2026"
      readTime="8 min read"
    >
      <p>
        Without a CAM cap, there is no ceiling on the{" "}
        <Link href="/resources/cam-charges-explained" className="text-blue-600 hover:underline">
          common area maintenance charges
        </Link>{" "}
        your landlord can pass through — as long as the costs fall within the
        lease&apos;s definition of operating expenses. For retail tenants,
        office tenants, medical practices, and franchise operators, this means
        CAM costs can increase unpredictably year after year, creating real
        budget risk for your business.
      </p>
      <p>
        A CAM cap is one of the most valuable protections a commercial tenant
        can negotiate. But not all caps are structured the same way, and the
        differences can mean thousands of dollars over the life of a lease.
      </p>

      <h2>What Is a CAM Cap?</h2>
      <p>
        A CAM cap limits the annual increase in common area maintenance charges
        that a landlord can pass through to tenants. For example, a lease with a
        5% CAM cap means your CAM charges can&apos;t increase by more than 5%
        per year, regardless of how much the landlord&apos;s actual expenses
        grew.
      </p>
      <p>
        CAM caps exist because operating expenses can be unpredictable. A new
        insurance assessment, an unexpected repair, or a shift in property
        management can cause expenses to spike. Without a cap, tenants absorb
        all of these increases.
      </p>

      <h2>Cumulative vs. Non-Cumulative Caps</h2>
      <p>
        This is the most important distinction in CAM cap structures, and it has
        a real financial impact over the life of a lease.
      </p>

      <h3>Non-Cumulative (Year-Over-Year) Cap</h3>
      <p>
        A non-cumulative cap limits the increase from one year to the next. If
        your cap is 5% and last year&apos;s CAM was $10.00 per square foot,
        this year&apos;s cap is $10.50. If actual expenses only came to $10.20,
        you pay $10.20 — and next year&apos;s cap is calculated from $10.20
        (not $10.50).
      </p>
      <p>
        This type of cap is more favorable to tenants because it prevents the
        landlord from &quot;banking&quot; unused increases.
      </p>

      <h3>Cumulative (Compounding) Cap</h3>
      <p>
        A cumulative cap allows unused increases to carry forward. Using the
        same example: if the cap is 5% from a $10.00 base and Year 1 actuals
        are $10.20, the Year 2 cap isn&apos;t based on $10.20 — it&apos;s
        based on $10.50 (the maximum allowed in Year 1). So the Year 2 cap
        would be $11.025 (5% of $10.50), even though actual expenses may have
        only increased modestly.
      </p>
      <p>
        Over a 5- or 10-year lease, cumulative caps create significantly higher
        ceilings than non-cumulative caps. Landlords generally prefer cumulative
        caps for this reason.
      </p>

      <h2>What Expenses Does the Cap Cover?</h2>
      <p>
        Not all CAM caps apply to all expenses. Many leases distinguish between:
      </p>
      <ul>
        <li>
          <strong>Controllable expenses</strong> — Costs the landlord has
          discretion over, like maintenance, landscaping, cleaning, and
          management fees.
        </li>
        <li>
          <strong>Uncontrollable expenses</strong> — Costs outside the
          landlord&apos;s control, like property taxes, insurance premiums, and
          utility rates.
        </li>
      </ul>
      <p>
        It&apos;s common for CAM caps to apply only to controllable expenses,
        meaning taxes and insurance can increase without limit. This is
        significant because property taxes and insurance are often the largest
        components of operating expenses. If your cap only covers controllable
        items, your total CAM bill can still increase substantially.
      </p>

      <h2>The Base Year Problem</h2>
      <p>
        CAM caps use a base year or base amount from which increases are
        measured. The choice of base year matters a lot:
      </p>
      <ul>
        <li>
          If the base year had unusually low expenses, the cap allows for
          larger absolute increases in subsequent years.
        </li>
        <li>
          If the base year had inflated expenses (perhaps due to a one-time
          event), the tenant benefits from a higher starting point.
        </li>
        <li>
          Some leases set the base as projected costs rather than actuals,
          which can work for or against the tenant.
        </li>
      </ul>

      <h2>Common CAM Cap Mistakes</h2>
      <p>
        Even when a lease includes a CAM cap, it&apos;s not always applied
        correctly on the{" "}
        <Link href="/resources/cam-reconciliation-guide" className="text-blue-600 hover:underline">
          reconciliation statement
        </Link>. Issues tenants encounter include:
      </p>
      <ul>
        <li>
          <strong>Wrong cap calculation</strong> — The landlord applies the
          wrong percentage or uses the wrong base year.
        </li>
        <li>
          <strong>Incorrect categorization</strong> — An expense that should be
          under the cap gets classified as uncontrollable.
        </li>
        <li>
          <strong>Ignoring the cap entirely</strong> — In multi-tenant
          buildings with different cap structures, landlords (or their property
          managers) sometimes apply the wrong cap to the wrong tenant.
        </li>
        <li>
          <strong>Cumulative vs. non-cumulative confusion</strong> — The lease
          says one thing, but the reconciliation calculates the other way.
        </li>
      </ul>
      <p>
        Cap violations tend to compound over time. A miscalculated base in Year
        1 affects every subsequent year, and the cumulative impact can amount to{" "}
        <Link href="/resources/common-cam-overcharges" className="text-blue-600 hover:underline">
          thousands of dollars in overcharges
        </Link>{" "}
        over the lease term.
      </p>

      <h2>Verifying Your CAM Cap</h2>
      <p>To check whether your CAM cap is being applied correctly:</p>
      <ol>
        <li>Identify the base year or base amount in your lease</li>
        <li>Determine whether the cap is cumulative or non-cumulative</li>
        <li>Identify which expense categories fall under the cap</li>
        <li>Calculate the maximum permitted charge for the current year</li>
        <li>Compare that maximum against what you were actually charged</li>
      </ol>

      <h2>How LeaseGuard Helps</h2>
      <p>
        CAM cap verification requires reading your lease&apos;s cap provisions
        precisely and applying them to the numbers on your reconciliation
        statement — including identifying which expenses fall under the cap,
        which base year to use, and whether the cap is cumulative or
        non-cumulative. LeaseGuard analyzes your lease&apos;s cap language
        alongside your CAM statement to check whether the cap was applied
        correctly, flagging any potential violations automatically.
      </p>

      <h2>Key Takeaways</h2>
      <ul>
        <li>A CAM cap limits annual increases in operating expenses passed through to tenants</li>
        <li>Non-cumulative caps are more tenant-friendly than cumulative caps</li>
        <li>Many caps only cover controllable expenses — taxes and insurance may be uncapped</li>
        <li>The base year selection has a major impact on how the cap plays out over time</li>
        <li>Verify the cap calculation on every reconciliation — errors are common</li>
      </ul>
    </ArticleLayout>
  );
}
