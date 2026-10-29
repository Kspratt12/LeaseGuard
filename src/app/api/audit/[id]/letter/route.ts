import { NextRequest, NextResponse } from "next/server";
import { requirePaidAudit } from "@/lib/paid-access";
import { buildDisputeLetter, letterToDocx, letterToPdf } from "@/services/dispute-letter";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_LETTER_CHARS = 20_000;

/** Draft letter built from the stored, verified findings. Owner + verified payment only. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await requirePaidAudit(req, id);
  if (!gate.ok) return gate.response;

  const { data: a } = await gate.db
    .from("audits")
    .select("free_findings,paid_findings,overcharge_breakdown,lease_clauses_summary,savings_estimate")
    .eq("id", id)
    .eq("owner_id", gate.userId)
    .maybeSingle();
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });

  const letter = buildDisputeLetter({
    findings: [...(a.free_findings ?? []), ...(a.paid_findings ?? [])],
    overchargeBreakdown: a.overcharge_breakdown ?? [],
    leaseClausesSummary: a.lease_clauses_summary ?? null,
  });
  return NextResponse.json(
    {
      text: letter.text,
      total: letter.total,
      headlineTotal: a.savings_estimate ?? null,
      placeholders: letter.placeholders,
      items: letter.items,
    },
    { headers: NO_STORE },
  );
}

/** Export the customer's EDITED text as PDF or Word. Same gate, so it is not a free converter. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await requirePaidAudit(req, id);
  if (!gate.ok) return gate.response;

  let body: { text?: unknown; format?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: NO_STORE });
  }
  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim() || text.length > MAX_LETTER_CHARS) {
    return NextResponse.json({ error: "The letter is empty or too long." }, { status: 400, headers: NO_STORE });
  }

  const name = `LeaseGuard-Dispute-Letter-${id.slice(0, 8)}`;
  if (body.format === "docx") {
    return new NextResponse(new Uint8Array(await letterToDocx(text)), {
      headers: {
        ...NO_STORE,
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${name}.docx"`,
      },
    });
  }
  if (body.format === "pdf") {
    return new NextResponse(new Uint8Array(await letterToPdf(text)), {
      headers: { ...NO_STORE, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"` },
    });
  }
  return NextResponse.json({ error: "Unknown format" }, { status: 400, headers: NO_STORE });
}
