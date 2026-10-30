import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentStore } from "@/lib/payments";
import type { EmailStore } from "@/lib/purchase-email";
import { purchaseInputFromRow } from "@/lib/purchase-eligibility";

/**
 * Supabase-backed PaymentStore. Uses the service-role client because payments
 * and stripe_events have no client-facing policies; callers must already have
 * authenticated and authorised the user.
 */
export function supabasePaymentStore(db: SupabaseClient): PaymentStore {
  return {
    async recordEvent(eventId, type) {
      const { error } = await db.from("stripe_events").insert({ id: eventId, type });
      if (!error) return "new";
      if (error.code !== "23505") throw new Error(`stripe_events insert failed: ${error.message}`);
      const { data } = await db.from("stripe_events").select("processed_at").eq("id", eventId).single();
      return data?.processed_at ? "duplicate_done" : "retry";
    },

    async markEventProcessed(eventId) {
      await db.from("stripe_events").update({ processed_at: new Date().toISOString() }).eq("id", eventId);
    },

    async getPaymentBySession(sessionId) {
      // A failed read must not look like "no such payment": the webhook would ignore a real payment for good.
      const { data, error } = await db
        .from("payments")
        .select("stripe_session_id,audit_id,owner_id,tier,status")
        .eq("stripe_session_id", sessionId)
        .maybeSingle();
      if (error) throw new Error("payment read failed");
      return data
        ? { session_id: data.stripe_session_id, audit_id: data.audit_id, owner_id: data.owner_id, tier: data.tier, status: data.status }
        : null;
    },

    async createPending(r) {
      const { error } = await db.from("payments").insert({
        stripe_session_id: r.sessionId, audit_id: r.auditId, owner_id: r.ownerId, tier: r.tier,
        amount_expected: r.amount, currency: r.currency, livemode: r.livemode, status: "pending",
      });
      if (error) throw new Error(`payments insert failed: ${error.message}`);
    },

    async markPaid(sessionId, info) {
      const { error } = await db.from("payments").update({
        status: "paid", paid_at: new Date().toISOString(),
        stripe_payment_intent_id: info.paymentIntentId, amount_paid: info.amountTotal, currency: info.currency,
      }).eq("stripe_session_id", sessionId).neq("status", "paid");
      // 23505 = payments_one_paid_per_audit: another session already unlocked this audit.
      if (error?.code === "23505") return false;
      if (error) throw new Error(`payments update failed: ${error.message}`);
      return true;
    },

    async markStatus(sessionId, status, reason) {
      // Never downgrade a payment that was already verified as paid.
      const { error } = await db.from("payments").update({ status, status_reason: reason ?? null })
        .eq("stripe_session_id", sessionId).neq("status", "paid");
      // If this write is lost, a charged-but-not-unlocked payment would leave no record and the webhook would still
      // answer 200 (so Stripe would not redeliver). Throw instead: the webhook returns 500 and Stripe retries.
      if (error) throw new Error("payment status write failed");
    },

    async hasPaid(auditId, ownerId) {
      const { data } = await db.from("payments").select("id")
        .eq("audit_id", auditId).eq("owner_id", ownerId).eq("status", "paid").limit(1);
      return !!data?.length;
    },

    async getAuditFacts(auditId) {
      const { data, error } = await db.from("audits").select("owner_id,status,recon_year_count").eq("id", auditId).maybeSingle();
      if (error) throw new Error("audit read failed"); // never read as "audit not found"
      return data ?? null;
    },

    async getPurchaseFacts(auditId) {
      const { data, error } = await db
        .from("audits")
        .select("free_findings,paid_findings,overcharge_breakdown,lease_clauses_summary,audit_mode,confidence,validation_warning")
        .eq("id", auditId)
        .maybeSingle();
      if (error) throw new Error("audit findings read failed"); // never read as "no findings" (which would look ineligible)
      return data ? purchaseInputFromRow(data as Record<string, unknown>) : null;
    },
  };
}

/**
 * Confirmation-email bookkeeping on the payments row (columns from 20261101_payment_confirmation_email.sql).
 * If that migration has not been applied, claim() fails and no email is sent: never a duplicate, never a guess.
 */
export function supabaseEmailStore(db: SupabaseClient): EmailStore {
  return {
    async loadPaidPayment(sessionId) {
      const { data } = await db.from("payments")
        .select("stripe_session_id,audit_id,owner_id,tier,amount_paid,currency,paid_at,status")
        .eq("stripe_session_id", sessionId).maybeSingle();
      if (!data || data.status !== "paid" || data.amount_paid == null) return null;
      return {
        sessionId: data.stripe_session_id, auditId: data.audit_id, ownerId: data.owner_id, tier: data.tier,
        amountCents: data.amount_paid, currency: data.currency, paidAt: data.paid_at,
      };
    },

    async claim(sessionId) {
      const { data, error } = await db.from("payments")
        .update({ confirmation_email_claimed_at: new Date().toISOString(), confirmation_email_error: null })
        .eq("stripe_session_id", sessionId).eq("status", "paid")
        .is("confirmation_email_sent_at", null).is("confirmation_email_claimed_at", null)
        .select("id");
      if (error) throw new Error("claim failed");
      return (data?.length ?? 0) === 1;
    },

    async markSent(sessionId) {
      await db.from("payments").update({ confirmation_email_sent_at: new Date().toISOString() }).eq("stripe_session_id", sessionId);
    },

    async release(sessionId, errorCode) {
      await db.from("payments").update({ confirmation_email_claimed_at: null, confirmation_email_error: errorCode.slice(0, 40) })
        .eq("stripe_session_id", sessionId).is("confirmation_email_sent_at", null);
    },

    async getOwnerEmail(ownerId) {
      const { data } = await db.auth.admin.getUserById(ownerId);
      return data?.user?.email ?? null;
    },
  };
}
