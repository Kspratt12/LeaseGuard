"use client";


import { formatMoney } from "@/lib/format";
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Loader2, RotateCcw } from "lucide-react";
import { getAuthHeaders } from "@/lib/auth-client";
import { buttonClass } from "@/components/ui";
import { AuditRightsPanel } from "@/components/audit-rights-panel";
import type { AuditRightsClause } from "@/lib/audit-rights";

interface Draft {
  text: string;
  /** Null when an earlier audit's overall total could not be reconciled (totalNote says so). */
  total: number | null;
  totalNote?: string | null;
  headlineTotal: number | null;
  placeholders: string[];
  /** Set when the AI step read only part of a long lease. */
  coverageNote?: string | null;
  items: {
    kind: "adjustment" | "clarify";
    title: string;
    amount: number | null;
    evidence: { document: string; page: number | null; quote: string }[];
  }[];
  /** Absent on responses from before this feature; treated as "none quoted". */
  auditRights?: AuditRightsClause[];
  documentRequest?: { text: string; items: { title: string; documents: string[] }[]; placeholders: string[]; citesLeaseClause: boolean };
}

type DocKind = "dispute" | "documents";

export default function DisputeLetterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [disputeText, setDisputeText] = useState("");
  const [requestText, setRequestText] = useState("");
  const [kind, setKind] = useState<DocKind>("dispute");
  const text = kind === "dispute" ? disputeText : requestText;
  const setText = kind === "dispute" ? setDisputeText : setRequestText;
  const generated = kind === "dispute" ? draft?.text ?? "" : draft?.documentRequest?.text ?? "";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pdf" | "docx" | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loginUrl = `/login?next=${encodeURIComponent(`/audit/${id}/letter`)}`;
      const headers = await getAuthHeaders();
      if (!headers) return router.replace(loginUrl);
      const res = await fetch(`/api/audit/${id}/letter`, { headers, cache: "no-store" });
      if (cancelled) return;
      if (res.status === 401) return router.replace(loginUrl);
      if (res.status === 402) {
        return setError("The dispute letter is part of the full report. Unlock the full report to use it.");
      }
      if (!res.ok) return setError("We could not prepare the letter for this audit.");
      const d: Draft = await res.json();
      setDraft(d);
      setDisputeText(d.text);
      setRequestText(d.documentRequest?.text ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  const remaining = useMemo(() => Array.from(new Set(text.match(/\[[^\]\n]{2,60}\]/g) ?? [])), [text]);

  async function download(format: "pdf" | "docx") {
    setBusy(format);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      if (!headers) throw new Error("Please sign in again.");
      const res = await fetch(`/api/audit/${id}/letter`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ text, format, kind }),
      });
      if (!res.ok) throw new Error("The download failed. Please try again.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `LeaseGuard-${kind === "documents" ? "Document-Request" : "Dispute-Letter"}-${id.slice(0, 8)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The download failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-14">
      <Link href={`/audit/${id}`} className="inline-flex min-h-11 items-center text-sm text-blue-700 hover:underline">
        &larr; Back to your audit
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-gray-900">Letters to your landlord</h1>
      <p className="mt-1 text-sm text-gray-600">
        Two editable drafts built from this audit: a letter about the items found, and a request for the records behind them.
        Nothing is sent from here.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {!draft && !error && <Loader2 className="mt-8 h-6 w-6 animate-spin text-blue-700" aria-label="Loading" />}

      {draft && (
        <>
          <div role="tablist" aria-label="Draft" className="mt-5 flex gap-1 rounded-xl bg-gray-100 p-1">
            {([["dispute", "Dispute letter"], ["documents", "Request for documents"]] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={`min-h-11 flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${kind === k ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200" : "text-gray-600 hover:text-gray-900"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <AuditRightsPanel clauses={draft.auditRights ?? []} />

          {kind === "documents" && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Review and edit before you send anything.</p>
              <p>
                This request lists the records behind each item in your audit. {draft.documentRequest?.citesLeaseClause
                  ? "It quotes the audit-rights sentence found in your lease, but it does not claim that sentence entitles you to copies: whether it does depends on the full clause."
                  : "No audit-rights clause was quoted, so it is written as a request, not as a demand under the lease."}{" "}
                It contains no deadlines or legal citations. This is not legal advice.
              </p>
            </div>
          )}

          {kind === "dispute" && (<>
          <div className="mt-4 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Review and edit before you send anything.</p>
            <p>
              This draft is generated from your audit&apos;s findings. It quotes only text found in your own documents
              and adds no legal citations or deadlines. Amounts shown are possible adjustments for you to confirm, not
              confirmed overcharges, and recovery is never guaranteed. This is not legal advice.
            </p>
          </div>

          {draft.total == null ? (
            <p className="mt-4 text-sm text-gray-700" data-testid="letter-total-unavailable">
              {draft.totalNote ?? "The overall total for this earlier audit could not be reconciled, so none is shown."} The letter lists the individual items only.
            </p>
          ) : (
            <p className="mt-4 text-sm text-gray-700">
              Total of the calculation-backed items:{" "}
              <span className="font-semibold">{formatMoney(draft.total)}</span>
              {draft.headlineTotal != null && draft.headlineTotal !== draft.total && (
                <span className="text-red-700">
                  {" "}
                  (differs from your audit total of {formatMoney(draft.headlineTotal)}: please double-check)
                </span>
              )}
            </p>
          )}
          </>)}

          <label htmlFor="letter" className="mt-4 block text-sm font-medium text-gray-700">
            {kind === "dispute" ? "Dispute letter (editable)" : "Request for documents (editable)"}
          </label>
          <textarea
            id="letter"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck
            className="mt-1 block min-h-[60vh] w-full rounded-lg border border-gray-300 bg-white p-4 font-serif text-[17px] leading-relaxed text-ink"
          />

          {draft?.coverageNote && (
            <p role="note" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <span className="font-semibold">Before you send this letter: </span>
              {draft.coverageNote} Check every provision in the letter against your full lease, add any provision this review did not detect, and delete the bracketed note at the top.
            </p>
          )}

          <p role="status" className="mt-2 text-sm text-gray-600">
            {remaining.length
              ? `${remaining.length} placeholder${remaining.length === 1 ? "" : "s"} still to fill in: ${remaining
                  .slice(0, 6)
                  .join(", ")}${remaining.length > 6 ? ", ..." : ""}`
              : "All placeholders are filled in."}
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => download("pdf")}
              disabled={!!busy || !text.trim()}
              className={buttonClass("primary")}
            >
              {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download PDF
            </button>
            <button
              type="button"
              onClick={() => download("docx")}
              disabled={!!busy || !text.trim()}
              className={buttonClass("secondary")}
            >
              {busy === "docx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download Word (.docx)
            </button>
            <button
              type="button"
              onClick={() => setText(generated)}
              className={buttonClass("ghost")}
            >
              <RotateCcw className="h-4 w-4" /> Reset to generated draft
            </button>
          </div>

          {kind === "dispute" && (
          <details className="mt-8 rounded-lg border border-gray-200 bg-white p-4">
            <summary className="cursor-pointer font-medium text-gray-900">Evidence behind each item</summary>
            <ul className="mt-3 space-y-4 text-sm text-gray-700">
              {draft.items.map((it, i) => (
                <li key={i}>
                  <p className="font-semibold">
                    {it.title}
                    {it.amount != null ? ` - ${formatMoney(it.amount)}` : " (to clarify)"}
                  </p>
                  {it.evidence.length === 0 && <p className="text-gray-500">No quotation was extracted for this item.</p>}
                  {it.evidence.slice(0, 3).map((e, j) => (
                    <p key={j} className="mt-1 break-words border-l-2 border-gray-200 pl-3 italic">
                      {e.document}
                      {e.page != null ? `, page ${e.page}` : ""}: &ldquo;{e.quote}&rdquo;
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </details>
          )}
        </>
      )}
    </main>
  );
}
