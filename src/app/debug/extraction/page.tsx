"use client";

import { useState, useRef } from "react";

interface ExtractorAttempt {
  method: string;
  textLength: number;
  wordCount: number;
  timingMs: number;
  error: string | null;
}

interface ExtractionResult {
  file: {
    name: string;
    size: number;
    bufferSize: number;
    pdfHeader: string;
    isPdf: boolean;
  };
  extraction: {
    method: string;
    textLength: number;
    wordCount: number;
    textPreview: string;
    normalizedTextPreview: string;
    timingMs: number;
    ocrTriggered: boolean;
    ocrTextLength: number;
    ocrError: string | null;
  };
  pipeline: ExtractorAttempt[];
  quality: {
    score: number;
    tier: string;
    extractionQualityScore: number | null;
    extractionQualityTier: string | null;
  };
  classification: {
    detectedType: string;
    leaseKeywordsFound: string[];
    reconKeywordsFound: string[];
    leaseKeywordCount: number;
    reconKeywordCount: number;
  };
  regexFields: {
    camCapPercentage: string | null;
    adminFeePercentage: string | null;
    managementFee: string | null;
    proRataShare: string | null;
    totalCamCharges: string | null;
    reconciliationTotal: string | null;
    reconciliationYear: number | null;
    priorYearTotal: string | null;
    tenantPremisesSqFt: string | null;
    buildingTotalSqFt: string | null;
    statedTenantSharePercent: string | null;
    derivedTotal: boolean;
    excludedTerms: string[];
    expenseCategories: string[];
    lineItems: Array<{ category: string; amount: string; rawLine: string }>;
    numericValuesCount: number;
    fieldsFound: string[];
    fieldsMissed: string[];
    timingMs: number;
  };
  aiExtraction: {
    hasApiKey: boolean;
    apiKeyPrefix: string;
    fields: unknown;
    error: string | null;
  };
  environment?: {
    canvasAvailable: boolean;
    canvasError: string | null;
    nodeVersion: string;
    platform: string;
    arch: string;
  };
  error?: string;
  stack?: string;
}

function QualityBadge({ tier, score }: { tier: string; score: number }) {
  const colors: Record<string, string> = {
    good: "bg-green-100 text-green-800 border-green-300",
    fair: "bg-yellow-100 text-yellow-800 border-yellow-300",
    poor: "bg-red-100 text-red-800 border-red-300",
    empty: "bg-gray-100 text-gray-800 border-gray-300",
  };
  return (
    <span className={`px-2 py-0.5 rounded border text-xs font-bold ${colors[tier] ?? colors.empty}`}>
      {tier.toUpperCase()} ({score}/100)
    </span>
  );
}

export default function DebugExtractionPage() {
  const [results, setResults] = useState<ExtractionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    const newResults: ExtractionResult[] = [];

    for (const file of Array.from(files)) {
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/debug-extraction", {
          method: "POST",
          body: form,
        });
        const data = await res.json();
        newResults.push(data);
      } catch (err) {
        newResults.push({
          error: err instanceof Error ? err.message : "Upload failed",
        } as ExtractionResult);
      }
    }

    setResults(newResults);
    setLoading(false);
  }

  return (
    <div className="max-w-5xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">Extraction Pipeline Debug Tool</h1>
      <p className="text-gray-600 mb-6">
        Upload PDFs to see exactly what each stage of the extraction pipeline produces.
        No audit is created. Shows per-extractor results, quality scoring, document
        classification, and full field extraction diagnostics.
      </p>

      <div className="flex gap-4 items-center mb-8">
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          multiple
          className="border rounded px-3 py-2"
        />
        <button
          onClick={handleUpload}
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded font-medium disabled:opacity-50"
        >
          {loading ? "Extracting..." : "Test Extraction"}
        </button>
      </div>

      {results.map((result, i) => (
        <div key={i} className="mb-8 border rounded-lg p-6 bg-white shadow-sm">
          {result.error && !result.file && (
            <div className="text-red-600">
              <p className="font-bold">Error: {result.error}</p>
              {result.stack && (
                <pre className="mt-2 text-xs whitespace-pre-wrap bg-red-50 p-2 rounded">
                  {result.stack}
                </pre>
              )}
            </div>
          )}

          {result.file && (
            <>
              {/* Header with file name and quality badge */}
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-lg font-bold">
                  {result.file.name} ({(result.file.size / 1024).toFixed(0)} KB)
                </h2>
                {result.quality && (
                  <QualityBadge
                    tier={result.quality.tier}
                    score={result.quality.score}
                  />
                )}
              </div>

              {/* File info */}
              <div className="mb-4 p-3 bg-gray-50 rounded text-sm">
                <strong>File:</strong> {result.file.bufferSize} bytes |
                Header: <code>{result.file.pdfHeader}</code> |
                Valid PDF: {result.file.isPdf ? "Yes" : <span className="text-red-600 font-bold">NO</span>}
              </div>

              {/* Pipeline: per-extractor results */}
              {result.pipeline && result.pipeline.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-bold text-sm mb-2">Extraction Pipeline (all extractors attempted)</h3>
                  <table className="w-full text-sm border-collapse border">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-1 px-3 text-left border">Method</th>
                        <th className="py-1 px-3 text-right border">Chars</th>
                        <th className="py-1 px-3 text-right border">Words</th>
                        <th className="py-1 px-3 text-right border">Time</th>
                        <th className="py-1 px-3 text-left border">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.pipeline.map((attempt, j) => {
                        const isChosen = attempt.method === result.extraction.method ||
                          (attempt.method === "pdfjs-dist" && result.extraction.method === "pdf_text") ||
                          (attempt.method === "pdf-parse" && result.extraction.method === "pdf_text");
                        const isBest = attempt.textLength > 0 && attempt.textLength ===
                          Math.max(...result.pipeline.map((p) => p.textLength));
                        return (
                          <tr key={j} className={isBest ? "bg-green-50" : attempt.error ? "bg-red-50" : ""}>
                            <td className="py-1 px-3 border font-mono">
                              {attempt.method}
                              {isBest && <span className="ml-1 text-green-700 text-xs">(best)</span>}
                            </td>
                            <td className={`py-1 px-3 border text-right font-mono ${attempt.textLength === 0 ? "text-red-600 font-bold" : ""}`}>
                              {attempt.textLength.toLocaleString()}
                            </td>
                            <td className="py-1 px-3 border text-right font-mono">{attempt.wordCount.toLocaleString()}</td>
                            <td className="py-1 px-3 border text-right">{attempt.timingMs}ms</td>
                            <td className="py-1 px-3 border text-red-600 text-xs max-w-xs truncate">
                              {attempt.error ?? "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Winning extraction method */}
              <div className="mb-4 p-3 bg-blue-50 rounded text-sm">
                <strong>Chosen Method:</strong> {result.extraction.method} |
                {result.extraction.textLength.toLocaleString()} chars |
                {result.extraction.wordCount.toLocaleString()} words |
                {result.extraction.timingMs}ms total
              </div>

              {/* OCR Fallback info */}
              {result.extraction.ocrTriggered && (
                <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded text-sm">
                  <strong>OCR Fallback:</strong>{" "}
                  <span className="text-orange-700 font-medium">triggered</span> |{" "}
                  OCR text: <span className="font-mono">{result.extraction.ocrTextLength} chars</span>
                  {result.extraction.ocrError && (
                    <span className="text-red-600"> | Error: {result.extraction.ocrError}</span>
                  )}
                </div>
              )}

              {/* Document Classification */}
              {result.classification && (
                <div className="mb-4 p-3 bg-purple-50 rounded text-sm">
                  <strong>Document Type:</strong>{" "}
                  <span className="font-bold">{result.classification.detectedType}</span> |
                  Lease keywords: {result.classification.leaseKeywordCount} |
                  Recon keywords: {result.classification.reconKeywordCount}
                  {result.classification.leaseKeywordsFound.length > 0 && (
                    <div className="mt-1 text-xs text-gray-600">
                      Lease: {result.classification.leaseKeywordsFound.join(", ")}
                    </div>
                  )}
                  {result.classification.reconKeywordsFound.length > 0 && (
                    <div className="mt-1 text-xs text-gray-600">
                      Recon: {result.classification.reconKeywordsFound.join(", ")}
                    </div>
                  )}
                </div>
              )}

              {/* Extracted fields */}
              <div className="mb-4">
                <h3 className="font-bold text-sm mb-2">
                  Regex-Extracted Fields ({result.regexFields.timingMs}ms)
                  {result.regexFields.fieldsFound && (
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      {result.regexFields.fieldsFound.length} found / {result.regexFields.fieldsMissed.length} missed
                    </span>
                  )}
                </h3>
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    {Object.entries(result.regexFields)
                      .filter(([k]) => !["lineItems", "excludedTerms", "expenseCategories", "timingMs", "numericValuesCount", "fieldsFound", "fieldsMissed"].includes(k))
                      .map(([key, val]) => (
                        <tr key={key} className="border-b">
                          <td className="py-1 pr-4 font-mono text-gray-600">{key}</td>
                          <td className={`py-1 ${val === null ? "text-red-500" : val === false ? "text-gray-400" : "text-green-700 font-medium"}`}>
                            {val === null ? "NULL (not found)" : String(val)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {result.regexFields.fieldsMissed && result.regexFields.fieldsMissed.length > 0 && (
                  <div className="mt-2 text-xs text-red-500">
                    Missed: {result.regexFields.fieldsMissed.join(", ")}
                  </div>
                )}
              </div>

              {/* Line items */}
              {result.regexFields.lineItems.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-bold text-sm mb-2">
                    Line Items ({result.regexFields.lineItems.length})
                  </h3>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="py-1 px-2 text-left">Category</th>
                        <th className="py-1 px-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.regexFields.lineItems.map((li, j) => (
                        <tr key={j} className="border-b">
                          <td className="py-1 px-2">{li.category}</td>
                          <td className="py-1 px-2 text-right font-mono">{li.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Excluded terms and categories */}
              {result.regexFields.excludedTerms.length > 0 && (
                <div className="mb-4 text-sm">
                  <strong>Excluded Terms:</strong> {result.regexFields.excludedTerms.join(", ")}
                </div>
              )}
              {result.regexFields.expenseCategories.length > 0 && (
                <div className="mb-4 text-sm">
                  <strong>Expense Categories:</strong> {result.regexFields.expenseCategories.join(", ")}
                </div>
              )}

              {/* AI Extraction */}
              <div className="mb-4 p-3 bg-yellow-50 rounded text-sm">
                <strong>AI Extraction:</strong>{" "}
                API Key: {result.aiExtraction.hasApiKey ? "Configured" : "NOT SET"} ({result.aiExtraction.apiKeyPrefix})
                {result.aiExtraction.error && (
                  <span className="text-red-600"> | Error: {result.aiExtraction.error}</span>
                )}
                {result.aiExtraction.fields != null && (
                  <pre className="mt-2 text-xs overflow-auto max-h-40">
                    {JSON.stringify(result.aiExtraction.fields as Record<string, unknown>, null, 2)}
                  </pre>
                )}
              </div>

              {/* Environment info */}
              {result.environment && (
                <div className="mb-4 p-3 bg-gray-50 rounded text-sm">
                  <strong>Environment:</strong>{" "}
                  Node {result.environment.nodeVersion} |
                  {result.environment.platform}/{result.environment.arch} |
                  Canvas: {result.environment.canvasAvailable
                    ? <span className="text-green-700">available</span>
                    : <span className="text-red-600">unavailable ({result.environment.canvasError})</span>
                  }
                </div>
              )}

              {/* Raw text preview */}
              <details className="mb-4">
                <summary className="cursor-pointer text-sm font-medium text-gray-600">
                  Extracted Text Preview (first 3000 chars)
                </summary>
                <pre className="mt-2 p-3 bg-gray-50 rounded text-xs whitespace-pre-wrap max-h-96 overflow-auto">
                  {result.extraction.textPreview}
                </pre>
              </details>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
