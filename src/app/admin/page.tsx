"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getAuthHeaders } from "@/lib/auth-client";
import { buttonClass, cardClass, Pill } from "@/components/ui";
import type { Overview } from "@/lib/admin-overview";

/**
 * Administrator overview. This page is only a shell: it contains no data. Everything shown comes
 * from /api/admin/overview, which checks on the server that the caller is an administrator, so
 * hiding or showing parts of this page is never what protects the data.
 */

type State = { kind: "loading" } | { kind: "signed-out" } | { kind: "denied" } | { kind: "error" } | { kind: "ready"; data: Overview };

const money = (cents: number | null) => (cents == null ? "n/a" : (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }));
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className={`${cardClass} p-4`}>
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p className="font-figures mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

function Counts({ title, counts }: { title: string; counts: Record<string, number> }) {
  return (
    <div className={`${cardClass} p-4`}>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {Object.entries(counts).map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-2">
            <dt className="capitalize text-ink-muted">{k}</dt>
            <dd className="font-figures tabular-nums text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function AdminPage() {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const headers = await getAuthHeaders();
    if (!headers) return setState({ kind: "signed-out" });
    try {
      const res = await fetch("/api/admin/overview", { headers, cache: "no-store" });
      if (res.status === 401) return setState({ kind: "signed-out" });
      if (res.status === 403) return setState({ kind: "denied" });
      if (!res.ok) return setState({ kind: "error" });
      setState({ kind: "ready", data: await res.json() });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.kind === "loading")
    return (
      <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6" aria-busy="true">
        <p role="status" className="text-sm text-ink-muted">Checking access…</p>
      </main>
    );

  if (state.kind === "signed-out")
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
        <h1 className="text-2xl font-semibold text-ink">Sign in required</h1>
        <Link href="/login?next=/admin" className={buttonClass("primary", "mt-6")}>Sign in</Link>
      </main>
    );

  if (state.kind === "denied")
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
        <h1 className="text-2xl font-semibold text-ink">No access</h1>
        <p className="mt-2 text-sm text-ink-muted">This area is for LeaseGuard administrators.</p>
        <Link href="/account" className={buttonClass("secondary", "mt-6")}>Back to my audits</Link>
      </main>
    );

  if (state.kind === "error")
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
        <h1 className="text-2xl font-semibold text-ink">Could not load</h1>
        <button type="button" onClick={load} className={buttonClass("primary", "mt-6")}>Try again</button>
      </main>
    );

  const d = state.data;
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Admin overview</h1>
          <p className="text-xs text-ink-muted">Read-only. Counts and minimal diagnostics, no customer documents. Updated {when(d.generatedAt)}.</p>
        </div>
        <button type="button" onClick={load} className={buttonClass("secondary")}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
        </button>
      </div>

      <section aria-label="Totals" className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Accounts" value={d.users.total ?? "n/a"} />
        <Stat label="Audits" value={d.audits.total} />
        <Stat label="Payments" value={d.payments.total} hint={`${d.payments.liveMode} live, ${d.payments.testMode} test`} />
        <Stat label="Stored reports" value={d.audits.withStoredReport} />
      </section>

      <section className="mt-4 grid gap-3 md:grid-cols-2" aria-label="Status counts">
        <Counts title="Audits by status" counts={d.audits.byStatus} />
        <Counts title="Payments by status" counts={d.payments.byStatus} />
      </section>

      <section className={`${cardClass} mt-4 p-4`} aria-labelledby="config">
        <h2 id="config" className="text-sm font-semibold text-ink">Configuration</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <Pill tone={d.configuration.stripeConfigOk ? "success" : "warning"}>Stripe {d.configuration.stripeMode ?? "not configured"}</Pill>
          <span className="text-ink-muted">Base URL: {d.configuration.baseUrl ?? "not set"}</span>
        </div>
        {d.configuration.stripeProblems.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-sm text-ink-soft">
            {d.configuration.stripeProblems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
      </section>

      <section className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className={`${cardClass} p-4`} aria-labelledby="fail">
          <h2 id="fail" className="text-sm font-semibold text-ink">Recent processing failures</h2>
          {d.recentFailures.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">None.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line text-sm">
              {d.recentFailures.map((f) => (
                <li key={f.audit + f.at} className="py-2">
                  <p className="font-figures text-xs text-ink-muted">{f.audit} · {when(f.at)}</p>
                  <p className="text-ink-soft">{f.note || "No message recorded"}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`${cardClass} p-4`} aria-labelledby="pay">
          <h2 id="pay" className="text-sm font-semibold text-ink">Recent payments</h2>
          {d.recentPayments.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">None yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line text-sm">
              {d.recentPayments.map((p) => (
                <li key={p.audit + p.at} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span className="font-figures text-xs text-ink-muted">{p.audit} · {when(p.at)}</span>
                  <span className="text-ink-soft">{p.tier} · {money(p.amountCents)} · {p.live ? "live" : "test"} · {p.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className={`${cardClass} mt-4 p-4`} aria-labelledby="hooks">
        <h2 id="hooks" className="text-sm font-semibold text-ink">Recent webhook events</h2>
        {d.recentWebhookEvents.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">None yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line text-sm">
            {d.recentWebhookEvents.map((e) => (
              <li key={e.type + e.receivedAt} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="font-figures text-xs text-ink-soft">{e.type}</span>
                <span className="text-xs text-ink-muted">{when(e.receivedAt)} · {e.processed ? "processed" : "not processed"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
