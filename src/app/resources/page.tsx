import Link from "next/link";
import type { Metadata } from "next";
import { BookOpen, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Resources: CAM Audits, Reconciliation, and Commercial Lease Insights | LeaseGuard",
  description:
    "Educational guides to help commercial tenants understand CAM charges, reconciliation statements, and how to identify potential overcharges in their leases.",
  keywords: [
    "CAM charges",
    "CAM reconciliation",
    "commercial lease audit",
    "CAM overcharges",
    "common area maintenance",
    "commercial tenant resources",
  ],
};

const articles = [
  {
    slug: "cam-charges-explained",
    title: "What Are CAM Charges in Commercial Leases?",
    description:
      "Learn how common area maintenance charges work, what they typically cover, and what commercial tenants should watch for.",
  },
  {
    slug: "how-to-audit-cam-charges",
    title: "How to Audit Your CAM Charges",
    description:
      "A step-by-step guide for commercial tenants who want to review their CAM statements for accuracy and potential overcharges.",
  },
  {
    slug: "cam-reconciliation-guide",
    title: "CAM Reconciliation: What Tenants Need to Know",
    description:
      "Understand the annual CAM reconciliation process, how adjustments are calculated, and where discrepancies commonly arise.",
  },
  {
    slug: "cam-cap-commercial-lease",
    title: "CAM Caps in Commercial Leases Explained",
    description:
      "Learn what CAM caps are, how they protect tenants from runaway costs, and what to look for in your lease language.",
  },
  {
    slug: "common-cam-overcharges",
    title: "5 Common CAM Overcharges Tenants Miss",
    description:
      "Discover the most frequently overlooked CAM billing errors that cost commercial tenants thousands of dollars each year.",
  },
];

export default function ResourcesPage() {
  return (
    <main className="bg-white">
      {/* Header */}
      <section className="border-b border-gray-100 bg-gray-50/60">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-14 sm:py-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700 mb-6">
            <BookOpen className="h-4 w-4" />
            LeaseGuard Resources
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight leading-tight">
            CAM Audits, Reconciliation, and
            <br className="hidden sm:block" /> Commercial Lease Insights
          </h1>
          <p className="mt-5 text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Guides and articles to help commercial tenants understand CAM
            charges, identify potential overcharges, and make informed decisions
            about their leases.
          </p>
        </div>
      </section>

      {/* Article list */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 py-14 sm:py-20">
        <div className="space-y-4">
          {articles.map((article) => (
            <Link
              key={article.slug}
              href={`/resources/${article.slug}`}
              className="group block rounded-xl border border-gray-200 p-6 sm:p-8 hover:border-blue-200 hover:shadow-md transition-all"
            >
              <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                {article.title}
              </h2>
              <p className="mt-2 text-gray-600 leading-relaxed">
                {article.description}
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                Read article <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
