import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import {
  UUID_RE,
  OWNER_READABLE_COLUMNS,
  authenticate,
  createUserClient,
  toPublicAudit,
} from "@/lib/audit-access";
import { TIERS, tierForYearCount } from "@/lib/payments";
import { supabasePaymentStore } from "@/lib/payment-store";
import { decidePurchase, purchaseInputFromRow, publicPurchase } from "@/lib/purchase-eligibility";

// Prevent Next.js from caching this route
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate" };

const notFound = () =>
  NextResponse.json({ error: "Audit not found" }, { status: 404, headers: NO_STORE });

/**
 * Read an audit as the signed-in user. Row-level security (owner_id =
 * auth.uid()) decides visibility; the explicit owner_id filter is a second
 * check. Retries briefly to tolerate insert/read timing right after upload.
 */
async function fetchOwnedAuditWithRetry(
  token: string,
  userId: string,
  id: string,
  maxAttempts = 3,
) {
  const userClient = createUserClient(token);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { data } = await userClient
      .from("audits")
      .select(OWNER_READABLE_COLUMNS.join(","))
      .eq("id", id)
      .eq("owner_id", userId)
      .maybeSingle();

    if (data) return data as unknown as Record<string, unknown>;
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, attempt * 250));
    }
  }
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await authenticate(req);
  if (!user) {
    return NextResponse.json(
      { error: "Sign in required" },
      { status: 401, headers: NO_STORE },
    );
  }

  // Same response for "invalid id", "does not exist" and "belongs to someone
  // else" so audit existence is never revealed.
  if (!UUID_RE.test(id)) return notFound();

  const audit = await fetchOwnedAuditWithRetry(user.token, user.id, id);
  if (!audit) return notFound();

  // Ownership is now established. Paid findings are not readable by the user
  // client (column grant), so read them with the service client for the teaser.
  const service = createServiceClient();
  const { data: paidRow } = await service
    .from("audits")
    .select("paid_findings,report_pdf_url,recon_year_count")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  // Paid content is released only when a webhook-verified payment exists for
  // this audit AND this owner. Nothing the browser sends can change that.
  const unlocked = await supabasePaymentStore(service).hasPaid(id, user.id);
  const tier = tierForYearCount(paidRow?.recon_year_count);

  const publicAudit = toPublicAudit(audit, paidRow?.paid_findings ?? null, {
    unlocked,
    tier,
    amountCents: tier ? TIERS[tier].amount : null,
    // The PDF is generated on demand from the stored findings, so it is available for any finished audit.
    reportAvailable: audit.status === "completed",
  });

  // Auto-heal: findings exist but status is still "processing" (the function
  // was terminated before the status write). Reflect completion; persistence is
  // done by the service client because users cannot write audits.
  if (
    publicAudit.status === "processing" &&
    Array.isArray(publicAudit.free_findings) &&
    publicAudit.free_findings.length > 0
  ) {
    publicAudit.status = "completed";
    await service
      .from("audits")
      .update({ status: "completed" })
      .eq("id", id)
      .eq("owner_id", user.id);
  }

  // Whether this audit may be sold, decided by the same rule checkout enforces. Counts and fixed sentences only.
  const purchase = publicPurchase(
    decidePurchase(
      purchaseInputFromRow({
        free_findings: audit.free_findings,
        paid_findings: paidRow?.paid_findings,
        overcharge_breakdown: audit.overcharge_breakdown,
        lease_clauses_summary: audit.lease_clauses_summary,
        audit_mode: audit.audit_mode,
        confidence: audit.confidence,
        validation_warning: audit.validation_warning,
      }),
    ),
  );

  return NextResponse.json({ ...publicAudit, purchase }, { headers: NO_STORE });
}
