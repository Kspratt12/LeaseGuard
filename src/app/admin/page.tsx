"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { RefreshCw, Search } from "lucide-react";
import { getAuthHeaders } from "@/lib/auth-client";
import { buttonClass, cardClass, Pill } from "@/components/ui";
import type { Overview } from "@/lib/admin-overview";

/**
 * Administrator dashboard (read-only). This page is a shell: it contains no data. Each section loads
 * from its own /api/admin/* route, and every one of those checks on the server that the caller is an
 * administrator (401 not signed in, 403 not an administrator). Hiding or showing parts of this page is
 * never what protects the data.
 */

type Gate = "loading" | "signed-out" | "denied" | "error" | "ready";

const money = (cents: number | null | undefined) => (cents == null ? "n/a" : (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }));
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "n/a");
const secs = (n: number | null | undefined) => (n == null ? "n/a" : n < 90 ? `${n}s` : `${Math.round((n / 60) * 10) / 10} min`);

async function getJson<T>(path: string): Promise<{ status: number; data: T | null }> {
  const headers = await getAuthHeaders();
  if (!headers) return { status: 401, data: null };
  try {
    const res = await fetch(path, { headers, cache: "no-store" });
    return { status: res.status, data: res.ok ? ((await res.json()) as T) : null };
  } catch {
    return { status: 0, data: null };
  }
}

function useSection<T>(path: string, enabled: boolean) {
  const [state, setState] = useState<{ loading: boolean; data: T | null; failed: boolean }>({ loading: true, data: null, failed: false });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    const r = await getJson<T>(path);
    setState({ loading: false, data: r.data, failed: !r.data });
  }, [path]);
  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);
  return { ...state, reload: load };
}

function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="mt-8" aria-label={title}>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-ink-muted">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

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
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
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

const Notes = ({ items }: { items: string[] }) => (
  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-ink-muted">
    {items.map((n) => (
      <li key={n}>{n}</li>
    ))}
  </ul>
);

const Empty = ({ children }: { children: ReactNode }) => <p className="text-sm text-ink-muted">{children}</p>;
const Loading = () => <p role="status" className="text-sm text-ink-muted">Loading…</p>;
const Failed = ({ retry }: { retry: () => void }) => (
  <p className="text-sm text-ink-soft">
    Could not load this section.{" "}
    <button type="button" onClick={retry} className="font-semibold underline underline-offset-2">Try again</button>
  </p>
);

// ───────────── revenue ─────────────
interface Bucket { count: number; cents: number }
interface ModeRev { total: Bucket; today: Bucket; month: Bucket; byTier: { single: Bucket; multi: Bucket; other: Bucket }; missingAmount: number; missingDate: number }
interface Revenue { generatedAt: string; live: ModeRev; test: ModeRev; truncated: boolean; notes: string[] }

function RevenueBlock({ m, label }: { m: ModeRev; label: string }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-ink">{label}</h3>
      <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="All time" value={money(m.total.cents)} hint={`${m.total.count} purchases`} />
        <Stat label="This month (UTC)" value={money(m.month.cents)} hint={`${m.month.count} purchases`} />
        <Stat label="Today (UTC)" value={money(m.today.cents)} hint={`${m.today.count} purchases`} />
        <div className={`${cardClass} p-4`}>
          <p className="text-xs font-semibold text-ink-muted">By plan</p>
          <p className="mt-1 text-sm text-ink-soft"><span className="font-figures tabular-nums">{m.byTier.single.count}</span> one-year ($49): <span className="font-figures tabular-nums">{money(m.byTier.single.cents)}</span></p>
          <p className="text-sm text-ink-soft"><span className="font-figures tabular-nums">{m.byTier.multi.count}</span> two to five years ($149): <span className="font-figures tabular-nums">{money(m.byTier.multi.cents)}</span></p>
          {m.byTier.other.count > 0 && <p className="text-xs text-ink-muted">{m.byTier.other.count} with an unrecognised plan</p>}
        </div>
      </div>
      {(m.missingAmount > 0 || m.missingDate > 0) && (
        <p className="mt-1 text-xs text-review">{m.missingAmount} paid record(s) have no amount and {m.missingDate} have no paid date; they are counted but add no money or no period.</p>
      )}
    </div>
  );
}

// ───────────── health ─────────────
interface Health {
  generatedAt: string;
  byStatus: Record<string, number>;
  failuresShown: { audit: string; at: string; stage: string; note: string }[];
  failuresTotalInSample: number;
  stageCounts: Record<string, number>;
  stuck: { audit: string; status: string; since: string }[];
  stuckAfterMinutes: number;
  processing: { sampleSize: number; n: number; medianSeconds: number | null; p90Seconds: number | null; maxSeconds: number | null; basis: string };
  notes: string[];
}

// ───────────── payments ─────────────
interface Diagnostics {
  generatedAt: string;
  paymentsByStatus: Record<string, number>;
  problemPayments: { audit: string; tier: string; status: string; reason: string; live: boolean; at: string }[];
  needsManualRefundCheck: number;
  staleCheckouts: { audit: string; tier: string; live: boolean; since: string }[];
  webhook: { totalEverReceived: number; lastReceivedAt: string | null; last7DaysByType: Record<string, number>; unprocessedOlderThanMinutes: number; unprocessed: { type: string; receivedAt: string }[] };
  notes: string[];
}

// ───────────── lookup ─────────────
interface PayRow { tier: string; status: string; reason: string; amountCents: number | null; live: boolean; createdAt: string; paidAt: string | null }
type Lookup =
  | { ok: true; kind: "none"; scanned?: number; capped?: boolean }
  | { ok: true; kind: "audit"; audit: { audit: string; status: string; createdAt: string; years: number | null; stuck: boolean; failure: { stage: string; note: string } | null; timeline: { event: string; at: string }[]; secondsToReport: number | null; payments: PayRow[] } }
  | { ok: true; kind: "account"; account: { createdAt: string; emailConfirmed: boolean; lastSignInAt: string | null; audits: { audit: string; status: string; createdAt: string }[] } };

function LookupBox() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [res, setRes] = useState<Lookup | null>(null);

  async function run(e?: FormEvent, value?: string) {
    e?.preventDefault();
    const term = (value ?? q).trim();
    if (!term) return;
    if (value) setQ(value);
    setBusy(true);
    setMsg(null);
    setRes(null);
    const headers = await getAuthHeaders();
    if (!headers) {
      setMsg("Sign in again.");
      setBusy(false);
      return;
    }
    try {
      const r = await fetch(`/api/admin/lookup?q=${encodeURIComponent(term)}`, { headers, cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok) setMsg(j?.error ?? "Lookup failed.");
      else setRes(j as Lookup);
    } catch {
      setMsg("Lookup failed.");
    }
    setBusy(false);
  }

  return (
    <div className={`${cardClass} p-4`}>
      <form onSubmit={run} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="lookup" className="sr-only">Full audit ID or exact account email</label>
        <input
          id="lookup"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Full audit ID, or an exact account email"
          autoComplete="off"
          spellCheck={false}
          className="min-h-11 flex-1 rounded-lg border border-line bg-white px-3 text-sm text-ink"
        />
        <button type="submit" disabled={busy} className={buttonClass("primary")}>
          <Search className="h-4 w-4" aria-hidden /> {busy ? "Searching…" : "Look up"}
        </button>
      </form>
      <p className="mt-2 text-xs text-ink-muted">Shows status, dates and payment state only. Never documents, extracted figures or full error text. The account search checks up to 2,000 accounts; an audit ID lookup has no such limit.</p>
      {msg && <p role="alert" className="mt-3 text-sm text-ink-soft">{msg}</p>}

      {res?.kind === "none" && (
        <p className="mt-3 text-sm text-ink-soft">
          No match.{res.capped ? ` Only the first ${res.scanned} accounts were searched.` : ""}
        </p>
      )}

      {res?.kind === "audit" && (
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-figures text-xs text-ink-muted">{res.audit.audit}</span>
            <Pill tone={res.audit.status === "completed" ? "success" : res.audit.status === "error" ? "warning" : "neutral"}>{res.audit.status}</Pill>
            {res.audit.stuck && <Pill tone="warning">possibly stuck</Pill>}
            <span className="text-xs text-ink-muted">{res.audit.years ? `${res.audit.years} year(s) of statements` : "years not recorded"}</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-ink-muted">Timeline</p>
            <ul className="mt-1 space-y-0.5 text-ink-soft">
              {res.audit.timeline.map((t) => (
                <li key={t.event}>{t.event}: {when(t.at)}</li>
              ))}
              <li className="text-xs text-ink-muted">
                {res.audit.secondsToReport != null ? `Created to report saved: ${secs(res.audit.secondsToReport)}` : "Processing time unavailable (no report file timestamp)"}
              </li>
            </ul>
          </div>
          {res.audit.failure && (
            <p className="text-ink-soft"><span className="font-semibold">Failure (inferred stage: {res.audit.failure.stage}):</span> {res.audit.failure.note || "no message recorded"}</p>
          )}
          <div>
            <p className="text-xs font-semibold text-ink-muted">Payments for this audit</p>
            {res.audit.payments.length === 0 ? (
              <p className="text-ink-muted">None.</p>
            ) : (
              <ul className="mt-1 divide-y divide-line">
                {res.audit.payments.map((p) => (
                  <li key={p.createdAt} className="py-1.5 text-ink-soft">
                    {p.tier} · {money(p.amountCents)} · {p.live ? "live" : "test"} · <span className="font-semibold">{p.status}</span>
                    {p.reason ? ` (${p.reason})` : ""} · started {when(p.createdAt)}{p.paidAt ? `, paid ${when(p.paidAt)}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {res?.kind === "account" && (
        <div className="mt-4 space-y-2 text-sm text-ink-soft">
          <p>Account created {when(res.account.createdAt)} · email {res.account.emailConfirmed ? "confirmed" : "NOT confirmed"} · last sign-in {when(res.account.lastSignInAt)}</p>
          {res.account.audits.length === 0 ? (
            <p className="text-ink-muted">No audits.</p>
          ) : (
            <ul className="divide-y divide-line">
              {res.account.audits.map((a) => (
                <li key={a.audit} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <button type="button" onClick={() => run(undefined, a.audit)} className="font-figures text-xs underline underline-offset-2">{a.audit}</button>
                  <span className="text-xs text-ink-muted">{a.status} · {when(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const [gate, setGate] = useState<Gate>("loading");
  const [overview, setOverview] = useState<Overview | null>(null);

  const loadGate = useCallback(async () => {
    setGate("loading");
    const r = await getJson<Overview>("/api/admin/overview");
    if (r.status === 401) return setGate("signed-out");
    if (r.status === 403) return setGate("denied");
    if (!r.data) return setGate("error");
    setOverview(r.data);
    setGate("ready");
  }, []);
  useEffect(() => {
    loadGate();
  }, [loadGate]);

  const ready = gate === "ready";
  const revenue = useSection<Revenue>("/api/admin/revenue", ready);
  const health = useSection<Health>("/api/admin/health", ready);
  const pay = useSection<Diagnostics>("/api/admin/payments", ready);
  const cfg = useSection<{ checks: { label: string; ok: boolean | null; detail: string }[] }>("/api/admin/config", ready);

  const refreshAll = () => {
    loadGate();
    revenue.reload();
    health.reload();
    pay.reload();
    cfg.reload();
  };

  if (gate === "loading")
    return (
      <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6" aria-busy="true">
        <p role="status" className="text-sm text-ink-muted">Checking access…</p>
      </main>
    );
  if (gate === "signed-out")
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
        <h1 className="text-2xl font-semibold text-ink">Sign in required</h1>
        <Link href="/login?next=/admin" className={buttonClass("primary", "mt-6")}>Sign in</Link>
      </main>
    );
  if (gate === "denied")
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
        <h1 className="text-2xl font-semibold text-ink">No access</h1>
        <p className="mt-2 text-sm text-ink-muted">This area is for LeaseGuard administrators.</p>
        <Link href="/account" className={buttonClass("secondary", "mt-6")}>Back to my audits</Link>
      </main>
    );
  if (gate === "error" || !overview)
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
        <h1 className="text-2xl font-semibold text-ink">Could not load</h1>
        <button type="button" onClick={loadGate} className={buttonClass("primary", "mt-6")}>Try again</button>
      </main>
    );

  const o = overview;
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Operations dashboard</h1>
          <p className="text-xs text-ink-muted">Read-only. No documents, no extracted figures, no edit or delete controls. Updated {when(o.generatedAt)}.</p>
        </div>
        <button type="button" onClick={refreshAll} className={buttonClass("secondary")}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
        </button>
      </div>

      <section aria-label="Totals" className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Accounts" value={o.users.total ?? "n/a"} />
        <Stat label="Audits" value={o.audits.total} />
        <Stat label="Payments (all statuses)" value={o.payments.total} hint={`${o.payments.liveMode} live, ${o.payments.testMode} test`} />
        <Stat label="Stored reports" value={o.audits.withStoredReport} />
      </section>

      <Section title="Revenue" note="Confirmed, webhook-verified payments only.">
        {revenue.loading ? <Loading /> : revenue.failed || !revenue.data ? <Failed retry={revenue.reload} /> : (
          <>
            <RevenueBlock m={revenue.data.live} label="Live payments" />
            <RevenueBlock m={revenue.data.test} label="Test-mode payments (not real money)" />
            {revenue.data.truncated && <p className="mt-2 text-xs text-review">More than 5,000 paid records exist; only the most recent 5,000 were counted.</p>}
            <Notes items={revenue.data.notes} />
          </>
        )}
      </Section>

      <Section title="Audit processing health">
        {health.loading ? <Loading /> : health.failed || !health.data ? <Failed retry={health.reload} /> : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <Counts title="Audits by status" counts={health.data.byStatus} />
              <div className={`${cardClass} p-4`}>
                <h3 className="text-sm font-semibold text-ink">Estimated processing time</h3>
                {health.data.processing.n === 0 ? (
                  <p className="mt-2 text-sm text-ink-muted">Not available yet: no completed audit has a report-file timestamp to measure from.</p>
                ) : (
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <div><dt className="text-xs text-ink-muted">Median</dt><dd className="font-figures tabular-nums">{secs(health.data.processing.medianSeconds)}</dd></div>
                    <div><dt className="text-xs text-ink-muted">Slowest 10%</dt><dd className="font-figures tabular-nums">{secs(health.data.processing.p90Seconds)}</dd></div>
                    <div><dt className="text-xs text-ink-muted">Longest</dt><dd className="font-figures tabular-nums">{secs(health.data.processing.maxSeconds)}</dd></div>
                  </dl>
                )}
                <p className="mt-2 text-xs text-ink-muted">{health.data.processing.basis} Based on {health.data.processing.n} of {health.data.processing.sampleSize} audits.</p>
              </div>
            </div>

            <div className={`${cardClass} mt-3 p-4`}>
              <h3 className="text-sm font-semibold text-ink">Possibly stuck (pending or processing for over {health.data.stuckAfterMinutes} minutes)</h3>
              {health.data.stuck.length === 0 ? <p className="mt-2 text-sm text-ink-muted">None.</p> : (
                <ul className="mt-2 divide-y divide-line text-sm">
                  {health.data.stuck.map((s) => (
                    <li key={s.audit} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                      <span className="font-figures text-xs text-ink-soft">{s.audit}</span>
                      <span className="text-xs text-ink-muted">{s.status} since {when(s.since)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={`${cardClass} mt-3 p-4`}>
              <h3 className="text-sm font-semibold text-ink">Failed audits (newest {health.data.failuresShown.length} of {health.data.failuresTotalInSample} in the sample)</h3>
              {health.data.failuresTotalInSample > 0 && (
                <p className="mt-1 text-xs text-ink-muted">
                  Inferred stage: {Object.entries(health.data.stageCounts).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(", ")}
                </p>
              )}
              {health.data.failuresShown.length === 0 ? <p className="mt-2 text-sm text-ink-muted">None.</p> : (
                <ul className="mt-2 divide-y divide-line text-sm">
                  {health.data.failuresShown.map((f) => (
                    <li key={f.audit} className="py-2">
                      <p className="font-figures text-xs text-ink-muted">{f.audit} · {when(f.at)} · {f.stage}</p>
                      <p className="text-ink-soft">{f.note || "No message recorded"}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Notes items={health.data.notes} />
          </>
        )}
      </Section>

      <Section title="Launch checks" note="Read by the live site itself: payment prices, webhook endpoint and email setup. Nothing secret is shown.">
        {cfg.loading ? <Loading /> : cfg.failed || !cfg.data ? <Failed retry={cfg.reload} /> : (
          <ul className="divide-y divide-line">
            {cfg.data.checks.map((k) => (
              <li key={k.label} className="py-2 text-sm">
                <span className="font-semibold text-ink">{k.ok === true ? "Pass" : k.ok === false ? "Needs attention" : "Not checked"}: {k.label}</span>
                <span className="block text-ink-muted">{k.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Payment and webhook diagnostics">
        {pay.loading ? <Loading /> : pay.failed || !pay.data ? <Failed retry={pay.reload} /> : (
          <>
            {pay.data.needsManualRefundCheck > 0 && (
              <p role="alert" className="mb-3 rounded-lg border border-review/30 bg-review-soft p-3 text-sm text-ink">
                {pay.data.needsManualRefundCheck} payment(s) were charged but not unlocked (a duplicate payment, or an audit with nothing to unlock when payment arrived). Each needs a refund decision in Stripe.
              </p>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <Counts title="Payments by status" counts={pay.data.paymentsByStatus} />
              <div className={`${cardClass} p-4`}>
                <h3 className="text-sm font-semibold text-ink">Webhook</h3>
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between gap-2"><dt className="text-ink-muted">Events ever received</dt><dd className="font-figures tabular-nums">{pay.data.webhook.totalEverReceived}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-ink-muted">Last received</dt><dd className="text-ink-soft">{when(pay.data.webhook.lastReceivedAt)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-ink-muted">Unfinished over {pay.data.webhook.unprocessedOlderThanMinutes} min</dt><dd className="font-figures tabular-nums">{pay.data.webhook.unprocessed.length}</dd></div>
                </dl>
                {Object.keys(pay.data.webhook.last7DaysByType).length > 0 && (
                  <p className="mt-2 text-xs text-ink-muted">Last 7 days: {Object.entries(pay.data.webhook.last7DaysByType).map(([k, v]) => `${k} ×${v}`).join(", ")}</p>
                )}
              </div>
            </div>

            <div className={`${cardClass} mt-3 p-4`}>
              <h3 className="text-sm font-semibold text-ink">Failed, expired or rejected payments (newest 15)</h3>
              {pay.data.problemPayments.length === 0 ? <p className="mt-2 text-sm text-ink-muted">None.</p> : (
                <ul className="mt-2 divide-y divide-line text-sm">
                  {pay.data.problemPayments.map((p) => (
                    <li key={p.audit + p.at} className="py-1.5 text-ink-soft">
                      <span className="font-figures text-xs text-ink-muted">{p.audit.slice(0, 8)} · {when(p.at)}</span> · {p.tier} · {p.live ? "live" : "test"} · <span className="font-semibold">{p.status}</span>{p.reason ? ` (${p.reason})` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={`${cardClass} mt-3 p-4`}>
              <h3 className="text-sm font-semibold text-ink">Checkouts started but not completed (over an hour old)</h3>
              {pay.data.staleCheckouts.length === 0 ? <p className="mt-2 text-sm text-ink-muted">None.</p> : (
                <ul className="mt-2 divide-y divide-line text-sm">
                  {pay.data.staleCheckouts.map((p) => (
                    <li key={p.audit + p.since} className="py-1.5 text-ink-soft">
                      <span className="font-figures text-xs text-ink-muted">{p.audit.slice(0, 8)}</span> · {p.tier} · {p.live ? "live" : "test"} · since {when(p.since)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Notes items={pay.data.notes} />
          </>
        )}
      </Section>

      <Section title="Look up an audit or account" note="A full audit ID or an exact email address. Nothing else is searchable.">
        <LookupBox />
      </Section>

      <section className={`${cardClass} mt-8 p-4`} aria-labelledby="config">
        <h2 id="config" className="text-sm font-semibold text-ink">Configuration</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <Pill tone={o.configuration.stripeConfigOk ? "success" : "warning"}>Stripe {o.configuration.stripeMode ?? "not configured"}</Pill>
          <span className="text-ink-muted">Base URL: {o.configuration.baseUrl ?? "not set"}</span>
        </div>
        {o.configuration.stripeProblems.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-sm text-ink-soft">
            {o.configuration.stripeProblems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
      </section>
    </main>
  );
}
