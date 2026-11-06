/**
 * Payment REVIEW status (a confirmed charge that could not be applied), kept separate from entitlement.
 *
 * Fictional data only. The database is a mock that records the filters it was given; there is no Stripe, no AI and NO
 * NETWORK: every outbound path throws and is counted. Entitlement, eligibility and checkout are NOT changed by this work,
 * and this file pins that too.
 *
 * Run: npx tsx src/services/__tests__/payment-review.test.ts
 */
delete process.env.ANTHROPIC_API_KEY;

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import React from "react";
// @ts-expect-error the react-dom type package is not installed; the module itself is
import { renderToStaticMarkup } from "react-dom/server";

const blocked: string[] = [];
const refuse = (what: string) => (..._args: unknown[]): never => {
  blocked.push(what);
  throw new Error(`network blocked: ${what}`);
};
/* eslint-disable @typescript-eslint/no-explicit-any */
(globalThis as any).fetch = async () => { blocked.push("fetch"); throw new Error("network blocked: fetch"); };
for (const [name, mod] of [["http", http], ["https", https]] as const) {
  (mod as any).request = refuse(`${name}.request`);
  (mod as any).get = refuse(`${name}.get`);
}
(net as any).connect = refuse("net.connect");
(net as any).createConnection = refuse("net.createConnection");
(net.Socket.prototype as any).connect = refuse("net.Socket.connect");
(tls as any).connect = refuse("tls.connect");
(dns as any).lookup = refuse("dns.lookup");
(dns as any).resolve = refuse("dns.resolve");
(dns.promises as any).lookup = async () => refuse("dns.promises.lookup")();

const SRC = path.join(__dirname, "../..");
let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8");

const AUDIT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OWNER = "11111111-1111-1111-1111-111111111111";
const OTHER_OWNER = "22222222-2222-2222-2222-222222222222";
const OTHER_AUDIT = "ffffffff-0000-0000-0000-000000000000";

/** A mock of the one Supabase call the reader makes. It APPLIES the .eq filters it is given, over a fictional table. */
type Row = { audit_id: string; owner_id: string; status: string; status_reason: string | null; stripe_session_id: string; amount_paid: number | null };
function mockDb(table: Row[], opts: { fail?: boolean } = {}) {
  const calls: { cols: string; filters: [string, string][] }[] = [];
  const db = {
    from(t: string) {
      assert.strictEqual(t, "payments");
      return {
        select(cols: string) {
          const call = { cols, filters: [] as [string, string][] };
          calls.push(call);
          const chain: any = {
            eq(col: string, val: string) {
              call.filters.push([col, val]);
              if (call.filters.length < 2) return chain;
              const rows = table.filter((r) => call.filters.every(([c, v]) => (r as any)[c] === v)).map((r) => ({ status: r.status, status_reason: r.status_reason }));
              return Promise.resolve(opts.fail ? { data: null, error: { message: "boom" } } : { data: rows, error: null });
            },
          };
          return chain;
        },
      };
    },
  };
  return { db: db as any, calls };
}
const row = (status: string, status_reason: string | null, over: Partial<Row> = {}): Row => ({
  audit_id: AUDIT, owner_id: OWNER, status, status_reason, stripe_session_id: "cs_test_fictional_1", amount_paid: status === "paid" ? 4900 : null, ...over,
});

async function main() {
  await test("NETWORK: canary - the guard blocks and counts, then resets", async () => {
    await assert.rejects(() => fetch("https://example.invalid/"), /network blocked/);
    assert.ok(blocked.length >= 1);
    blocked.length = 0;
  });

  const R = await import("../../lib/payment-review");
  const { SUPPORT_EMAIL } = await import("../../lib/constants");
  const { PaymentReviewNotice } = await import("../../components/payment-review-notice");
  const { NoPurchasePanel } = await import("../../components/audit-no-purchase");
  const { authorizeReportAccess, REFUND_REVIEW_REASONS } = await import("../../lib/payments");

  const SEEN = [...R.CHARGE_SEEN_REJECTION_REASONS];

  await test("EVIDENCE: the charge-seen reasons are exactly the rejections fulfil() reaches AFTER Stripe showed the session paid", () => {
    const src = read("lib/payments.ts");
    const fulfil = src.slice(src.indexOf("async function fulfil("));
    const paidCheck = fulfil.indexOf('session.payment_status !== "paid"');
    assert.ok(paidCheck > 0);
    const before = [...fulfil.slice(0, paidCheck).matchAll(/reject\("([a-z_]+)"\)/g)].map((m) => m[1]);
    const after = [...fulfil.slice(paidCheck).matchAll(/reject\("([a-z_]+)"\)/g)].map((m) => m[1]);
    assert.deepStrictEqual(before.sort(), ["livemode_mismatch", "wrong_mode"], "rejections before the paid check prove nothing");
    assert.deepStrictEqual([...new Set(after)].sort(), [...SEEN].sort(), "every rejection after the paid check, and only those, is charge-seen");
    for (const r of REFUND_REVIEW_REASONS) assert.ok(SEEN.includes(r));
  });

  await test("NO PAYMENT ROW: nothing is asserted either way (no review, and no 'no charge' wording exists anywhere in the product)", async () => {
    const { db } = mockDb([]);
    assert.strictEqual(await R.readPaymentReview(db, AUDIT, OWNER, false), null);
    // the removed assurance is gone from every source file, not merely hidden for this state
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "__tests__" ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]));
    const hits = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f)).filter((f) => /not been charged|have not been charged|haven't been charged|not charged/i.test(fs.readFileSync(f, "utf8")));
    assert.deepStrictEqual(hits, []);
    const panel = renderToStaticMarkup(React.createElement(NoPurchasePanel, { reason: "insufficient_analysis", unquantifiedChecks: 2 })) as string;
    assert.ok(/not offering a purchase for this audit\./.test(panel) && !/charged/i.test(panel), "the no-purchase panel makes no statement about charges");
    const cleanPanel = renderToStaticMarkup(React.createElement(NoPurchasePanel, { reason: "nothing_to_unlock" })) as string;
    assert.ok(!/charged/i.test(cleanPanel));
  });

  await test("PENDING, FAILED, EXPIRED and UNKNOWN: no review is raised and nothing is inferred (webhook failure leaves a pending row)", async () => {
    const cases: [string, Row[]][] = [
      ["pending", [row("pending", null)]],
      ["failed", [row("failed", null)]],
      ["expired", [row("expired", null)]],
      ["rejected, reason before the paid check (livemode_mismatch)", [row("rejected", "livemode_mismatch")]],
      ["rejected, reason before the paid check (wrong_mode)", [row("rejected", "wrong_mode")]],
      ["rejected, unrecognised reason", [row("rejected", "something_new")]],
      ["rejected, empty reason", [row("rejected", "")]],
      ["rejected, null reason", [row("rejected", null)]],
      ["a charge-seen reason on a row that is NOT rejected", [row("pending", "wrong_amount"), row("failed", "not_eligible_at_payment")]],
    ];
    for (const [name, rows] of cases) {
      for (const entitled of [false, true]) assert.strictEqual(await R.readPaymentReview(mockDb(rows).db, AUDIT, OWNER, entitled), null, `${name} (entitled=${entitled})`);
    }
  });

  await test("CONFIRMED CHARGE NOT APPLIED: every charge-seen reason raises 'not_applied' when the owner has no access", async () => {
    for (const reason of SEEN) assert.strictEqual(await R.readPaymentReview(mockDb([row("rejected", reason)]).db, AUDIT, OWNER, false), "not_applied", reason);
  });

  await test("PAID + A SECOND CHARGE-SEEN REJECTION: entitlement is untouched and the review is still surfaced, as a separate kind", async () => {
    const rows = [row("paid", null), row("rejected", "duplicate_payment_refund_needed", { stripe_session_id: "cs_test_fictional_2" })];
    assert.strictEqual(await R.readPaymentReview(mockDb(rows).db, AUDIT, OWNER, true), "additional_payment");
    // the access decision is its own existing function, fed by the paid row alone, and is not derived from the review
    const store = { async hasPaid() { return rows.some((r) => r.status === "paid"); } } as any;
    const access = await authorizeReportAccess({ userId: OWNER, auditId: AUDIT, userOwnsAudit: async () => true, store, getReportPath: async () => "generated" });
    assert.strictEqual(access.ok, true);
    // a paid row with only pending/unknown companions raises nothing
    assert.strictEqual(await R.readPaymentReview(mockDb([row("paid", null), row("pending", null), row("rejected", "livemode_mismatch")]).db, AUDIT, OWNER, true), null);
    assert.strictEqual(await R.readPaymentReview(mockDb([row("paid", null)]).db, AUDIT, OWNER, true), null);
  });

  await test("ENTITLEMENT IS NOT AFFECTED: a charge-seen rejection alone grants nothing, and the review never feeds the access decision", async () => {
    const rows = [row("rejected", "not_eligible_at_payment")];
    const store = { async hasPaid() { return rows.some((r) => r.status === "paid"); } } as any;
    const access = await authorizeReportAccess({ userId: OWNER, auditId: AUDIT, userOwnsAudit: async () => true, store, getReportPath: async () => "generated" });
    assert.deepStrictEqual(access, { ok: false, status: 402 });
    const route = read("app/api/audit/[id]/route.ts");
    assert.ok(/const unlocked = await supabasePaymentStore\(service\)\.hasPaid\(id, user\.id\);/.test(route), "unlocked still comes from hasPaid alone");
    assert.ok(/readPaymentReview\(service as unknown as PaymentRowsDb, id, user\.id, unlocked\)/.test(route), "the review takes unlocked as an input, it does not produce it");
    assert.ok(!/unlocked\s*=\s*[^=;]*payment_review/.test(route));
  });

  await test("OWNER ISOLATION: the reader filters by audit AND owner; another owner's or another audit's rows never shape the result", async () => {
    const table = [
      row("rejected", "wrong_amount", { owner_id: OTHER_OWNER }),
      row("rejected", "wrong_amount", { audit_id: OTHER_AUDIT }),
      row("pending", null),
    ];
    const m = mockDb(table);
    assert.strictEqual(await R.readPaymentReview(m.db, AUDIT, OWNER, false), null, "only this owner's rows on this audit are considered");
    assert.deepStrictEqual(m.calls[0].filters, [["audit_id", AUDIT], ["owner_id", OWNER]]);
    assert.strictEqual(m.calls[0].cols, "status,status_reason", "no Stripe id, amount or date is even read");
    // the other owner, asking about the same audit, is shown their own rows only
    assert.strictEqual(await R.readPaymentReview(mockDb(table).db, AUDIT, OTHER_OWNER, false), "not_applied");
    // the route reads only after ownership is established
    const route = read("app/api/audit/[id]/route.ts");
    assert.ok(route.indexOf("fetchOwnedAuditWithRetry(user.token") < route.indexOf("readPaymentReview("), "ownership first");
    assert.ok(/if \(!audit\) return notFound\(\);/.test(route));
  });

  await test("A READ ERROR yields no statement, never a guess", async () => {
    assert.strictEqual(await R.readPaymentReview(mockDb([row("rejected", "wrong_amount")], { fail: true }).db, AUDIT, OWNER, false), null);
  });

  await test("WHAT THE BROWSER GETS: one word or null - no Stripe id, reason, amount or date", async () => {
    const rows = [row("rejected", "not_eligible_at_payment", { stripe_session_id: "cs_live_SECRET123", amount_paid: 14900 })];
    const out = await R.readPaymentReview(mockDb(rows).db, AUDIT, OWNER, false);
    assert.ok(out === "not_applied");
    const wire = JSON.stringify({ payment_review: out });
    for (const leak of ["cs_live", "SECRET", "14900", "not_eligible_at_payment", "rejected"]) assert.ok(!wire.includes(leak), leak);
    const html = renderToStaticMarkup(React.createElement(PaymentReviewNotice, { kind: "not_applied", auditId: AUDIT })) as string;
    for (const leak of ["cs_", "14900", "not_eligible_at_payment", "rejected", "pi_"]) assert.ok(!html.includes(leak), `notice shows ${leak}`);
  });

  const NO_PROMISE = /will (contact|refund|respond|reply|be refunded|review)|we('ll| will)|within \d|hours|business day|refund (has|was|is|will)|refunded|approved|issued|processed|guarantee/i;

  await test("WORDING (not applied): the approved sentence, the reference and the support address - no promise of contact, refund or timing", () => {
    const html = renderToStaticMarkup(React.createElement(PaymentReviewNotice, { kind: "not_applied", auditId: AUDIT })) as string;
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const ref = R.supportReference(AUDIT);
    assert.strictEqual(ref, "AAAAAAAA");
    assert.ok(text.includes(`Our records show a payment for this audit that could not be applied. Please do not pay again. Contact ${SUPPORT_EMAIL} with reference ${ref} so we can review it. This page does not show refund status.`), text);
    assert.ok(!NO_PROMISE.test(R.paymentReviewMessage("not_applied", ref).body), "no promise");
    assert.strictEqual(SUPPORT_EMAIL, "support@leaseguard.io");
  });

  await test("WORDING (entitled owner, additional payment): separate text that never says the report could not be unlocked", () => {
    const m = R.paymentReviewMessage("additional_payment", "AAAAAAAA");
    const all = `${m.title} ${m.body}`;
    assert.ok(/additional payment/.test(all) && /Your access to this report is not affected/.test(all));
    assert.ok(!/could not be unlocked|not unlocked|locked|could not be applied|unlock/i.test(all), all);
    assert.ok(!NO_PROMISE.test(m.body));
    assert.ok(m.body.endsWith("This page does not show refund status."));
    assert.notStrictEqual(m.body, R.paymentReviewMessage("not_applied", "AAAAAAAA").body);
    assert.ok(!/refund (has|was|is|will)|refunded/i.test(all), "no claim that a refund was issued");
  });

  await test("PAGE WIRING (source scan, not a browser check): the notice renders from payment_review whether or not the report is unlocked", () => {
    const page = read("app/audit/[id]/page.tsx");
    assert.ok(/\{audit\.payment_review && <PaymentReviewNotice kind=\{audit\.payment_review\} auditId=\{audit\.id\} \/>\}/.test(page));
    const at = page.indexOf("audit.payment_review &&");
    const surround = page.slice(Math.max(0, at - 400), at);
    assert.ok(!/unlocked\s*&&/.test(surround), "not gated on locked/unlocked");
    assert.ok(!/did not go through/.test(page), "the 'did not go through' claim is gone from the confirming flow");
    assert.ok(/Your card statement shows whether a charge was made\. This page cannot show that\./.test(page));
  });

  await test("UNCHANGED: eligibility, checkout creation, the webhook's checks and the settlement exception stay as the base has them", () => {
    const pay = read("lib/payments.ts");
    assert.ok(!/getSettlementFacts/.test(pay));
    assert.strictEqual((pay.match(/store\.getPurchaseFacts\(/g) ?? []).length, 2);
    assert.strictEqual((pay.match(/decidePurchase\(/g) ?? []).length, 2);
    assert.ok(/reject\("not_eligible_at_payment"\)/.test(pay));
    assert.ok(/return years === 1 \? "single" : "multi";/.test(pay));
    assert.ok(/const actionable = plan\.tierCounts\.calculated \+ plan\.tierCounts\.judgment;/.test(read("lib/purchase-eligibility.ts")));
    assert.ok(!/payment-review/.test(pay) && !/payment-review/.test(read("lib/purchase-eligibility.ts")) && !/payment-review/.test(read("lib/payment-store.ts")), "the review module is read by the audit route only");
  });

  await test("NETWORK: no outbound request was attempted by any step above", () => {
    assert.deepStrictEqual(blocked, []);
  });

  console.log(`\npayment-review: ${passed} passed, 0 failed`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
