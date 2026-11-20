/**
 * Reading and writing audits.input_overrides. Server-only (service client, after the caller's access was checked).
 * Tolerates the column not existing yet (migration not applied): reads return "no corrections" and writes report
 * "unavailable", so deploying the code before the migration never breaks an audit page, report or letter.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseOverrides, type InputOverrides } from "@/lib/input-overrides";

export type OverridesRead = { available: boolean; overrides: InputOverrides | null };

/** Postgres "undefined column" (42703) or PostgREST "column not found in schema cache" (PGRST204). */
const missingColumn = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42703" || e.code === "PGRST204" || /input_overrides/.test(e.message ?? ""));

export async function readOverrides(db: SupabaseClient, auditId: string, ownerId: string): Promise<OverridesRead> {
  const { data, error } = await db.from("audits").select("input_overrides").eq("id", auditId).eq("owner_id", ownerId).maybeSingle();
  // A missing column means "not deployed yet"; any other read error shows the original result (never a guessed one).
  if (error) return { available: !missingColumn(error), overrides: null };
  return { available: true, overrides: parseOverrides((data as { input_overrides?: unknown } | null)?.input_overrides) };
}

export async function writeOverrides(
  db: SupabaseClient,
  auditId: string,
  ownerId: string,
  overrides: InputOverrides | null,
): Promise<"ok" | "unavailable" | "error"> {
  const { error } = await db.from("audits").update({ input_overrides: overrides }).eq("id", auditId).eq("owner_id", ownerId);
  if (!error) return "ok";
  return missingColumn(error) ? "unavailable" : "error";
}
