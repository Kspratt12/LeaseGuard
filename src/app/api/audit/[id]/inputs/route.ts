import { NextRequest, NextResponse } from "next/server";
import { requirePaidAudit } from "@/lib/paid-access";
import { containLegacyAudit } from "@/lib/legacy-containment";
import { applyInputOverrides, listCorrectableInputs, mergeOverrides, validateCorrections } from "@/lib/input-overrides";
import { readOverrides, writeOverrides } from "@/lib/input-overrides-store";
import { errorInfo } from "@/lib/safe-log";

/**
 * The numbers this audit's deterministic checks used, and customer corrections of them.
 * Owner + verified payment only (the same gate as the report and the letter). Corrections are stored separately from
 * the extracted results and applied when the audit is read (src/lib/input-overrides.ts).
 */
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };
const COLUMNS = "free_findings,paid_findings,overcharge_breakdown,lease_clauses_summary,savings_estimate,estimated_overcharge,validation_warning";

async function load(db: Awaited<ReturnType<typeof requirePaidAudit>> & { ok: true }, id: string) {
  const { data } = await db.db.from("audits").select(COLUMNS).eq("id", id).eq("owner_id", db.userId).maybeSingle();
  return data ? containLegacyAudit(data as Record<string, unknown>) : null;
}

function view(row: Record<string, unknown>, read: Awaited<ReturnType<typeof readOverrides>>) {
  const shown = applyInputOverrides(row, read.overrides);
  return {
    available: read.available,
    inputs: listCorrectableInputs(row, read.overrides),
    savings_estimate: shown.savings_estimate ?? null,
    corrections: (shown.lease_clauses_summary as { inputCorrections?: unknown } | null)?.inputCorrections ?? null,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await requirePaidAudit(req, id);
  if (!gate.ok) return gate.response;
  const row = await load(gate, id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
  return NextResponse.json(view(row, await readOverrides(gate.db, id, gate.userId)), { headers: NO_STORE });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await requirePaidAudit(req, id);
  if (!gate.ok) return gate.response;
  let body: { values?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: NO_STORE });
  }
  if (!body || typeof body.values !== "object" || body.values === null || Array.isArray(body.values)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: NO_STORE });
  }
  const row = await load(gate, id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
  const read = await readOverrides(gate.db, id, gate.userId);
  if (!read.available) {
    return NextResponse.json({ error: "Corrections are not available yet." }, { status: 503, headers: NO_STORE });
  }
  const inputs = listCorrectableInputs(row, read.overrides);
  const checked = validateCorrections(inputs, body.values as Record<string, unknown>);
  if (!checked.ok) return NextResponse.json({ error: checked.errors.join(" ") }, { status: 400, headers: NO_STORE });
  const merged = mergeOverrides(read.overrides, inputs, checked.changes, new Date().toISOString());
  const result = await writeOverrides(gate.db, id, gate.userId, merged);
  if (result !== "ok") {
    if (result === "error") console.error(`[inputs:${id}] write failed`, errorInfo(new Error("update failed")));
    return NextResponse.json(
      { error: result === "unavailable" ? "Corrections are not available yet." : "The correction could not be saved. Please try again." },
      { status: result === "unavailable" ? 503 : 500, headers: NO_STORE },
    );
  }
  return NextResponse.json(view(row, { available: true, overrides: merged }), { headers: NO_STORE });
}
