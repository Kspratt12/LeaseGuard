import { authenticate, type AuthedUser } from "@/lib/audit-access";
import { createServiceClient } from "@/lib/supabase";

/**
 * Administrator authorization. Decided on the server, for every admin API call.
 *
 * A caller is an administrator only if BOTH hold:
 *   1. their bearer token is a valid Supabase session (verified with Supabase Auth), and
 *   2. their user id has a row in public.admin_users.
 *
 * admin_users is writable only with the service role, so nobody can grant themselves access
 * through the app, and registering with a particular email address grants nothing. Rows are
 * added by the owner, deliberately, in the SQL editor (see supabase/pending/ADMIN-ACTIVATION.sql).
 * Any lookup failure denies access (fail closed).
 */

export type AdminAuth = { ok: true; user: AuthedUser } | { ok: false; status: 401 | 403 };

export interface AdminDeps {
  verify?: (token: string) => Promise<{ id: string } | null>;
  isAdmin?: (userId: string) => Promise<boolean>;
}

async function isAdminInDatabase(userId: string): Promise<boolean> {
  const { data, error } = await createServiceClient().from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
  return !error && !!data;
}

export async function authorizeAdmin(req: Request, deps: AdminDeps = {}): Promise<AdminAuth> {
  const user = await authenticate(req, deps.verify);
  if (!user) return { ok: false, status: 401 };
  try {
    const allowed = await (deps.isAdmin ?? isAdminInDatabase)(user.id);
    return allowed ? { ok: true, user } : { ok: false, status: 403 };
  } catch {
    return { ok: false, status: 403 };
  }
}

/**
 * Diagnostic text is shown to the administrator, so strip anything that could carry personal or
 * sensitive detail (email addresses, links, long digit runs, file names) and keep it short.
 */
export function redactDiagnostic(text: string | null | undefined, max = 140): string {
  if (!text) return "";
  const cleaned = text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]")
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/\b[\w.-]+\.(pdf|png|jpe?g|docx?|heic|webp)\b/gi, "[file]")
    .replace(/\d{6,}/g, "[number]")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > max ? cleaned.slice(0, max - 1) + "…" : cleaned;
}
