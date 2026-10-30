import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { handleStripeEvent } from "@/lib/payments";
import { supabasePaymentStore, supabaseEmailStore } from "@/lib/payment-store";
import { configuredSender, sendPurchaseConfirmation } from "@/lib/purchase-email";
import { getStripe, stripeModeFromKey } from "@/lib/stripe";
import { errorInfo } from "@/lib/safe-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook. The signature is verified against the RAW request body
 * (req.text(), never a re-serialised JSON body). Unauthenticated by design:
 * the signature is the authentication.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }

  const rawBody = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const db = createServiceClient();
    const result = await handleStripeEvent(event, {
      store: supabasePaymentStore(db),
      stripe,
      expectLivemode: stripeModeFromKey(process.env.STRIPE_SECRET_KEY) === "live",
    });
    const line = `[stripe-webhook] ${event.type} ${event.id} -> ${result.outcome}${result.reason ? ` (${result.reason})` : ""}`;
    // A rejected payment may mean a customer was charged without being unlocked: needs a human.
    if (result.outcome === "rejected") console.error(`ACTION REQUIRED ${line}`);
    else console.log(line);

    // Only a freshly verified payment triggers the confirmation email. It is best effort and never changes the
    // response: a mail problem must not make Stripe retry (and cannot undo access, which is already recorded).
    if (result.outcome === "paid") {
      const session = event.data.object as { id: string };
      await sendPurchaseConfirmation({ sessionId: session.id, store: supabaseEmailStore(db), send: configuredSender(), baseUrl: process.env.APP_BASE_URL });
    }
    return NextResponse.json({ received: true, outcome: result.outcome });
  } catch (err) {
    // 500 makes Stripe retry; the event is only marked processed on success.
    console.error(`[stripe-webhook] ${event.type} ${event.id} failed:`, errorInfo(err));
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
