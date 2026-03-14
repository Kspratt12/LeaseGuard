import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// Prevent Next.js from caching this route
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  console.log(`[audit/${id}] GET request received`);

  const supabase = createServiceClient();

  const { data: audit, error } = await supabase
    .from("audits")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error(`[audit/${id}] Supabase error: code=${error.code} message=${error.message} details=${error.details}`);
  }

  if (error || !audit) {
    console.log(`[audit/${id}] Not found — error=${!!error}, audit=${!!audit}`);
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  console.log(`[audit/${id}] Found — status=${audit.status}`);

  return NextResponse.json(audit, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
