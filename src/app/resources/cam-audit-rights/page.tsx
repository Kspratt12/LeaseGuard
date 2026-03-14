import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

export const metadata: Metadata = {
  title: "CAM Audit Rights in Commercial Leases | LeaseGuard",
  description:
    "Understand your audit rights as a commercial tenant — including review periods, access to records, and how to exercise your right to audit CAM charges.",
  keywords: [
    "CAM audit rights",
    "tenant audit rights",
    "commercial lease audit rights",
    "right to audit CAM",
    "CAM reconciliation audit",
    "tenant rights commercial lease",
  ],
};

export default function CamAuditRights() {
  return (
    <ArticleLayout
      title="CAM Audit Rights in Commercial Leases"
      publishedDate="March 2026"
      readTime="7 min read"
      description="Understand your audit rights as a commercial tenant — including review periods, access to records, and how to exercise your right to audit CAM charges."
    >
      <p>
        Most commercial leases include an audit clause that gives tenants the
        right to review the landlord&apos;s books and records related to{" "}
        <Link
          href="/resources/cam-charges-explained"
          className="text-blue-600 hover:underline"
        >
          CAM charges
        </Link>{" "}
        and operating expenses. Despite this, the majority of tenants never
        exercise this right — often because they are unaware it exists or
        unsure how to begin. Understanding your audit rights is the first step
        toward verifying that your charges are accurate.
      </p>

      <h2>Tenant Audit Rights</h2>
      <p>
        An audit clause in a commercial lease typically grants the tenant the
        right to inspect, review, or audit the landlord&apos;s records related
        to operating expenses and CAM charges. The specific rights vary by lease,
        but common provisions include:
      </p>
      <ul>
        <li>
          The right to review the landlord&apos;s books and records for the
          charges billed during the lease year
        </li>
        <li>
          The right to hire a third-party auditor or accountant to conduct the
          review
        </li>
        <li>
          The right to receive copies of invoices, contracts, and supporting
          documentation for billed expenses
        </li>
        <li>
          A requirement that the landlord make records available within a
          specified timeframe after a request
        </li>
      </ul>
      <p>
        Some leases also include a provision that if the audit reveals an
        overcharge above a certain threshold — often 3% to 5% — the landlord
        must reimburse the tenant for the cost of the audit in addition to
        refunding the overcharge.
      </p>

      <h2>Review Periods</h2>
      <p>
        Audit clauses typically define a window during which the tenant must
        exercise their audit right. Common provisions include:
      </p>
      <ul>
        <li>
          <strong>Time limit after receiving the reconciliation statement</strong>{" "}
          — Many leases require tenants to initiate an audit within 90 to 180
          days after receiving the annual{" "}
          <Link
            href="/resources/cam-reconciliation-guide"
            className="text-blue-600 hover:underline"
          >
            CAM reconciliation statement
          </Link>
        </li>
        <li>
          <strong>Annual exercise window</strong> — Some leases allow audits
          only during a specific period each year, often tied to the lease year
          end
        </li>
        <li>
          <strong>Lookback period</strong> — The audit may cover only the most
          recent lease year, or the lease may permit a lookback covering
          multiple prior years
        </li>
      </ul>
      <p>
        Missing the review period can mean forfeiting your audit right for that
        year. Tenants should calendar these deadlines as soon as they receive
        their reconciliation statement.
      </p>

      <h2>How Reconciliation Audits Work</h2>
      <p>
        A reconciliation audit compares the charges on the landlord&apos;s
        annual reconciliation statement against the terms of the lease. The
        process typically involves:
      </p>
      <ol>
        <li>
          Reviewing the lease to identify permitted expense categories, excluded
          costs, fee caps, and pro rata share calculations
        </li>
        <li>
          Examining each line item on the reconciliation statement to verify it
          falls within permitted categories
        </li>
        <li>
          Checking mathematical accuracy — pro rata share percentages, totals,
          and year-over-year adjustments
        </li>
        <li>
          Identifying charges that exceed{" "}
          <Link
            href="/resources/cam-cap-commercial-lease"
            className="text-blue-600 hover:underline"
          >
            CAM caps
          </Link>{" "}
          or violate escalation limits
        </li>
        <li>
          Flagging{" "}
          <Link
            href="/resources/can-landlords-charge-capital-expenses"
            className="text-blue-600 hover:underline"
          >
            capital expenditures
          </Link>{" "}
          that may have been improperly classified as operating expenses
        </li>
      </ol>
      <p>
        For a detailed walkthrough, see our{" "}
        <Link
          href="/resources/cam-reconciliation-statement-example"
          className="text-blue-600 hover:underline"
        >
          CAM reconciliation statement example
        </Link>
        .
      </p>

      <h2>Why Tenants Audit CAM Charges</h2>
      <p>
        Tenants audit CAM charges because reconciliation statements are prepared
        by the landlord or their property management company, and errors —
        whether accidental or intentional — are common. Without an audit, these
        errors compound year after year.
      </p>
      <p>The most common reasons tenants exercise their audit rights include:</p>
      <ul>
        <li>
          Unexpected increases in CAM charges that are not explained by market
          conditions
        </li>
        <li>
          Suspicion that{" "}
          <Link
            href="/resources/common-cam-overcharges"
            className="text-blue-600 hover:underline"
          >
            common overcharges
          </Link>{" "}
          may be present in their billing
        </li>
        <li>
          A lease renewal approaching, making it important to establish accurate
          baseline costs
        </li>
        <li>
          Learning that other tenants in the same property have identified
          billing errors through their own audits
        </li>
      </ul>
      <p>
        LeaseGuard helps tenants exercise their audit rights by automating the
        comparison of lease terms against reconciliation charges. Upload your
        lease and reconciliation statement to receive findings in about 60
        seconds. For a step-by-step overview, see our guide on{" "}
        <Link
          href="/resources/how-to-audit-cam-charges"
          className="text-blue-600 hover:underline"
        >
          how to audit CAM charges
        </Link>
        .
      </p>
    </ArticleLayout>
  );
}
