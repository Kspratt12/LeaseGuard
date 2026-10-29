/**
 * Password-recovery helpers. Pure, so the rules are testable without a browser or Supabase.
 *
 * Security notes:
 *  - The forgot-password screen must give the SAME answer whether or not an account exists,
 *    so nothing here distinguishes the two.
 *  - A recovery link only ever yields a session for the account that received the email;
 *    it carries no audit data and the reset page displays none.
 */

export const MIN_PASSWORD_LENGTH = 8;

export type RecoveryLinkProblem =
  | { kind: "none" }
  | { kind: "expired" }
  | { kind: "invalid" };

/**
 * Supabase reports a bad recovery link by redirecting back with an error in the URL fragment,
 * e.g. #error=access_denied&error_code=otp_expired&error_description=...
 */
export function parseRecoveryLinkProblem(hashOrQuery: string): RecoveryLinkProblem {
  const raw = hashOrQuery.replace(/^[#?]/, "");
  if (!raw) return { kind: "none" };
  const p = new URLSearchParams(raw);
  const code = (p.get("error_code") ?? "").toLowerCase();
  const err = (p.get("error") ?? "").toLowerCase();
  const desc = (p.get("error_description") ?? "").toLowerCase();
  if (!code && !err && !desc) return { kind: "none" };
  if (code === "otp_expired" || /expired/.test(desc)) return { kind: "expired" };
  return { kind: "invalid" };
}

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password !== confirm) return "The two passwords do not match.";
  return null;
}

/** Simple, deliberately permissive check: the server is the real authority on addresses. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** The one message shown after a reset request, whatever the server answered. */
export const RESET_REQUEST_MESSAGE =
  "If an account exists for that email, we have sent a link to reset the password. " +
  "It can take a few minutes to arrive; check your spam folder. The link works once and expires after a short time.";
