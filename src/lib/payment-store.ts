import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentStore } from "@/lib/payments";

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
      const { data } = await db
        .from("payments")
        .select("stripe_session_id,audit_id,owner_id,tier,status")
        .eq("stripe_session_id", sessionId)
        .maybeSingle();
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
      await db.from("payments").update({ status, status_reason: reason ?? null })
        .eq("stripe_session_id", sessionId).neq("status", "paid");
    },

    async hasPaid(auditId, ownerId) {
      const { data } = await db.from("payments").select("id")
        .eq("audit_id", auditId).eq("owner_id", ownerId).eq("status", "paid").limit(1);
      return !!data?.length;
    },

    async getAuditFacts(auditId) {
      const { data } = await db.from("audits").select("owner_id,status,recon_year_count").eq("id", auditId).maybeSingle();
      return data ?? null;
    },
  };
}
