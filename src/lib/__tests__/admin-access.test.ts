/** Administrator authorization. Run: npx tsx src/lib/__tests__/admin-access.test.ts */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// supabase.ts reads these when it is first imported, so set them before the dynamic imports below.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";

let n = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  await fn();
  n++;
  console.log("  ✓", name);
}
const req = (auth?: string) => new Request("http://x/api/admin/overview", { headers: auth ? { authorization: auth } : {} });
const goodUser = async () => ({ id: "11111111-1111-4111-8111-111111111111" });

(async () => {
  const { authorizeAdmin, redactDiagnostic } = await import("../admin-access");
  const { buildOverview } = await import("../admin-overview");
  await t("no token: 401", async () => assert.deepEqual(await authorizeAdmin(req()), { ok: false, status: 401 }));
  await t("malformed header: 401", async () => assert.deepEqual(await authorizeAdmin(req("Basic abc")), { ok: false, status: 401 }));
  await t("invalid session token: 401", async () => assert.deepEqual(await authorizeAdmin(req("Bearer bad"), { verify: async () => null }), { ok: false, status: 401 }));
  await t("verify throws: 401 (fails closed)", async () =>
    assert.deepEqual(await authorizeAdmin(req("Bearer x"), { verify: async () => { throw new Error("boom"); } }), { ok: false, status: 401 }));
  await t("valid customer who is not an administrator: 403", async () =>
    assert.deepEqual(await authorizeAdmin(req("Bearer x"), { verify: goodUser, isAdmin: async () => false }), { ok: false, status: 403 }));
  await t("admin lookup error: 403 (fails closed)", async () =>
    assert.deepEqual(await authorizeAdmin(req("Bearer x"), { verify: goodUser, isAdmin: async () => { throw new Error("db down"); } }), { ok: false, status: 403 }));
  await t("valid administrator: allowed", async () => {
    const r = await authorizeAdmin(req("Bearer x"), { verify: goodUser, isAdmin: async (id) => id === "11111111-1111-4111-8111-111111111111" });
    assert.equal(r.ok, true);
  });
  await t("the admin check is by user id and never by email address", async () => {
    let seen = "";
    await authorizeAdmin(req("Bearer x"), { verify: goodUser, isAdmin: async (id) => { seen = id; return false; } });
    assert.match(seen, /^[0-9a-f-]{36}$/);
  });

  await t("redaction removes emails, links, file names and long numbers, and truncates", () => {
    const s = redactDiagnostic("Failed for jane@acme.com at https://x.supabase.co/storage/v1/lease-2025.pdf account 123456789 " + "x".repeat(300));
    assert.ok(!/jane@acme|https?:|lease-2025|123456789/.test(s));
    assert.ok(s.length <= 140);
    assert.equal(redactDiagnostic(null), "");
  });

  await t("overview contains counts and shortened ids only: no emails, secrets or document paths", async () => {
    const rows: Record<string, unknown[]> = {
      audits: [{ id: "abcdef12-0000-4000-8000-000000000000", created_at: "2026-01-01T00:00:00Z", error_message: "bad file jane@acme.com" }],
      payments: [{ audit_id: "abcdef12-0000-4000-8000-000000000000", tier: "single", status: "paid", amount_paid: 4900, amount_expected: 4900, livemode: true, created_at: "2026-01-01T00:00:00Z" }],
      stripe_events: [{ type: "checkout.session.completed", received_at: "2026-01-01T00:00:00Z", processed_at: "2026-01-01T00:00:01Z" }],
    };
    const chain = (table: string): any => {
      const q: any = {
        select: (_c: string, opts?: { head?: boolean }) => { q.head = !!opts?.head; return q; },
        eq: () => q, not: () => q, order: () => q, limit: () => Promise.resolve({ data: rows[table], error: null }),
        then: (res: (v: unknown) => void) => res({ count: q.head ? 3 : null, error: null }),
      };
      return q;
    };
    const db: any = { from: chain, auth: { admin: { listUsers: async () => ({ data: { total: 7 } }) } } };
    const o = await buildOverview(db, { STRIPE_SECRET_KEY: "sk_live_SECRETVALUE123", STRIPE_WEBHOOK_SECRET: "whsec_SECRETVALUE", APP_BASE_URL: "https://www.leaseguard.io" });
    const json = JSON.stringify(o);
    assert.ok(!/@acme|SECRETVALUE|sk_live|whsec_|lease_url|recon_url/.test(json), "leaked something sensitive");
    assert.equal(o.users.total, 7);
    assert.equal(o.recentFailures[0].audit, "abcdef12");
    assert.equal(o.audits.total, 3);
  });

  await t("every admin API route calls authorizeAdmin before touching data", () => {
    const dir = path.join(__dirname, "../../app/api/admin");
    const routes: string[] = [];
    const walk = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name === "route.ts" && routes.push(path.join(d, e.name))));
    walk(dir);
    assert.ok(routes.length >= 1);
    for (const r of routes) {
      const src = fs.readFileSync(r, "utf8");
      const auth = src.indexOf("authorizeAdmin(");
      const data = src.search(/createServiceClient\(\)|buildOverview\(/);
      assert.ok(auth >= 0 && data > auth, `${r}: authorization must come first`);
    }
  });

  await t("the migration is server-only (RLS on, no client privileges, no policies)", () => {
    const sql = fs.readFileSync(path.join(__dirname, "../../../supabase/migrations/20261031_admin_users.sql"), "utf8").toLowerCase();
    assert.ok(sql.includes("enable row level security"));
    assert.ok(/revoke all on public\.admin_users from anon, authenticated/.test(sql));
    assert.ok(!/create policy/.test(sql));
  });

  await t("no password or secret appears in the activation file", () => {
    const sql = fs.readFileSync(path.join(__dirname, "../../../supabase/pending/ADMIN-ACTIVATION.sql"), "utf8").toLowerCase();
    assert.ok(!/password\s*=|crypt\(|encrypted_password/.test(sql));
    assert.ok(sql.includes("email_confirmed_at is not null"));
  });

  console.log(`admin-access: ${n} passed, 0 failed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
