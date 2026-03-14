/**
 * Document validation and intelligence layer.
 *
 * Runs BEFORE the audit to verify uploaded PDFs contain
 * valid lease and CAM reconciliation data.
 *
 * Three-tier classification:
 *   HIGH_CONFIDENCE  → full audit
 *   LIKELY_MATCH     → limited audit (only checks with extracted data)
 *   UNKNOWN          → rejected
 */

import pdfParse from "pdf-parse";
import {
  extractTextWithOcr,
  OCR_TEXT_THRESHOLD,
  type ExtractionMethod,
  type ExtractionResult,
} from "@/services/ocr-extractor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DocumentType = "lease" | "reconciliation" | "unknown";
export type ConfidenceLevel = "high" | "medium" | "low";
export type ClassificationTier = "high_confidence" | "likely_match" | "unknown";
export type AuditMode = "full" | "limited" | "rejected";
export type { ExtractionMethod } from "@/services/ocr-extractor";

export interface DocumentClassification {
  type: DocumentType;
  confidence: number; // 0–1
  tier: ClassificationTier;
  matchedKeywords: string[];
}

export interface LineItem {
  category: string;
  amount: string;
  rawLine: string;
}

export interface ExtractedFields {
  camCapPercentage: string | null;
  adminFeePercentage: string | null;
  managementFee: string | null;
  expenseCategories: string[];
  totalCamCharges: string | null;
  reconciliationTotal: string | null;
  proRataShare: string | null;
  baseRent: string | null;
  numericValues: string[];
  excludedTerms: string[];
  lineItems: LineItem[];
  tenantPremisesSqFt: string | null;
  buildingTotalSqFt: string | null;
  statedTenantSharePercent: string | null;
  /** True when reconciliationTotal was calculated by summing line items. */
  derivedTotal: boolean;
  /** Prior-year CAM / operating expense total if detected in reconciliation. */
  priorYearTotal: string | null;
  /** Reconciliation year detected from document text (e.g. 2024). */
  reconciliationYear: number | null;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface DocumentValidationResult {
  leaseClassification: DocumentClassification;
  reconClassification: DocumentClassification;
  leaseText: string;
  reconText: string;
  leaseFields: ExtractedFields;
  reconFields: ExtractedFields;
  wasSwapped: boolean;
  leaseExtractionMethod: ExtractionMethod;
  reconExtractionMethod: ExtractionMethod;
  issues: ValidationIssue[];
  confidence: ConfidenceLevel;
  confidenceScore: number; // 0–100
  canProceed: boolean;
  auditMode: AuditMode;
  userMessage: string | null;
}

// ---------------------------------------------------------------------------
// Keyword dictionaries
// ---------------------------------------------------------------------------

const LEASE_KEYWORDS = [
  "lease agreement",
  "tenant",
  "landlord",
  "base rent",
  "cam cap",
  "operating expenses",
  "section",
  "term",
  "premises",
  "lessee",
  "lessor",
  "rentable square",
  "pro rata",
  "lease commencement",
  "renewal option",
  "common area maintenance",
  "permitted use",
  "security deposit",
  "triple net",
  "nnn",
  "leasehold",
  "demised premises",
  "rent commencement",
  "gross lease",
  "net lease",
];

const RECON_KEYWORDS = [
  "common area maintenance",
  "cam reconciliation",
  "operating expenses",
  "expense summary",
  "annual reconciliation",
  "management fee",
  "admin fee",
  "actual expenses",
  "estimated expenses",
  "year-end",
  "year end",
  "reconciliation statement",
  "expense category",
  "total charges",
  "insurance",
  "property tax",
  "utilities",
  "janitorial",
  "repairs and maintenance",
  "operating cost",
  "budget vs actual",
  "variance",
  "pass-through",
  "pass through",
  "billable expenses",
];

// Expanded expense category list
const EXPENSE_CATEGORIES = [
  "tax",
  "taxes",
  "property tax",
  "insurance",
  "maintenance",
  "repairs",
  "repairs and maintenance",
  "landscaping",
  "security",
  "utilities",
  "management fee",
  "admin fee",
  "administrative fee",
  "legal",
  "capital improvement",
  "roof repair",
  "structural repair",
  "janitorial",
  "snow removal",
  "trash removal",
  "elevator",
  "hvac",
  "parking",
  "cleaning",
  "common area",
  "water",
  "electric",
  "gas",
  "sewer",
  "fire protection",
  "pest control",
  "window cleaning",
];

// Lease exclusion terms (capital / non-pass-through items)
const EXCLUSION_TERMS = [
  "capital improvement",
  "capital expenditure",
  "capital expense",
  "capital cost",
  "capital replacement",
  "capital repair",
  "structural repair",
  "structural maintenance",
  "structural defect",
  "roof replacement",
  "roof repair",
  "foundation",
  "depreciation",
  "amortization",
  "ground lease",
  "ground rent",
  "leasing commission",
  "brokerage commission",
  "tenant improvement",
  "tenant buildout",
  "tenant allowance",
  "condemnation",
  "environmental remediation",
  "hazardous material",
  "asbestos",
  "mold remediation",
  "legal fee",
  "litigation",
  "mortgage",
  "debt service",
  "interest expense",
  "above-standard",
  "above standard",
];

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

export async function extractTextFromPdf(
  buffer: Buffer,
): Promise<ExtractionResult> {
  // Step 1: Try standard pdf-parse text extraction
  let pdfText = "";
  try {
    const result = await pdfParse(buffer);
    pdfText = result.text ?? "";
  } catch (err) {
    console.warn("[pdf-parse] Failed to extract text:", err instanceof Error ? err.message : err);
    pdfText = "";
  }

  // Step 2: If extracted text is below threshold, fall back to OCR
  if (pdfText.trim().length < OCR_TEXT_THRESHOLD) {
    console.log(
      `[ocr-fallback] pdf-parse returned ${pdfText.trim().length} chars (< ${OCR_TEXT_THRESHOLD}), attempting OCR...`,
    );
    const ocrText = await extractTextWithOcr(buffer);
    if (ocrText.trim().length > pdfText.trim().length) {
      console.log(
        `[ocr-fallback] OCR recovered ${ocrText.trim().length} chars`,
      );
      return { text: ocrText, method: "ocr" };
    }
  }

  return { text: pdfText, method: "pdf_text" };
}

// ---------------------------------------------------------------------------
// Numeric normalization
// ---------------------------------------------------------------------------

/**
 * Detect all financial numbers in text, including formats like:
 *   8.5%   8.5 %   $48,000   48000   48,000.00   $1,234.56
 */
function detectNumericValues(text: string): string[] {
  const patterns = [
    /\$[\d,]+(?:\.\d{1,2})?/g,              // $48,000 or $48,000.00
    /\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?/g,    // 48,000 or 48,000.00
    /\d+(?:\.\d+)?\s*%/g,                    // 8.5% or 8.5 %
    /(?<!\w)\d{4,}(?:\.\d{1,2})?(?!\w)/g,    // bare numbers like 48000
  ];

  const seen = new Set<string>();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      seen.add(match[0].trim());
    }
  }
  return [...seen];
}

/**
 * Normalize a captured numeric string to a plain number.
 *   "$48,000.00" → 48000   "8.5 %" → 8.5   "48,000" → 48000
 */
export function normalizeNumber(raw: string): number {
  const cleaned = raw.replace(/[$,%\s]/g, "");
  return parseFloat(cleaned);
}

// ---------------------------------------------------------------------------
// Document classification (three-tier)
// ---------------------------------------------------------------------------

function classifyDocument(text: string): {
  lease: DocumentClassification;
  recon: DocumentClassification;
} {
  const lower = text.toLowerCase();

  const leaseMatches = LEASE_KEYWORDS.filter((kw) => lower.includes(kw));
  const reconMatches = RECON_KEYWORDS.filter((kw) => lower.includes(kw));

  const leaseScore =
    LEASE_KEYWORDS.length > 0 ? leaseMatches.length / LEASE_KEYWORDS.length : 0;
  const reconScore =
    RECON_KEYWORDS.length > 0 ? reconMatches.length / RECON_KEYWORDS.length : 0;

  return {
    lease: {
      type: "lease",
      confidence: leaseScore,
      tier: scoreTier(leaseScore),
      matchedKeywords: leaseMatches,
    },
    recon: {
      type: "reconciliation",
      confidence: reconScore,
      tier: scoreTier(reconScore),
      matchedKeywords: reconMatches,
    },
  };
}

function scoreTier(score: number): ClassificationTier {
  if (score >= 0.15) return "high_confidence";
  if (score >= 0.05) return "likely_match";
  return "unknown";
}

function detectDocumentType(text: string): DocumentClassification {
  const { lease, recon } = classifyDocument(text);

  // Check the relaxed fallback: ≥2 financial numbers + ≥1 keyword from either list
  const numericCount = detectNumericValues(text).length;
  const anyKeywords = lease.matchedKeywords.length + recon.matchedKeywords.length;

  if (lease.tier === "unknown" && recon.tier === "unknown") {
    // Relaxed rule: if at least 2 numbers and 1 keyword, treat as likely_match
    if (numericCount >= 2 && anyKeywords >= 1) {
      // Assign to whichever scored higher, even if both are very low
      if (lease.confidence >= recon.confidence) {
        return { ...lease, tier: "likely_match" };
      }
      return { ...recon, tier: "likely_match" };
    }
    return { type: "unknown", confidence: 0, tier: "unknown", matchedKeywords: [] };
  }

  if (lease.confidence >= recon.confidence) {
    return lease;
  }
  return recon;
}

// ---------------------------------------------------------------------------
// Field extraction (regex-based, improved numeric tolerance)
// ---------------------------------------------------------------------------

export function extractFields(text: string): ExtractedFields {
  // -----------------------------------------------------------------
  // CAM Cap — many phrasing variations
  // -----------------------------------------------------------------
  const camCapPatterns = [
    // "CAM cap: 5%", "CAM Cap of 5%"
    /(?:cam\s*cap|cap\s*(?:on|of)\s*(?:cam|common\s*area))[\s:]*(\d+(?:\.\d+)?)\s*%/i,
    // "annual cap: 5%", "annual increase cap 5%", "yearly cap of 5%"
    /(?:annual|yearly)\s*(?:increase\s*)?cap[\s:]*(?:of\s*)?(\d+(?:\.\d+)?)\s*%/i,
    // "shall not exceed a 5% annual increase" (with optional article before number)
    /(?:shall\s*not\s*exceed|not\s*to\s*exceed)\s+(?:a\s+)?(\d+(?:\.\d+)?)\s*%\s*(?:annual|per\s*(?:annum|year)|yearly|(?:annual\s*)?increase|per\s*calendar\s*year)/i,
    // "capped at 5%", "limited to 5%" (only when near expense/cost/cap/increase context)
    /(?:(?:is|are)\s*capped\s*at|limited\s*to)\s+(?:a\s+)?(\d+(?:\.\d+)?)\s*%\s*(?:per\s*(?:annum|year)|annually|per\s*calendar\s*year|increase|annual)?/i,
    // "increase by no more than 5%", "increases shall not exceed 5%"
    /increas(?:e|es)\s*(?:shall\s*)?(?:by\s*)?no\s*more\s*than\s*(\d+(?:\.\d+)?)\s*%/i,
    // "shall not increase more than 10%", "shall not increase by more than 10%"
    /shall\s*not\s*increas(?:e|es?)\s*(?:by\s*)?more\s*than\s*(\d+(?:\.\d+)?)\s*%/i,
    // "increases ... limited to no more than 4%"
    /increas(?:e|es)\s*(?:in\s*)?(?:controllable\s*)?(?:operating\s*)?(?:costs?\s*|expenses?\s*)?(?:are\s*)?(?:limited|capped|restricted)\s*to\s*(?:no\s*more\s*than\s*)?(\d+(?:\.\d+)?)\s*%/i,
    // "maximum annual increase of 5%", "maximum increase: 5%"
    /maximum\s*(?:annual\s*)?increase[\s:]*(?:of\s*)?(\d+(?:\.\d+)?)\s*%/i,
    // "controllable expense cap 5%", "controllable expenses shall not exceed 5%"
    /controllable\s*(?:expense|cost)s?\s*(?:cap|shall\s*not\s*exceed|not\s*to\s*exceed|limited\s*to|capped\s*at)[\s:]*(?:a\s+)?(\d+(?:\.\d+)?)\s*%/i,
    // "operating expense cap: 5%"
    /operating\s*(?:expense|cost)s?\s*(?:cap|shall\s*not\s*exceed)[\s:]*(?:a\s+)?(\d+(?:\.\d+)?)\s*%/i,
    // "cap of 5% on controllable expenses"
    /cap\s*of\s*(\d+(?:\.\d+)?)\s*%\s*on\s*(?:controllable|operating)/i,
    // "cumulative cap" or "compounding cap" with percentage
    /(?:cumulative|compound(?:ing|ed)?)\s*cap[\s:]*(?:of\s*)?(\d+(?:\.\d+)?)\s*%/i,
  ];
  let camCapPercentage: string | null = null;
  for (const pat of camCapPatterns) {
    const m = text.match(pat);
    if (m) { camCapPercentage = m[1]; break; }
  }

  // -----------------------------------------------------------------
  // Admin / Management Fee — many phrasing variations
  // -----------------------------------------------------------------
  const adminFeePatterns = [
    // "Admin Fee Cap: 12%", "Administrative Fee Cap: 12%", "Admin Fee Limit: 12%"
    /(?:admin(?:istrative|istration)?\s*fee\s*(?:cap|limit|maximum))[\s:]*(\d+(?:\.\d+)?)\s*%/i,
    // "Administrative Fee: 12%", "Admin Fee: 12%"
    /(?:admin(?:istrative|istration)?\s*fee)[\s:]*(\d+(?:\.\d+)?)\s*%/i,
    // "administrative fee of 12%", "admin fee shall not exceed 12%"
    /(?:admin(?:istrative|istration)?\s*(?:fee|charge|cost))\s*(?:of|equal\s*to|at|not\s*to\s*exceed|shall\s*not\s*exceed)\s*(\d+(?:\.\d+)?)\s*%/i,
    // "admin fee not to exceed 12%", "admin fee capped at 12%"
    /(?:admin(?:istrative|istration)?\s*fee)\s*(?:not\s*to\s*exceed|shall\s*not\s*exceed|capped\s*at|limited\s*to)\s*(\d+(?:\.\d+)?)\s*%/i,
    // "12% administrative fee"
    /(\d+(?:\.\d+)?)\s*%\s*(?:admin(?:istrative|istration)?\s*(?:fee|charge))/i,
  ];
  let adminFeePercentage: string | null = null;
  for (const pat of adminFeePatterns) {
    const m = text.match(pat);
    if (m) { adminFeePercentage = m[1]; break; }
  }

  const mgmtFeePatterns = [
    // "Management Fee Cap: 10%", "Management Fee Limit: 10%", "Management Fee Maximum: 10%"
    /(?:(?:property\s*)?management\s*fee\s*(?:cap|limit|maximum))[\s:]*(\d+(?:\.\d+)?)\s*%/i,
    // "management fee: 15%", "management fee 15%"
    /(?:management\s*fee)[\s:]*(\d+(?:\.\d+)?)\s*%/i,
    // "Management Fee (18%)" — parenthetical
    /(?:management\s*fee)\s*\(\s*(\d+(?:\.\d+)?)\s*%\s*\)/i,
    // "management fee of 15%", "not to exceed 15%"
    /(?:management\s*(?:fee|charge|cost))\s*(?:of|equal\s*to|at|not\s*to\s*exceed|shall\s*not\s*exceed|capped\s*at)\s*(\d+(?:\.\d+)?)\s*%/i,
    // "15% management fee"
    /(\d+(?:\.\d+)?)\s*%\s*(?:management\s*(?:fee|charge))/i,
    // "property management: 15%", "Property Management (14%)"
    /(?:property\s*management)\s*[\s:(]*(\d+(?:\.\d+)?)\s*%/i,
    // "Property Management Fee Limit: 8%", "Property Management Fee Cap: 8%"
    /(?:property\s*management\s*fee\s*(?:cap|limit|maximum))[\s:]*(\d+(?:\.\d+)?)\s*%/i,
    // "manager's fee: 15%", "manager's fee shall not exceed 12%"
    /(?:manager(?:'s|s)?\s*(?:fee|compensation))\s*(?:shall\s*not\s*exceed\s*|not\s*to\s*exceed\s*|[\s:]*)?(\d+(?:\.\d+)?)\s*%/i,
  ];
  let managementFee: string | null = null;
  for (const pat of mgmtFeePatterns) {
    const m = text.match(pat);
    if (m) { managementFee = m[1]; break; }
  }

  // -----------------------------------------------------------------
  // Pro-Rata Share
  // -----------------------------------------------------------------
  const proRataPatterns = [
    // "pro-rata share: 8.08%", "pro rata share: 8.08%"
    /(?:pro[\s-]*rata\s*share)[\s:]*(\d+(?:\.\d+)?)\s*%/i,
    // "pro-rata share ... shall be 8.08%" (up to 80 chars between)
    /(?:pro[\s-]*rata\s*share)\s.{0,80}?(\d+(?:\.\d+)?)\s*%/i,
    // "Tenant's proportionate share: 8.08%"
    /(?:tenant(?:'s)?\s*(?:proportionate|pro[\s-]*rata)\s*share)[\s:]*(\d+(?:\.\d+)?)\s*%/i,
    // "proportionate share ... 8.08%"
    /(?:proportionate\s*share)\s.{0,60}?(\d+(?:\.\d+)?)\s*%/i,
    // "Tenant's Share: 8.08%"
    /(?:tenant(?:'s)?\s*share)[\s:]*(\d+(?:\.\d+)?)\s*%/i,
    // "Tenant Share (8.5%)" — parenthetical format
    /(?:tenant(?:'s)?\s*share)\s*\(\s*(\d+(?:\.\d+)?)\s*%\s*\)/i,
    // "Your Share of Expenses: 7.00%"
    /(?:your\s*share)[\s:]*(?:of\s*\w+\s*)?[\s:]*(\d+(?:\.\d+)?)\s*%/i,
  ];
  let proRataShare: string | null = null;
  for (const pat of proRataPatterns) {
    const m = text.match(pat);
    if (m) { proRataShare = m[1]; break; }
  }

  // -----------------------------------------------------------------
  // Square Footage — tenant premises and building total
  // -----------------------------------------------------------------
  const tenantSqFtPatterns = [
    // "Premises square footage: 8,500", "Premises consisting of 8,500 sq ft"
    /(?:premises\s*(?:square\s*footage|area|consisting\s*of|contains?|containing|comprising))[\s:]*(?:approximately\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:sq(?:uare)?\s*(?:ft|feet)|rsf|rentable\s*sq)/i,
    // "consisting of approximately 4,200 rentable square feet" (after Premises with punctuation gap)
    /(?:premises)[^.]{0,20}consisting\s*of\s*(?:approximately\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:rentable\s*)?(?:sq(?:uare)?\s*(?:ft|feet)|sf|rsf)/i,
    // "4,200 rentable square feet within the Building" (tenant context)
    /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:rentable\s*)?(?:sq(?:uare)?\s*(?:ft|feet)|sf|rsf)\s*(?:within|in)\s*the\s*(?:building|property)/i,
    // "Tenant's Premises: 8,500 SF", "Tenant premises ... 8,500 RSF"
    /(?:tenant(?:'s)?\s*premises)[\s:].{0,40}?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:sq(?:uare)?\s*(?:ft|feet)|sf|rsf)/i,
    // "8,500 rentable square feet of premises", "8,500 sq ft of demised premises"
    /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:rentable\s*)?(?:sq(?:uare)?\s*(?:ft|feet)|sf|rsf)\s*(?:of\s*)?(?:demised\s*)?premises/i,
    // "Rentable area of the Premises shall be 8,500"
    /(?:rentable\s*area\s*(?:of\s*)?(?:the\s*)?premises)[\s:]*(?:shall\s*be\s*|is\s*)?(?:approximately\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i,
    // "Premises: approximately 8,500 square feet"
    /(?:premises)[\s:]*(?:approximately|approx\.?|about)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:sq(?:uare)?\s*(?:ft|feet)|sf|rsf)/i,
    // "Tenant's Rentable Area: 8,500 SF"
    /(?:tenant(?:'s)?\s*rentable\s*area)[\s:]*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i,
  ];
  let tenantPremisesSqFt: string | null = null;
  for (const pat of tenantSqFtPatterns) {
    const m = text.match(pat);
    if (m) { tenantPremisesSqFt = m[1]; break; }
  }

  const buildingSqFtPatterns = [
    // "Building rentable area: 100,000 sq ft", "Total building area: 100,000 SF"
    /(?:(?:total\s*)?building\s*(?:rentable\s*)?(?:area|square\s*footage))[\s:]*(?:approximately\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:sq(?:uare)?\s*(?:ft|feet)|sf|rsf)?/i,
    // "Total rentable area of the Building: 100,000"
    /(?:(?:total\s*)?rentable\s*area\s*(?:of\s*)?(?:the\s*)?building)[\s:]*(?:approximately\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i,
    // "Building containing/contains 100,000 rentable square feet"
    /(?:building\s*(?:contains?|containing|comprising|consisting\s*of))[\s:]*(?:approximately\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:rentable\s*)?(?:sq(?:uare)?\s*(?:ft|feet)|sf|rsf)/i,
    // "Building RSF: 100,000", "Building SF: 100,000"
    /(?:building\s*(?:rsf|sf))[\s:]*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i,
    // "100,000 total rentable square feet" (building context)
    /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:total\s*)?(?:rentable\s*)?(?:sq(?:uare)?\s*(?:ft|feet)|sf|rsf)\s*(?:of\s*)?(?:total\s*)?(?:building|property)/i,
    // "52,000 rentable square feet of leasable area" (in building context)
    /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:rentable\s*)?(?:sq(?:uare)?\s*(?:ft|feet)|sf|rsf)\s*(?:of\s*)?(?:leasable|rentable|gross)\s*area/i,
  ];
  let buildingTotalSqFt: string | null = null;
  for (const pat of buildingSqFtPatterns) {
    const m = text.match(pat);
    if (m) { buildingTotalSqFt = m[1]; break; }
  }

  // Stated tenant share percent (explicit percentage in lease)
  // This captures "Tenant's Proportionate Share shall be 8.5%"
  const statedSharePatterns = [
    /(?:tenant(?:'s)?\s*(?:proportionate|pro[\s-]*rata)\s*share)\s*(?:shall\s*be|is|equals?|:)\s*(\d+(?:\.\d+)?)\s*%/i,
    /(?:proportionate\s*share)\s*(?:shall\s*be|is|equals?|:)\s*(\d+(?:\.\d+)?)\s*%/i,
  ];
  let statedTenantSharePercent: string | null = null;
  for (const pat of statedSharePatterns) {
    const m = text.match(pat);
    if (m) { statedTenantSharePercent = m[1]; break; }
  }

  // -----------------------------------------------------------------
  // Dollar amounts
  // -----------------------------------------------------------------
  const dollarPattern = /[\s:$]*(\$?\s*[\d,]+(?:\.\d{1,2})?)/i;

  // Total CAM Charges — ordered from most specific to least specific
  // Flexible dollar separator: colon, spaces, dots, OCR artifacts between label and amount
  const flexSep = `[\\s:.·\\-]*`;
  const dollarCapture = `(\\$?\\s*[\\d,]+(?:\\.\\d{1,2})?)`;

  const totalCamPatterns = [
    // "Total CAM Charges: $53,444", "Total CAM: $40,570", "CAM Total: $40,570"
    new RegExp(
      `(?:total\\s*cam\\s*(?:charges?|costs?|expenses?)?|cam\\s*total|total\\s*common\\s*area\\s*(?:maintenance\\s*)?(?:charges?|costs?|expenses?)?)\\s*(?:for\\s*(?:your\\s*)?(?:suite|unit|space)\\s*)?${flexSep}${dollarCapture}`,
      "i",
    ),
    // "Total Reconciliation Charges: $40,570"
    new RegExp(
      `(?:total\\s*reconciliation\\s*(?:charges?|costs?|expenses?))${flexSep}${dollarCapture}`,
      "i",
    ),
    // "Total Recoverable Expenses: $40,570", "Recoverable Operating Expenses: $40,570"
    new RegExp(
      `(?:(?:total\\s*)?recoverable\\s*(?:operating\\s*)?(?:expenses?|charges?|costs?))${flexSep}${dollarCapture}`,
      "i",
    ),
    // "Total Additional Rent: $12,900"
    new RegExp(
      `(?:total\\s*additional\\s*rent)${flexSep}${dollarCapture}`,
      "i",
    ),
    // "Total Billable Expenses: $40,570"
    new RegExp(
      `(?:total\\s*billable\\s*(?:expenses?|charges?|costs?))${flexSep}${dollarCapture}`,
      "i",
    ),
    // "Tenant's Share (8.08%): $53,444" or "Your Share (7.00%): $33,508"
    new RegExp(
      `(?:tenant(?:'s)?\\s*share|your\\s*(?:share|portion))\\s*(?:\\([^)]*\\)\\s*)?${flexSep}${dollarCapture}`,
      "i",
    ),
    // "Total Amount Due: $12,560", "Amount Due by Tenant: $12,560"
    new RegExp(
      `(?:total\\s*amount\\s*(?:due|owed|payable)|amount\\s*(?:due|owed|payable)\\s*(?:by\\s*tenant)?)${flexSep}${dollarCapture}`,
      "i",
    ),
    // "Net Amount Due: $5,508"
    new RegExp(
      `(?:net\\s*(?:amount\\s*)?(?:due|owed|payable))${flexSep}${dollarCapture}`,
      "i",
    ),
    // "Total Building Expenses: $478,686", "Total Property Expenses"
    new RegExp(
      `(?:total\\s*(?:building|property)\\s*(?:expenses?|charges?|costs?))${flexSep}${dollarCapture}`,
      "i",
    ),
    // "CAM Expense Summary: $40,570", "CAM Expense Summary — $40,570"
    new RegExp(
      `(?:cam\\s*expense\\s*summary)${flexSep}${dollarCapture}`,
      "i",
    ),
    // "Operating Expense Summary Total ........ $40,570"
    new RegExp(
      `(?:operating\\s*expense\\s*summary\\s*total)${flexSep}${dollarCapture}`,
      "i",
    ),
    // "Operating Expense Summary: $40,570"
    new RegExp(
      `(?:(?:operating|cam)\\s*expense\\s*summary)${flexSep}${dollarCapture}`,
      "i",
    ),
    // "Total Operating Expenses $40,570", "Total Operating Expense $40,570"
    new RegExp(
      `(?:total\\s*(?:tenant\\s*)?operating\\s*(?:expenses?|charges?|costs?))${flexSep}${dollarCapture}`,
      "i",
    ),
    // "Total Expenses $40,570", "Total Charges $40,570" (most generic — last)
    new RegExp(
      `(?:total\\s*(?:expenses?|charges?|costs?))${flexSep}${dollarCapture}`,
      "i",
    ),
    // "Total Pass-Through/Reimbursable/Net/Actual/Annual Expenses"
    new RegExp(
      `(?:total\\s+(?:pass[\\s-]*through|reimbursable|net|actual|annual)\\s*(?:expenses?|charges?|costs?))${flexSep}${dollarCapture}`,
      "i",
    ),
    // Content-bridge fallback: "Total [qualifier]" with non-digit gap to first dollar amount
    // Handles multi-column tables where text (column headers, annotations) sits between label and amount
    new RegExp(
      `(?:total\\s+(?:operating|cam|common|building|property|recoverable|billable|reimbursable|actual|tenant|net|pass[\\s-]*through|annual)\\s*(?:area\\s*)?(?:maintenance\\s*)?(?:expenses?|charges?|costs?)?)\\b[^\\d\\n\\r]{0,80}?${dollarCapture}`,
      "i",
    ),
  ];
  let totalCamCharges: string | null = null;
  for (const pat of totalCamPatterns) {
    const m = text.match(pat);
    if (m) { totalCamCharges = m[1]?.trim() ?? null; break; }
  }

  // Reconciliation total — broader building-level totals
  const reconTotalPatterns = [
    // "Reconciliation Total: $X", "Grand Total: $X"
    new RegExp(
      `(?:reconciliation\\s*total|grand\\s*total)${flexSep}${dollarCapture}`,
      "i",
    ),
    // "Total Building Expenses", "Total Property Expenses/Charges/Costs"
    new RegExp(
      `(?:total\\s*(?:building|property)\\s*(?:expenses?|charges?|costs?))${flexSep}${dollarCapture}`,
      "i",
    ),
    // "Total Actual Expenses/Charges/Costs"
    new RegExp(
      `(?:total\\s*actual\\s*(?:expenses?|charges?|costs?))${flexSep}${dollarCapture}`,
      "i",
    ),
    // "Year-End Total", "Year End Expenses", "Actual Total"
    new RegExp(
      `(?:(?:actual|year[\\s-]*end)\\s*(?:total|expenses?|charges?))${flexSep}${dollarCapture}`,
      "i",
    ),
    // "Subtotal Operating Expenses $560,540"
    new RegExp(
      `(?:subtotal\\s*(?:operating\\s*)?(?:expenses?|charges?|costs?))${flexSep}${dollarCapture}`,
      "i",
    ),
    // Generic: "Total $59,400" on its own line (table row format)
    /(?:^|[\n\r])[\s]*(?:total)[\s:.·\-]+\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:$|[\n\r])/im,
    // Broad content-bridge: "Total [qualifier words]" with non-digit gap to dollar amount
    // Handles multi-column layouts, parenthetical annotations, OCR spacing
    new RegExp(
      `(?:total\\s+(?:operating|cam|common|building|property|recoverable|billable|reimbursable|actual|tenant|net|pass[\\s-]*through|annual)\\s*(?:area\\s*)?(?:maintenance\\s*)?(?:expenses?|charges?|costs?|rent)?)\\b[^\\d\\n\\r]{0,80}?${dollarCapture}`,
      "i",
    ),
    // Broadest: "Total" at line start, skip non-digit content, grab first amount on line
    /(?:^|[\n\r])[\s]*total\b[^\d\n\r]{0,100}?\$?\s*([\d,]+(?:\.\d{1,2})?)/im,
  ];
  let reconciliationTotal: string | null = null;
  for (const pat of reconTotalPatterns) {
    const m = text.match(pat);
    if (m) { reconciliationTotal = m[1]?.trim() ?? null; break; }
  }

  // -----------------------------------------------------------------
  // Prior-Year Total — detect previous year CAM / operating expense total
  // Common in reconciliation statements that show year-over-year comparison
  // -----------------------------------------------------------------
  const priorYearPatterns = [
    // "Prior Year Total: $40,570", "Previous Year Total: $40,570"
    new RegExp(
      `(?:prior|previous|last|preceding)\\s*(?:year(?:'s)?\\s*)?(?:total|cam|operating\\s*(?:expenses?|charges?|costs?))${flexSep}${dollarCapture}`,
      "i",
    ),
    // "2023 Total: $40,570", "2022 Total Expenses: $40,570" (year before current)
    new RegExp(
      `(?:20\\d{2})\\s*(?:total|cam|operating)?\\s*(?:expenses?|charges?|costs?)?${flexSep}${dollarCapture}`,
      "i",
    ),
    // "Prior Year CAM Charges: $40,570"
    new RegExp(
      `(?:prior|previous|last)\\s*year(?:'s)?\\s*(?:cam|common\\s*area|operating)\\s*(?:maintenance\\s*)?(?:charges?|expenses?|costs?|total)${flexSep}${dollarCapture}`,
      "i",
    ),
    // "Base Year Expenses: $38,000", "Base Year Total: $38,000"
    new RegExp(
      `(?:base\\s*year)\\s*(?:total|expenses?|charges?|costs?|cam|operating)?${flexSep}${dollarCapture}`,
      "i",
    ),
    // "Year-Over-Year" context: "Prior: $38,000" near year-over-year language
    new RegExp(
      `(?:year[\\s-]*over[\\s-]*year|yoy|y\\/y|annual\\s*comparison)[^\\n\\r]{0,120}?(?:prior|previous|last|base|former)${flexSep}${dollarCapture}`,
      "i",
    ),
  ];
  let priorYearTotal: string | null = null;
  for (const pat of priorYearPatterns) {
    const m = text.match(pat);
    if (m) { priorYearTotal = m[1]?.trim() ?? null; break; }
  }

  // -----------------------------------------------------------------
  // Reconciliation Year — detect the year covered by this reconciliation
  // -----------------------------------------------------------------
  const reconciliationYearPatterns = [
    // "CAM Reconciliation 2024", "Operating Expense Reconciliation – 2023"
    /(?:CAM|common\s*area|operating\s*expense)\s*reconciliation[\s\u2013\u2014\-–—]*(\d{4})/i,
    // "For the Year Ending 2025", "For the Year Ended December 31, 2024"
    /for\s+the\s+year\s+(?:ending|ended|of)[^0-9]{0,40}(\d{4})/i,
    // "Calendar Year 2022", "Fiscal Year 2023"
    /(?:calendar|fiscal)\s+year\s+(\d{4})/i,
    // "Reconciliation Statement 2024", "Reconciliation for 2024"
    /reconciliation\s+(?:statement\s+)?(?:for\s+)?(\d{4})/i,
    // "Year 2024 CAM", "2024 Reconciliation"
    /(?:^|\s)(\d{4})\s+(?:CAM|reconciliation|operating\s*expense)/im,
    // "Annual Reconciliation – January 1, 2024 to December 31, 2024"
    /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+(\d{4})\s*(?:to|through|\u2013|-)/i,
    // Fallback: "January 1 – December 31, 2024" (end date year)
    /(?:to|through|\u2013|-)\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+(\d{4})/i,
  ];
  let reconciliationYear: number | null = null;
  for (const pat of reconciliationYearPatterns) {
    const m = text.match(pat);
    if (m && m[1]) {
      const yr = parseInt(m[1], 10);
      if (yr >= 1990 && yr <= 2099) {
        reconciliationYear = yr;
        break;
      }
    }
  }

  // Base rent
  const baseRentMatch = text.match(
    new RegExp(
      `(?:base\\s*rent|monthly\\s*rent|annual\\s*rent|minimum\\s*rent)${dollarPattern.source}`,
      "i",
    ),
  );

  // -----------------------------------------------------------------
  // Line item amounts — detect category: $amount pairs
  // Supports single-column ("Category: $X") AND multi-column tables
  // ("Category  $Budget  $Actual") by capturing the LAST dollar amount
  // on each line when multiple are present.
  // -----------------------------------------------------------------
  const lineItems: LineItem[] = [];

  // Strategy: split into lines, then for each line detect a leading
  // text category followed by one or more dollar amounts.  Keep the
  // LAST amount (typically the "Actual" column in Budget/Actual tables).
  const textLines = text.split(/[\n\r]+/);
  const categoryPattern = /^[\s]*([A-Za-z][A-Za-z0-9 ()&\-\/,.:;%]+?)\s{2,}/;
  const amountPattern = /\$?\s*([\d,]+(?:\.\d{1,2})?)/g;

  // Also handle dotted-leader lines: "Category .............. $Amount"
  const dottedLeaderPattern = /^[\s]*([A-Za-z][A-Za-z0-9 ()&\-\/,:%]+?)\s*\.{2,}\s*/;

  for (const line of textLines) {
    // Try multi-space separator first, then dotted-leader
    const catMatch = line.match(categoryPattern) || line.match(dottedLeaderPattern);
    if (!catMatch) continue;

    // Strip trailing dots, dashes, colons, and whitespace from category
    const cat = catMatch[1].replace(/[\s.\-:;]+$/, "").trim().toLowerCase();
    if (cat.length <= 2 || cat.length >= 60) continue;

    // Find all dollar amounts on the line after the category
    const afterCategory = line.slice(catMatch[0].length);
    const amounts: string[] = [];
    let amtMatch;
    amountPattern.lastIndex = 0;
    while ((amtMatch = amountPattern.exec(afterCategory)) !== null) {
      amounts.push(amtMatch[1]);
    }

    // Use the last amount on the line (Actual column in Budget/Actual tables)
    const amt = amounts.length > 0 ? amounts[amounts.length - 1] : null;
    if (!amt) continue;

    const numVal = parseFloat(amt.replace(/,/g, ""));
    if (numVal >= 100) {
      // Deduplicate: skip if same category and amount already captured
      const alreadyCaptured = lineItems.some(
        (li) => li.category === cat && li.amount === amt,
      );
      if (!alreadyCaptured) {
        lineItems.push({ category: cat, amount: amt, rawLine: line.trim() });
      }
    }
  }

  // Also try the original single-column pattern for lines the above may miss
  // (e.g. "Category: $X" with colon separator and less whitespace)
  const singleColPattern = /(?:^|[\n\r])[\s]*([A-Za-z][A-Za-z &\-\/]+?)[\s:.]+\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:$|[\n\r])/gm;
  let lineMatch;
  while ((lineMatch = singleColPattern.exec(text)) !== null) {
    const cat = lineMatch[1].trim().toLowerCase();
    const amt = lineMatch[2];
    const numVal = parseFloat(amt.replace(/,/g, ""));
    if (numVal >= 100 && cat.length > 2 && cat.length < 60) {
      // Only add if not already captured
      const alreadyExists = lineItems.some(
        (li) => li.category === cat && li.amount === amt,
      );
      if (!alreadyExists) {
        lineItems.push({ category: cat, amount: amt, rawLine: lineMatch[0].trim() });
      }
    }
  }

  // -----------------------------------------------------------------
  // Fallback: derive totals from line items if regex missed them
  // Handles table-row formats where "Total" is a category label
  // -----------------------------------------------------------------
  if (!totalCamCharges) {
    const totalItem = lineItems.find(
      (item) =>
        /^\s*(?:total|grand\s*total)\b/i.test(item.category) &&
        !/square|footage|sf|rsf|area|units?\b/i.test(item.category),
    );
    if (totalItem) {
      totalCamCharges = totalItem.amount;
    }
  }
  if (!reconciliationTotal && !totalCamCharges) {
    const totalItem = lineItems.find(
      (item) =>
        /^\s*(?:total|grand\s*total|subtotal)\b/i.test(item.category) &&
        !/square|footage|sf|rsf|area|units?\b/i.test(item.category),
    );
    if (totalItem) {
      reconciliationTotal = totalItem.amount;
    }
  }

  // Multi-line fallback: "Total [type]" on one line, dollar amount on the next
  if (!totalCamCharges && !reconciliationTotal) {
    const multiLineMatch = text.match(
      /(?:^|[\n\r])[\s]*total\s+(?:(?:operating|cam|common|building|property)\s+)?(?:expenses?|charges?|costs?|maintenance)?[^\n\r]*[\n\r]+[\s]*\$?\s*([\d,]+(?:\.\d{1,2})?)/im,
    );
    if (multiLineMatch) {
      reconciliationTotal = multiLineMatch[1]?.trim() ?? null;
    }
  }

  // -----------------------------------------------------------------
  // Last-resort fallback: sum extracted line items to derive a total
  // -----------------------------------------------------------------
  let derivedTotal = false;
  if (!totalCamCharges && !reconciliationTotal && lineItems.length >= 2) {
    // Exclude any line item that is itself labelled "total" / "subtotal"
    const nonTotalItems = lineItems.filter(
      (item) => !/^\s*(?:total|grand\s*total|subtotal)\b/i.test(item.category),
    );
    if (nonTotalItems.length >= 2) {
      const sum = nonTotalItems.reduce(
        (acc, item) => acc + parseFloat(item.amount.replace(/,/g, "")),
        0,
      );
      if (sum > 0) {
        reconciliationTotal = sum.toFixed(2);
        derivedTotal = true;
      }
    }
  }

  // -----------------------------------------------------------------
  // Expense categories — expanded list + line item detection
  // -----------------------------------------------------------------
  const lower = text.toLowerCase();
  const expenseCategories = EXPENSE_CATEGORIES.filter((cat) =>
    lower.includes(cat),
  );
  // Also add categories from line items that match known categories
  for (const item of lineItems) {
    for (const known of EXPENSE_CATEGORIES) {
      if (item.category.includes(known) && !expenseCategories.includes(known)) {
        expenseCategories.push(known);
      }
    }
  }

  // -----------------------------------------------------------------
  // Exclusion terms — also detect from contextual phrases
  // -----------------------------------------------------------------
  const excludedTerms = EXCLUSION_TERMS.filter((term) =>
    lower.includes(term),
  );
  // Detect exclusion language patterns like "shall not include", "excludes", "excluded from"
  const exclusionContextPatterns = [
    /(?:shall\s*not\s*include|(?:are|is)\s*excluded?\s*(?:from)?|tenant\s*(?:shall|will)\s*not\s*(?:be\s*)?(?:responsible|liable|charged)\s*for|landlord(?:'s)?\s*(?:sole\s*)?(?:responsibility|obligation))[^.]{0,200}/gi,
    /(?:excluded?\s*(?:items?|categories?|expenses?|costs?|charges?))[^.]{0,200}/gi,
    /(?:non[\s-]*?pass[\s-]*?through)[^.]{0,200}/gi,
  ];
  for (const pat of exclusionContextPatterns) {
    let ctxMatch;
    while ((ctxMatch = pat.exec(text)) !== null) {
      const snippet = ctxMatch[0].toLowerCase();
      for (const term of EXCLUSION_TERMS) {
        if (snippet.includes(term) && !excludedTerms.includes(term)) {
          excludedTerms.push(term);
        }
      }
      // Also catch broader capital/structural references
      if (/capital/i.test(snippet) && !excludedTerms.includes("capital expenditure")) {
        excludedTerms.push("capital expenditure");
      }
      if (/structural/i.test(snippet) && !excludedTerms.includes("structural repair")) {
        excludedTerms.push("structural repair");
      }
    }
  }

  // All numeric values (improved detection)
  const numericValues = detectNumericValues(text);

  return {
    camCapPercentage,
    adminFeePercentage,
    managementFee,
    expenseCategories,
    totalCamCharges,
    reconciliationTotal,
    proRataShare,
    baseRent: baseRentMatch?.[1]?.trim() ?? null,
    numericValues,
    excludedTerms,
    lineItems,
    tenantPremisesSqFt,
    buildingTotalSqFt,
    statedTenantSharePercent,
    derivedTotal,
    priorYearTotal,
    reconciliationYear,
  };
}

// ---------------------------------------------------------------------------
// Confidence scoring
// ---------------------------------------------------------------------------

function computeConfidence(
  leaseClass: DocumentClassification,
  reconClass: DocumentClassification,
  leaseFields: ExtractedFields,
  reconFields: ExtractedFields,
): { level: ConfidenceLevel; score: number } {
  let score = 0;

  // Document classification strength (0–30)
  score += Math.min(leaseClass.confidence * 30, 15);
  score += Math.min(reconClass.confidence * 30, 15);

  // Key financial fields present (0–40)
  const keyFields = [
    leaseFields.camCapPercentage,
    leaseFields.adminFeePercentage ?? leaseFields.managementFee,
    leaseFields.proRataShare,
    reconFields.totalCamCharges ?? reconFields.reconciliationTotal,
    reconFields.managementFee ?? reconFields.adminFeePercentage,
  ];
  const fieldsPresent = keyFields.filter(Boolean).length;
  score += (fieldsPresent / keyFields.length) * 40;

  // Expense categories detected (0–15)
  const totalCategories =
    leaseFields.expenseCategories.length + reconFields.expenseCategories.length;
  score += Math.min(totalCategories / 6, 1) * 15;

  // Numeric values present (0–15)
  const totalNumerics =
    leaseFields.numericValues.length + reconFields.numericValues.length;
  score += Math.min(totalNumerics / 10, 1) * 15;

  score = Math.round(Math.min(score, 100));

  let level: ConfidenceLevel;
  if (score >= 70) level = "high";
  else if (score >= 40) level = "medium";
  else level = "low";

  return { level, score };
}

// ---------------------------------------------------------------------------
// Determine audit mode from classifications
// ---------------------------------------------------------------------------

function determineAuditMode(
  leaseClass: DocumentClassification,
  reconClass: DocumentClassification,
  leaseFields: ExtractedFields,
  reconFields: ExtractedFields,
): AuditMode {
  const leaseTier = leaseClass.tier;
  const reconTier = reconClass.tier;

  // Both high confidence → full audit
  if (leaseTier === "high_confidence" && reconTier === "high_confidence") {
    return "full";
  }

  // At least one unknown and no extracted fields to work with → rejected
  if (leaseTier === "unknown" || reconTier === "unknown") {
    // Even if one is unknown, check if extraction produced usable fields
    const hasAnyField =
      leaseFields.camCapPercentage != null ||
      leaseFields.adminFeePercentage != null ||
      leaseFields.managementFee != null ||
      leaseFields.proRataShare != null ||
      reconFields.totalCamCharges != null ||
      reconFields.reconciliationTotal != null ||
      reconFields.managementFee != null ||
      reconFields.adminFeePercentage != null;

    if (hasAnyField) return "limited";
    return "rejected";
  }

  // At least one likely_match → limited audit
  if (leaseTier === "likely_match" || reconTier === "likely_match") {
    return "limited";
  }

  return "full";
}

// ---------------------------------------------------------------------------
// Main validation pipeline
// ---------------------------------------------------------------------------

export async function validateDocuments(
  leaseBuffer: Buffer,
  reconBuffer: Buffer,
): Promise<DocumentValidationResult> {
  const issues: ValidationIssue[] = [];

  // 1. Extract text from both PDFs (with OCR fallback)
  let leaseExtraction = await extractTextFromPdf(leaseBuffer);
  let reconExtraction = await extractTextFromPdf(reconBuffer);
  let leaseText = leaseExtraction.text;
  let reconText = reconExtraction.text;
  let leaseExtractionMethod = leaseExtraction.method;
  let reconExtractionMethod = reconExtraction.method;

  // 2. Truly empty PDF detection (no readable text at all)
  const MIN_TEXT_LENGTH = 20;

  if (leaseText.trim().length < MIN_TEXT_LENGTH && reconText.trim().length < MIN_TEXT_LENGTH) {
    return {
      leaseClassification: unknownClassification(),
      reconClassification: unknownClassification(),
      leaseText: "",
      reconText: "",
      leaseFields: emptyFields(),
      reconFields: emptyFields(),
      wasSwapped: false,
      leaseExtractionMethod: leaseExtractionMethod,
      reconExtractionMethod: reconExtractionMethod,
      issues: [],
      confidence: "low",
      confidenceScore: 0,
      canProceed: false,
      auditMode: "rejected",
      userMessage:
        "This document does not contain readable lease or CAM data. Please upload a valid document.",
    };
  }

  if (leaseText.trim().length < MIN_TEXT_LENGTH) {
    return {
      leaseClassification: unknownClassification(),
      reconClassification: detectDocumentType(reconText),
      leaseText: "",
      reconText,
      leaseFields: emptyFields(),
      reconFields: extractFields(reconText),
      wasSwapped: false,
      leaseExtractionMethod: leaseExtractionMethod,
      reconExtractionMethod: reconExtractionMethod,
      issues: [],
      confidence: "low",
      confidenceScore: 0,
      canProceed: false,
      auditMode: "rejected",
      userMessage:
        "The lease document does not contain readable text. Please upload a valid lease PDF.",
    };
  }

  if (reconText.trim().length < MIN_TEXT_LENGTH) {
    return {
      leaseClassification: detectDocumentType(leaseText),
      reconClassification: unknownClassification(),
      leaseText,
      reconText: "",
      leaseFields: extractFields(leaseText),
      reconFields: emptyFields(),
      wasSwapped: false,
      leaseExtractionMethod: leaseExtractionMethod,
      reconExtractionMethod: reconExtractionMethod,
      issues: [],
      confidence: "low",
      confidenceScore: 0,
      canProceed: false,
      auditMode: "rejected",
      userMessage:
        "The reconciliation document does not contain readable text. Please upload a valid CAM reconciliation PDF.",
    };
  }

  // 3. Classify documents
  let leaseClassification = detectDocumentType(leaseText);
  let reconClassification = detectDocumentType(reconText);
  let wasSwapped = false;

  // 4. Check if documents are swapped
  if (
    leaseClassification.type === "reconciliation" &&
    reconClassification.type === "lease"
  ) {
    [leaseText, reconText] = [reconText, leaseText];
    [leaseExtractionMethod, reconExtractionMethod] = [reconExtractionMethod, leaseExtractionMethod];
    leaseClassification = detectDocumentType(leaseText);
    reconClassification = detectDocumentType(reconText);
    wasSwapped = true;
    issues.push({
      field: "document_order",
      message:
        "The uploaded documents appeared to be swapped. The system automatically corrected the order.",
    });
  }

  // 5. Extract fields (always attempt, even on weak classification)
  const leaseFields = extractFields(leaseText);
  const reconFields = extractFields(reconText);

  // 6. Determine audit mode based on classification tier + extracted fields
  const auditMode = determineAuditMode(
    leaseClassification,
    reconClassification,
    leaseFields,
    reconFields,
  );

  if (auditMode === "rejected") {
    return {
      leaseClassification,
      reconClassification,
      leaseText,
      reconText,
      leaseFields,
      reconFields,
      wasSwapped,
      leaseExtractionMethod,
      reconExtractionMethod,
      issues,
      confidence: "low",
      confidenceScore: 0,
      canProceed: false,
      auditMode: "rejected",
      userMessage:
        "The uploaded documents could not be identified as lease or CAM reconciliation documents. Please upload valid commercial lease and reconciliation files.",
    };
  }

  // 7. Required data detection (informational — does not block)
  if (!leaseFields.camCapPercentage) {
    issues.push({
      field: "cam_cap",
      message: "CAM cap percentage could not be detected in the lease.",
    });
  }
  if (!leaseFields.adminFeePercentage && !leaseFields.managementFee) {
    issues.push({
      field: "admin_fee",
      message:
        "Admin / management fee percentage could not be detected in the lease.",
    });
  }
  if (reconFields.expenseCategories.length === 0) {
    issues.push({
      field: "expense_categories",
      message:
        "No expense categories could be detected in the reconciliation statement.",
    });
  }
  if (!reconFields.totalCamCharges && !reconFields.reconciliationTotal) {
    issues.push({
      field: "total_cam",
      message:
        "Your reconciliation statement contains individual expense line items but does not include a total CAM or operating expense summary. " +
        "Because of this, the system cannot verify whether the CAM cap was exceeded. " +
        "If available, upload a reconciliation summary page that includes a total operating expense amount.",
    });
  }
  if (!leaseFields.proRataShare) {
    issues.push({
      field: "pro_rata",
      message: "Pro-rata share could not be detected in the lease.",
    });
  }

  // 8. Compute confidence
  const { level: confidence, score: confidenceScore } = computeConfidence(
    leaseClassification,
    reconClassification,
    leaseFields,
    reconFields,
  );

  // 9. Build user message
  const usedOcr =
    leaseExtractionMethod === "ocr" || reconExtractionMethod === "ocr";

  let userMessage: string | null = null;
  if (usedOcr) {
    userMessage =
      "Document required OCR processing due to limited embedded text.";
  } else if (auditMode === "limited") {
    userMessage =
      "Limited Review: Some checks could not be completed due to missing or unclear data.";
  } else if (issues.length > 0) {
    userMessage =
      "Some audit checks could not be fully verified due to incomplete document data.";
  }

  return {
    leaseClassification,
    reconClassification,
    leaseText,
    reconText,
    leaseFields,
    reconFields,
    wasSwapped,
    leaseExtractionMethod,
    reconExtractionMethod,
    issues,
    confidence,
    confidenceScore,
    canProceed: true,
    auditMode,
    userMessage,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unknownClassification(): DocumentClassification {
  return { type: "unknown", confidence: 0, tier: "unknown", matchedKeywords: [] };
}

function emptyFields(): ExtractedFields {
  return {
    camCapPercentage: null,
    adminFeePercentage: null,
    managementFee: null,
    expenseCategories: [],
    totalCamCharges: null,
    reconciliationTotal: null,
    proRataShare: null,
    baseRent: null,
    numericValues: [],
    excludedTerms: [],
    lineItems: [] as LineItem[],
    tenantPremisesSqFt: null,
    buildingTotalSqFt: null,
    statedTenantSharePercent: null,
    derivedTotal: false,
    priorYearTotal: null,
    reconciliationYear: null,
  };
}
