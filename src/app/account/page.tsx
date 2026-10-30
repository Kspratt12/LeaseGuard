"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, FilePlus2, FileText, Loader2, Lock, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getAuthHeaders } from "@/lib/auth-client";
import { formatUsdFromCents, formatYears } from "@/lib/format";
import { Pill, buttonClass, cardClass } from "@/components/ui";

interface AuditSummary {
  id: string;
  created_at: string | null;
  status: string | null;
  savings_estimate: number | null;
  years: number | null;
  price_cents: number | null;
  unlocked: boolean;
  /** False when the audit has nothing to unlock: no price or purchase is mentioned for it. */
  purchasable?: boolean;
}

type View = "processing" | "failed" | "unlocked" | "preview" | "unknown";

function viewOf(a: AuditSummary): View {
  if (a.status === "pending" || a.status === "processing") return "processing";
  if (a.status === "error") return "failed";
  if (a.status === "completed") return a.unlocked ? "unlocked" : "preview";
  return "unknown";
}

function AuditCard({ a }: { a: AuditSummary }) {
  const view = viewOf(a);
  const when = a.created_at
    ? new Date(a.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "Date unavailable";
  const years = formatYears(a.years);
  const price = formatUsdFromCents(a.price_cents);
  const amount = a.savings_estimate ? `$${a.savings_estimate.toLocaleString("en-US")}` : null;

  return (
    <li className={`${cardClass} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">CAM audit{years ? ` · ${years} of statements` : ""}</p>
          <p className="mt-0.5 text-sm text-gray-500">Started {when}</p>
        </div>
        {view === "unlocked" && (
          <Pill tone="success">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Full report unlocked
          </Pill>
        )}
        {view === "preview" && (
          <Pill tone="info">
            <Lock className="h-3.5 w-3.5" aria-hidden /> Preview ready
          </Pill>
        )}
        {view === "processing" && (
          <Pill tone="warning">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Processing
          </Pill>
        )}
        {view === "failed" && (
          <Pill tone="danger">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Could not be processed
          </Pill>
        )}
      </div>

      {(view === "preview" || view === "unlocked") && amount && (
        <p className="mt-3 text-sm text-gray-700">
          Potential billing discrepancies: <span className="font-semibold text-gray-900">{amount}</span>
          <span className="text-gray-500"> (items to review, not confirmed overcharges)</span>
        </p>
      )}
      {view === "preview" && a.purchasable !== false && (
        <p className="mt-1 text-sm text-gray-600">
          {price
            ? `The full report with evidence and a dispute letter draft is a one-time ${price}.`
            : "Open the audit to see your options for the full report."}
        </p>
      )}
      {view === "preview" && a.purchasable === false && (
        <p className="mt-1 text-sm text-gray-600">There are no additional findings to unlock for this audit, so no purchase is offered.</p>
      )}
      {view === "processing" && (
        <p className="mt-3 text-sm text-gray-600">Processing time depends on your documents. This page updates on its own when your audit is ready.</p>
      )}
      {view === "failed" && (
        <p className="mt-3 text-sm text-gray-600">
          We could not read these documents. Clear, text-based PDFs or sharp photos of each page work best.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {view === "unlocked" && (
          <>
            <Link href={`/audit/${a.id}`} className={buttonClass("primary")}>
              <FileText className="h-4 w-4" aria-hidden /> Open full report
            </Link>
            <Link href={`/audit/${a.id}/letter`} className={buttonClass("secondary")}>
              Dispute letter draft
            </Link>
          </>
        )}
        {view === "preview" && (
          <Link href={`/audit/${a.id}`} className={buttonClass("primary")}>
            Review results{price && a.purchasable !== false ? ` and unlock for ${price}` : ""}
          </Link>
        )}
        {view === "processing" && (
          <Link href={`/audit/${a.id}`} className={buttonClass("secondary")}>
            View progress
          </Link>
        )}
        {view === "failed" && (
          <Link href="/upload" className={buttonClass("primary")}>
            Start a new audit
          </Link>
        )}
        {view === "unknown" && (
          <Link href={`/audit/${a.id}`} className={buttonClass("secondary")}>
            Open
          </Link>
        )}
      </div>
    </li>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const [audits, setAudits] = useState<AuditSummary[] | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const headers = await getAuthHeaders();
    if (!headers) return router.replace("/login?next=/account");
    const res = await fetch("/api/audits", { headers, cache: "no-store" });
    if (res.status === 401) return router.replace("/login?next=/account");
    if (!res.ok) return setError("We could not load your audits. Please refresh the page.");
    setError(null);
    setAudits(await res.json());
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => !cancelled && setEmail(data.session?.user.email ?? null));
    load();
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Keep in-progress audits fresh without a manual refresh (for up to 10 minutes).
  const anyProcessing = !!audits?.some((a) => viewOf(a) === "processing");
  useEffect(() => {
    if (!anyProcessing) return;
    const started = Date.now();
    const t = setInterval(() => (Date.now() - started > 10 * 60_000 ? clearInterval(t) : load()), 6000);
    return () => clearInterval(t);
  }, [anyProcessing, load]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  const unlockedCount = audits?.filter((a) => a.unlocked).length ?? 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">My audits</h1>
          {email && <p className="mt-1 truncate text-sm text-gray-500">Signed in as {email}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/upload" className={buttonClass("primary")}>
            <FilePlus2 className="h-4 w-4" aria-hidden /> New audit
          </Link>
          <button type="button" onClick={signOut} className={buttonClass("ghost")}>
            Sign out
          </button>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <span>{error}</span>
          <button type="button" onClick={load} className={buttonClass("secondary", "!min-h-9 !py-1.5")}>
            Try again
          </button>
        </div>
      )}

      {!audits && !error && (
        <ul className="mt-6 space-y-3" aria-label="Loading your audits" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className={`${cardClass} h-32 animate-pulse bg-gray-50`} />
          ))}
        </ul>
      )}

      {audits && audits.length === 0 && (
        <section className={`${cardClass} mt-6 p-6 text-center sm:p-10`}>
          <FilePlus2 className="mx-auto h-8 w-8 text-blue-600" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold text-gray-900">No audits yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">
            Upload your commercial lease and a CAM reconciliation statement. The preview is free; the full report is a
            one-time $49 for one year or $149 for two to five years.
          </p>
          <Link href="/upload" className={buttonClass("primary", "mt-5")}>
            Run your first audit
          </Link>
        </section>
      )}

      {audits && audits.length > 0 && (
        <>
          <p className="mt-6 text-sm text-gray-500">
            {audits.length} {audits.length === 1 ? "audit" : "audits"}
            {unlockedCount > 0 ? ` · ${unlockedCount} with the full report unlocked` : ""}
          </p>
          <ul className="mt-3 space-y-3">
            {audits.map((a) => (
              <AuditCard key={a.id} a={a} />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
