import { NextRequest, NextResponse } from "next/server";

/**
 * Diagnostic endpoint: upload a PDF and see exactly what the extraction
 * pipeline produces — text, fields, classification, confidence, quality score,
 * and per-extractor attempt details.
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
    const { extractTextFromPdf, extractFields, scoreExtractionQuality } =
      await import("@/services/document-validator");

    // Import OCR status
    let canvasStatus = { available: false, error: "not checked" as string | null };
    try {
      const { getCanvasStatus } = await import("@/services/ocr-extractor");
      canvasStatus = getCanvasStatus();
    } catch (err) {
      canvasStatus = { available: false, error: err instanceof Error ? err.message : String(err) };
    }

    // Step 1: Extract text (includes all pipeline stages)
    const startText = Date.now();
    const extraction = await extractTextFromPdf(buffer);
    const textMs = Date.now() - startText;

    // Step 2: Extract fields
    const startFields = Date.now();
    const fields = extractFields(extraction.text);
    const fieldsMs = Date.now() - startFields;

    // Step 3: Document classification
    const lower = extraction.text.toLowerCase();
    const leaseKeywordsFound: string[] = [];
    const reconKeywordsFound: string[] = [];
    const leaseKws = [
      "lease agreement", "tenant", "landlord", "base rent", "cam cap",
      "operating expenses", "premises", "lessee", "lessor", "pro rata",
      "common area maintenance", "security deposit", "triple net",
      "demised premises", "rentable area", "excluded expenses",
      "controllable expenses", "proportionate share",
    ];
    const reconKws = [
      "cam reconciliation", "operating expenses", "expense summary",
      "annual reconciliation", "management fee", "actual expenses",
      "reconciliation statement", "total charges", "insurance",
      "property tax", "budget vs actual", "tenant's share",
      "amount due", "true-up", "prior year", "building expenses",
    ];
    for (const kw of leaseKws) {
      if (lower.includes(kw)) leaseKeywordsFound.push(kw);
    }
    for (const kw of reconKws) {
      if (lower.includes(kw)) reconKeywordsFound.push(kw);
    }

    const docType = leaseKeywordsFound.length >= reconKeywordsFound.length
      ? (leaseKeywordsFound.length > 0 ? "lease" : "unknown")
      : "reconciliation";

    // Step 4: Try AI extraction
    let aiFields = null;
    let aiError: string | null = null;
    try {
      const { extractLeaseFieldsWithAI, extractReconFieldsWithAI } =
        await import("@/services/ai-extraction");

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

    // Quality scoring
    const quality = scoreExtractionQuality(extraction.text);

    // Count regex fields found vs missed
    const regexFieldNames = [
      "camCapPercentage", "adminFeePercentage", "managementFee",
      "proRataShare", "totalCamCharges", "reconciliationTotal",
      "reconciliationYear", "priorYearTotal", "tenantPremisesSqFt",
      "buildingTotalSqFt", "statedTenantSharePercent",
    ] as const;
    const fieldsFound = regexFieldNames.filter(
      (k) => fields[k] !== null && fields[k] !== undefined,
    );
    const fieldsMissed = regexFieldNames.filter(
      (k) => fields[k] === null || fields[k] === undefined,
    );

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
        textPreview: extraction.text.substring(0, 3000),
        normalizedTextPreview: extraction.text.substring(0, 1000),
        timingMs: textMs,
        ocrTriggered: extraction.ocrTriggered,
        ocrTextLength: extraction.ocrTextLength,
        ocrError: extraction.ocrError,
      },
      pipeline: extraction.pipeline ?? [],
      quality: {
        score: quality.score,
        tier: quality.tier,
        extractionQualityScore: extraction.qualityScore ?? null,
        extractionQualityTier: extraction.qualityTier ?? null,
      },
      classification: {
        detectedType: docType,
        leaseKeywordsFound,
        reconKeywordsFound,
        leaseKeywordCount: leaseKeywordsFound.length,
        reconKeywordCount: reconKeywordsFound.length,
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
        lineItems: fields.lineItems.slice(0, 30),
        numericValuesCount: fields.numericValues.length,
        fieldsFound: fieldsFound as unknown as string[],
        fieldsMissed: fieldsMissed as unknown as string[],
        timingMs: fieldsMs,
      },
      aiExtraction: {
        hasApiKey,
        apiKeyPrefix: apiKey ? `${apiKey.substring(0, 12)}...` : "NOT SET",
        fields: aiFields,
        error: aiError,
      },
      environment: {
        canvasAvailable: canvasStatus.available,
        canvasError: canvasStatus.error,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack?.split("\n").slice(0, 5).join("\n") : undefined;
    console.error("[debug-extraction] Error:", message);
    return NextResponse.json({ error: message, stack }, { status: 500 });
  }
}
