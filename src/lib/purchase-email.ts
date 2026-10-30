/**
 * Purchase confirmation email, sent once after Stripe has confirmed a payment.
 *
 * Rules this module enforces:
 *  - It is only called after the webhook has verified the payment (outcome "paid"); it also re-checks the payment row.
 *  - One email per payment, even if Stripe delivers events twice or in parallel: the send is CLAIMED atomically in the
 *    database first (and the provider call carries an idempotency key as a second guard).
 *  - It never throws into the webhook: a failed email must not make Stripe retry the payment event.
 *  - No attachment. The email links to the signed-in results page; the report itself never travels by email.
 *  - Logs say only the result and an error code, never an address, name, file name or document content.
 *
 * Everything outside the world (database, mail provider, clock) is injected so it can be tested without any service.
 */
import { SITE_URL, SUPPORT_EMAIL } from "@/lib/constants";
import type { Tier } from "@/lib/payments";

export interface PurchaseFacts {
  sessionId: string;
  auditId: string;
  ownerId: string;
  tier: Tier;
  amountCents: number;
  currency: string;
  paidAt: string | null;
}

export interface EmailStore {
  /** The verified, paid payment for this checkout session, or null if there is none (never email an unpaid session). */
  loadPaidPayment(sessionId: string): Promise<PurchaseFacts | null>;
  /** Atomically claim the right to send. True for exactly one caller per payment. */
  claim(sessionId: string): Promise<boolean>;
  markSent(sessionId: string): Promise<void>;
  /** Give the claim back after a failure so a later attempt is possible; records the error CODE only. */
  release(sessionId: string, errorCode: string): Promise<void>;
  /** The address of the account that owns the payment. */
  getOwnerEmail(ownerId: string): Promise<string | null>;
}

export type EmailSender = (msg: { to: string; subject: string; html: string; text: string; idempotencyKey: string }) => Promise<{ ok: true } | { ok: false; code: string }>;

export type PurchaseEmailOutcome = "sent" | "skipped_not_configured" | "skipped_not_paid" | "skipped_already_sent" | "skipped_no_address" | "failed";

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export function reviewName(tier: Tier): string {
  return tier === "single" ? "One-year CAM review" : "Multi-year CAM review (2 to 5 years)";
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function formatPaid(amountCents: number, currency: string): string {
  const major = (amountCents / 100).toFixed(2);
  return `$${major.replace(/\B(?=(\d{3})+(?!\d))/g, ",")} ${currency.toUpperCase()}`;
}

export function resultsUrl(auditId: string, baseUrl: string = SITE_URL): string {
  return `${baseUrl.replace(/\/$/, "")}/audit/${encodeURIComponent(auditId)}`;
}

export function buildPurchaseEmail(f: PurchaseFacts, opts: { baseUrl?: string; supportEmail?: string } = {}): { subject: string; html: string; text: string } {
  const support = opts.supportEmail ?? SUPPORT_EMAIL;
  const url = resultsUrl(f.auditId, opts.baseUrl);
  const name = reviewName(f.tier);
  const amount = formatPaid(f.amountCents, f.currency);
  const date = f.paidAt ? new Date(f.paidAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : null;
  const ref = `LG-${f.auditId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const subject = "Your LeaseGuard report is unlocked";

  const steps: Array<[string, string]> = [
    ["Download PDF report", "On the results page, choose Download PDF report. It includes your findings, the source evidence and the CAM Review Plan."],
    ["Open your CAM Review Plan", "A one-page checklist of what to ask your landlord for and what to check first. It is on the results page and at the end of the PDF."],
    ["Prepare dispute letter", "Turns the findings into a letter you can edit before you send it. It asks your landlord for explanations and supporting records without accusing anyone."],
  ];

  const text = [
    "Your LeaseGuard report is unlocked.",
    "",
    `Review: ${name}`,
    `Amount paid: ${amount}`,
    ...(date ? [`Date: ${date}`] : []),
    `Reference: ${ref}`,
    "",
    "Open your results:",
    url,
    "",
    "You will be asked to sign in with the email address you used for LeaseGuard. If you do not use a password, choose the email sign-in link.",
    "",
    "What is on the results page:",
    ...steps.map(([t, d]) => `- ${t}: ${d}`),
    "",
    "A reminder about what this is: LeaseGuard flags potential discrepancies for you to review with your landlord. It is not legal or accounting advice and it does not guarantee any refund.",
    "",
    `Questions? Reply to this email or write to ${support}.`,
    "",
    "Your documents and report are not attached to this email on purpose, so they stay behind your sign-in.",
  ].join("\n");

  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#5b6472;font-size:14px;">${esc(label)}</td><td style="padding:6px 0;color:#0f1b2d;font-size:14px;text-align:right;font-weight:600;">${esc(value)}</td></tr>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f1ea;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Open your results, download the PDF and find your CAM Review Plan and dispute letter.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #e3ddd0;">
<tr><td style="padding:24px 24px 8px 24px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:#0f1b2d;">LeaseGuard</td></tr>
<tr><td style="padding:8px 24px 0 24px;font-family:Arial,Helvetica,sans-serif;">
<h1 style="margin:0 0 8px 0;font-size:24px;line-height:1.25;color:#0f1b2d;">Your report is unlocked</h1>
<p style="margin:0 0 16px 0;font-size:16px;line-height:1.5;color:#334155;">Thank you for your purchase. Your full results are ready, and you can come back to them whenever you need.</p>
</td></tr>
<tr><td style="padding:0 24px;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e3ddd0;border-bottom:1px solid #e3ddd0;margin:4px 0 20px 0;">
${row("Review", name)}${row("Amount paid", amount)}${date ? row("Date", date) : ""}${row("Reference", ref)}
</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px 0;"><tr><td style="background:#0f1b2d;border-radius:8px;">
<a href="${esc(url)}" style="display:inline-block;padding:14px 24px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Open my results</a>
</td></tr></table>
<p style="margin:8px 0 20px 0;font-size:13px;line-height:1.5;color:#5b6472;">You will be asked to sign in with the email address you used for LeaseGuard. If you do not use a password, choose the email sign-in link. Button not working? Copy this address into your browser:<br><span style="word-break:break-all;">${esc(url)}</span></p>
<h2 style="margin:0 0 8px 0;font-size:17px;color:#0f1b2d;">What you will find</h2>
${steps.map(([t, d]) => `<p style="margin:0 0 10px 0;font-size:14px;line-height:1.5;color:#334155;"><strong style="color:#0f1b2d;">${esc(t)}.</strong> ${esc(d)}</p>`).join("\n")}
<p style="margin:16px 0;font-size:13px;line-height:1.5;color:#5b6472;">LeaseGuard flags potential discrepancies for you to review with your landlord. It is not legal or accounting advice and does not guarantee any refund.</p>
<p style="margin:0 0 4px 0;font-size:14px;line-height:1.5;color:#334155;">Questions? Reply to this email or write to <a href="mailto:${esc(support)}" style="color:#0f1b2d;">${esc(support)}</a>.</p>
<p style="margin:0 0 24px 0;font-size:12px;line-height:1.5;color:#7a8494;">Your documents and report are not attached to this email on purpose, so they stay behind your sign-in.</p>
</td></tr></table>
</td></tr></table></body></html>`;

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/** Log line with no personal data: audit id prefix and a code only. */
const short = (id: string) => id.slice(0, 8);

export async function sendPurchaseConfirmation(args: {
  sessionId: string;
  store: EmailStore;
  send: EmailSender | null;
  baseUrl?: string;
  log?: { info: (m: string) => void; error: (m: string) => void };
}): Promise<PurchaseEmailOutcome> {
  const log = args.log ?? { info: (m: string) => console.log(m), error: (m: string) => console.error(m) };
  if (!args.send) {
    log.error("[purchase-email] not configured (RESEND_API_KEY missing): confirmation email NOT sent");
    return "skipped_not_configured";
  }
  try {
    const facts = await args.store.loadPaidPayment(args.sessionId);
    if (!facts) return "skipped_not_paid";

    // The only place a send is allowed to start: one winner per payment.
    if (!(await args.store.claim(args.sessionId))) {
      log.info(`[purchase-email] audit=${short(facts.auditId)} already sent or claimed`);
      return "skipped_already_sent";
    }

    const to = await args.store.getOwnerEmail(facts.ownerId);
    if (!to) {
      await args.store.release(args.sessionId, "no_address");
      log.error(`[purchase-email] ACTION REQUIRED audit=${short(facts.auditId)} no address on the account`);
      return "skipped_no_address";
    }

    const content = buildPurchaseEmail(facts, { baseUrl: args.baseUrl });
    const res = await args.send({ to, ...content, idempotencyKey: `purchase-confirmation/${facts.sessionId}` });
    if (!res.ok) {
      await args.store.release(args.sessionId, res.code);
      log.error(`[purchase-email] ACTION REQUIRED audit=${short(facts.auditId)} send failed: ${res.code}`);
      return "failed";
    }
    await args.store.markSent(args.sessionId);
    log.info(`[purchase-email] audit=${short(facts.auditId)} confirmation sent`);
    return "sent";
  } catch (err) {
    // Never let an email problem reach the webhook response.
    log.error(`[purchase-email] ACTION REQUIRED unexpected failure: ${err instanceof Error ? err.name : "unknown"}`);
    return "failed";
  }
}

// ---------------------------------------------------------------------------
// Resend (plain HTTPS call: no new dependency)
// ---------------------------------------------------------------------------

export function resendSender(opts: { apiKey: string; from: string; replyTo: string; fetchImpl?: typeof fetch }): EmailSender {
  const f = opts.fetchImpl ?? fetch;
  return async (m) => {
    try {
      const res = await f("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": m.idempotencyKey },
        body: JSON.stringify({ from: opts.from, to: [m.to], reply_to: opts.replyTo, subject: m.subject, html: m.html, text: m.text }),
      });
      if (res.ok) return { ok: true };
      return { ok: false, code: `http_${res.status}` };
    } catch {
      return { ok: false, code: "network" };
    }
  };
}

/** The sender for this deployment, or null when no key is configured. */
export function configuredSender(env: Record<string, string | undefined> = process.env): EmailSender | null {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey || !apiKey.startsWith("re_")) return null;
  return resendSender({ apiKey, from: env.EMAIL_FROM || "LeaseGuard <noreply@leaseguard.io>", replyTo: SUPPORT_EMAIL });
}
