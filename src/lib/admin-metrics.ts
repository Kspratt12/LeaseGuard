/**
 * Pure calculations for the administrator dashboard (no database access, so they are unit-tested).
 *
 * What the schema can and cannot support, in plain terms:
 * - Revenue: payments rows with status "paid" are written once per Stripe session and at most one
 *   paid payment can exist per audit (unique index), and webhook events are de-duplicated by event id,
 *   so a duplicate webhook cannot double-count a purchase. livemode separates live from test.
 * - Refunds are NOT recorded anywhere (the webhook does not handle refund events), so revenue is
 *   gross of refunds and is labelled that way.
 * - Audits store only created_at. There is no completed_at, so processing time cannot be read from
 *   the table; it is estimated from the saved time of the report file (see dashboard text).
 * - There is no failure-stage column; a coarse stage is inferred from the error text.
 */

export interface PaymentRow {
  tier: string;
  status: string;
  amount_paid: number | null;
  paid_at: string | null;
  livemode: boolean;
}

export interface Bucket {
  count: number;
  cents: number;
}

export interface ModeRevenue {
  total: Bucket;
  today: Bucket;
  month: Bucket;
  byTier: { single: Bucket; multi: Bucket; other: Bucket };
  /** paid rows with no recorded amount (counted, but add nothing to the money totals) */
  missingAmount: number;
  /** paid rows with no paid_at (counted in the total only) */
  missingDate: number;
}

const empty = (): Bucket => ({ count: 0, cents: 0 });
const emptyMode = (): ModeRevenue => ({ total: empty(), today: empty(), month: empty(), byTier: { single: empty(), multi: empty(), other: empty() }, missingAmount: 0, missingDate: 0 });
const add = (b: Bucket, cents: number) => {
  b.count += 1;
  b.cents += cents;
};

/** Day and month boundaries are UTC. The dashboard says so. */
export function computeRevenue(rows: PaymentRow[], now: Date = new Date()): { live: ModeRevenue; test: ModeRevenue } {
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const out = { live: emptyMode(), test: emptyMode() };
  for (const r of rows) {
    if (r.status !== "paid") continue; // pending, failed, expired and rejected never count as revenue
    const m = r.livemode ? out.live : out.test;
    const cents = typeof r.amount_paid === "number" && r.amount_paid > 0 ? r.amount_paid : 0;
    if (cents === 0) m.missingAmount += 1;
    add(m.total, cents);
    add(m.byTier[r.tier === "single" || r.tier === "multi" ? r.tier : "other"], cents);
    const t = r.paid_at ? Date.parse(r.paid_at) : NaN;
    if (Number.isNaN(t)) {
      m.missingDate += 1;
      continue;
    }
    if (t >= monthStart) add(m.month, cents);
    if (t >= dayStart) add(m.today, cents);
  }
  return out;
}

export type FailureStage = "Saving the report" | "Saving results" | "Timed out" | "Reading documents" | "AI analysis" | "Unclassified";

/** Coarse stage inferred from the error text. A hint for troubleshooting, not a recorded fact. */
export function classifyFailure(message: string | null | undefined): FailureStage {
  const m = (message ?? "").toLowerCase();
  if (!m) return "Unclassified";
  if (m.includes("report upload failed")) return "Saving the report";
  if (m.includes("core db update failed") || m.includes("could not save the results")) return "Saving results";
  if (m.includes("timed out") || m.includes("timeout")) return "Timed out";
  if (/(pdf|extract|ocr|unreadable|scanned|text|document)/.test(m)) return "Reading documents";
  if (/(anthropic|claude|api key|rate limit|overloaded|model)/.test(m)) return "AI analysis";
  return "Unclassified";
}

export interface DurationStats {
  n: number;
  medianSeconds: number | null;
  p90Seconds: number | null;
  maxSeconds: number | null;
}

/** Durations in milliseconds. Only plausible values (0 to 1 hour) are used; the rest are dropped, never guessed. */
export function durationStats(durationsMs: number[]): DurationStats {
  const ok = durationsMs.filter((d) => Number.isFinite(d) && d >= 0 && d <= 60 * 60 * 1000).sort((a, b) => a - b);
  if (ok.length === 0) return { n: 0, medianSeconds: null, p90Seconds: null, maxSeconds: null };
  const mid = ok.length % 2 ? ok[(ok.length - 1) / 2] : (ok[ok.length / 2 - 1] + ok[ok.length / 2]) / 2;
  const p90 = ok[Math.max(0, Math.ceil(ok.length * 0.9) - 1)];
  const s = (ms: number) => Math.round(ms / 100) / 10;
  return { n: ok.length, medianSeconds: s(mid), p90Seconds: s(p90), maxSeconds: s(ok[ok.length - 1]) };
}

/** Uploads run for at most 5 minutes, so anything still pending or processing after 10 is suspicious. */
export const STUCK_AFTER_MS = 10 * 60 * 1000;
export const STALE_CHECKOUT_MS = 60 * 60 * 1000;
export const WEBHOOK_GRACE_MS = 5 * 60 * 1000;

export const olderThan = (iso: string | null | undefined, ms: number, now: Date = new Date()) => {
  const t = iso ? Date.parse(iso) : NaN;
  return !Number.isNaN(t) && now.getTime() - t > ms;
};

/** Searches accept a full audit id or an exact email address, nothing else. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
export type LookupQuery = { kind: "audit"; id: string } | { kind: "email"; email: string } | { kind: "invalid" };
export function parseLookup(q: string | null | undefined): LookupQuery {
  const v = (q ?? "").trim();
  if (v.length === 0 || v.length > 320) return { kind: "invalid" };
  if (UUID.test(v)) return { kind: "audit", id: v.toLowerCase() };
  if (EMAIL.test(v)) return { kind: "email", email: v.toLowerCase() };
  return { kind: "invalid" };
}
