import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { authorizeAdmin } from "@/lib/admin-access";
import { lookupData } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Read-only. The administrator check runs before any data is touched. 401 = not signed in, 403 = not an administrator. */
export async function GET(req: NextRequest) {
  const auth = await authorizeAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? "Sign in required" : "Not authorized" }, { status: auth.status, headers: NO_STORE });
  }
  try {
    const data = await lookupData(createServiceClient(), req.nextUrl.searchParams.get("q"));
    if (!data.ok) {
      return NextResponse.json({ error: data.error }, { status: data.status, headers: NO_STORE });
    }
    return NextResponse.json(data, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Could not load this section" }, { status: 500, headers: NO_STORE });
  }
}
