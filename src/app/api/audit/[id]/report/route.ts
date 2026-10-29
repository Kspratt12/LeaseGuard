import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { authenticate, userOwnsAudit, UUID_RE } from "@/lib/audit-access";
import { authorizeReportAccess } from "@/lib/payments";
import { supabasePaymentStore } from "@/lib/payment-store";

/**
 * Report download. Requires a signed-in OWNER and a VERIFIED payment (recorded
 * only by the signature-checked, Stripe-re-verified webhook).
 *
 * The PDF stored at processing time is the free PREVIEW (isPaid: false). The full
 * report is generated here, on demand, after authorization, from the stored
 * findings, so paid content never sits in storage under a guessable link and the
 * downloaded file always matches the findings and totals shown on screen.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await authenticate(req);
  const db = createServiceClient();

  const access = await authorizeReportAccess({
    userId: user?.id ?? null,
    auditId: id,
    userOwnsAudit: (auditId, userId) =>
      UUID_RE.test(auditId) && user ? userOwnsAudit(user.token, userId, auditId) : Promise.resolve(false),
    store: supabasePaymentStore(db),
    getReportPath: async (auditId) => {
      const { data } = await db.from("audits").select("report_pdf_url,status").eq("id", auditId).maybeSingle();
      return data?.status === "completed" ? (data.report_pdf_url ?? "generated") : null;
    },
  });

  if (!access.ok) {
    const error = { 401: "Sign in required", 402: "Payment required", 404: "Report not found" }[access.status];
    return NextResponse.json({ error }, { status: access.status, headers: NO_STORE });
  }

  const { data: a } = await db
    .from("audits")
    .select("created_at,savings_estimate,free_findings,paid_findings,confidence,confidence_score,validation_warning,estimated_overcharge,overcharge_breakdown,lease_clauses_summary")
    .eq("id", id)
    .eq("owner_id", user!.id)
    .maybeSingle();
  if (!a) return NextResponse.json({ error: "Report not found" }, { status: 404, headers: NO_STORE });

  try {
    const { generateReportPdf } = await import("@/services/report-pdf");
    const pdf = await generateReportPdf({
      auditId: id,
      createdAt: a.created_at ?? new Date().toISOString(),
      savingsEstimate: a.savings_estimate ?? 0,
      freeFindings: a.free_findings ?? [],
      paidFindings: a.paid_findings ?? [],
      isPaid: true,
      confidence: a.confidence ?? undefined,
      confidenceScore: a.confidence_score ?? undefined,
      validationWarning: a.validation_warning,
      estimatedOvercharge: a.estimated_overcharge ?? 0,
      overchargeBreakdown: a.overcharge_breakdown ?? [],
      leaseClausesSummary: a.lease_clauses_summary,
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        ...NO_STORE,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="LeaseGuard-CAM-Audit-${id.slice(0, 8)}.pdf"`,
      },
    });
  } catch (err) {
    console.error(`[report:${id}] PDF generation failed:`, err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Failed to generate the report" }, { status: 500, headers: NO_STORE });
  }
}
