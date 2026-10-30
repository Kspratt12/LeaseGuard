import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

export const metadata: Metadata = {
  alternates: { canonical: "/resources/commercial-lease-dispute-letter-template" },
  title: "CAM Dispute Letter Template | LeaseGuard",
  description:
    "A plain fill-in letter a commercial tenant can adapt to ask a landlord to explain CAM charges and send supporting records, with notes on what to attach.",
  keywords: [
    "commercial lease dispute letter",
    "CAM dispute letter template",
    "CAM reconciliation dispute",
    "request CAM backup documents",
  ],
};

export default function CamDisputeLetterTemplate() {
  return (
    <ArticleLayout
      title="CAM Dispute Letter Template for Commercial Tenants"
      publishedDate="October 29, 2026"
      modifiedDate="October 29, 2026"
      readTime="5 min read"
      description="A plain fill-in letter a commercial tenant can adapt to ask a landlord to explain CAM charges and send supporting records, with notes on what to attach."
    >
      <p>
        When a CAM reconciliation statement contains something you cannot match to your lease, a clear written request
        is usually the best first step. It creates a record, gives the landlord a chance to explain, and asks for the
        backup that lets you check the numbers. The template below is written to do that without accusing anyone.
      </p>
      <p>
        Before you send anything, read your lease for any notice, audit-request or payment-under-protest provisions.
        They differ from lease to lease, and this guide does not state any deadline because it cannot know yours. If a
        large amount or a deadline is involved, consider asking a commercial real estate attorney.
      </p>

      <h2>The template</h2>
      <p>Replace everything in [brackets]. Delete any item that does not apply to you.</p>
      <pre className="whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-800">
{`[Date]

[Landlord or property manager name]
[Address]

Re: [Premises address / suite] - CAM reconciliation for [year or period]

Dear [Name],

I am writing about the CAM reconciliation statement dated [date] for the premises above. While reviewing it against our lease, I found [number] items I would like to understand better. I am asking for an explanation and supporting records, and I am not assuming that anything is incorrect.

1. [Item, for example: Management fee]
   The statement shows [amount or percentage] on page [page]. Section [lease section] of our lease says [short, exact quote from the lease]. Could you explain how the statement amount was calculated and where the lease permits it?

2. [Item, for example: Roof repair or replacement]
   The statement includes [amount] for [description] on page [page]. Could you tell me whether this was treated as an operating expense or a capital expense, and which lease provision allows it to be passed through? Please send the invoice or contract for the work.

3. [Item, for example: Pro-rata share]
   The statement uses [percentage]. Our lease indicates [percentage or square footage]. Could you send the calculation behind the percentage and the building area you used?

Please also send:
- The general ledger or expense detail behind the operating expense total
- The prior-year reconciliation, if not already provided
- Any allocation or gross-up calculation applied
- Invoices for the items listed above

Please respond by [reasonable date, for example 30 days from today]. I am reserving my rights under the lease while I review your reply, and I would welcome a call if that is easier.

Sincerely,
[Your name]
[Business name]
[Phone] | [Email]`}
      </pre>

      <h2>Why it is worded this way</h2>
      <ul>
        <li>
          <strong>It asks for explanations first.</strong> Many differences have ordinary explanations. A calm request
          usually gets a faster, more useful answer than an accusation.
        </li>
        <li>
          <strong>It quotes your lease exactly.</strong> Copy the sentence word for word and note the section and page
          so the landlord can see what you are comparing.
        </li>
        <li>
          <strong>It names the page of the statement.</strong> That removes any doubt about which line you mean.
        </li>
        <li>
          <strong>It asks for the supporting records.</strong> Invoices and ledger detail are what let you confirm or
          close an item.
        </li>
        <li>
          <strong>It does not state a legal conclusion.</strong> Whether a charge is permitted depends on the lease
          and the facts, so the letter asks rather than declares.
        </li>
      </ul>

      <h2>What to attach or have ready</h2>
      <ul>
        <li>The pages of the lease you quote (not the whole lease unless asked)</li>
        <li>The reconciliation statement with the relevant lines marked</li>
        <li>Your own arithmetic, if you did any, such as your <Link href="/resources/check-your-pro-rata-share" className="text-blue-600 hover:underline">pro-rata share check</Link></li>
        <li>Proof of how and when you sent the letter, such as an email record or a mailing receipt</li>
      </ul>

      <h2>If the landlord does not reply or disagrees</h2>
      <p>
        Keep the exchange in writing. Many leases give tenants a separate right to inspect the landlord&apos;s books;
        our guide to{" "}
        <Link href="/resources/cam-audit-rights" className="text-blue-600 hover:underline">
          CAM audit rights
        </Link>{" "}
        explains what to look for in your lease. For a longer walk-through of the whole process, see{" "}
        <Link href="/resources/dispute-cam-charges" className="text-blue-600 hover:underline">
          how to dispute CAM charges
        </Link>
        .
      </p>

      <h2>Let LeaseGuard draft it from your documents</h2>
      <p>
        If you run a{" "}
        <Link href="/upload" className="text-blue-600 hover:underline">
          LeaseGuard audit
        </Link>
        , the paid report includes a dispute letter draft built from your own findings, with the statement page and
        lease wording filled in where the software found them. You can edit it before sending. It asks for
        explanations and supporting records in the same careful way, and it does not present a finding as proven.
      </p>
      <p>
        This template is general information for commercial tenants, not legal advice, and sending it does not
        guarantee any credit or refund.
      </p>
    </ArticleLayout>
  );
}
