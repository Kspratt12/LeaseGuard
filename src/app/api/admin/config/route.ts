import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { authorizeAdmin } from "@/lib/admin-access";
import { runConfigChecks } from "@/lib/admin-config-check";
import { checkStripeConfig } from "@/lib/stripe-config";
import { getStripe } from "@/lib/stripe";
import { SITE_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Read-only. The administrator check runs first. Returns labels and pass/fail only: no keys, ids or addresses. */
export async function GET(req: NextRequest) {
  const auth = await authorizeAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? "Sign in required" : "Not authorized" }, { status: auth.status, headers: NO_STORE });
  }
  try {
    let stripe = null;
    if (checkStripeConfig(process.env).ok) {
      try { stripe = getStripe(); } catch { stripe = null; }
    }
    const db = createServiceClient();
    const checks = await runConfigChecks({
      env: process.env,
      stripe,
      siteUrl: process.env.APP_BASE_URL || SITE_URL,
      emailColumnsExist: async () => {
        const { error } = await db.from("payments").select("confirmation_email_sent_at").limit(1);
        return !error;
      },
    });
    return NextResponse.json({ checks }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Could not load this section" }, { status: 500, headers: NO_STORE });
  }
}
