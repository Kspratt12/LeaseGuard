import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { authorizeAdmin } from "@/lib/admin-access";
import { buildOverview } from "@/lib/admin-overview";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Read-only administrator overview. The authorization check runs before any data is touched. */
export async function GET(req: NextRequest) {
  const auth = await authorizeAdmin(req);
  if (!auth.ok) {
    // 401 = not signed in, 403 = signed in but not an administrator. No detail either way.
    return NextResponse.json({ error: auth.status === 401 ? "Sign in required" : "Not authorized" }, { status: auth.status, headers: NO_STORE });
  }
  try {
    return NextResponse.json(await buildOverview(createServiceClient()), { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Could not load the overview" }, { status: 500, headers: NO_STORE });
  }
}
