import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

/**
 * Extract structured lease data (CAM caps, exclusions, base year, etc.)
 * from a lease PDF stored in Supabase.
 *
 * TODO: Implement with Claude vision — pass PDF pages as images,
 * return typed lease terms.
 */
export async function extractLeaseTerms(_leaseUrl: string) {
  // Will use anthropic.messages.create with image content blocks
  return null;
}

/**
 * Extract line-item charges from a CAM reconciliation PDF.
 *
 * TODO: Implement with Claude vision — return typed charge rows.
 */
export async function extractReconCharges(_reconUrl: string) {
  // Will use anthropic.messages.create with image content blocks
  return null;
}
