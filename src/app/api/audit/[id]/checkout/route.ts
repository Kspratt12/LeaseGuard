import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { authenticate, userOwnsAudit } from "@/lib/audit-access";
import { createCheckoutForAudit } from "@/lib/payments";
import { supabasePaymentStore } from "@/lib/payment-store";
import { getStripe, stripeModeFromKey } from "@/lib/stripe";
import { SITE_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Create a Stripe Checkout Session (one-time payment) for an audit the signed-in
 * user owns. The request body is ignored: the tier and price are decided on the
 * server from the audit's verified reconciliation-year count.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await authenticate(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401, headers: NO_STORE });

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return NextResponse.json({ error: "Payments are not available right now." }, { status: 503, headers: NO_STORE });
  }

  let result;
  try {
    result = await createCheckoutForAudit({
      auditId: id,
      userId: user.id,
      userOwnsAudit: (auditId, userId) => userOwnsAudit(user.token, userId, auditId),
      store: supabasePaymentStore(createServiceClient()),
      stripe,
      baseUrl: process.env.APP_BASE_URL || SITE_URL,
      expectLivemode: stripeModeFromKey(process.env.STRIPE_SECRET_KEY) === "live",
    });
  } catch {
    // A database read failed: say so, rather than treating it as "this audit cannot be purchased".
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 503, headers: NO_STORE });
  }

  if (result.ok) return NextResponse.json({ url: result.url }, { headers: NO_STORE });

  const map = {
    not_found: [404, "Audit not found"],
    not_ready: [409, "This audit is not finished yet."],
    not_purchasable: [409, "This audit cannot be purchased."],
    already_paid: [409, "This audit is already unlocked."],
    nothing_to_unlock: [409, "There are no additional findings to unlock for this audit, so there is nothing to purchase."],
    insufficient_analysis: [409, "We could not complete enough checks on these documents to offer a paid report, so this audit cannot be purchased."],
    not_configured: [503, "Payments are not available right now."],
    price_mismatch: [503, "Payments are not available right now."],
    stripe_error: [502, "Could not start checkout. Please try again."],
  } as const;
  const [status, error] = map[result.reason];
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}
