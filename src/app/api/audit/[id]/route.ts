import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// Prevent Next.js from caching this route
export const dynamic = "force-dynamic";

/** Retry a Supabase query with short backoff to handle replication lag. */
async function fetchAuditWithRetry(
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
  maxAttempts = 3,
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { data: audit, error } = await supabase
      .from("audits")
      .select("*")
      .eq("id", id)
      .single();

    if (audit) return { audit, error: null };

    // On last attempt, return the error
    if (attempt === maxAttempts) {
      return { audit: null, error };
    }

    // Brief backoff before retry (200ms, 500ms)
    const backoff = attempt * 250;
    console.warn(
      `[audit/${id}] Attempt ${attempt}/${maxAttempts} returned no row (code=${error?.code}), retrying in ${backoff}ms...`,
    );
    await new Promise((r) => setTimeout(r, backoff));
  }
  return { audit: null, error: new Error("Exhausted retries") as unknown };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  console.log(`[audit/${id}] GET request received`);

  const supabase = createServiceClient();

  const { audit, error } = await fetchAuditWithRetry(supabase, id);

  if (error) {
    console.error(`[audit/${id}] Supabase error after retries: ${JSON.stringify(error)}`);
  }

  if (error || !audit) {
    console.log(`[audit/${id}] Not found after retries — error=${!!error}, audit=${!!audit}`);
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  const findingsCount = Array.isArray(audit.free_findings) ? audit.free_findings.length : 0;
  const paidCount = Array.isArray(audit.paid_findings) ? audit.paid_findings.length : 0;
  const findingsFieldType = audit.free_findings === null ? "null" : Array.isArray(audit.free_findings) ? `array[${audit.free_findings.length}]` : typeof audit.free_findings;
  const paidFieldType = audit.paid_findings === null ? "null" : Array.isArray(audit.paid_findings) ? `array[${audit.paid_findings.length}]` : typeof audit.paid_findings;
  console.log(
    `[audit/${id}] Found — status=${audit.status}, free=${findingsFieldType}, paid=${paidFieldType}, savings=${audit.savings_estimate ?? "null"}, overcharge=${audit.estimated_overcharge ?? "null"}, report=${audit.report_pdf_url ? "yes" : "no"}, error=${audit.error_message ?? "none"}`,
  );

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
