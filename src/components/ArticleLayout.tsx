import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface ArticleLayoutProps {
  title: string;
  publishedDate: string;
  readTime: string;
  children: React.ReactNode;
}

export function ArticleLayout({
  title,
  publishedDate,
  readTime,
  children,
}: ArticleLayoutProps) {
  return (
    <main className="bg-white">
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
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight tracking-tight">
            {title}
          </h1>
          <div className="mt-4 flex items-center gap-3 text-sm text-gray-500">
            <time>{publishedDate}</time>
            <span className="text-gray-300">·</span>
            <span>{readTime}</span>
          </div>
        </div>
      </div>

      {/* Article body */}
      <article className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
        <div className="prose prose-gray prose-lg max-w-none [&>h2]:text-2xl [&>h2]:font-semibold [&>h2]:text-gray-900 [&>h2]:mt-10 [&>h2]:mb-4 [&>h3]:text-xl [&>h3]:font-semibold [&>h3]:text-gray-800 [&>h3]:mt-8 [&>h3]:mb-3 [&>p]:text-gray-600 [&>p]:leading-relaxed [&>p]:mb-5 [&>ul]:text-gray-600 [&>ul]:leading-relaxed [&>ul]:mb-5 [&>ul]:space-y-2 [&>ol]:text-gray-600 [&>ol]:leading-relaxed [&>ol]:mb-5 [&>ol]:space-y-2 [&_li]:pl-1">
          {children}
        </div>
      </article>

      {/* CTA */}
      <section className="border-t border-gray-100 bg-gray-50/60">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 sm:py-18 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            Want to check your own CAM charges?
          </h2>
          <p className="text-gray-600 mb-8 max-w-xl mx-auto leading-relaxed">
            Upload your commercial lease and CAM reconciliation statements to
            run a LeaseGuard audit. Get results in about 60 seconds.
          </p>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-7 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-500 hover:shadow-md transition-all"
          >
            Run 60-Second Audit
          </Link>
          <div className="mt-6 flex items-center justify-center gap-6 text-sm text-gray-500">
            <Link
              href="/resources"
              className="hover:text-blue-600 transition-colors"
            >
              More Resources
            </Link>
            <span className="text-gray-300">·</span>
            <Link
              href="/#pricing"
              className="hover:text-blue-600 transition-colors"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
