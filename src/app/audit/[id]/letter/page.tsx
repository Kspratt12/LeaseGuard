"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Loader2, RotateCcw } from "lucide-react";
import { getAuthHeaders } from "@/lib/auth-client";
import { buttonClass } from "@/components/ui";

interface Draft {
  text: string;
  total: number;
  headlineTotal: number | null;
  placeholders: string[];
  items: {
    kind: "adjustment" | "clarify";
    title: string;
    amount: number | null;
    evidence: { document: string; page: number | null; quote: string }[];
  }[];
}

export default function DisputeLetterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState("");
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
      setText(d.text);
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
        body: JSON.stringify({ text, format }),
      });
      if (!res.ok) throw new Error("The download failed. Please try again.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `LeaseGuard-Dispute-Letter-${id.slice(0, 8)}.${format}`;
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
      <h1 className="mt-3 text-2xl font-bold text-gray-900">Dispute letter draft</h1>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {!draft && !error && <Loader2 className="mt-8 h-6 w-6 animate-spin text-blue-700" aria-label="Loading" />}

      {draft && (
        <>
          <div className="mt-4 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Review and edit before you send anything.</p>
            <p>
              This draft is generated from your audit&apos;s findings. It quotes only text found in your own documents
              and adds no legal citations or deadlines. Amounts shown are possible adjustments for you to confirm, not
              confirmed overcharges, and recovery is never guaranteed. This is not legal advice.
            </p>
          </div>

          <p className="mt-4 text-sm text-gray-700">
            Total of the calculation-backed items:{" "}
            <span className="font-semibold">${draft.total.toLocaleString()}</span>
            {draft.headlineTotal != null && draft.headlineTotal !== draft.total && (
              <span className="text-red-700">
                {" "}
                (differs from your audit total of ${draft.headlineTotal.toLocaleString()}: please double-check)
              </span>
            )}
          </p>

          <label htmlFor="letter" className="mt-4 block text-sm font-medium text-gray-700">
            Letter (editable)
          </label>
          <textarea
            id="letter"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck
            className="mt-1 block min-h-[60vh] w-full rounded-lg border border-gray-300 bg-white p-4 font-serif text-[17px] leading-relaxed text-ink"
          />

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
              onClick={() => setText(draft.text)}
              className={buttonClass("ghost")}
            >
              <RotateCcw className="h-4 w-4" /> Reset to generated draft
            </button>
          </div>

          <details className="mt-8 rounded-lg border border-gray-200 bg-white p-4">
            <summary className="cursor-pointer font-medium text-gray-900">Evidence behind each item</summary>
            <ul className="mt-3 space-y-4 text-sm text-gray-700">
              {draft.items.map((it, i) => (
                <li key={i}>
                  <p className="font-semibold">
                    {it.title}
                    {it.amount != null ? ` - $${it.amount.toLocaleString()}` : " (to clarify)"}
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
        </>
      )}
    </main>
  );
}
