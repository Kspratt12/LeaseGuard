import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// Prevent Next.js from caching this route
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  console.log(`[audit/${id}] GET request received`);

  const supabase = createServiceClient();

  const { data: audit, error } = await supabase
    .from("audits")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error(`[audit/${id}] Supabase error: code=${error.code} message=${error.message} details=${error.details}`);
  }

  if (error || !audit) {
    console.log(`[audit/${id}] Not found — error=${!!error}, audit=${!!audit}`);
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  const findingsCount = Array.isArray(audit.free_findings) ? audit.free_findings.length : 0;
  const paidCount = Array.isArray(audit.paid_findings) ? audit.paid_findings.length : 0;
  console.log(`[audit/${id}] Found — status=${audit.status}, free=${findingsCount}, paid=${paidCount}, savings=${audit.savings_estimate ?? "null"}`);

  // Auto-heal: if the audit has result data but status is still "processing",
  // the background job completed but the status update was lost (e.g. serverless
  // function terminated). Fix the status in-place and persist it.
  // IMPORTANT: Only treat non-empty findings as evidence of completion.
  // An empty array [] may be a DB column default, not actual results.
  if (
    audit.status === "processing" &&
    Array.isArray(audit.free_findings) &&
    audit.free_findings.length > 0
  ) {
    console.warn(
      `[audit/${id}] Auto-healing stuck audit: has findings but status was "processing" — setting to "completed"`,
    );
    audit.status = "completed";
    // Persist the fix so future polls don't need to heal again
    supabase
      .from("audits")
      .update({ status: "completed" })
      .eq("id", id)
      .then(({ error: healErr }) => {
        if (healErr) {
          console.error(`[audit/${id}] Auto-heal DB update failed:`, healErr.message);
        } else {
          console.log(`[audit/${id}] Auto-heal persisted OK`);
        }
      });
  }

  return NextResponse.json(audit, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
