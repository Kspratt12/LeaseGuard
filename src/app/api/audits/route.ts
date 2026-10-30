import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { authenticate } from "@/lib/audit-access";
import { TIERS, tierForYearCount } from "@/lib/payments";
import { decidePurchase, purchaseInputFromRow } from "@/lib/purchase-eligibility";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * The signed-in user's own audits (newest first), so a customer can always get
 * back to a report they paid for. Identity comes from the verified JWT and every
 * query is filtered by that id; only non-sensitive summary fields are returned.
 */
export async function GET(req: NextRequest) {
  const user = await authenticate(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401, headers: NO_STORE });

  const db = createServiceClient();
  const { data: audits, error } = await db
    .from("audits")
    .select("id,created_at,status,savings_estimate,recon_year_count,free_findings,paid_findings,overcharge_breakdown,lease_clauses_summary,audit_mode,confidence,validation_warning")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: "Could not load audits" }, { status: 500, headers: NO_STORE });

  const ids = (audits ?? []).map((a) => a.id);
  const { data: paid } = ids.length
    ? await db.from("payments").select("audit_id").eq("owner_id", user.id).eq("status", "paid").in("audit_id", ids)
    : { data: [] as { audit_id: string }[] };
  const unlocked = new Set((paid ?? []).map((p) => p.audit_id));

  return NextResponse.json(
    (audits ?? []).map((a) => ({
      id: a.id,
      created_at: a.created_at,
      status: a.status,
      savings_estimate: a.savings_estimate,
      years: a.recon_year_count ?? null,
      price_cents: ((t) => (t ? TIERS[t].amount : null))(tierForYearCount(a.recon_year_count)),
      unlocked: unlocked.has(a.id),
      // Only a yes/no: the account list never carries findings.
      purchasable: a.status === "completed" && decidePurchase(purchaseInputFromRow(a as unknown as Record<string, unknown>)).eligible,
    })),
    { headers: NO_STORE },
  );
}
