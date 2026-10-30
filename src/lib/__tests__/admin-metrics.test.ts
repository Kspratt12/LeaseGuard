/** Admin dashboard calculations and data shaping. Run: npx tsx src/lib/__tests__/admin-metrics.test.ts */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";

let n = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  await fn();
  n++;
  console.log("  ✓", name);
}

(async () => {
  const m = await import("../admin-metrics");
  const data = await import("../admin-data");

  const NOW = new Date("2026-11-15T15:00:00Z");
  const row = (o: Partial<import("../admin-metrics").PaymentRow>) => ({ tier: "single", status: "paid", amount_paid: 4900, paid_at: "2026-11-15T10:00:00Z", livemode: true, ...o });

  await t("revenue counts only paid rows; pending, failed, expired and rejected add nothing", () => {
    const r = m.computeRevenue([row({}), row({ status: "pending" }), row({ status: "failed" }), row({ status: "expired" }), row({ status: "rejected" })], NOW);
    assert.equal(r.live.total.count, 1);
    assert.equal(r.live.total.cents, 4900);
  });

  await t("live and test mode are kept apart", () => {
    const r = m.computeRevenue([row({ livemode: true }), row({ livemode: false, amount_paid: 14900, tier: "multi" })], NOW);
    assert.equal(r.live.total.cents, 4900);
    assert.equal(r.test.total.cents, 14900);
    assert.equal(r.live.byTier.multi.count, 0);
    assert.equal(r.test.byTier.multi.count, 1);
  });

  await t("breakdown by the $49 and $149 plans", () => {
    const r = m.computeRevenue([row({}), row({}), row({ tier: "multi", amount_paid: 14900 })], NOW);
    assert.deepEqual(r.live.byTier.single, { count: 2, cents: 9800 });
    assert.deepEqual(r.live.byTier.multi, { count: 1, cents: 14900 });
    assert.equal(r.live.total.cents, 24700);
  });

  await t("today and month use UTC boundaries", () => {
    const r = m.computeRevenue(
      [
        row({ paid_at: "2026-11-15T00:00:00Z" }), // today, this month
        row({ paid_at: "2026-11-14T23:59:59Z" }), // this month, not today
        row({ paid_at: "2026-11-01T00:00:00Z" }), // first moment of the month
        row({ paid_at: "2026-10-31T23:59:59Z" }), // last month
      ],
      NOW,
    );
    assert.equal(r.live.today.count, 1);
    assert.equal(r.live.month.count, 3);
    assert.equal(r.live.total.count, 4);
  });

  await t("a paid row with no amount is counted but never guessed; one with no date counts only in the total", () => {
    const r = m.computeRevenue([row({ amount_paid: null }), row({ paid_at: null })], NOW);
    assert.equal(r.live.missingAmount, 1);
    assert.equal(r.live.missingDate, 1);
    assert.equal(r.live.total.cents, 4900);
    assert.equal(r.live.today.count, 1);
  });

  await t("a duplicated payment row would be visible: the database rule (one paid payment per audit) is what prevents it", () => {
    const sql = fs.readFileSync(path.join(__dirname, "../../../supabase/migrations/20261030_payments.sql"), "utf8");
    assert.match(sql, /unique index if not exists payments_one_paid_per_audit[\s\S]*where status = 'paid'/);
    assert.match(sql, /stripe_session_id\s+text not null unique/);
  });

  await t("failure stage is inferred from the error text and falls back to Unclassified", () => {
    assert.equal(m.classifyFailure("Report upload failed: boom"), "Saving the report");
    assert.equal(m.classifyFailure("Core DB update failed: x"), "Saving results");
    assert.equal(m.classifyFailure("Could not save the results (PostgrestError code=23505)."), "Saving results");
    assert.equal(m.classifyFailure("Processing timed out"), "Timed out");
    assert.equal(m.classifyFailure("Could not extract text from the PDF"), "Reading documents");
    assert.equal(m.classifyFailure("Anthropic rate limit"), "AI analysis");
    assert.equal(m.classifyFailure("something odd"), "Unclassified");
    assert.equal(m.classifyFailure(null), "Unclassified");
  });

  await t("duration statistics use real values only and show nothing when there are none", () => {
    assert.deepEqual(m.durationStats([]), { n: 0, medianSeconds: null, p90Seconds: null, maxSeconds: null });
    const s = m.durationStats([10_000, 20_000, 30_000, 40_000, -5, NaN, 2 * 3600_000]); // the last three are impossible and dropped
    assert.equal(s.n, 4);
    assert.equal(s.medianSeconds, 25);
    assert.equal(s.maxSeconds, 40);
  });

  await t("age checks: stuck after 10 minutes, stale checkout after an hour", () => {
    assert.equal(m.olderThan("2026-11-15T14:49:00Z", m.STUCK_AFTER_MS, NOW), true);
    assert.equal(m.olderThan("2026-11-15T14:55:00Z", m.STUCK_AFTER_MS, NOW), false);
    assert.equal(m.olderThan(null, m.STUCK_AFTER_MS, NOW), false);
  });

  await t("lookup accepts only a full audit id or an exact email", () => {
    assert.equal(m.parseLookup("abc").kind, "invalid");
    assert.equal(m.parseLookup("").kind, "invalid");
    assert.equal(m.parseLookup("11111111").kind, "invalid"); // no partial ids
    // a wildcard is just a character: the account search is an exact comparison in code, never a LIKE query
    assert.ok(!/\.(like|ilike|or)\(/.test(fs.readFileSync(path.join(__dirname, "../admin-data.ts"), "utf8")), "pattern search found");
    assert.equal(m.parseLookup("a'; drop table audits;--").kind, "invalid");
    assert.deepEqual(m.parseLookup("11111111-1111-4111-8111-111111111111"), { kind: "audit", id: "11111111-1111-4111-8111-111111111111" });
    assert.deepEqual(m.parseLookup("  Owner@Example.com "), { kind: "email", email: "owner@example.com" });
  });

  // ── data layer against a fake database: shape and redaction ──
  const AUDIT = "abcdef12-0000-4000-8000-000000000000";
  const tables: Record<string, any[]> = {
    audits: [{ id: "bbbbbbbb-0000-4000-8000-000000000000", created_at: "2026-11-15T14:00:00Z", status: "completed", error_message: null, recon_year_count: 1, report_pdf_url: "x/report.pdf", owner_id: "u1" }, { id: AUDIT, created_at: "2026-11-15T14:00:00Z", status: "error", error_message: "Core DB update failed for jane@acme.com https://x.co/y lease-2025.pdf 123456789", recon_year_count: 1, report_pdf_url: `${AUDIT}/report.pdf`, owner_id: "u1" }],
    payments: [
      // charged but not unlocked because the audit had nothing to unlock when payment arrived: needs a refund decision
      { audit_id: "ffffffff-0000-4000-8000-000000000001", tier: "single", status: "rejected", status_reason: "not_eligible_at_payment", amount_paid: null, amount_expected: 4900, livemode: true, created_at: "2026-11-15T12:00:00Z", paid_at: null },
      // rejected for another reason (a wrong amount): shown in the problem list, but not a refund-needed customer
      { audit_id: "ffffffff-0000-4000-8000-000000000002", tier: "single", status: "rejected", status_reason: "wrong_amount", amount_paid: null, amount_expected: 4900, livemode: true, created_at: "2026-11-15T11:00:00Z", paid_at: null },
      { audit_id: AUDIT, tier: "single", status: "rejected", status_reason: "duplicate_payment_refund_needed", amount_paid: null, amount_expected: 4900, livemode: true, created_at: "2026-11-15T13:00:00Z", paid_at: null },
      { audit_id: AUDIT, tier: "single", status: "pending", status_reason: null, amount_paid: null, amount_expected: 4900, livemode: true, created_at: "2026-11-15T09:00:00Z", paid_at: null },
    ],
    stripe_events: [{ type: "checkout.session.completed", received_at: "2026-11-15T10:00:00Z", processed_at: null }],
  };
  const chain = (table: string): any => {
    let rows = tables[table];
    const q: any = {
      head: false,
      select: (_c: string, o?: { head?: boolean }) => { q.head = !!o?.head; return q; },
      eq: (col: string, v: unknown) => { rows = rows.filter((r) => r[col] === v); return q; },
      in: (col: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[col])); return q; },
      not: () => q, gte: () => q, order: () => q,
      limit: () => Promise.resolve({ data: rows, error: null }),
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (res: (v: unknown) => void) => res(q.head ? { count: rows.length, error: null } : { data: rows, error: null }),
    };
    return q;
  };
  const db: any = {
    from: chain,
    storage: { from: () => ({ list: async () => ({ data: [{ name: "report.pdf", created_at: "2026-11-15T14:00:42Z" }] }) }) },
    auth: { admin: { listUsers: async () => ({ data: { users: [{ id: "u1", email: "owner@example.com", created_at: "2026-11-01T00:00:00Z", email_confirmed_at: "2026-11-01T00:01:00Z", last_sign_in_at: null }] } }) } },
  };

  await t("health data: stage inferred, error text redacted, processing time from real timestamps", async () => {
    const h = await data.healthData(db, NOW);
    const json = JSON.stringify(h);
    assert.ok(!/jane@acme|https?:|lease-2025|123456789/.test(json), "unredacted text leaked");
    assert.equal(h.failuresShown[0].stage, "Saving results");
    assert.equal(h.processing.n, 1);
    assert.equal(h.processing.medianSeconds, 42);
  });

  await t("diagnostics: refund-needed flag, stale checkout, unfinished webhook event, no payloads", async () => {
    const d = await data.diagnosticsData(db, NOW);
    assert.equal(d.needsManualRefundCheck, 2, "the duplicate-payment row and the nothing-to-unlock row count; the wrong-amount row does not");
    assert.equal(d.staleCheckouts.length, 1);
    assert.equal(d.webhook.unprocessed.length, 1);
    const { notes: _notes, ...rest } = d; // the explanatory notes mention the word "payload"; the data itself must not carry one
    assert.ok(!/payload|secret|sk_|whsec_|@/i.test(JSON.stringify(rest)));
  });

  await t("lookup by audit id returns status, dates and payments only", async () => {
    const r: any = await data.lookupData(db, AUDIT, NOW);
    assert.equal(r.kind, "audit");
    assert.equal(r.audit.secondsToReport, 42);
    const json = JSON.stringify(r);
    for (const banned of ["lease_url", "recon_url", "paid_findings", "free_findings", "overcharge", "owner_id", "report_pdf_url", "jane@acme"]) assert.ok(!json.includes(banned), `leaked ${banned}`);
  });

  await t("lookup by email never returns the email address or the user id", async () => {
    const r: any = await data.lookupData(db, "owner@example.com", NOW);
    assert.equal(r.kind, "account");
    const json = JSON.stringify(r);
    assert.ok(!json.includes("owner@example.com"));
    assert.ok(!json.includes('"u1"'));
    assert.equal(r.account.emailConfirmed, true);
  });

  await t("lookup rejects anything but a full id or exact email with a 400", async () => {
    const r: any = await data.lookupData(db, "abcdef12", NOW);
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
  });

  await t("the data module only reads: no insert, update, delete or upsert anywhere", () => {
    const src = fs.readFileSync(path.join(__dirname, "../admin-data.ts"), "utf8");
    assert.ok(!/\.(insert|update|upsert|delete|remove)\(/.test(src), "write call found");
    assert.ok(!/\.(createUser|deleteUser|updateUserById|generateLink|inviteUserByEmail)\(/.test(src), "auth write call found");
  });

  await t("every admin route authorises before touching data (including the new ones)", () => {
    const dir = path.join(__dirname, "../../app/api/admin");
    const routes: string[] = [];
    const walk = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name === "route.ts" && routes.push(path.join(d, e.name))));
    walk(dir);
    assert.ok(routes.length >= 5, `expected 5 admin routes, found ${routes.length}`);
    for (const r of routes) {
      const src = fs.readFileSync(r, "utf8");
      const a = src.indexOf("authorizeAdmin(");
      const d = src.search(/createServiceClient\(\)/);
      assert.ok(a >= 0 && d > a, `${r}: authorization must come first`);
      assert.ok(/status: auth\.status/.test(src), `${r}: must return the 401/403 status`);
      assert.ok(/no-store/i.test(src), `${r}: must not be cached`);
    }
  });

  await t("limits and caveats are disclosed on the dashboard: refunds, the 5,000 and 2,000 limits, rejected duplicates, estimated duration", async () => {
    const rev = await data.revenueData(db, NOW);
    const text = rev.notes.join(" ");
    assert.ok(/Refunds are NOT recorded/.test(text) && /gross of refunds/.test(text));
    assert.ok(/newest 5,000 paid records/.test(text));
    assert.ok(/rejected.*not counted as revenue.*(was|may have been) charged/i.test(text));
    const health = await data.healthData(db, NOW);
    assert.ok(/newest 200 failed audits/.test(health.notes.join(" ")));
    assert.ok(/Estimated from the time the report file was saved/.test(health.processing.basis));
    const page = fs.readFileSync(path.join(__dirname, "../../app/admin/page.tsx"), "utf8");
    assert.ok(/up to 2,000 accounts/.test(page), "the account-search limit must be visible");
    assert.ok(/Estimated processing time/.test(page), "duration must be labelled an estimate");
    assert.ok(!page.includes(">Processing time</h3>"), "the plain label must not return");
  });

  console.log(`admin-metrics: ${n} passed, 0 failed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
