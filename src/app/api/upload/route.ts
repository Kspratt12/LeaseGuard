import { NextRequest, NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "invoices";

/** Hard timeout for the entire processing pipeline (4 minutes). */
const PROCESSING_TIMEOUT_MS = 4 * 60 * 1000;

/** Per-step timeout (2 minutes). */
const STEP_TIMEOUT_MS = 2 * 60 * 1000;

/** Race a promise against a timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout: ${label} exceeded ${ms / 1000}s`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Extra reconciliation buffers for multi-year comparison. */
interface ExtraRecon {
  buffer: Buffer;
  name: string;
}

/**
 * Background processing: validate, audit, generate PDF, upload report, update DB.
 * Runs after the response has been sent to the client.
 */
async function processAudit(
  auditId: string,
  leaseBuffer: Buffer,
  reconBuffer: Buffer,
  supabase: SupabaseClient,
  docNames?: { leaseDocName?: string; reconDocName?: string },
  extraRecons?: ExtraRecon[],
) {
  try {
    console.log(`[process:${auditId}] Setting status to processing...`);
    await supabase
      .from("audits")
      .update({ status: "processing" })
      .eq("id", auditId);

    // Lazy-load heavy processing modules
    console.log(`[process:${auditId}] Loading processing modules...`);
    const { validateDocuments } = await import("@/services/document-validator");
    const { runAudit } = await import("@/services/audit-logic");
    const { generateReportPdf } = await import("@/services/report-pdf");
    console.log(`[process:${auditId}] Processing modules loaded OK`);

    // Step 1: Validate documents
    console.log(`[process:${auditId}] Validating documents...`);
    const validation = await withTimeout(
      validateDocuments(leaseBuffer, reconBuffer),
      STEP_TIMEOUT_MS,
      "document validation",
    );

    if (validation.issues.length > 0) {
      console.log(
        `[process:${auditId}] Validation issues:`,
        JSON.stringify(validation.issues),
      );
    }
    if (validation.wasSwapped) {
      console.log(`[process:${auditId}] Documents were auto-swapped.`);
    }
    console.log(
      `[process:${auditId}] Confidence: ${validation.confidence} (${validation.confidenceScore}/100), mode: ${validation.auditMode}`,
    );
    console.log(
      `[process:${auditId}] Lease tier: ${validation.leaseClassification.tier}, Recon tier: ${validation.reconClassification.tier}`,
    );
    console.log(
      `[process:${auditId}] Extraction methods — lease: ${validation.leaseExtractionMethod}, recon: ${validation.reconExtractionMethod}`,
    );

    // Key extraction summary
    console.log(
      `[process:${auditId}] Extracted — lease: ${validation.leaseText.length} chars, recon: ${validation.reconText.length} chars`,
    );
    console.log(
      `[process:${auditId}] Lease fields — camCap: ${validation.leaseFields.camCapPercentage ?? "NULL"}, proRata: ${validation.leaseFields.proRataShare ?? "NULL"}, adminFee: ${validation.leaseFields.adminFeePercentage ?? "NULL"}`,
    );
    console.log(
      `[process:${auditId}] Recon fields — totalCam: ${validation.reconFields.totalCamCharges ?? "NULL"}, reconTotal: ${validation.reconFields.reconciliationTotal ?? "NULL"}, lineItems: ${validation.reconFields.lineItems.length}, year: ${validation.reconFields.reconciliationYear ?? "NULL"}`,
    );

    // Step 2: If validation fails, stop
    if (!validation.canProceed) {
      console.log(
        `[process:${auditId}] Validation failed: ${validation.userMessage}`,
      );
      await supabase
        .from("audits")
        .update({
          status: "error",
          error_message: validation.userMessage,
        })
        .eq("id", auditId);
      return;
    }

    // Step 2b: Build multi-year reconciliation data if extra recons provided
    const { extractTextFromPdf, extractFields, normalizeNumber } = await import(
      "@/services/document-validator"
    );
    const { extractReconFieldsWithAI } = await import(
      "@/services/ai-extraction"
    );

    let multiYearReconciliations:
      | Array<{
          year: number;
          total: number;
          lineItems: Array<{ category: string; amount: string; rawLine: string }>;
          docName?: string;
        }>
      | undefined;

    // Include the primary reconciliation in multi-year data
    const primaryReconFields = validation.reconFields;
    const primaryYear = primaryReconFields.reconciliationYear;
    const primaryTotal = primaryReconFields.totalCamCharges
      ? normalizeNumber(primaryReconFields.totalCamCharges)
      : primaryReconFields.reconciliationTotal
        ? normalizeNumber(primaryReconFields.reconciliationTotal)
        : null;

    if (extraRecons && extraRecons.length > 0) {
      console.log(
        `[process:${auditId}] Processing ${extraRecons.length} extra reconciliation(s) for multi-year comparison...`,
      );
      const yearEntries: Array<{
        year: number;
        total: number;
        lineItems: Array<{ category: string; amount: string; rawLine: string }>;
        docName?: string;
      }> = [];

      // Add primary recon if it has year + total
      if (primaryYear != null && primaryTotal != null && primaryTotal > 0) {
        yearEntries.push({
          year: primaryYear,
          total: primaryTotal,
          lineItems: primaryReconFields.lineItems,
          docName: docNames?.reconDocName,
        });
      }

      // Process each extra recon
      for (const extra of extraRecons) {
        try {
          const extraction = await extractTextFromPdf(extra.buffer);
          console.log(`[process:${auditId}] Extra recon "${extra.name}": extracted ${extraction.text.length} chars via ${extraction.method}`);
          console.log(`[process:${auditId}] Extra recon "${extra.name}" text preview: ${extraction.text.substring(0, 200).replace(/[\n\r]+/g, " | ")}`);

          let fields = extractFields(extraction.text);

          // Supplement with AI extraction for extra recons too
          try {
            const aiFields = await extractReconFieldsWithAI(extraction.text);
            if (aiFields) {
              console.log(`[process:${auditId}] Extra recon "${extra.name}" AI extraction successful`);
              // Merge AI fields: AI takes priority for missing regex fields
              fields = {
                ...fields,
                totalCamCharges: (aiFields.totalCamCharges?.replace(/^\$\s*/, "") ?? null) || fields.totalCamCharges,
                reconciliationTotal: (aiFields.reconciliationTotal?.replace(/^\$\s*/, "") ?? null) || fields.reconciliationTotal,
                reconciliationYear: aiFields.reconciliationYear ?? fields.reconciliationYear,
              };
            }
          } catch (aiErr) {
            console.warn(`[process:${auditId}] Extra recon "${extra.name}" AI extraction failed:`, aiErr);
          }

          const yr = fields.reconciliationYear;
          const tot = fields.totalCamCharges
            ? normalizeNumber(fields.totalCamCharges)
            : fields.reconciliationTotal
              ? normalizeNumber(fields.reconciliationTotal)
              : null;

          console.log(`[process:${auditId}] Extra recon "${extra.name}" fields: year=${yr}, totalCam=${fields.totalCamCharges ?? "NULL"}, reconTotal=${fields.reconciliationTotal ?? "NULL"}, lineItems=${fields.lineItems.length}`);

          if (yr != null && tot != null && tot > 0) {
            yearEntries.push({
              year: yr,
              total: tot,
              lineItems: fields.lineItems,
              docName: extra.name,
            });
            console.log(
              `[process:${auditId}] Extra recon "${extra.name}": year=${yr}, total=$${tot.toLocaleString()}, lineItems=${fields.lineItems.length}`,
            );
          } else {
            console.log(
              `[process:${auditId}] Extra recon "${extra.name}": FAILED to extract — year=${yr}, total=${tot}`,
            );
            // Log lines containing "total" or year patterns for diagnosis
            const totalLines = extraction.text
              .split(/[\n\r]+/)
              .filter((line: string) => /total|20\d{2}|reconciliation/i.test(line))
              .map((line: string) => line.trim().substring(0, 120));
            if (totalLines.length > 0) {
              console.log(`[process:${auditId}] Extra recon diagnostic lines: ${JSON.stringify(totalLines.slice(0, 10))}`);
            }
          }
        } catch (err) {
          console.warn(
            `[process:${auditId}] Failed to process extra recon "${extra.name}":`,
            err,
          );
        }
      }

      if (yearEntries.length >= 2) {
        multiYearReconciliations = yearEntries;
        console.log(
          `[process:${auditId}] Multi-year comparison enabled with ${yearEntries.length} years`,
        );
      }
    }

    // Step 3: Run audit
    console.log(`[process:${auditId}] Running audit...`);
    const multiYearUploadedButFailed =
      extraRecons != null &&
      extraRecons.length > 0 &&
      (multiYearReconciliations == null || multiYearReconciliations.length < 2);
    const result = await withTimeout(
      runAudit(validation, {
        leaseDocName: docNames?.leaseDocName,
        reconDocName: docNames?.reconDocName,
        multiYearReconciliations,
        multiYearUploadedButFailed,
      }),
      STEP_TIMEOUT_MS,
      "audit analysis",
    );
    console.log(
      `[process:${auditId}] Audit complete — savings: $${result.savings_estimate}, free: ${result.free_findings.length}, paid: ${result.paid_findings.length}, confidence: ${result.confidence}`,
    );

    // Step 4: Generate PDF report
    console.log(`[process:${auditId}] Generating PDF report...`);
    const pdfBuffer = await withTimeout(
      generateReportPdf({
        auditId,
        createdAt: new Date().toISOString(),
        savingsEstimate: result.savings_estimate,
        freeFindings: result.free_findings,
        paidFindings: result.paid_findings,
        isPaid: false,
        confidence: result.confidence,
        confidenceScore: result.confidenceScore,
        validationWarning: result.validationWarning,
        estimatedOvercharge: result.estimated_overcharge,
        overchargeBreakdown: result.overcharge_breakdown,
        leaseClausesSummary: result.leaseClausesSummary,
      }),
      STEP_TIMEOUT_MS,
      "PDF generation",
    );
    console.log(`[process:${auditId}] PDF report generated (${pdfBuffer.length} bytes)`);

    // Step 5: Upload report
    console.log(`[process:${auditId}] Uploading report to storage...`);
    const reportPath = `${auditId}/report.pdf`;
    const { error: reportUploadErr } = await withTimeout(
      supabase.storage.from(BUCKET).upload(reportPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      }),
      STEP_TIMEOUT_MS,
      "report upload",
    );
    if (reportUploadErr) {
      throw new Error(`Report upload failed: ${reportUploadErr.message}`);
    }
    console.log(`[process:${auditId}] Report uploaded OK`);

    // 17. Final payload stored to DB
    // Step 6: Update audit record with results.
    // Split into core fields (must succeed) and analytics fields (best-effort)
    // so a missing optional column cannot block the audit from completing.
    console.log(`[process:${auditId}] Storing results to DB...`);

    const coreUpdate = {
      status: "completed" as const,
      savings_estimate: result.savings_estimate,
      free_findings: result.free_findings,
      paid_findings: result.paid_findings,
      report_pdf_url: reportPath,
      error_message: null,
      estimated_overcharge: result.estimated_overcharge,
      overcharge_breakdown: result.overcharge_breakdown,
    };

    const { error: coreErr } = await supabase
      .from("audits")
      .update(coreUpdate)
      .eq("id", auditId);

    if (coreErr) {
      console.error(`[process:${auditId}] Core update failed:`, coreErr.message);
      throw new Error(`Core DB update failed: ${coreErr.message}`);
    }
    console.log(`[process:${auditId}] Core fields written OK`);

    // Analytics / metadata fields — best-effort (missing columns won't block audit)
    const analyticsUpdate = {
      confidence: result.confidence,
      confidence_score: result.confidenceScore,
      validation_warning: result.validationWarning,
      was_swapped: result.wasSwapped,
      audit_mode: result.auditMode,
      lease_extraction_method: result.leaseExtractionMethod,
      recon_extraction_method: result.reconExtractionMethod,
      lease_clauses_summary: result.leaseClausesSummary,
    };

    const { error: analyticsErr } = await supabase
      .from("audits")
      .update(analyticsUpdate)
      .eq("id", auditId);

    if (analyticsErr) {
      console.warn(
        `[process:${auditId}] Analytics update failed (non-fatal):`,
        analyticsErr.message,
      );
    } else {
      console.log(`[process:${auditId}] Analytics fields written OK`);
    }

    console.log(`[process:${auditId}] ✓ Audit record updated — status: completed`);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown processing error";
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(`[process:${auditId}] Processing error:`, message);
    if (stack) console.error(`[process:${auditId}] Stack trace:`, stack);

    try {
      await supabase
        .from("audits")
        .update({
          status: "error",
          error_message: message,
        })
        .eq("id", auditId);
      console.log(`[process:${auditId}] Audit record updated — status: error`);
    } catch (dbErr) {
      console.error(`[process:${auditId}] CRITICAL: Failed to set error status:`, dbErr);
    }
  }
}

export async function POST(req: NextRequest) {
  let auditId: string | undefined;

  try {
    // --- Parse form data ---
    console.log("[upload] Parsing form data...");
    let form: FormData;
    try {
      form = await req.formData();
    } catch (formErr) {
      console.error("[upload] Failed to parse form data:", formErr);
      return NextResponse.json(
        { success: false, error: "Invalid form data. Please upload valid PDF files." },
        { status: 400 },
      );
    }
    console.log("[upload] Form data parsed OK");

    const lease = form.get("lease") as File | null;
    const recon = form.get("recon") as File | null;

    if (!lease || !recon) {
      return NextResponse.json(
        { success: false, error: "Both lease and reconciliation PDFs are required." },
        { status: 400 },
      );
    }

    if (lease.type !== "application/pdf" || recon.type !== "application/pdf") {
      return NextResponse.json(
        { success: false, error: "Only PDF files are accepted." },
        { status: 400 },
      );
    }

    // --- Collect extra reconciliation files for multi-year comparison ---
    const extraReconFiles: ExtraRecon[] = [];
    const extraReconEntries = form.getAll("extraRecons");
    for (const entry of extraReconEntries) {
      if (entry instanceof File && entry.type === "application/pdf") {
        extraReconFiles.push({
          buffer: Buffer.from(await entry.arrayBuffer()),
          name: entry.name,
        });
      }
    }
    if (extraReconFiles.length > 0) {
      console.log(`[upload] ${extraReconFiles.length} extra reconciliation file(s) detected for multi-year comparison`);
    }

    // --- Read file buffers ---
    console.log("[upload] Reading file buffers...");
    const leaseBuffer = Buffer.from(await lease.arrayBuffer());
    const reconBuffer = Buffer.from(await recon.arrayBuffer());
    console.log(
      `[upload] Buffers ready — lease: ${leaseBuffer.length} bytes, recon: ${reconBuffer.length} bytes`,
    );

    const supabase = createServiceClient();
    auditId = randomUUID();

    // --- Upload lease PDF ---
    console.log(`[upload:${auditId}] Uploading lease to storage...`);
    const leasePath = `${auditId}/lease.pdf`;
    const { error: leaseErr } = await supabase.storage
      .from(BUCKET)
      .upload(leasePath, leaseBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (leaseErr) {
      console.error(`[upload:${auditId}] Lease storage upload failed:`, leaseErr.message);
      return NextResponse.json(
        { success: false, error: "Lease file upload failed. Please try again." },
        { status: 500 },
      );
    }
    console.log(`[upload:${auditId}] Lease uploaded OK`);

    // --- Upload recon PDF ---
    console.log(`[upload:${auditId}] Uploading recon to storage...`);
    const reconPath = `${auditId}/recon.pdf`;
    const { error: reconErr } = await supabase.storage
      .from(BUCKET)
      .upload(reconPath, reconBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (reconErr) {
      console.error(`[upload:${auditId}] Recon storage upload failed:`, reconErr.message);
      return NextResponse.json(
        { success: false, error: "Reconciliation file upload failed. Please try again." },
        { status: 500 },
      );
    }
    console.log(`[upload:${auditId}] Recon uploaded OK`);

    // --- Build public URLs ---
    const { data: leaseUrlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(leasePath);
    const { data: reconUrlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(reconPath);

    // --- Create audit row ---
    console.log(`[upload:${auditId}] Inserting audit row...`);
    const { error: dbErr } = await supabase.from("audits").insert({
      id: auditId,
      lease_url: leaseUrlData.publicUrl,
      recon_url: reconUrlData.publicUrl,
      status: "pending",
      // Explicitly null so DB defaults (e.g. []) don't make the client
      // think processing already completed before it even started.
      free_findings: null,
      paid_findings: null,
      savings_estimate: null,
      estimated_overcharge: null,
      overcharge_breakdown: null,
    });

    if (dbErr) {
      console.error(`[upload:${auditId}] Database insert failed:`, dbErr.message);
      return NextResponse.json(
        { success: false, error: "Failed to create audit record. Please try again." },
        { status: 500 },
      );
    }
    console.log(`[upload:${auditId}] Audit row created OK`);

    // --- Return immediately, process in background ---
    // The client will poll GET /api/audit/[id] to track progress.
    console.log(`[upload:${auditId}] Returning response, starting background processing...`);

    // Use after() to keep the serverless function alive until processing
    // completes. Without this, Vercel may terminate the function after
    // the response is sent, leaving the audit stuck in "processing".
    const capturedAuditId = auditId;
    const capturedLeaseDocName = lease.name;
    const capturedReconDocName = recon.name;
    const capturedExtraRecons = extraReconFiles.length > 0 ? extraReconFiles : undefined;

    after(async () => {
      try {
        await withTimeout(
          processAudit(
            capturedAuditId,
            leaseBuffer,
            reconBuffer,
            supabase,
            { leaseDocName: capturedLeaseDocName, reconDocName: capturedReconDocName },
            capturedExtraRecons,
          ),
          PROCESSING_TIMEOUT_MS,
          "overall processing",
        );
      } catch (err) {
        // Safety net: if the overall timeout fires and processAudit's own
        // catch didn't run, force the row to error.
        console.error(`[process:${capturedAuditId}] Overall timeout/error:`, err);
        try {
          await supabase
            .from("audits")
            .update({
              status: "error",
              error_message: err instanceof Error ? err.message : "Processing timed out",
            })
            .eq("id", capturedAuditId);
        } catch { /* best-effort */ }
      }
    });

    return NextResponse.json({ success: true, id: capturedAuditId });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : String(err);
    const stack =
      err instanceof Error ? err.stack : undefined;
    console.error("[upload] Unhandled route error:", message);
    if (stack) console.error("[upload] Stack trace:", stack);

    return NextResponse.json(
      { success: false, error: "Something went wrong processing your documents. Please try again." },
      { status: 500 },
    );
  }
}
