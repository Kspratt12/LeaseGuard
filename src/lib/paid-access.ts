import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase";
import { authenticate, userOwnsAudit, UUID_RE } from "@/lib/audit-access";
import { authorizeReportAccess } from "@/lib/payments";
import { supabasePaymentStore } from "@/lib/payment-store";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Shared gate for every paid, per-audit feature (report, dispute letter, ...):
 * signed in -> owns the audit (RLS) -> verified payment -> audit completed.
 * Returns the authenticated user and a service client only when ALL pass.
 */
export async function requirePaidAudit(
  req: NextRequest,
  auditId: string,
): Promise<
  | { ok: true; userId: string; db: SupabaseClient }
  | { ok: false; response: NextResponse }
> {
  const user = await authenticate(req);
  const db = createServiceClient();
  const access = await authorizeReportAccess({
    userId: user?.id ?? null,
    auditId,
    userOwnsAudit: (id, userId) =>
      UUID_RE.test(id) && user ? userOwnsAudit(user.token, userId, id) : Promise.resolve(false),
    store: supabasePaymentStore(db),
    getReportPath: async (id) => {
      const { data } = await db.from("audits").select("status").eq("id", id).maybeSingle();
      return data?.status === "completed" ? "ok" : null;
    },
  });
  if (!access.ok) {
    const error = { 401: "Sign in required", 402: "Payment required", 404: "Not found" }[access.status];
    return { ok: false, response: NextResponse.json({ error }, { status: access.status, headers: NO_STORE }) };
  }
  return { ok: true, userId: user!.id, db };
}
