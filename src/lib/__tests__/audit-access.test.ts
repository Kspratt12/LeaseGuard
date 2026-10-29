/**
 * Run: npx tsx src/lib/__tests__/audit-access.test.ts
 *
 * Covers app-level authorization behaviour that does not need a database:
 * unauthenticated requests are rejected, tokens are parsed strictly, and
 * audit responses never carry document URLs or paid content.
 * It does NOT test RLS or tenant isolation in Postgres — that needs a
 * Supabase project (see supabase/pending/AUTH-OWNERSHIP.md).
 */
// Unreachable on purpose: any accidental network call fails fast.
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service";

import assert from "node:assert";
import { NextRequest } from "next/server";
import {
  authenticate,
  extractBearerToken,
  toPublicAudit,
  UUID_RE,
  OWNER_READABLE_COLUMNS,
} from "../audit-access";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const req = (headers: Record<string, string> = {}, url = "http://localhost/x") =>
  new NextRequest(url, { headers });
const ID = "123e4567-e89b-12d3-a456-426614174000";

async function main() {
  await test("bearer token parsing is strict", () => {
    assert.strictEqual(extractBearerToken(req()), null);
    assert.strictEqual(extractBearerToken(req({ authorization: "Basic abc" })), null);
    assert.strictEqual(extractBearerToken(req({ authorization: "Bearer " })), null);
    assert.strictEqual(extractBearerToken(req({ authorization: "Bearer a.b.c" })), "a.b.c");
  });

  await test("authenticate: no token / rejected token / verifier error => null", async () => {
    assert.strictEqual(await authenticate(req(), async () => ({ id: "u" })), null);
    assert.strictEqual(
      await authenticate(req({ authorization: "Bearer t" }), async () => null),
      null,
    );
    assert.strictEqual(
      await authenticate(req({ authorization: "Bearer t" }), async () => {
        throw new Error("boom");
      }),
      null,
    );
  });

  await test("authenticate: valid token yields the verified user id", async () => {
    const u = await authenticate(req({ authorization: "Bearer t" }), async (t) => ({ id: `user-for-${t}` }));
    assert.deepStrictEqual(u, { id: "user-for-t", token: "t" });
  });

  await test("GET /api/audit/[id] without credentials => 401", async () => {
    const { GET } = await import("../../app/api/audit/[id]/route");
    const res = await GET(req(), { params: Promise.resolve({ id: ID }) });
    assert.strictEqual(res.status, 401);
  });

  await test("GET /api/audit/[id] with a bad token => 401, never the audit", async () => {
    const { GET } = await import("../../app/api/audit/[id]/route");
    const res = await GET(req({ authorization: "Bearer forged" }), { params: Promise.resolve({ id: ID }) });
    assert.strictEqual(res.status, 401);
    assert.ok(!(await res.text()).includes("findings"));
  });

  await test("GET report without credentials => 401 (no signed URL, no redirect)", async () => {
    const { GET } = await import("../../app/api/audit/[id]/report/route");
    const res = await GET(req(), { params: Promise.resolve({ id: ID }) });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.headers.get("location"), null);
  });

  await test("POST /api/upload without credentials => 401", async () => {
    const { POST } = await import("../../app/api/upload/route");
    const res = await POST(new NextRequest("http://localhost/api/upload", { method: "POST" }));
    assert.strictEqual(res.status, 401);
  });

  await test("audit id must be a UUID", () => {
    assert.ok(UUID_RE.test(ID));
    assert.ok(!UUID_RE.test("../../etc/passwd"));
    assert.ok(!UUID_RE.test("1 or 1=1"));
  });

  await test("public audit hides document URLs, report path, raw errors and paid details", () => {
    const row = {
      id: ID, status: "error", free_findings: [{ category: "a" }],
      lease_url: "SECRET-lease", recon_url: "SECRET-recon", report_pdf_url: "SECRET-report",
      error_message: "ECONNREFUSED internal stack", owner_id: "owner",
    };
    const paid = [{ category: "Mgmt fee", severity: "high", potential_savings: 100,
      description: "SECRET-detail", sourceEvidence: [{ quote: "SECRET-quote" }] }];
    const out = JSON.stringify(toPublicAudit(row, paid));
    for (const s of ["SECRET", "ECONNREFUSED", "owner"]) assert.ok(!out.includes(s), `leaked ${s}`);
    assert.ok(out.includes("Mgmt fee"));
    assert.strictEqual(toPublicAudit(row, paid).report_pdf_url, null);
  });

  await test("owner-readable column allowlist excludes sensitive columns", () => {
    for (const c of ["paid_findings", "lease_url", "recon_url", "report_pdf_url", "error_message"]) {
      assert.ok(!(OWNER_READABLE_COLUMNS as readonly string[]).includes(c), c);
    }
  });

  console.log(`\n${passed} passed, 0 failed`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
