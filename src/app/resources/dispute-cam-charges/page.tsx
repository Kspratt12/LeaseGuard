import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

export const metadata: Metadata = {
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
      publishedDate="March 2026"
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

      <h2>How Tenants Challenge CAM Charges</h2>
      <p>
        Disputing CAM charges is a structured process. Tenants who approach it
        methodically — with evidence tied directly to their lease — are more
        likely to reach a favorable resolution. The typical process includes:
      </p>
      <ol>
        <li>
          <strong>Review the reconciliation statement</strong> — Start by
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
          <strong>Compare against the lease</strong> — Cross-reference each
          flagged charge against the specific provisions of your lease to
          determine whether the charge is permitted, capped, or excluded
        </li>
        <li>
          <strong>Document the discrepancies</strong> — Prepare a written
          summary of each disputed charge, including the lease clause it
          violates, the amount billed, and the amount you believe is correct
        </li>
        <li>
          <strong>Submit a formal dispute</strong> — Send a written notice to
          the landlord or property manager identifying each disputed item and
          requesting a correction or credit
        </li>
        <li>
          <strong>Negotiate or escalate</strong> — Work with the landlord to
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
          An audit report or analysis identifying the specific discrepancies —
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
          <strong>CAM caps</strong> —{" "}
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
          <strong>Excluded expense categories</strong> — Most leases define
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
          <strong>Administrative fee limits</strong> — Many leases cap
          management or administrative fees at a specific percentage of total
          operating expenses
        </li>
        <li>
          <strong>Pro rata share definition</strong> — The lease defines how the
          tenant&apos;s share is calculated. If the landlord uses incorrect
          square footage or an inconsistent denominator, every charge will be
          inflated
        </li>
        <li>
          <strong>Audit rights</strong> — The lease&apos;s{" "}
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
        A formal audit — whether performed manually or through an automated
        tool — provides the evidence foundation for a dispute. When an audit
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
      <p>
        For a comprehensive overview of the most common issues audits uncover,
        see our guide to{" "}
        <Link
          href="/resources/common-cam-overcharges"
          className="text-blue-600 hover:underline"
        >
          common CAM overcharges tenants miss
        </Link>
        . To run an automated analysis of your own lease and reconciliation
        statements, visit our{" "}
        <Link
          href="/resources/how-to-audit-cam-charges"
          className="text-blue-600 hover:underline"
        >
          CAM audit guide
        </Link>
        .
      </p>
    </ArticleLayout>
  );
}
