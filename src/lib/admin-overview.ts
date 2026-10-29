import type { SupabaseClient } from "@supabase/supabase-js";
import { checkStripeConfig } from "@/lib/stripe-config";
import { redactDiagnostic } from "@/lib/admin-access";

/**
 * Read-only overview for the administrator. Counts and minimal diagnostics only.
 * It never returns email addresses, names, lease or statement contents, document paths,
 * keys or tokens. Identifiers are shortened to their first 8 characters.
 */

const short = (id: string | null | undefined) => (id ? id.slice(0, 8) : "");

export interface Overview {
  generatedAt: string;
  users: { total: number | null };
  audits: { total: number; byStatus: Record<string, number>; withStoredReport: number };
  payments: { total: number; byStatus: Record<string, number>; liveMode: number; testMode: number };
  recentFailures: { audit: string; at: string; note: string }[];
  recentPayments: { audit: string; tier: string; status: string; amountCents: number | null; live: boolean; at: string }[];
  recentWebhookEvents: { type: string; receivedAt: string; processed: boolean }[];
  configuration: { stripeMode: string | null; stripeConfigOk: boolean; stripeProblems: string[]; baseUrl: string | null };
}

async function count(db: SupabaseClient, table: string, filter?: (q: any) => any): Promise<number> {
  let q: any = db.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: c, error } = await q;
  if (error) throw new Error(`count ${table} failed`);
  return c ?? 0;
}

export async function buildOverview(db: SupabaseClient, env: Record<string, string | undefined> = process.env): Promise<Overview> {
  const auditStatuses = ["pending", "processing", "completed", "error"];
  const paymentStatuses = ["pending", "paid", "failed", "expired", "rejected"];

  const [auditTotal, withReport, paymentTotal, live, test, ...rest] = await Promise.all([
    count(db, "audits"),
    count(db, "audits", (q) => q.not("report_pdf_url", "is", null)),
    count(db, "payments"),
    count(db, "payments", (q) => q.eq("livemode", true)),
    count(db, "payments", (q) => q.eq("livemode", false)),
    ...auditStatuses.map((s) => count(db, "audits", (q) => q.eq("status", s))),
    ...paymentStatuses.map((s) => count(db, "payments", (q) => q.eq("status", s))),
  ]);
  const byAudit: Record<string, number> = {};
  const byPayment: Record<string, number> = {};
  auditStatuses.forEach((s, i) => (byAudit[s] = rest[i]));
  paymentStatuses.forEach((s, i) => (byPayment[s] = rest[auditStatuses.length + i]));

  let users: number | null = null;
  try {
    const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1 });
    const total = (data as unknown as { total?: number } | null)?.total;
    users = typeof total === "number" ? total : null;
  } catch {
    users = null;
  }

  const [failures, payments, events] = await Promise.all([
    db.from("audits").select("id,created_at,error_message").eq("status", "error").order("created_at", { ascending: false }).limit(10),
    db.from("payments").select("audit_id,tier,status,amount_paid,amount_expected,livemode,created_at").order("created_at", { ascending: false }).limit(10),
    db.from("stripe_events").select("type,received_at,processed_at").order("received_at", { ascending: false }).limit(10),
  ]);

  const stripe = checkStripeConfig(env);
  return {
    generatedAt: new Date().toISOString(),
    users: { total: users },
    audits: { total: auditTotal, byStatus: byAudit, withStoredReport: withReport },
    payments: { total: paymentTotal, byStatus: byPayment, liveMode: live, testMode: test },
    recentFailures: (failures.data ?? []).map((a: any) => ({ audit: short(a.id), at: a.created_at, note: redactDiagnostic(a.error_message) })),
    recentPayments: (payments.data ?? []).map((p: any) => ({
      audit: short(p.audit_id),
      tier: p.tier,
      status: p.status,
      amountCents: p.amount_paid ?? p.amount_expected ?? null,
      live: !!p.livemode,
      at: p.created_at,
    })),
    recentWebhookEvents: (events.data ?? []).map((e: any) => ({ type: e.type, receivedAt: e.received_at, processed: !!e.processed_at })),
    configuration: {
      stripeMode: stripe.mode,
      stripeConfigOk: stripe.ok,
      // problem text never contains a secret value (see stripe-config tests)
      stripeProblems: stripe.problems,
      baseUrl: env.APP_BASE_URL ?? null,
    },
  };
}
