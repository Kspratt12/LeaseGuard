/**
 * Minimum abuse / cost protection for uploads: every audit triggers paid AI calls.
 * Pure function so the policy is testable; the route supplies the counts.
 *
 * - inFlight: audits still pending/processing (stops double-submits and parallel floods)
 * - lastHour / last24h: audits created recently by the same signed-in user
 */
export const UPLOAD_LIMITS = { inFlight: 2, perHour: 6, perDay: 20 } as const;

export function evaluateUploadQuota(c: { lastHour: number; last24h: number; inFlight: number }): string | null {
  if (c.inFlight >= UPLOAD_LIMITS.inFlight) {
    return "You already have audits being processed. Please wait for them to finish before starting another.";
  }
  if (c.lastHour >= UPLOAD_LIMITS.perHour) {
    return "You have reached the hourly audit limit. Please try again later.";
  }
  if (c.last24h >= UPLOAD_LIMITS.perDay) {
    return "You have reached the daily audit limit. Please try again tomorrow or contact support.";
  }
  return null;
}
