import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side audit authorization helpers.
 *
 * Authorization is decided by the database: audits are read through a client
 * that carries the caller's own JWT, so row-level security (owner_id =
 * auth.uid()) applies. The service-role client is used only for work that is
 * already authorized (e.g. building the paid teaser for an audit the caller
 * owns) and for background processing. Audit UUIDs are never authorization.
 */

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Columns an owner may read directly. Must match the column grant in the migration. */
export const OWNER_READABLE_COLUMNS = [
  "id",
  "owner_id",
  "status",
  "savings_estimate",
  "free_findings",
  "confidence",
  "confidence_score",
  "validation_warning",
  "was_swapped",
  "audit_mode",
  "estimated_overcharge",
  "overcharge_breakdown",
  "lease_clauses_summary",
] as const;

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/** Client that acts as the signed-in user, so RLS applies to every query. */
export function createUserClient(token: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export interface AuthedUser {
  id: string;
  token: string;
}

/** Validate the bearer token with Supabase Auth. Returns null if missing/invalid. */
export async function authenticate(
  req: Request,
  verify: (token: string) => Promise<{ id: string } | null> = verifyWithSupabase,
): Promise<AuthedUser | null> {
  const token = extractBearerToken(req);
  if (!token) return null;
  try {
    const user = await verify(token);
    return user ? { id: user.id, token } : null;
  } catch {
    return null;
  }
}

async function verifyWithSupabase(token: string) {
  const { data, error } = await createUserClient(token).auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id };
}

/**
 * Teaser for paid findings. Never includes descriptions or source evidence.
 */
export function toPublicAudit(
  audit: Record<string, unknown>,
  paidFindings: unknown,
  access: {
    unlocked: boolean;
    tier: "single" | "multi" | null;
    amountCents: number | null;
    reportAvailable: boolean;
  } = { unlocked: false, tier: null, amountCents: null, reportAvailable: false },
) {
  const paid = Array.isArray(paidFindings)
    ? (paidFindings as Array<Record<string, unknown>>)
    : paidFindings === null || paidFindings === undefined
      ? null
      : [];

  return {
    id: audit.id,
    status: audit.status,
    savings_estimate: audit.savings_estimate,
    free_findings: audit.free_findings,
    // Full paid findings only after the server verified payment AND ownership.
    paid_findings: paid && access.unlocked
      ? paid
      : paid
      ? paid.map((f) => ({
          category: f.category,
          severity: f.severity,
          potential_savings: f.potential_savings,
          insufficientData: f.insufficientData,
          description: "Full details are included in the complete report.",
        }))
      : null,
    error_message:
      audit.status === "error"
        ? "We could not process these documents. Please try again with clear, text-based PDFs."
        : null,
    // The storage path is never returned; the report is fetched via the gated report route.
    report_pdf_url: null,
    report_available: access.unlocked && access.reportAvailable,
    payment: {
      unlocked: access.unlocked,
      tier: access.tier,
      amount_cents: access.amountCents,
      currency: "usd",
    },
    confidence: audit.confidence,
    confidence_score: audit.confidence_score,
    validation_warning: audit.validation_warning,
    was_swapped: audit.was_swapped,
    audit_mode: audit.audit_mode,
    estimated_overcharge: audit.estimated_overcharge,
    overcharge_breakdown: audit.overcharge_breakdown,
    lease_clauses_summary: audit.lease_clauses_summary,
  };
}

/** True when the signed-in user (via RLS, with their own JWT) can see this audit. */
export async function userOwnsAudit(token: string, userId: string, auditId: string): Promise<boolean> {
  if (!UUID_RE.test(auditId)) return false;
  const { data } = await createUserClient(token)
    .from("audits")
    .select("id")
    .eq("id", auditId)
    .eq("owner_id", userId)
    .maybeSingle();
  return !!data;
}
