import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

export const metadata: Metadata = {
  alternates: { canonical: "/resources/dispute-cam-charges" },
  title: "How to Dispute CAM Charges | LeaseGuard",
  description:
    "Learn how commercial tenants can dispute CAM charges, what documentation is needed, and how lease clauses limit what landlords can bill.",
  keywords: [
    "dispute CAM charges",
    "challenge CAM charges",
    "CAM charge dispute",
    "commercial lease dispute",
    "CAM overcharge dispute",
    "tenant dispute landlord charges",
  ],
};

export default function DisputeCamCharges() {
  return (
    <ArticleLayout
      title="How to Dispute CAM Charges"
      publishedDate="March 14, 2026"
      modifiedDate="October 29, 2026"
      readTime="7 min read"
      description="Learn how commercial tenants can dispute CAM charges, what documentation is needed, and how lease clauses limit what landlords can bill."
    >
      <p>
        When a commercial tenant identifies errors in their{" "}
        <Link
          href="/resources/cam-charges-explained"
          className="text-blue-600 hover:underline"
        >
          CAM charges
        </Link>
        , the next step is to formally dispute those charges with the landlord.
        The dispute process requires preparation, documentation, and a clear
        understanding of your lease terms. This guide explains how tenants
        challenge CAM charges and what to expect during the process.
      </p>
      <p>
        If you want a starting point for the written request, see our <Link href="/resources/commercial-lease-dispute-letter-template" className="text-blue-600 hover:underline">CAM dispute letter template</Link>, and to check one common source of differences first, see <Link href="/resources/check-your-pro-rata-share" className="text-blue-600 hover:underline">how to check your pro-rata share</Link>.
      </p>
      <p>
        If you are deciding who should do the review, see our overview of <Link href="/resources/commercial-lease-audit-services" className="text-blue-600 hover:underline">commercial lease audit services</Link>.
      </p>

      <h2>How Tenants Challenge CAM Charges</h2>
      <p>
        Disputing CAM charges is a structured process. Tenants who approach it
        methodically, with evidence tied directly to their lease, are more
        likely to reach a favorable resolution. The typical process includes:
      </p>
      <ol>
        <li>
          <strong>Review the reconciliation statement:</strong> Start by
          obtaining and reviewing the annual{" "}
          <Link
            href="/resources/cam-reconciliation-guide"
            className="text-blue-600 hover:underline"
          >
            CAM reconciliation statement
          </Link>{" "}
          to identify specific charges that appear incorrect or unexpected
        </li>
        <li>
          <strong>Compare against the lease:</strong> Cross-reference each
          flagged charge against the specific provisions of your lease to
          determine whether the charge is permitted, capped, or excluded
        </li>
        <li>
          <strong>Document the discrepancies:</strong> Prepare a written
          summary of each disputed charge, including the lease clause you believe applies, the amount billed, and the amount you believe is correct
        </li>
        <li>
          <strong>Submit a formal dispute:</strong> Send a written notice to
          the landlord or property manager identifying each disputed item and
          requesting a correction or credit
        </li>
        <li>
          <strong>Negotiate or escalate:</strong> Work with the landlord to
          resolve the disputed charges. If the landlord does not agree, tenants
          may need to escalate through the dispute resolution process defined in
          their lease
        </li>
      </ol>

      <h2>Documentation Required</h2>
      <p>
        A successful CAM dispute depends on clear, specific documentation. Before
        initiating a dispute, tenants should gather:
      </p>
      <ul>
        <li>
          A copy of the signed lease agreement, specifically the sections
          covering operating expenses, CAM charges, and excluded costs
        </li>
        <li>
          The annual CAM reconciliation statement being disputed
        </li>
        <li>
          Prior years&apos; reconciliation statements for comparison (to
          identify unusual year-over-year changes)
        </li>
        <li>
          Any correspondence from the landlord regarding CAM charges or
          adjustments
        </li>
        <li>
          An audit report or analysis identifying the specific discrepancies,
          tools like LeaseGuard can generate this automatically
        </li>
      </ul>
      <p>
        The more specific and evidence-based the dispute, the stronger the
        tenant&apos;s position. Vague complaints about high costs are less
        effective than citing a specific lease clause that limits a charge to a
        defined amount.
      </p>

      <h2>Lease Clauses That Limit Charges</h2>
      <p>
        The strength of a CAM dispute depends on what the lease says. Key
        clauses that tenants should review include:
      </p>
      <ul>
        <li>
          <strong>CAM caps:</strong> {" "}
          <Link
            href="/resources/cam-cap-commercial-lease"
            className="text-blue-600 hover:underline"
          >
            CAM cap clauses
          </Link>{" "}
          set a maximum on annual CAM charges or limit year-over-year increases.
          If billed amounts exceed the cap, the tenant has a clear basis for
          dispute
        </li>
        <li>
          <strong>Excluded expense categories:</strong> Most leases define
          categories of expenses that cannot be included in CAM. Common
          exclusions include{" "}
          <Link
            href="/resources/can-landlords-charge-capital-expenses"
            className="text-blue-600 hover:underline"
          >
            capital improvements
          </Link>
          , landlord&apos;s income taxes, and leasing commissions
        </li>
        <li>
          <strong>Administrative fee limits:</strong> Many leases cap
          management or administrative fees at a specific percentage of total
          operating expenses
        </li>
        <li>
          <strong>Pro rata share definition:</strong> The lease defines how the
          tenant&apos;s share is calculated. If the landlord uses incorrect
          square footage or an inconsistent denominator, every charge will be
          inflated
        </li>
        <li>
          <strong>Audit rights:</strong> The lease&apos;s{" "}
          <Link
            href="/resources/cam-audit-rights"
            className="text-blue-600 hover:underline"
          >
            audit clause
          </Link>{" "}
          defines how and when the tenant can review the landlord&apos;s
          records, which supports the dispute process
        </li>
      </ul>

      <h2>When Audits Identify Discrepancies</h2>
      <p>
        A formal audit, whether performed manually or through an automated
        tool, provides the evidence foundation for a dispute. When an audit
        identifies discrepancies, tenants should:
      </p>
      <ul>
        <li>
          Prioritize the largest dollar-value findings, as these have the most
          impact and are easiest to substantiate
        </li>
        <li>
          Verify that each finding ties back to a specific lease clause, not
          just a general sense that charges seem high
        </li>
        <li>
          Consider whether the discrepancy is a one-time error or a recurring
          issue across multiple years
        </li>
        <li>
          Determine whether the total overcharge exceeds any threshold in the
          audit clause that would require the landlord to reimburse audit costs
        </li>
      </ul>
      <h2>Putting Your Questions in Writing</h2>
      <p>
        A written request is easier for a landlord to answer, and for you to rely on later, than a phone call. A useful
        letter usually contains:
      </p>
      <ul>
        <li>The property, suite and the statement period it concerns.</li>
        <li>Each item as its own numbered point, with the statement line and amount.</li>
        <li>The lease provision you are relying on, quoted exactly, with its section or page.</li>
        <li>The arithmetic that led you to question the item, so the landlord can check it.</li>
        <li>A request for the supporting documents behind each item, such as invoices and allocation workpapers.</li>
        <li>A clear separation between items you believe are calculation errors and items where you only need an explanation.</li>
      </ul>
      <p>
        Avoid stating legal conclusions or deadlines you have not confirmed. Any time limit for raising questions comes
        from your lease and applicable law, so check both, and consider having an attorney review a letter before you send
        it. The full LeaseGuard report includes an editable dispute-letter draft built only from your audit&apos;s findings:
        it quotes your own documents, shows the calculation for each item, leaves unknown details as placeholders for you
        to complete, and exports to PDF or Word.
      </p>
      <p>
        For a comprehensive overview of the most common issues audits uncover,
        see our guide to{" "}
        <Link
          href="/resources/common-cam-overcharges"
          className="text-blue-600 hover:underline"
        >
          common CAM overcharges tenants miss
        </Link>
        . To compare your own reconciliation statement against your lease, start a{" "}
        <Link
          href="/upload" className="text-blue-600 hover:underline" > LeaseGuard audit </Link>
        .
      </p>
    </ArticleLayout>
  );
}
