import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

export const metadata: Metadata = {
  alternates: { canonical: "/resources/management-fees-and-cam-caps" },
  title: "Management Fees and CAM Caps in Leases | LeaseGuard",
  description:
    "How management and administrative fees are calculated in commercial leases, what base they apply to, and how they interact with a CAM cap. Fictional examples.",
};

const a = "text-blue-600 hover:underline";

export default function ManagementFeesAndCamCapsPage() {
  return (
    <ArticleLayout
      title="Commercial Lease Management Fees and CAM Caps"
      publishedDate="October 29, 2026"
      modifiedDate="October 29, 2026"
      readTime="7 min read"
      description="How management and administrative fees are calculated in commercial leases and how they relate to CAM caps."
    >
      <p>
        Two lease terms cause a lot of confusion on CAM statements: the management (or administrative) fee and the CAM cap.
        They often interact, and a small difference in wording can change the amount by thousands of dollars. This guide
        explains what to look for. It describes common practice, not the terms of your lease; your lease controls.
      </p>

      <h2>What a management fee usually is</h2>
      <p>
        A management or administrative fee compensates the landlord for managing the property. In many leases it is a
        percentage of operating expenses. The percentage is negotiated, so there is no single standard figure you can rely
        on. What matters is what your lease says and how the statement applies it.
      </p>

      <h2>Question 1: A percentage of what?</h2>
      <p>
        This is the most important question and the one statements rarely answer. The lease may base the fee on:
      </p>
      <ul>
        <li>all operating expenses, including property taxes and insurance;</li>
        <li>operating expenses excluding taxes, insurance or utilities;</li>
        <li>only certain categories, such as common area maintenance;</li>
        <li>total collections, or rent, instead of expenses.</li>
      </ul>
      <p>
        <em>Fictional example.</em> A building has $400,000 of expenses, of which $120,000 are property taxes. The lease
        allows a 5% fee. Applied to all expenses, the fee is $20,000. Applied to expenses excluding taxes ($280,000), the fee
        is $14,000. The $6,000 difference is shared among tenants. A tenant with a 10% share would pay $600 more under the
        wider base.
      </p>

      <h2>Question 2: Does the fee apply to itself?</h2>
      <p>
        A fee is sometimes calculated on a total that already includes the fee. That makes the effective percentage higher
        than the stated one. <em>Fictional example:</em> a 5% fee applied to a total that includes the fee solves to
        fee = 5% x (expenses + fee). On $400,000 of expenses that gives about $21,053, which is 5.26% of the expenses, not
        5%. Whether a lease intends that is a matter of its wording, so compare the fee on the statement with the
        expenses it is based on.
      </p>

      <h2>Question 3: Is the fee inside the CAM cap?</h2>
      <p>
        A CAM cap limits how much charges can grow, but leases differ on what the cap covers:
      </p>
      <ul>
        <li>Some caps cover all CAM charges; others cover only <strong>controllable</strong> expenses, which usually exclude taxes, insurance and utilities.</li>
        <li>Management fees are included in the capped amount in some leases and excluded in others.</li>
        <li>Some caps are <strong>cumulative</strong> (unused room carries forward) and some are not.</li>
      </ul>
      <p>
        The same statement can look compliant or non-compliant depending on these answers. Our guide to{" "}
        <Link href="/resources/cam-cap-commercial-lease" className={a}>
          CAM caps in commercial leases
        </Link>{" "}
        covers cap structures in more detail.
      </p>

      <h2>How to check your statement</h2>
      <ol>
        <li>Find the fee clause in your lease. Note the percentage, the base, and any dollar limit.</li>
        <li>Find the fee line on the statement and its stated percentage. Divide the fee by the expense total it should apply to, and compare with the lease percentage.</li>
        <li>Check what is in the expense total used for the fee: taxes, insurance, capital items, or the fee itself.</li>
        <li>If you have a cap, work out whether the fee is part of the capped amount under your lease&apos;s wording.</li>
        <li>Write down any difference as a question for the landlord, with the lease page and the statement line.</li>
      </ol>
      <p>
        You can recompute the arithmetic with the{" "}
        <Link href="/cam-calculator" className={a}>
          CAM calculator
        </Link>
        . It adds a fee on top of expenses or treats it as already included, so you can test both readings.
      </p>

      <h2>What a difference does and does not mean</h2>
      <p>
        If the fee on your statement is higher than your calculation, you have a question, not a finding. The landlord may be
        using a different base the lease permits, or the statement may contain an error. Ask for the calculation in writing.
        Time limits for raising a question depend on your lease and local law, so check them before you wait.
      </p>
      <p>
        LeaseGuard checks the fee percentage on your statement against the limit in your lease and shows the source page for
        each side. Where the documents do not give enough detail to calculate a dollar amount, it says so instead of guessing.
        Start with a{" "}
        <Link href="/upload" className={a}>
          free preview
        </Link>
        , or read{" "}
        <Link href="/resources/dispute-cam-charges" className={a}>
          how to dispute CAM charges
        </Link>{" "}
        once you have your questions in order.
      </p>
      <p>
        This guide is general information, not legal or accounting advice. For advice on your lease, consult a qualified
        commercial real estate attorney.
      </p>
    </ArticleLayout>
  );
}
