import { NextRequest, NextResponse } from "next/server";

/**
 * Diagnostic endpoint: upload a PDF and see exactly what the extraction
 * pipeline produces — text, fields, classification, confidence.
 *
 * Usage: POST /api/debug-extraction with FormData containing a "file" field.
 * Returns JSON with the full extraction result.
 *
 * This endpoint is for debugging only — it does NOT create an audit.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded. Send a PDF as the 'file' field." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const header = buffer.slice(0, 5).toString("ascii");

    // Import extraction functions
    const { extractTextFromPdf, extractFields } = await import(
      "@/services/document-validator"
    );

    // Step 1: Extract text
    const startText = Date.now();
    const extraction = await extractTextFromPdf(buffer);
    const textMs = Date.now() - startText;

    // Step 2: Extract fields
    const startFields = Date.now();
    const fields = extractFields(extraction.text);
    const fieldsMs = Date.now() - startFields;

    // Step 3: Try AI extraction
    let aiFields = null;
    let aiError: string | null = null;
    try {
      const { extractLeaseFieldsWithAI, extractReconFieldsWithAI } =
        await import("@/services/ai-extraction");

      // Try both — one will return useful data depending on doc type
      const [aiLease, aiRecon] = await Promise.all([
        extractLeaseFieldsWithAI(extraction.text),
        extractReconFieldsWithAI(extraction.text),
      ]);
      aiFields = { lease: aiLease, recon: aiRecon };
    } catch (err) {
      aiError = err instanceof Error ? err.message : String(err);
    }

    // Check if API key is configured
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const hasApiKey = !!apiKey && apiKey.length > 20 && !apiKey.endsWith("...");

    return NextResponse.json({
      file: {
        name: file.name,
        size: file.size,
        type: file.type,
        bufferSize: buffer.length,
        pdfHeader: header,
        isPdf: header.startsWith("%PDF"),
      },
      extraction: {
        method: extraction.method,
        textLength: extraction.text.length,
        wordCount: extraction.text.trim().split(/\s+/).filter(Boolean).length,
        textPreview: extraction.text.substring(0, 2000),
        timingMs: textMs,
      },
      regexFields: {
        camCapPercentage: fields.camCapPercentage,
        adminFeePercentage: fields.adminFeePercentage,
        managementFee: fields.managementFee,
        proRataShare: fields.proRataShare,
        totalCamCharges: fields.totalCamCharges,
        reconciliationTotal: fields.reconciliationTotal,
        reconciliationYear: fields.reconciliationYear,
        priorYearTotal: fields.priorYearTotal,
        tenantPremisesSqFt: fields.tenantPremisesSqFt,
        buildingTotalSqFt: fields.buildingTotalSqFt,
        statedTenantSharePercent: fields.statedTenantSharePercent,
        derivedTotal: fields.derivedTotal,
        excludedTerms: fields.excludedTerms,
        expenseCategories: fields.expenseCategories,
        lineItems: fields.lineItems.slice(0, 20),
        numericValuesCount: fields.numericValues.length,
        timingMs: fieldsMs,
      },
      aiExtraction: {
        hasApiKey,
        apiKeyPrefix: apiKey ? `${apiKey.substring(0, 12)}...` : "NOT SET",
        fields: aiFields,
        error: aiError,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[debug-extraction] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
