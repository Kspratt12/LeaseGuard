import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

const BUCKET = "invoices";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: audit, error } = await supabase
    .from("audits")
    .select("report_pdf_url")
    .eq("id", id)
    .single();

  if (error || !audit?.report_pdf_url) {
    return NextResponse.json(
      { error: "Report not found" },
      { status: 404 },
    );
  }

  // Generate a signed URL valid for 60 minutes
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(audit.report_pdf_url, 3600);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { error: "Failed to generate download URL" },
      { status: 500 },
    );
  }

  return NextResponse.redirect(signed.signedUrl);
}
