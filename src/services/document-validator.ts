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
import {
  extractLeaseFieldsWithAI,
  extractReconFieldsWithAI,
  type AILeaseFields,
  type AIReconFields,
} from "@/services/ai-extraction";

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
  "cam cap",
  "lease term",
  "square footage",
  "rentable area",
  "excluded expenses",
  "pass-through",
  "annual increase",
  "controllable expenses",
  "tenant improvement",
  "proportionate share",
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
  "tenant's share",
  "your share",
  "amount due",
  "true-up",
  "true up",
  "adjustment",
  "prior year",
  "previous year",
  "annual expenses",
  "building expenses",
  "property expenses",
  "subtotal",
  "gross-up",
  "landlord",
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
  "professional fee",
  "accounting fee",
  "audit expense",
  "management overhead",
  "advertising",
  "promotional expense",
  "charitable contribution",
  "donation",
  "penalty",
  "fine",
  "late fee",
  "interest charge",
];

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

/**
 * Extract text from a PDF buffer using pdfjs-dist (modern Mozilla PDF.js).
 * Falls back to the legacy pdf-parse library, then OCR, if pdfjs-dist fails.
 */
/**
 * Count distinct whitespace-separated words — used to judge text quality.
 * Garbled text like "TotalCAMCharges$53,444" has fewer words than
 * properly spaced "Total CAM Charges $53,444".
 */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Normalize extracted text by injecting spaces at common concatenation boundaries.
 * Handles garbled PDF text where words are merged (e.g. "TotalCAMCharges$69,025").
 *
 * Also handles OCR artifacts, abbreviation expansion, and common business-text
 * cleanup for lease and CAM reconciliation documents.
 */
function normalizeExtractedText(text: string): string {
  let result = text;
  // Insert space between lowercase and uppercase: "feeCap" → "fee Cap", "totalCam" → "total Cam"
  result = result.replace(/([a-z])([A-Z])/g, "$1 $2");
  // Insert space before $ when preceded by letter: "Charges$69" → "Charges $69"
  result = result.replace(/([A-Za-z])\$/g, "$1 $");
  // Insert space between digit+% and letter: "10%annually" → "10% annually"
  result = result.replace(/(\d%)([A-Za-z])/g, "$1 $2");
  // Insert space between colon and letter when no space: "Cap:controllable" → "Cap: controllable"
  result = result.replace(/:([A-Za-z])/g, ": $1");
  // Insert space between digit and letter: "5percent" → "5 percent", "100sf" → "100 sf"
  result = result.replace(/(\d)([A-Za-z])/g, "$1 $2");
  // Insert space between letter and digit when no space: "Suite240" → "Suite 240"
  result = result.replace(/([A-Za-z])(\d)/g, "$1 $2");
  // Normalize common OCR artifacts: l → I, O → 0 in numeric contexts
  result = result.replace(/\bl(\d)/g, "1$1"); // "l5%" → "15%"
  result = result.replace(/(\d)O(\d)/g, "$10$2"); // "1O0" → "100"
  // Normalize multiple spaces to single space
  result = result.replace(/ {2,}/g, " ");
  // Normalize common dotted leaders (used in tables): "Category..........$X" → "Category $X"
  result = result.replace(/\.{3,}/g, " ");
  // Normalize em/en dashes to regular dashes
  result = result.replace(/[\u2013\u2014\u2015]/g, "-");
  // Normalize smart quotes to regular quotes
  result = result.replace(/[\u201C\u201D\u201E]/g, '"');
  result = result.replace(/[\u2018\u2019\u201A]/g, "'");
  return result;
}

/**
 * Concept synonym map — normalizes various business terms to canonical forms
 * before extraction. This allows regex patterns to match against consistent
 * terminology regardless of how the original document phrased things.
 */
const CONCEPT_SYNONYMS: Array<{ canonical: string; variants: RegExp }> = [
  // CAM cap synonyms
  { canonical: "CAM cap", variants: /\b(?:controllable\s*(?:expense|cost|operating)\s*cap|operating\s*expense\s*(?:escalation\s*)?cap|expense\s*escalation\s*(?:cap|limit)|annual\s*escalation\s*cap|cam\s*escalation\s*(?:cap|limit)|opex\s*cap)\b/gi },
  // Pro rata share synonyms
  { canonical: "pro-rata share", variants: /\b(?:proportionate\s*share|tenant(?:'s)?\s*(?:allocation|share\s*(?:percentage|pct|%))|cost\s*sharing\s*(?:percentage|ratio)|rentable\s*(?:area\s*)?(?:allocation|share)|sq(?:uare)?\s*(?:ft|foot|footage)\s*allocation)\b/gi },
  // Management fee synonyms
  { canonical: "management fee", variants: /\b(?:property\s*(?:mgmt|mgt)\s*fee|(?:mgmt|mgt)\s*fee|pm\s*fee|supervisory\s*fee|oversight\s*(?:fee|charge))\b/gi },
  // Admin fee synonyms
  { canonical: "administrative fee", variants: /\b(?:admin\s*(?:charge|cost|overhead)|administrative\s*(?:charge|cost|overhead)|overhead\s*(?:fee|charge))\b/gi },
  // Excluded expense synonyms
  { canonical: "capital improvement", variants: /\b(?:cap(?:ital)?\s*(?:ex|expenditure|improvement|project)|capex|capital\s*(?:outlay|replacement|upgrade))\b/gi },
  { canonical: "structural repair", variants: /\b(?:structural\s*(?:work|issue|deficiency|element)|building\s*(?:structure|shell|envelope)\s*(?:repair|maintenance))\b/gi },
  // Reconciliation total synonyms
  { canonical: "total operating expenses", variants: /\b(?:total\s*(?:opex|op\s*ex)|aggregate\s*(?:operating\s*)?(?:expenses?|charges?|costs?)|combined\s*(?:operating\s*)?(?:expenses?|charges?))\b/gi },
];

/**
 * Apply concept synonym normalization to text — inserts canonical terms
 * as parenthetical annotations so regex patterns can match either form.
 */
function applyConceptNormalization(text: string): string {
  let result = text;
  for (const { canonical, variants } of CONCEPT_SYNONYMS) {
    result = result.replace(variants, (match) => `${match} (${canonical})`);
  }
  return result;
}

export async function extractTextFromPdf(
  buffer: Buffer,
): Promise<ExtractionResult> {
  // Validate buffer looks like a PDF
  const header = buffer.slice(0, 5).toString("ascii");
  if (!header.startsWith("%PDF")) {
    console.warn(`[extractText] Buffer does not start with %PDF header (got "${header}"). Size: ${buffer.length} bytes`);
  }

  // Always try BOTH extractors and pick the higher-quality result.
  // Previously pdfjs-dist returned early when it had >= 30 chars, but
  // garbled text (no spaces between words) could pass that threshold
  // while being completely unparseable by downstream regex patterns.

  let pdfjsText = "";
  let pdfjsError: string | null = null;
  try {
    pdfjsText = await extractWithPdfjsDist(buffer);
    console.log(`[extractText] pdfjs-dist extracted ${pdfjsText.trim().length} chars, ${wordCount(pdfjsText)} words`);
    if (pdfjsText.trim().length > 0) {
      console.log(`[extractText] pdfjs-dist first 200 chars: ${pdfjsText.substring(0, 200).replace(/[\n\r]+/g, " | ")}`);
    }
  } catch (err) {
    pdfjsError = err instanceof Error ? err.message : String(err);
    console.warn("[extractText] pdfjs-dist failed:", pdfjsError);
    if (err instanceof Error && err.stack) {
      console.warn("[extractText] pdfjs-dist stack:", err.stack.split("\n").slice(0, 3).join(" > "));
    }
  }

  let legacyText = "";
  let legacyError: string | null = null;
  try {
    const result = await pdfParse(buffer);
    legacyText = result.text ?? "";
    console.log(`[extractText] pdf-parse extracted ${legacyText.trim().length} chars, ${wordCount(legacyText)} words`);
    if (legacyText.trim().length > 0) {
      console.log(`[extractText] pdf-parse first 200 chars: ${legacyText.substring(0, 200).replace(/[\n\r]+/g, " | ")}`);
    }
  } catch (err) {
    legacyError = err instanceof Error ? err.message : String(err);
    console.warn("[extractText] pdf-parse failed:", legacyError);
  }

  // Log diagnostic summary when both extractors fail or return little text
  if (pdfjsText.trim().length < 30 && legacyText.trim().length < 30) {
    console.error(
      `[extractText] CRITICAL: Both extractors returned minimal text. ` +
      `pdfjs=${pdfjsText.trim().length} chars (error: ${pdfjsError ?? "none"}), ` +
      `pdf-parse=${legacyText.trim().length} chars (error: ${legacyError ?? "none"}). ` +
      `Buffer: ${buffer.length} bytes, header: "${buffer.slice(0, 10).toString("ascii").replace(/[^\x20-\x7E]/g, "?")}"`
    );
  }

  // Pick the extractor with more words (better spacing = more useful text).
  // Fall back to char length as tiebreaker.
  let pdfText: string;
  const pdfjsWords = wordCount(pdfjsText);
  const legacyWords = wordCount(legacyText);
  if (pdfjsWords > legacyWords) {
    pdfText = pdfjsText;
    console.log(`[extractText] Chose pdfjs-dist (${pdfjsWords} words > ${legacyWords} words)`);
  } else if (legacyWords > pdfjsWords) {
    pdfText = legacyText;
    console.log(`[extractText] Chose pdf-parse (${legacyWords} words > ${pdfjsWords} words)`);
  } else {
    // Same word count — pick whichever has more chars
    pdfText = pdfjsText.trim().length >= legacyText.trim().length ? pdfjsText : legacyText;
    console.log(`[extractText] Tie — chose ${pdfText === pdfjsText ? "pdfjs-dist" : "pdf-parse"} (${pdfText.trim().length} chars)`);
  }

  // Normalize text: inject spaces at common garbled boundaries
  pdfText = normalizeExtractedText(pdfText);

  if (pdfText.trim().length >= OCR_TEXT_THRESHOLD) {
    return { text: pdfText, method: "pdf_text", ocrTriggered: false, ocrTextLength: 0, ocrError: null };
  }

  // Both text extractors returned little text — fall back to OCR
  console.log(
    `[extractText] Text extraction returned ${pdfText.trim().length} chars (< ${OCR_TEXT_THRESHOLD}), attempting OCR fallback...`,
  );
  let ocrText = "";
  let ocrError: string | null = null;
  try {
    const rawOcrText = await extractTextWithOcr(buffer);
    ocrText = normalizeExtractedText(rawOcrText);
  } catch (err) {
    ocrError = err instanceof Error ? err.message : String(err);
    console.error(`[extractText] OCR fallback error: ${ocrError}`);
  }
  console.log(
    `[extractText] OCR Fallback Used: true | OCR Extracted Text Length: ${ocrText.trim().length} characters` +
    (ocrError ? ` | Error: ${ocrError}` : ""),
  );
  if (ocrText.trim().length > pdfText.trim().length) {
    console.log(
      `[extractText] OCR recovered ${ocrText.trim().length} chars, using OCR text`,
    );
    return { text: ocrText, method: "ocr", ocrTriggered: true, ocrTextLength: ocrText.trim().length, ocrError };
  }

  return { text: pdfText, method: "pdf_text", ocrTriggered: true, ocrTextLength: ocrText.trim().length, ocrError };
}

/**
 * Extract text using the modern pdfjs-dist library (Mozilla PDF.js).
 * Handles modern PDF formats including those generated by pdf-lib.
 */
async function extractWithPdfjsDist(buffer: Buffer): Promise<string> {
  // Dynamic import — pdfjs-dist is listed in serverExternalPackages
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const path = await import("path");
  const fs = await import("fs");

  // Resolve font path robustly — works on Vercel, local dev, and Docker.
  // Try multiple candidate paths because Vercel serverless functions may
  // relocate node_modules or use a different working directory.
  const candidates = [
    path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts/"),
    path.join(__dirname, "../../../node_modules/pdfjs-dist/standard_fonts/"),
    path.join(__dirname, "../../node_modules/pdfjs-dist/standard_fonts/"),
    // Vercel .next/server/chunks path
    path.resolve("node_modules/pdfjs-dist/standard_fonts/"),
  ];
  let fontDataUrl = candidates[0]; // default
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        fontDataUrl = candidate;
        break;
      }
    } catch {
      // ignore — fs access may fail in edge runtime
    }
  }
  console.log(`[pdfjs] Using font path: ${fontDataUrl}`);

  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    standardFontDataUrl: fontDataUrl,
    // Disable font loading failures from blocking extraction
    disableFontFace: true,
  }).promise;

  const pageTexts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Reconstruct text with line breaks based on Y position changes.
    // Track X positions to insert spaces between adjacent text items
    // that have a horizontal gap (many PDFs emit each word as a
    // separate text item without embedded spaces).
    let lastY: number | null = null;
    let lastX: number | null = null;
    let lastWidth: number = 0;
    let lineText = "";
    for (const item of content.items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const textItem = item as any;
      if (!textItem.str) continue;
      const x: number = textItem.transform[4];
      const y: number = textItem.transform[5];
      const width: number = textItem.width ?? 0;
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        // New line — push the previous line and start a new one
        pageTexts.push(lineText);
        lineText = textItem.str;
      } else {
        // Same line — add space between items when there is a
        // horizontal gap (prevents "TotalCAMCharges" concatenation)
        if (
          lineText.length > 0 &&
          !lineText.endsWith(" ") &&
          !textItem.str.startsWith(" ")
        ) {
          // Insert space if the current item starts beyond where the
          // previous item ended (gap > 0.5 units)
          if (lastX !== null && x - (lastX + lastWidth) > 0.5) {
            lineText += " ";
          }
        }
        lineText += textItem.str;
      }
      lastY = y;
      lastX = x;
      lastWidth = width;
    }
    if (lineText) pageTexts.push(lineText);
    pageTexts.push(""); // Page break
  }

  doc.destroy();
  return pageTexts.join("\n");
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
  if (score >= 0.12) return "high_confidence";
  if (score >= 0.04) return "likely_match";
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
  // Apply concept normalization so synonymous business terms can be
  // matched by the same regex patterns
  text = applyConceptNormalization(text);

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
    // "CAM Cap: <any descriptive text> 10%" — bridges up to 120 chars between label and %
    /(?:cam\s*cap)\s*[:]\s*[^%]{0,120}?(\d+(?:\.\d+)?)\s*%/i,
    // "controllable operating expenses shall not exceed 10%" (without trailing annual/year qualifier)
    /(?:controllable\s*(?:operating\s*)?(?:expenses?|costs?))\s*(?:shall\s*)?(?:not\s*)?(?:exceed|increase\s*(?:by\s*)?more\s*than)\s*(?:a\s+)?(\d+(?:\.\d+)?)\s*%/i,
    // "shall not increase more than 10% per year" (with trailing per-year)
    /shall\s*not\s*(?:increase|exceed|escalate)\s*(?:by\s*)?(?:more\s*than\s*)?(\d+(?:\.\d+)?)\s*%\s*(?:per|each|any|in\s*any)\s*(?:year|annum|calendar)/i,
    // "expense escalation cap" / "opex cap" (via concept normalization)
    /(?:expense\s*escalation\s*(?:cap|limit)|opex\s*cap|cam\s*escalation\s*(?:cap|limit))\s*[:=]?\s*(\d+(?:\.\d+)?)\s*%/i,
    // "annual escalation limited/capped to 10%"
    /(?:annual\s*(?:escalation|increase))\s*(?:limited|capped|restricted)\s*(?:to|at)\s*(\d+(?:\.\d+)?)\s*%/i,
    // "not to exceed 10% annually" (broader)
    /not\s*to\s*exceed\s*(\d+(?:\.\d+)?)\s*%\s*(?:annually|per\s*year|per\s*annum|each\s*year)/i,
    // "10% cap on annual increases"
    /(\d+(?:\.\d+)?)\s*%\s*cap\s*(?:on|for)\s*(?:annual|yearly)\s*(?:increase|escalation)/i,
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
    // "Administrative Fee Cap: 5% of CAM charges" — bridges descriptive text
    /(?:admin(?:istrative|istration)?\s*fee\s*(?:cap|limit|maximum))\s*[:]\s*[^%]{0,60}?(\d+(?:\.\d+)?)\s*%/i,
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
    // "Management Fee Cap: 4% of operating expenses" — bridges descriptive text
    /(?:(?:property\s*)?management\s*fee\s*(?:cap|limit|maximum))\s*[:]\s*[^%]{0,60}?(\d+(?:\.\d+)?)\s*%/i,
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
    // "Tenant Pro Rata Share: 8.5% of operating expenses" — bridges descriptive text after colon
    /(?:(?:tenant(?:'s)?\s*)?pro[\s-]*rata\s*share)\s*[:]\s*(\d+(?:\.\d+)?)\s*%/i,
    // "Pro Rata Share: 8.5%" — simple colon-separated
    /(?:pro[\s-]*rata\s*share)\s*[:]\s*(\d+(?:\.\d+)?)\s*%/i,
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
    // "4,200 rentable square feet within/in/of the/a Building" (tenant context)
    /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:rentable\s*)?(?:sq(?:uare)?\s*(?:ft|feet)|sf|rsf)\s*(?:within|in|of)\s*(?:the|a)\s*(?:building|property)/i,
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
    // "based on 5,100 rentable square feet" (common in pro-rata share context)
    /based\s*on\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:rentable\s*)?(?:sq(?:uare)?\s*(?:ft|feet)|sf|rsf)/i,
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
  // Require at least one digit — prevents bare commas from matching
  const dollarCapture = `(\\$?\\s*\\d[\\d,]*(?:\\.\\d{1,2})?)`;

  /**
   * Given a regex match result, find the LAST dollar-sign-prefixed amount
   * on the same line as the match. This handles multi-column PDF tables
   * (Budget | Actual) where the first amount is Budget and the last is Actual.
   * Also skips bare percentages that the simple capture group might grab.
   */
  function extractBestDollarAmount(
    fullText: string,
    match: RegExpMatchArray,
  ): string | null {
    // Find the line containing this match
    // Handle \r\n, \n, and \r line endings
    const matchIdx = match.index ?? fullText.indexOf(match[0]);
    const lineBreak = /[\r\n]/;
    let lineStart = matchIdx;
    while (lineStart > 0 && !lineBreak.test(fullText[lineStart - 1])) {
      lineStart--;
    }
    let lineEnd = matchIdx + match[0].length;
    while (lineEnd < fullText.length && !lineBreak.test(fullText[lineEnd])) {
      lineEnd++;
    }
    const fullLine = fullText.slice(lineStart, lineEnd);

    // Find all $-prefixed amounts on this line (definitive dollar amounts)
    const dollarAmounts = [...fullLine.matchAll(/\$\s*\d[\d,]*(?:\.\d{1,2})?/g)];
    if (dollarAmounts.length > 0) {
      // Return the LAST dollar amount (Actual column in Budget|Actual tables)
      return dollarAmounts[dollarAmounts.length - 1][0];
    }

    // No $-prefixed amounts — look for large bare numbers on this line
    // Match both comma-formatted (53,444.13) AND pure digit amounts (661437)
    const bareAmounts = [
      ...fullLine.matchAll(/(?<!\d)(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?)(?!\d)/g),
      ...fullLine.matchAll(/(?<!\d)(\d{4,}(?:\.\d{1,2})?)(?![,\d])/g),
    ];
    if (bareAmounts.length > 0) {
      // Find the largest valid amount (most likely the actual dollar total)
      let bestAmount: string | null = null;
      let bestVal = 0;
      for (const m of bareAmounts) {
        const val = parseFloat(m[1].replace(/,/g, ""));
        if (!isNaN(val) && val >= 100 && val > bestVal) {
          bestVal = val;
          bestAmount = m[1];
        }
      }
      if (bestAmount) return bestAmount;
    }

    // Fallback: use the regex capture but validate it
    const captured = match[1]?.trim() ?? null;
    if (captured) {
      const val = parseFloat(captured.replace(/[$,%\s]/g, ""));
      // If < 100, it's likely a misidentified percentage (e.g. "8.08%")
      if (!isNaN(val) && val >= 100) return captured;
    }

    return null;
  }

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
    // Skip bare percentage values — only capture $-prefixed amounts
    new RegExp(
      `(?:tenant(?:'s)?\\s*share|your\\s*(?:share|portion))\\s*(?:\\([^)]*\\)\\s*)?(?:\\s*\\d+(?:\\.\\d+)?\\s*%\\s*)?${flexSep}${dollarCapture}`,
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
    // "Aggregate expenses", "Combined charges" (via concept normalization)
    new RegExp(
      `(?:aggregate\\s*(?:operating\\s*)?(?:expenses?|charges?|costs?)|combined\\s*(?:operating\\s*)?(?:expenses?|charges?))${flexSep}${dollarCapture}`,
      "i",
    ),
    // "Annual true-up", "Year-end adjustment/true-up"
    new RegExp(
      `(?:annual\\s*true[\\s-]*up|year[\\s-]*end\\s*(?:adjustment|true[\\s-]*up|reconciliation))${flexSep}${dollarCapture}`,
      "i",
    ),
    // "Tenant adjustment", "Landlord pass-through charges"
    new RegExp(
      `(?:tenant\\s*(?:adjustment|true[\\s-]*up)|landlord\\s*pass[\\s-]*through\\s*(?:charges?|amount))${flexSep}${dollarCapture}`,
      "i",
    ),
  ];
  let totalCamCharges: string | null = null;
  for (const pat of totalCamPatterns) {
    const m = text.match(pat);
    if (m) {
      totalCamCharges = extractBestDollarAmount(text, m);
      if (totalCamCharges) break;
      // If extractBestDollarAmount returned null (misidentified percentage),
      // continue to next pattern
    }
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
    if (m) {
      reconciliationTotal = extractBestDollarAmount(text, m);
      if (reconciliationTotal) break;
    }
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
    // "Reconciliation for the Year 2024", "Operating Expense Reconciliation for the Year 2025"
    /reconciliation\s+(?:for\s+)?(?:the\s+)?(?:year\s+)?(\d{4})/i,
    // "for the Year 2024" (standalone)
    /for\s+the\s+year\s+(\d{4})/i,
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
  // Match category names followed by whitespace (2+ spaces, tabs, or mix)
  const categoryPattern = /^[\s]*([A-Za-z][A-Za-z0-9 ()&\-\/,.:;%]+?)(?:\s{2,}|\t+|\s*\t)/;
  const amountPattern = /\$?\s*([\d,]+(?:\.\d{1,2})?)/g;

  // Also handle dotted-leader lines: "Category .............. $Amount"
  // (dots already normalized to spaces by normalizeExtractedText, but handle originals too)
  const dottedLeaderPattern = /^[\s]*([A-Za-z][A-Za-z0-9 ()&\-\/,:%]+?)\s*(?:\.{2,}|_{2,}|\-{2,})\s*/;

  // Colon-separated: "Category: $Amount" or "Category:  $Amount"
  const colonPattern = /^[\s]*([A-Za-z][A-Za-z0-9 ()&\-\/,%]+?)\s*:\s*/;

  // Pipe/bar-separated tables: "| Category | $Amount |"
  const pipeSepPattern = /\|\s*([A-Za-z][A-Za-z0-9 ()&\-\/,%]+?)\s*\|/;

  for (const line of textLines) {
    // Try multi-space/tab separator first, then dotted-leader, then colon, then pipe
    const catMatch = line.match(categoryPattern) || line.match(dottedLeaderPattern) || line.match(colonPattern) || line.match(pipeSepPattern);
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

  // Dollar-sign separator fallback: "Category $Amount" — the $ acts as delimiter
  // even when spaces are missing or minimal (e.g. "Administrative Fee$6,500.00")
  const dollarSepPattern = /(?:^|[\n\r])[\s]*([A-Za-z][A-Za-z0-9 ()&\-\/,%]+?)\s*\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:$|[\n\r])/gm;
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

  // Dollar-sign separator fallback pass
  let dollarMatch;
  while ((dollarMatch = dollarSepPattern.exec(text)) !== null) {
    const cat = dollarMatch[1].replace(/[\s.\-:;]+$/, "").trim().toLowerCase();
    const amt = dollarMatch[2];
    const numVal = parseFloat(amt.replace(/,/g, ""));
    if (numVal >= 100 && cat.length > 2 && cat.length < 60) {
      const alreadyExists = lineItems.some(
        (li) => li.category === cat && li.amount === amt,
      );
      if (!alreadyExists) {
        lineItems.push({ category: cat, amount: amt, rawLine: dollarMatch[0].trim() });
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
  // Post-extraction validation: ensure totals are real dollar amounts
  // A value < $100 is almost certainly a misidentified percentage (e.g. 8.08%)
  // -----------------------------------------------------------------
  if (totalCamCharges) {
    const val = normalizeNumber(totalCamCharges);
    if (isNaN(val) || val < 100) {
      totalCamCharges = null;
    }
  }
  if (reconciliationTotal && !derivedTotal) {
    const val = normalizeNumber(reconciliationTotal);
    if (isNaN(val) || val < 100) {
      reconciliationTotal = null;
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

  // --- Debug extraction diagnostic block ---
  const fields = {
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

  // Log detailed extraction diagnostics
  const textLen = text.length;
  const nullFields = Object.entries(fields)
    .filter(([k, v]) => v === null && k !== "baseRent")
    .map(([k]) => k);
  console.log(
    `[extractFields] text=${textLen} chars | ` +
    `camCap=${camCapPercentage ?? "MISS"} | adminFee=${adminFeePercentage ?? "MISS"} | ` +
    `mgmtFee=${managementFee ?? "MISS"} | proRata=${proRataShare ?? "MISS"} | ` +
    `totalCam=${totalCamCharges ?? "MISS"} | reconTotal=${reconciliationTotal ?? "MISS"} | ` +
    `year=${reconciliationYear ?? "MISS"} | lineItems=${lineItems.length} | ` +
    `excludedTerms=${excludedTerms.length} | nullFields=[${nullFields.join(",")}]`
  );

  return fields;
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

  // Data-driven promotion: if we extracted strong financial data from both
  // documents, promote to "full" even if keyword classification is weak.
  // This handles real-world documents with non-standard formatting that
  // have low keyword hits but contain real extractable financial data.
  const hasStrongLeaseData =
    (leaseFields.camCapPercentage != null || leaseFields.proRataShare != null) &&
    (leaseFields.excludedTerms.length > 0 || leaseFields.managementFee != null || leaseFields.adminFeePercentage != null);
  const hasStrongReconData =
    (reconFields.totalCamCharges != null || reconFields.reconciliationTotal != null) &&
    reconFields.lineItems.length >= 2;

  if (hasStrongLeaseData && hasStrongReconData) {
    return "full";
  }

  // At least one unknown — run in limited mode regardless.
  // Never reject: the audit engine generates "Insufficient Data" findings
  // when fields are missing, which is more useful than blocking entirely.
  if (leaseTier === "unknown" || reconTier === "unknown") {
    return "limited";
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

  // 2. Log short-text warnings but NEVER reject — always try to audit.
  // AI extraction and the audit engine can produce useful findings even
  // with very limited text.  Blocking here was the primary cause of the
  // "stuck at 95%" / "does not contain readable data" errors.
  const MIN_TEXT_LENGTH = 20;

  if (leaseText.trim().length < MIN_TEXT_LENGTH) {
    console.warn(
      `[validator] Lease text very short (${leaseText.trim().length} chars) — will attempt AI extraction`,
    );
    issues.push({
      field: "lease_text",
      message: "Lease document contained very little extractable text. AI analysis will be attempted.",
    });
  }

  if (reconText.trim().length < MIN_TEXT_LENGTH) {
    console.warn(
      `[validator] Recon text very short (${reconText.trim().length} chars) — will attempt AI extraction`,
    );
    issues.push({
      field: "recon_text",
      message: "Reconciliation document contained very little extractable text. AI analysis will be attempted.",
    });
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
  let leaseFields = extractFields(leaseText);
  let reconFields = extractFields(reconText);

  // Log regex extraction results for diagnosis
  console.log(`[validator] Regex lease fields — camCap: ${leaseFields.camCapPercentage ?? "NULL"}, adminFee: ${leaseFields.adminFeePercentage ?? "NULL"}, mgmtFee: ${leaseFields.managementFee ?? "NULL"}, proRata: ${leaseFields.proRataShare ?? "NULL"}`);
  console.log(`[validator] Regex lease fields — excludedTerms: [${leaseFields.excludedTerms.join(", ")}], lineItems: ${leaseFields.lineItems.length}`);
  console.log(`[validator] Regex recon fields — totalCam: ${reconFields.totalCamCharges ?? "NULL"}, reconTotal: ${reconFields.reconciliationTotal ?? "NULL"}, lineItems: ${reconFields.lineItems.length}, year: ${reconFields.reconciliationYear ?? "NULL"}, expenseCats: ${reconFields.expenseCategories.length}`);

  // 5b. AI-powered extraction: supplement regex results with Claude analysis.
  // Runs in parallel for both documents. Falls back gracefully if no API key.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const hasApiKey = !!apiKey && apiKey.length > 20 && !apiKey.endsWith("...");
  console.log(
    `[validator] ANTHROPIC_API_KEY configured: ${hasApiKey} ` +
    `(length=${apiKey?.length ?? 0}, prefix=${apiKey ? apiKey.substring(0, 12) + "..." : "NOT SET"})`
  );

  try {
    console.log("[validator] Attempting AI-powered field extraction...");
    const [aiLease, aiRecon] = await Promise.all([
      extractLeaseFieldsWithAI(leaseText),
      extractReconFieldsWithAI(reconText),
    ]);

    if (aiLease) {
      console.log("[validator] AI lease extraction successful:", JSON.stringify(aiLease));
      leaseFields = mergeLeaseFields(leaseFields, aiLease);
    } else {
      console.log("[validator] AI lease extraction returned null (no API key or failed)");
    }

    if (aiRecon) {
      console.log("[validator] AI recon extraction successful:", JSON.stringify(aiRecon));
      reconFields = mergeReconFields(reconFields, aiRecon);
    } else {
      console.log("[validator] AI recon extraction returned null (no API key or failed)");
    }

    // Log merged field results after AI supplementation
    console.log(`[validator] Post-AI lease fields — camCap: ${leaseFields.camCapPercentage ?? "NULL"}, adminFee: ${leaseFields.adminFeePercentage ?? "NULL"}, mgmtFee: ${leaseFields.managementFee ?? "NULL"}, proRata: ${leaseFields.proRataShare ?? "NULL"}, excludedTerms: ${leaseFields.excludedTerms.length}`);
    console.log(`[validator] Post-AI recon fields — totalCam: ${reconFields.totalCamCharges ?? "NULL"}, reconTotal: ${reconFields.reconciliationTotal ?? "NULL"}, year: ${reconFields.reconciliationYear ?? "NULL"}, lineItems: ${reconFields.lineItems.length}`);
  } catch (err) {
    console.warn(
      "[validator] AI extraction failed (falling back to regex only):",
      err instanceof Error ? err.message : err,
    );
  }

  // 6. Determine audit mode based on classification tier + extracted fields
  const auditMode = determineAuditMode(
    leaseClassification,
    reconClassification,
    leaseFields,
    reconFields,
  );

  // Note: auditMode is never "rejected" — we always proceed.
  // The audit engine will generate appropriate findings even with sparse data.

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

// ---------------------------------------------------------------------------
// AI extraction merge helpers
// ---------------------------------------------------------------------------

/**
 * Merge AI-extracted lease fields into regex-extracted fields.
 * AI values take priority when the regex value is null/empty.
 * When both exist, AI overrides only if the regex value looks suspicious.
 */
function mergeLeaseFields(
  regex: ExtractedFields,
  ai: AILeaseFields,
): ExtractedFields {
  return {
    ...regex,
    camCapPercentage: ai.camCapPercentage ?? regex.camCapPercentage,
    adminFeePercentage: ai.adminFeePercentage ?? regex.adminFeePercentage,
    managementFee: ai.managementFee ?? regex.managementFee,
    proRataShare: ai.proRataShare ?? regex.proRataShare,
    tenantPremisesSqFt: ai.tenantPremisesSqFt ?? regex.tenantPremisesSqFt,
    buildingTotalSqFt: ai.buildingTotalSqFt ?? regex.buildingTotalSqFt,
    statedTenantSharePercent:
      ai.statedTenantSharePercent ?? regex.statedTenantSharePercent,
    excludedTerms:
      ai.excludedTerms.length > 0
        ? [...new Set([...regex.excludedTerms, ...ai.excludedTerms])]
        : regex.excludedTerms,
  };
}

/**
 * Merge AI-extracted reconciliation fields into regex-extracted fields.
 * AI values take priority when the regex value is null/empty.
 */
function mergeReconFields(
  regex: ExtractedFields,
  ai: AIReconFields,
): ExtractedFields {
  // For dollar amounts, AI provides them as "$53,444.13" — strip to match regex format
  const cleanDollar = (v: string | null): string | null => {
    if (!v) return null;
    // Keep the numeric format: remove only leading $, keep commas and decimals
    return v.replace(/^\$\s*/, "").trim() || null;
  };

  // Merge line items: combine regex + AI, deduplicate by category
  const mergedLineItems = [...regex.lineItems];
  if (ai.lineItems.length > 0) {
    const existingCats = new Set(
      regex.lineItems.map((li) => li.category.toLowerCase().trim()),
    );
    for (const aiItem of ai.lineItems) {
      const cat = aiItem.category.toLowerCase().trim();
      if (!existingCats.has(cat)) {
        // Clean the amount: strip $, keep commas
        const cleanedAmount = aiItem.amount.replace(/^\$\s*/, "").trim();
        mergedLineItems.push({
          category: cat,
          amount: cleanedAmount,
          rawLine: `${aiItem.category}: $${cleanedAmount}`,
        });
        existingCats.add(cat);
      }
    }
  }

  // Merge expense categories from AI line items
  const mergedExpenseCategories = [...regex.expenseCategories];
  for (const li of ai.lineItems) {
    const cat = li.category.toLowerCase().trim();
    if (!mergedExpenseCategories.includes(cat)) {
      mergedExpenseCategories.push(cat);
    }
  }

  return {
    ...regex,
    totalCamCharges:
      cleanDollar(ai.totalCamCharges) ?? regex.totalCamCharges,
    reconciliationTotal:
      cleanDollar(ai.reconciliationTotal) ?? regex.reconciliationTotal,
    priorYearTotal:
      cleanDollar(ai.priorYearTotal) ?? regex.priorYearTotal,
    reconciliationYear: ai.reconciliationYear ?? regex.reconciliationYear,
    proRataShare: ai.proRataShare ?? regex.proRataShare,
    adminFeePercentage: ai.adminFeePercentage ?? regex.adminFeePercentage,
    managementFee: ai.managementFee ?? regex.managementFee,
    lineItems: mergedLineItems,
    expenseCategories: mergedExpenseCategories,
  };
}

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
