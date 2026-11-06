/**
 * Payment REVIEW status: does this audit have a payment, confirmed as charged, that the system could not apply?
 *
 * This is deliberately separate from entitlement. Whether the owner may open the paid report is decided only by
 * `hasPaid` (a verified `paid` row) and is not touched here. This module answers a different question for the owner's own
 * screen: is there a payment that needs a human to look at it?
 *
 * Evidence used (the owner's own `payments` rows for the audit): `status` and `status_reason` only.
 *   - A row is a CONFIRMED CHARGE that was not applied only when it is `rejected` with one of the reasons below. The webhook
 *     reaches each of these only after it re-reads the session from Stripe and sees `payment_status = paid` (see fulfil() in
 *     payments.ts), so each one is evidence that Stripe reported the session paid.
 *   - Nothing else counts. A `pending` row, a failed webhook, a `failed` / `expired` row, a rejection reason that is not in
 *     the list (`livemode_mismatch`, `wrong_mode`, anything unrecognised) and the ABSENCE of any row say nothing about
 *     whether a charge happened, and this module makes no statement about them. In particular nothing here, or anywhere
 *     in the product, assures a customer that no charge occurred.
 *
 * What the browser receives is one of two words or null. No Stripe identifier, reason, amount or date leaves the server.
 * Pure: no database, no network.
 */
import { SUPPORT_EMAIL } from "@/lib/constants";

/** Rejection reasons the webhook only produces after Stripe showed the session as paid. Keep in step with fulfil() in payments.ts. */
export const CHARGE_SEEN_REJECTION_REASONS = [
  "not_eligible_at_payment",
  "duplicate_payment_refund_needed",
  "wrong_currency",
  "wrong_amount",
  "audit_mismatch",
  "owner_mismatch",
  "tier_mismatch",
  "audit_owner_changed",
  "wrong_tier_for_audit",
  "wrong_price",
] as const;

/** The only columns the review decision reads. */
export interface PaymentReviewRow {
  status?: unknown;
  status_reason?: unknown;
}

/**
 *   "not_applied"        a confirmed charge could not be applied, and the owner does NOT have access
 *   "additional_payment" a confirmed charge was not applied, and the owner already HAS access (for example a second payment)
 *   null                 nothing to review that the evidence supports
 */
export type PaymentReview = "not_applied" | "additional_payment" | null;

const REASONS = new Set<string>(CHARGE_SEEN_REJECTION_REASONS);

/** True when the row is a rejected payment whose reason proves Stripe reported it paid. */
export const isChargeSeenRejection = (r: PaymentReviewRow): boolean =>
  r.status === "rejected" && typeof r.status_reason === "string" && REASONS.has(r.status_reason);

/**
 * `entitled` is the EXISTING access decision (hasPaid), passed in unchanged. It only chooses the wording: it is never
 * derived here and never changed here.
 */
export function paymentReviewOf(rows: PaymentReviewRow[] | null | undefined, entitled: boolean): PaymentReview {
  if (!Array.isArray(rows) || !rows.some(isChargeSeenRejection)) return null;
  return entitled ? "additional_payment" : "not_applied";
}

/** The reference a customer quotes: the same short audit reference the page already uses for support. */
export const supportReference = (auditId: string): string => auditId.slice(0, 8).toUpperCase();

/** The one customer-facing statement per kind. It promises no contact, refund, outcome or response time. */
export function paymentReviewMessage(kind: Exclude<PaymentReview, null>, reference: string): { title: string; body: string } {
  if (kind === "not_applied") {
    return {
      title: "A payment for this audit could not be applied",
      body:
        "Our records show a payment for this audit that could not be applied. Please do not pay again. " +
        `Contact ${SUPPORT_EMAIL} with reference ${reference} so we can review it. This page does not show refund status.`,
    };
  }
  return {
    title: "An additional payment for this audit needs review",
    body:
      "Our records show an additional payment for this audit that was not applied. Your access to this report is not affected. " +
      `Contact ${SUPPORT_EMAIL} with reference ${reference} so we can review it. This page does not show refund status.`,
  };
}

/** Minimal shape of the Supabase client used to read the owner's payment rows (so tests can supply a mock). */
export interface PaymentRowsDb {
  from(table: "payments"): {
    select(cols: string): {
      eq(col: string, val: string): { eq(col: string, val: string): PromiseLike<{ data: PaymentReviewRow[] | null; error: unknown }> };
    };
  };
}

/**
 * Read the review kind for an audit the caller has ALREADY been shown to own. Rows are filtered by the audit AND by the
 * owner id, the same pair `hasPaid` uses, so one owner's payments can never shape another owner's screen. A read error
 * yields null (no statement), never a guess.
 */
export async function readPaymentReview(db: PaymentRowsDb, auditId: string, ownerId: string, entitled: boolean): Promise<PaymentReview> {
  const { data, error } = await db.from("payments").select("status,status_reason").eq("audit_id", auditId).eq("owner_id", ownerId);
  if (error) return null;
  return paymentReviewOf(data, entitled);
}
