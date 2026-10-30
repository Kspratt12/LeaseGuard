import type { SupabaseClient } from "@supabase/supabase-js";
import { redactDiagnostic } from "@/lib/admin-access";
import { REFUND_REVIEW_REASONS } from "@/lib/payments";
import {
  STALE_CHECKOUT_MS,
  STUCK_AFTER_MS,
  WEBHOOK_GRACE_MS,
  classifyFailure,
  computeRevenue,
  durationStats,
  olderThan,
  parseLookup,
  type FailureStage,
  type PaymentRow,
} from "@/lib/admin-metrics";

/**
 * Read-only data for the administrator dashboard. Every function here only SELECTs.
 * Nothing returned contains lease or statement contents, extracted amounts, document paths,
 * keys or tokens, Stripe payloads, or email addresses (an email is only ever matched, never listed).
 */

const BUCKET = "invoices";
const PAGE = 5000;

async function count(db: SupabaseClient, table: string, filter?: (q: any) => any): Promise<number> {
  let q: any = db.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: c, error } = await q;
  if (error) throw new Error(`count ${table} failed`);
  return c ?? 0;
}

// ───────────────────────────── revenue ─────────────────────────────
export async function revenueData(db: SupabaseClient, now: Date = new Date()) {
  const { data, error } = await db.from("payments").select("tier,status,amount_paid,paid_at,livemode").eq("status", "paid").limit(PAGE);
  if (error) throw new Error("revenue query failed");
  const totalPaid = await count(db, "payments", (q) => q.eq("status", "paid"));
  return {
    generatedAt: now.toISOString(),
    ...computeRevenue((data ?? []) as PaymentRow[], now),
    truncated: totalPaid > PAGE,
    notes: [
      "Only payments the webhook verified as paid are counted. Pending, failed, expired and rejected checkouts are never revenue.",
      "A duplicate webhook cannot double-count: each Stripe session is stored once and an audit can have only one paid payment.",
      "Refunds are NOT recorded in the database (the webhook does not handle refund events). These figures are gross of refunds. Check Stripe for refunds.",
      "Days and months are UTC. Amounts are the amount Stripe reported as paid, in US dollars.",
      "Counts the newest 5,000 paid records. A warning appears above if there are more than that.",
      "A payment the webhook rejected after charging (a duplicate payment, or an audit with nothing to unlock when payment arrived) is not counted as revenue, but that customer was charged. The refund alert in the diagnostics section lists these. Check Stripe.",
    ],
  };
}

// ───────────────────────────── processing health ─────────────────────────────
export async function healthData(db: SupabaseClient, now: Date = new Date()) {
  const statuses = ["pending", "processing", "completed", "error"];
  const counts = await Promise.all(statuses.map((s) => count(db, "audits", (q) => q.eq("status", s))));
  const byStatus: Record<string, number> = {};
  statuses.forEach((s, i) => (byStatus[s] = counts[i]));

  const [errs, active, done] = await Promise.all([
    db.from("audits").select("id,created_at,error_message").eq("status", "error").order("created_at", { ascending: false }).limit(200),
    db.from("audits").select("id,created_at,status").in("status", ["pending", "processing"]).order("created_at", { ascending: true }).limit(100),
    db.from("audits").select("id,created_at").eq("status", "completed").order("created_at", { ascending: false }).limit(20),
  ]);

  const stageCounts: Record<FailureStage, number> = { "Saving the report": 0, "Saving results": 0, "Timed out": 0, "Reading documents": 0, "AI analysis": 0, Unclassified: 0 };
  const failures = (errs.data ?? []).map((a: any) => {
    const stage = classifyFailure(a.error_message);
    stageCounts[stage] += 1;
    return { audit: a.id as string, at: a.created_at as string, stage, note: redactDiagnostic(a.error_message) };
  });

  const stuck = (active.data ?? [])
    .filter((a: any) => olderThan(a.created_at, STUCK_AFTER_MS, now))
    .slice(0, 15)
    .map((a: any) => ({ audit: a.id as string, status: a.status as string, since: a.created_at as string }));

  // Processing time: audits have no completed_at, so use the saved time of each audit's report file.
  const durations: number[] = [];
  await Promise.all(
    (done.data ?? []).map(async (a: any) => {
      try {
        const { data: objs } = await db.storage.from(BUCKET).list(a.id, { limit: 20 });
        const report = (objs ?? []).find((o: any) => o.name === "report.pdf");
        const savedAt = report?.created_at ? Date.parse(report.created_at) : NaN;
        const started = Date.parse(a.created_at);
        if (!Number.isNaN(savedAt) && !Number.isNaN(started)) durations.push(savedAt - started);
      } catch {
        /* a missing file simply contributes nothing */
      }
    }),
  );

  return {
    generatedAt: now.toISOString(),
    byStatus,
    failuresShown: failures.slice(0, 15),
    failuresTotalInSample: failures.length,
    stageCounts,
    stuck,
    stuckAfterMinutes: STUCK_AFTER_MS / 60000,
    processing: {
      sampleSize: (done.data ?? []).length,
      ...durationStats(durations),
      basis:
        "Estimated from the time the report file was saved minus the time the audit was created, for the 20 most recent completed audits. The audits table has no completed time. Shown only when real timestamps exist.",
    },
    notes: [
      "Failure stage is inferred from the error text. It is a hint, not a recorded fact.",
      "Failure counts and stages come from the newest 200 failed audits. Processing time uses the 20 most recent completed audits.",
      "Error text is shortened and stripped of emails, links, file names and long numbers.",
    ],
  };
}

// ───────────────────────────── payment and webhook diagnostics ─────────────────────────────
export async function diagnosticsData(db: SupabaseClient, now: Date = new Date()) {
  const paymentStatuses = ["pending", "paid", "failed", "expired", "rejected"];
  const pc = await Promise.all(paymentStatuses.map((s) => count(db, "payments", (q) => q.eq("status", s))));
  const byStatus: Record<string, number> = {};
  paymentStatuses.forEach((s, i) => (byStatus[s] = pc[i]));

  const since7d = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
  const [problems, pending, events, lastEvent, totalEvents] = await Promise.all([
    db.from("payments").select("audit_id,tier,status,status_reason,livemode,created_at").in("status", ["failed", "expired", "rejected"]).order("created_at", { ascending: false }).limit(15),
    db.from("payments").select("audit_id,tier,livemode,created_at").eq("status", "pending").order("created_at", { ascending: true }).limit(100),
    db.from("stripe_events").select("type,received_at,processed_at").gte("received_at", since7d).order("received_at", { ascending: false }).limit(1000),
    db.from("stripe_events").select("received_at").order("received_at", { ascending: false }).limit(1),
    count(db, "stripe_events"),
  ]);

  // Customers who were charged but not unlocked. An exact count (not derived from the 15 newest problem rows), so an
  // older one can never drop out of the alert.
  const needsRefund = await count(db, "payments", (q) => q.eq("status", "rejected").in("status_reason", [...REFUND_REVIEW_REASONS]));

  const typeCounts: Record<string, number> = {};
  const unprocessed: { type: string; receivedAt: string }[] = [];
  for (const e of events.data ?? []) {
    typeCounts[e.type] = (typeCounts[e.type] ?? 0) + 1;
    if (!e.processed_at && olderThan(e.received_at, WEBHOOK_GRACE_MS, now)) unprocessed.push({ type: e.type, receivedAt: e.received_at });
  }

  return {
    generatedAt: now.toISOString(),
    paymentsByStatus: byStatus,
    problemPayments: (problems.data ?? []).map((p: any) => ({
      audit: p.audit_id as string,
      tier: p.tier as string,
      status: p.status as string,
      reason: redactDiagnostic(p.status_reason, 60),
      live: !!p.livemode,
      at: p.created_at as string,
    })),
    needsManualRefundCheck: needsRefund,
    staleCheckouts: (pending.data ?? [])
      .filter((p: any) => olderThan(p.created_at, STALE_CHECKOUT_MS, now))
      .slice(0, 10)
      .map((p: any) => ({ audit: p.audit_id as string, tier: p.tier as string, live: !!p.livemode, since: p.created_at as string })),
    webhook: {
      totalEverReceived: totalEvents,
      lastReceivedAt: lastEvent.data?.[0]?.received_at ?? null,
      last7DaysByType: typeCounts,
      unprocessedOlderThanMinutes: WEBHOOK_GRACE_MS / 60000,
      unprocessed: unprocessed.slice(0, 10),
    },
    notes: [
      "Pending checkouts older than an hour are people who started to pay and did not finish; that is normal, not an error.",
      "Webhook counts cover the last 7 days (up to 1,000 events). Lists show the newest 10 to 15 items.",
      "The webhook table records that an event was received and whether it was finished. It stores no payload and no error text, so a failed delivery that never reached the site will not appear here. Check Stripe's webhook page for those.",
    ],
  };
}

// ───────────────────────────── limited lookup ─────────────────────────────
async function auditCard(db: SupabaseClient, id: string, now: Date) {
  const { data: a } = await db.from("audits").select("id,created_at,status,error_message,recon_year_count,report_pdf_url").eq("id", id).maybeSingle();
  if (!a) return null;
  const { data: pays } = await db.from("payments").select("tier,status,status_reason,amount_paid,amount_expected,livemode,created_at,paid_at").eq("audit_id", id).order("created_at", { ascending: true });
  let reportSavedAt: string | null = null;
  try {
    const { data: objs } = await db.storage.from(BUCKET).list(id, { limit: 20 });
    reportSavedAt = (objs ?? []).find((o: any) => o.name === "report.pdf")?.created_at ?? null;
  } catch {
    reportSavedAt = null;
  }
  const started = Date.parse(a.created_at);
  const saved = reportSavedAt ? Date.parse(reportSavedAt) : NaN;
  const secs = !Number.isNaN(saved) && !Number.isNaN(started) && saved >= started && saved - started <= 3600_000 ? Math.round((saved - started) / 100) / 10 : null;
  return {
    audit: a.id as string,
    status: a.status as string,
    createdAt: a.created_at as string,
    years: a.recon_year_count as number | null,
    stuck: ["pending", "processing"].includes(a.status) && olderThan(a.created_at, STUCK_AFTER_MS, now),
    failure: a.status === "error" ? { stage: classifyFailure(a.error_message), note: redactDiagnostic(a.error_message) } : null,
    timeline: [
      { event: "Audit created", at: a.created_at as string },
      ...(reportSavedAt ? [{ event: "Report file saved", at: reportSavedAt }] : []),
    ],
    secondsToReport: secs,
    payments: (pays ?? []).map((p: any) => ({
      tier: p.tier as string,
      status: p.status as string,
      reason: redactDiagnostic(p.status_reason, 60),
      amountCents: (p.amount_paid ?? p.amount_expected ?? null) as number | null,
      live: !!p.livemode,
      createdAt: p.created_at as string,
      paidAt: (p.paid_at ?? null) as string | null,
    })),
  };
}

export async function lookupData(db: SupabaseClient, rawQuery: string | null, now: Date = new Date()) {
  const q = parseLookup(rawQuery);
  if (q.kind === "invalid") return { ok: false as const, status: 400, error: "Enter a full audit ID or an exact email address." };

  if (q.kind === "audit") {
    const card = await auditCard(db, q.id, now);
    return card ? { ok: true as const, kind: "audit" as const, audit: card } : { ok: true as const, kind: "none" as const };
  }

  // exact email: scan accounts (read-only); capped so a huge user table cannot make this slow
  const PER = 200;
  const MAX_PAGES = 10;
  let found: any = null;
  let scanned = 0;
  for (let page = 1; page <= MAX_PAGES && !found; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: PER });
    if (error) throw new Error("account lookup failed");
    scanned += data.users.length;
    found = data.users.find((u: any) => (u.email ?? "").toLowerCase() === q.email) ?? null;
    if (data.users.length < PER) break;
  }
  if (!found) return { ok: true as const, kind: "none" as const, scanned, capped: scanned >= PER * MAX_PAGES };

  const { data: audits } = await db.from("audits").select("id,created_at,status").eq("owner_id", found.id).order("created_at", { ascending: false }).limit(10);
  return {
    ok: true as const,
    kind: "account" as const,
    account: {
      createdAt: found.created_at as string,
      emailConfirmed: !!found.email_confirmed_at,
      lastSignInAt: (found.last_sign_in_at ?? null) as string | null,
      audits: (audits ?? []).map((a: any) => ({ audit: a.id as string, status: a.status as string, createdAt: a.created_at as string })),
    },
  };
}
