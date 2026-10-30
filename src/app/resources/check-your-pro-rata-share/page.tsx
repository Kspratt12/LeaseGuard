import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

export const metadata: Metadata = {
  alternates: { canonical: "/resources/check-your-pro-rata-share" },
  title: "Check Your CAM Pro-Rata Share | LeaseGuard",
  description:
    "How a commercial tenant can check the pro-rata share on a CAM statement: the formula, which square footage to use, and what to ask the landlord if it differs.",
  keywords: [
    "tenant pro-rata share",
    "pro rata share CAM",
    "tenant proportionate share",
    "CAM reconciliation",
    "commercial lease operating expenses",
  ],
};

export default function CheckYourProRataShare() {
  return (
    <ArticleLayout
      title="How to Check Your Pro-Rata Share on a CAM Statement"
      publishedDate="October 29, 2026"
      modifiedDate="October 29, 2026"
      readTime="5 min read"
      description="How a commercial tenant can check the pro-rata share on a CAM statement: the formula, which square footage to use, and what to ask the landlord if it differs."
    >
      <p>
        Your pro-rata share decides how much of the building&apos;s operating expenses lands on you. A small error in
        that percentage is repeated on every line of the{" "}
        <Link href="/resources/cam-reconciliation-guide" className="text-blue-600 hover:underline">
          CAM reconciliation statement
        </Link>{" "}
        and every year, which is why it is one of the first things worth checking.
      </p>

      <h2>The basic formula</h2>
      <p>
        In most leases the share is your premises area divided by the building (or project) area, shown as a
        percentage:
      </p>
      <p>
        <strong>Pro-rata share = your square footage ÷ the building&apos;s square footage</strong>
      </p>
      <p>
        Your lease decides which areas count and how they are measured. Some leases name a fixed percentage; others
        say the share changes if the premises or the building changes. Always start from the lease wording, not from
        the number on the statement.
      </p>

      <h2>A worked example (fictional numbers)</h2>
      <p>This example uses invented figures to show the arithmetic. They are not from any real lease.</p>
      <ul>
        <li>Your premises: 4,000 square feet</li>
        <li>The building: 50,000 square feet</li>
        <li>4,000 ÷ 50,000 = 0.08, so the share is 8.00%</li>
        <li>Total building operating expenses on the statement: $500,000</li>
        <li>Your share at 8.00%: $500,000 × 8.00% = $40,000.00</li>
        <li>If the statement uses 8.08% instead: $500,000 × 8.08% = $40,400.00</li>
        <li>Difference to ask about: $40,400.00 − $40,000.00 = $400.00</li>
      </ul>
      <p>
        A $400 difference may have an ordinary explanation, such as a different building area in the lease than in
        the landlord&apos;s records. The point of the check is to find out, not to assume.
      </p>

      <h2>What to compare</h2>
      <ol>
        <li>
          <strong>The percentage in the lease</strong> (or the two square-footage figures it is built from).
        </li>
        <li>
          <strong>The percentage on the statement.</strong> If it differs, note both numbers and the page they appear
          on.
        </li>
        <li>
          <strong>The building area the landlord used.</strong> Landlords sometimes use rentable, leasable or gross
          area. Your lease says which one applies.
        </li>
        <li>
          <strong>Whether the share can change.</strong> Leases often say what happens when space is added, removed
          or vacant. Occupancy adjustments (&quot;gross-up&quot; clauses) are a separate calculation, covered in our{" "}
          <Link href="/resources/cam-reconciliation-guide" className="text-blue-600 hover:underline">
            reconciliation guide
          </Link>
          .
        </li>
        <li>
          <strong>Whether the same share is applied to every line.</strong> Some expenses, such as a cost that serves
          only part of the property, may be allocated differently under the lease.
        </li>
      </ol>

      <h2>Questions to ask if the share differs</h2>
      <ul>
        <li>Which square footage did you use for my premises and for the building, and where does the lease say so?</li>
        <li>Has the measured area changed since the lease was signed, and is there an amendment that says so?</li>
        <li>Can you send the calculation behind the percentage on the statement?</li>
        <li>Is the same percentage applied to every expense line? If not, which lines use a different allocation?</li>
      </ul>
      <p>
        You can turn these into a written request with our{" "}
        <Link href="/resources/commercial-lease-dispute-letter-template" className="text-blue-600 hover:underline">
          dispute letter template
        </Link>
        . A request for an explanation is a reasonable first step and does not assume the landlord made a mistake.
      </p>

      <h2>Check it with your own numbers</h2>
      <p>
        The free{" "}
        <Link href="/cam-calculator" className="text-blue-600 hover:underline">
          CAM calculator
        </Link>{" "}
        runs this arithmetic for you. If you would like your lease and statement compared in full, including the
        share, the{" "}
        <Link href="/upload" className="text-blue-600 hover:underline">
          LeaseGuard audit
        </Link>{" "}
        flags a share that differs from the lease as a potential discrepancy and shows where in your documents it
        found each figure.
      </p>
      <p>
        This guide is general information for commercial tenants, not legal or accounting advice. Your lease and
        applicable law decide your rights.
      </p>
    </ArticleLayout>
  );
}
