import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SITE_URL } from "@/lib/constants";

interface ArticleLayoutProps {
  title: string;
  publishedDate: string;
  /** When the article was last changed. Same formats as publishedDate. */
  modifiedDate?: string;
  readTime: string;
  description?: string;
  children: React.ReactNode;
}

const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];

/** "March 2026" -> "2026-03", "March 5, 2026" -> "2026-03-05"; anything else -> undefined (omitted). */
export function toIsoDate(input: string): string | undefined {
  const m = /^([A-Za-z]+)\s+(?:(\d{1,2}),\s*)?(\d{4})$/.exec(input.trim());
  if (!m) return undefined;
  const month = MONTHS.indexOf(m[1].toLowerCase()) + 1;
  if (month < 1) return undefined;
  const mm = String(month).padStart(2, "0");
  return m[2] ? `${m[3]}-${mm}-${m[2].padStart(2, "0")}` : `${m[3]}-${mm}`;
}

const TOOLS = [
  { href: "/cam-calculator", title: "CAM calculator", text: "Free. Check the arithmetic on your statement. No upload." },
  { href: "/resources/how-to-audit-cam-charges", title: "How to audit CAM charges", text: "Step-by-step review of a reconciliation statement." },
  { href: "/resources/dispute-cam-charges", title: "How to dispute CAM charges", text: "Organize evidence and raise questions with your landlord." },
  { href: "/resources/commercial-lease-audit-checklist", title: "Audit checklist", text: "Documents and checks to complete before you start." },
];

export function ArticleLayout({
  title,
  publishedDate,
  modifiedDate,
  readTime,
  description,
  children,
}: ArticleLayoutProps) {
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: description || title,
    author: {
      "@type": "Organization",
      name: "LeaseGuard",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "LeaseGuard",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/leaseguard-mark.png`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
    },
    ...(toIsoDate(publishedDate) ? { datePublished: toIsoDate(publishedDate) } : {}),
    ...(modifiedDate && toIsoDate(modifiedDate) ? { dateModified: toIsoDate(modifiedDate) } : {}),
  };

  return (
    <main className="bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      {/* Header */}
      <div className="border-b border-gray-100 bg-gray-50/60">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
          <Link
            href="/resources"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            All Resources
          </Link>
          <h1 className="text-3xl sm:text-5xl font-semibold text-gray-900 leading-[1.1] tracking-tight">
            {title}
          </h1>
          <div className="mt-4 flex items-center gap-3 text-sm text-gray-500">
            <time dateTime={toIsoDate(publishedDate)}>{publishedDate}</time>
            {modifiedDate && (
              <>
                <span className="text-gray-300">·</span>
                <span>
                  Updated <time dateTime={toIsoDate(modifiedDate)}>{modifiedDate}</time>
                </span>
              </>
            )}
            <span className="text-gray-300">·</span>
            <span>{readTime}</span>
          </div>
        </div>
      </div>

      {/* Article body */}
      <article className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
        <div className="guide-prose prose prose-gray prose-lg max-w-none [&>h2]:text-2xl [&>h2]:font-semibold [&>h2]:text-gray-900 [&>h2]:mt-10 [&>h2]:mb-4 [&>h3]:text-xl [&>h3]:font-semibold [&>h3]:text-gray-800 [&>h3]:mt-8 [&>h3]:mb-3 [&>p]:text-gray-600 [&>p]:leading-relaxed [&>p]:mb-5 [&>ul]:text-gray-600 [&>ul]:leading-relaxed [&>ul]:mb-5 [&>ul]:space-y-2 [&>ol]:text-gray-600 [&>ol]:leading-relaxed [&>ol]:mb-5 [&>ol]:space-y-2 [&_li]:pl-1">
          {children}
        </div>
      </article>

      {/* Tools and related guides */}
      <section className="border-t border-gray-100">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Tools and next steps</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {TOOLS.map((t) => (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className="block h-full rounded-xl border border-gray-200 p-4 hover:border-blue-300 transition-colors"
                >
                  <span className="font-medium text-blue-700">{t.title}</span>
                  <span className="mt-1 block text-sm text-gray-600">{t.text}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-gray-500">
            General information for commercial tenants, not legal or accounting advice. Your lease and applicable law
            decide your rights and deadlines.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-ink text-white">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 sm:py-18 text-center">
          <h2 className="text-3xl font-semibold text-white mb-3">
            Run a LeaseGuard CAM Audit
          </h2>
          <p className="text-white/75 mb-8 max-w-xl mx-auto leading-relaxed">
            Commercial tenants can upload their lease and CAM reconciliation
            statement to identify potential billing discrepancies, excluded
            cost pass-throughs, and CAM cap issues to review. The preview is
            free; the full report is a one-time $49 for one year or $149 for
            two to five years.
          </p>
          <Link
            href="/upload"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-paper px-8 text-base font-semibold text-ink transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Start a free preview
          </Link>
          <div className="mt-6 flex items-center justify-center gap-6 text-sm text-white/70">
            <Link
              href="/resources"
              className="inline-flex min-h-11 items-center hover:text-white transition-colors"
            >
              More Resources
            </Link>
            <span className="text-white/30">·</span>
            <Link
              href="/#pricing"
              className="inline-flex min-h-11 items-center hover:text-white transition-colors"
            >
              View Pricing
            </Link>
            <span className="text-white/30">·</span>
            <Link
              href="/sample-cam-audit-report"
              className="inline-flex min-h-11 items-center hover:text-white transition-colors"
            >
              Sample Report
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
