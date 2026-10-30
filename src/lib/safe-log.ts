/**
 * Helpers for logging failures without logging what the failure was about.
 *
 * An exception message is NOT safe to log: a database error can quote the row it rejected, a parser error can quote
 * the text it choked on, and an AI-client error can include part of a response. These helpers keep only the error
 * type and a short code or status, plus the stack frames (file and function names, never the message line).
 */

const CODE_RE = /^[A-Za-z0-9_.:-]{1,40}$/;

/** "TypeError", or "PostgrestError code=23505", or "APIError status=429". Never the message. */
export function errorInfo(err: unknown): string {
  if (err === null || err === undefined) return "unknown error";
  if (typeof err !== "object") return "non-error value";
  const e = err as { name?: unknown; code?: unknown; status?: unknown; statusCode?: unknown };
  const name = typeof e.name === "string" && CODE_RE.test(e.name) ? e.name : "Error";
  const parts: string[] = [name];
  if ((typeof e.code === "string" || typeof e.code === "number") && CODE_RE.test(String(e.code))) parts.push(`code=${e.code}`);
  const status = typeof e.status === "number" ? e.status : typeof e.statusCode === "number" ? e.statusCode : null;
  if (status !== null && Number.isFinite(status)) parts.push(`status=${status}`);
  return parts.join(" ");
}

/** The first few "at ..." frames of a stack, without the leading message line. */
export function stackFrames(err: unknown, max = 3): string {
  const stack = err && typeof err === "object" ? (err as { stack?: unknown }).stack : undefined;
  if (typeof stack !== "string") return "";
  return stack
    .split("\n")
    .filter((l) => /^\s+at\s/.test(l))
    .slice(0, max)
    .map((l) => l.trim())
    .join(" > ");
}
