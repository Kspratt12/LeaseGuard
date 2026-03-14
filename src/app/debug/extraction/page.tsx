"use client";

import { useState, useRef } from "react";

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
    timingMs: number;
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
    timingMs: number;
  };
  aiExtraction: {
    hasApiKey: boolean;
    apiKeyPrefix: string;
    fields: unknown;
    error: string | null;
  };
  error?: string;
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
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">Extraction Debug Tool</h1>
      <p className="text-gray-600 mb-6">
        Upload PDFs to see exactly what the extraction pipeline produces.
        No audit is created.
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
            <p className="text-red-600">Error: {result.error}</p>
          )}

          {result.file && (
            <>
              <h2 className="text-lg font-bold mb-4">
                {result.file.name} ({(result.file.size / 1024).toFixed(0)} KB)
              </h2>

              {/* File info */}
              <div className="mb-4 p-3 bg-gray-50 rounded text-sm">
                <strong>File:</strong> {result.file.bufferSize} bytes |
                Header: {result.file.pdfHeader} |
                Valid PDF: {result.file.isPdf ? "Yes" : "NO"}
              </div>

              {/* Extraction method */}
              <div className="mb-4 p-3 bg-blue-50 rounded text-sm">
                <strong>Text Extraction:</strong> {result.extraction.method} |
                {result.extraction.textLength} chars |
                {result.extraction.wordCount} words |
                {result.extraction.timingMs}ms
              </div>

              {/* Extracted fields */}
              <div className="mb-4">
                <h3 className="font-bold text-sm mb-2">Regex-Extracted Fields ({result.regexFields.timingMs}ms)</h3>
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    {Object.entries(result.regexFields)
                      .filter(([k]) => !["lineItems", "excludedTerms", "expenseCategories", "timingMs", "numericValuesCount"].includes(k))
                      .map(([key, val]) => (
                        <tr key={key} className="border-b">
                          <td className="py-1 pr-4 font-mono text-gray-600">{key}</td>
                          <td className={`py-1 ${val === null ? "text-red-500" : "text-green-700 font-medium"}`}>
                            {val === null ? "NULL (not found)" : String(val)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
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

              {/* Raw text preview */}
              <details className="mb-4">
                <summary className="cursor-pointer text-sm font-medium text-gray-600">
                  Raw Extracted Text (first 2000 chars)
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
