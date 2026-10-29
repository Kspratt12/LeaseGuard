import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { handleStripeEvent } from "@/lib/payments";
import { supabasePaymentStore } from "@/lib/payment-store";
import { getStripe, stripeModeFromKey } from "@/lib/stripe";

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
    const result = await handleStripeEvent(event, {
      store: supabasePaymentStore(createServiceClient()),
      stripe,
      expectLivemode: stripeModeFromKey(process.env.STRIPE_SECRET_KEY) === "live",
    });
    const line = `[stripe-webhook] ${event.type} ${event.id} -> ${result.outcome}${result.reason ? ` (${result.reason})` : ""}`;
    // A rejected payment may mean a customer was charged without being unlocked: needs a human.
    if (result.outcome === "rejected") console.error(`ACTION REQUIRED ${line}`);
    else console.log(line);
    return NextResponse.json({ received: true, outcome: result.outcome });
  } catch (err) {
    // 500 makes Stripe retry; the event is only marked processed on success.
    console.error(`[stripe-webhook] ${event.type} ${event.id} failed:`, err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
