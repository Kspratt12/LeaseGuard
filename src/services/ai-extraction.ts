/**
 * AI-powered document field extraction using Claude.
 *
 * Sends extracted document text to Claude and returns structured fields.
 * Falls back gracefully when the API key is not configured.
 *
 * This supplements the regex-based extraction in document-validator.ts
 * to handle varied document formats that regex patterns miss.
 */

import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AILeaseFields {
  camCapPercentage: string | null;
  adminFeePercentage: string | null;
  managementFee: string | null;
  proRataShare: string | null;
  tenantPremisesSqFt: string | null;
  buildingTotalSqFt: string | null;
  statedTenantSharePercent: string | null;
  excludedTerms: string[];
}

export interface AIReconLineItem {
  category: string;
  amount: string;
}

export interface AIReconFields {
  totalCamCharges: string | null;
  reconciliationTotal: string | null;
  priorYearTotal: string | null;
  reconciliationYear: number | null;
  proRataShare: string | null;
  adminFeePercentage: string | null;
  managementFee: string | null;
  lineItems: AIReconLineItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if the Anthropic API key is configured (not a placeholder). */
function hasApiKey(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return !!key && key.length > 20 && !key.endsWith("...");
}

/** Parse JSON from Claude's response, stripping markdown fences if present. */
function parseJSON<T>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}

// Singleton client (lazy)
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

// ---------------------------------------------------------------------------
// Lease field extraction
// ---------------------------------------------------------------------------

const LEASE_PROMPT = `You are a commercial real estate lease analyst AI. Extract structured lease terms from the document text below.

Return ONLY a valid JSON object with these exact fields:

{
  "camCapPercentage": "<number as string, e.g. '5' for 5%> or null",
  "adminFeePercentage": "<administrative fee cap percentage as string> or null",
  "managementFee": "<management/property management fee cap percentage as string> or null",
  "proRataShare": "<tenant pro-rata share percentage as string, e.g. '8.08'> or null",
  "tenantPremisesSqFt": "<tenant premises square footage as string with commas, e.g. '8,500'> or null",
  "buildingTotalSqFt": "<total building square footage as string with commas, e.g. '100,000'> or null",
  "statedTenantSharePercent": "<explicitly stated tenant share percentage as string> or null",
  "excludedTerms": ["<expense categories explicitly excluded from pass-through>"]
}

RULES:
- Only extract values CLEARLY stated in the text. Never guess or infer.
- For percentages, return just the number (e.g. "5" not "5%").
- For square footage, include commas (e.g. "8,500").
- For excludedTerms, use lowercase descriptive phrases (e.g. "capital improvement", "structural repair", "roof replacement").
- If a field is not found, use null (or empty array for excludedTerms).
- Look for CAM caps expressed as "shall not exceed X%", "annual increase capped at X%", "controllable expense cap of X%", etc.
- Look for admin/management fees expressed as percentages of operating expenses.
- Look for pro-rata share, proportionate share, or tenant's share percentages.
- Look for square footage of tenant premises and total building area.
- Look for excluded/non-pass-through expense categories in exclusion clauses.

Respond with ONLY the JSON object. No markdown formatting, no explanation.`;

export async function extractLeaseFieldsWithAI(
  text: string,
): Promise<AILeaseFields | null> {
  if (!hasApiKey()) return null;

  try {
    const truncated = text.substring(0, 20000);
    const client = getClient();

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `${LEASE_PROMPT}\n\n--- DOCUMENT TEXT ---\n${truncated}`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") return null;

    const parsed = parseJSON<AILeaseFields>(content.text);

    // Validate and sanitize
    return {
      camCapPercentage: sanitizePercent(parsed.camCapPercentage),
      adminFeePercentage: sanitizePercent(parsed.adminFeePercentage),
      managementFee: sanitizePercent(parsed.managementFee),
      proRataShare: sanitizePercent(parsed.proRataShare),
      tenantPremisesSqFt: parsed.tenantPremisesSqFt || null,
      buildingTotalSqFt: parsed.buildingTotalSqFt || null,
      statedTenantSharePercent: sanitizePercent(
        parsed.statedTenantSharePercent,
      ),
      excludedTerms: Array.isArray(parsed.excludedTerms)
        ? parsed.excludedTerms.filter(
            (t) => typeof t === "string" && t.length > 0,
          )
        : [],
    };
  } catch (err) {
    console.warn(
      "[ai-extraction] Lease AI extraction failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reconciliation field extraction
// ---------------------------------------------------------------------------

const RECON_PROMPT = `You are a commercial real estate CAM reconciliation analyst AI. Extract structured data from this CAM reconciliation statement.

Return ONLY a valid JSON object with these exact fields:

{
  "totalCamCharges": "<total CAM/operating charges as string with $ and commas, e.g. '$53,444.13'> or null",
  "reconciliationTotal": "<building-level total expenses as string with $ and commas> or null",
  "priorYearTotal": "<prior/previous year total as string with $ and commas> or null",
  "reconciliationYear": <four-digit year number, e.g. 2024> or null,
  "proRataShare": "<tenant share percentage as string, e.g. '8.08'> or null",
  "adminFeePercentage": "<admin fee percentage as string> or null",
  "managementFee": "<management fee percentage as string> or null",
  "lineItems": [
    {"category": "<expense category in lowercase>", "amount": "<dollar amount as string, e.g. '12,500'>"}
  ]
}

RULES:
- Only extract values CLEARLY present in the document. Never guess.
- For dollar amounts, include $ and commas (e.g. "$53,444.13").
- For percentages, return just the number (e.g. "8.08" not "8.08%").
- For lineItems, extract each expense category and its dollar amount.
- In multi-column tables (Budget vs Actual), use the ACTUAL column values.
- totalCamCharges = the tenant's total CAM/operating expense amount.
- reconciliationTotal = the building-level total (if different from tenant total).
- priorYearTotal = any prior year / previous year / base year total shown for comparison.
- reconciliationYear = the year this reconciliation covers.
- For lineItems, use lowercase category names (e.g. "property tax", "insurance", "management fee").
- Include ALL line items you can find, even small ones.
- If the document shows a table, extract every row as a line item.

Respond with ONLY the JSON object. No markdown formatting, no explanation.`;

export async function extractReconFieldsWithAI(
  text: string,
): Promise<AIReconFields | null> {
  if (!hasApiKey()) return null;

  try {
    const truncated = text.substring(0, 20000);
    const client = getClient();

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `${RECON_PROMPT}\n\n--- DOCUMENT TEXT ---\n${truncated}`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") return null;

    const parsed = parseJSON<AIReconFields>(content.text);

    // Validate and sanitize
    return {
      totalCamCharges: parsed.totalCamCharges || null,
      reconciliationTotal: parsed.reconciliationTotal || null,
      priorYearTotal: parsed.priorYearTotal || null,
      reconciliationYear: sanitizeYear(parsed.reconciliationYear),
      proRataShare: sanitizePercent(parsed.proRataShare),
      adminFeePercentage: sanitizePercent(parsed.adminFeePercentage),
      managementFee: sanitizePercent(parsed.managementFee),
      lineItems: Array.isArray(parsed.lineItems)
        ? parsed.lineItems
            .filter(
              (li) =>
                typeof li.category === "string" &&
                typeof li.amount === "string" &&
                li.category.length > 0 &&
                li.amount.length > 0,
            )
            .map((li) => ({
              category: li.category.toLowerCase().trim(),
              amount: li.amount.replace(/[$,\s]/g, "").trim()
                ? li.amount
                : li.amount,
            }))
        : [],
    };
  } catch (err) {
    console.warn(
      "[ai-extraction] Recon AI extraction failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sanitization helpers
// ---------------------------------------------------------------------------

/** Strip %, $, spaces from a percentage string and validate it's a real number. */
function sanitizePercent(val: string | null | undefined): string | null {
  if (!val) return null;
  const cleaned = String(val).replace(/[%$,\s]/g, "").trim();
  const num = parseFloat(cleaned);
  if (isNaN(num) || num <= 0 || num > 100) return null;
  return cleaned;
}

/** Validate a year is in a reasonable range. */
function sanitizeYear(val: number | null | undefined): number | null {
  if (val == null) return null;
  const yr = Math.round(val);
  if (yr >= 1990 && yr <= 2099) return yr;
  return null;
}
