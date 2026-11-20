import type { SourceDocument } from "@/lib/source-index";

/** The audit's quotations grouped by document and page, so the customer can check them in their own copy. */
export function SourceIndexPanel({ index }: { index: SourceDocument[] }) {
  return (
    <section aria-labelledby="src-title" className="rounded-xl border border-gray-200 bg-white p-4 text-sm sm:p-5">
      <h2 id="src-title" className="text-lg font-semibold text-ink">Where to look in your documents</h2>
      <p className="mt-1 text-ink-soft">
        Every passage this audit quoted, by document and page, so you can open your own copy and check each one. Page numbers are
        shown only where the document&apos;s text had page breaks; the review does not record where on a page a passage sits.
      </p>
      {index.length === 0 ? (
        <p className="mt-3 text-ink-soft">No passages were quoted from your documents for this audit.</p>
      ) : (
        <div className="mt-3 space-y-4">
          {index.map((d) => (
            <div key={d.document}>
              <h3 className="break-words font-semibold text-ink">{d.document}</h3>
              <ul className="mt-1 space-y-2">
                {d.pages.map((p) => (
                  <li key={p.page ?? "none"}>
                    <p className="font-medium text-gray-800">{p.page != null ? `Page ${p.page}` : "Page not recorded"}</p>
                    <ul className="mt-1 space-y-1">
                      {p.quotes.map((q, i) => (
                        <li key={i} className="break-words border-l-2 border-gray-200 pl-3">
                          <span className="text-gray-500">{q.item}: </span>
                          <span className="italic">&ldquo;{q.quote}&rdquo;</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
