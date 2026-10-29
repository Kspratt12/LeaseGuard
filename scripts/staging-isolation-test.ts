/**
 * Tenant-isolation test against the STAGING Supabase project.
 *
 *   npx tsx --env-file=.env.local scripts/staging-isolation-test.ts
 *
 * Requires: the ownership migration applied to staging, `npm run dev` (or a
 * staging build) serving BASE_URL, and .env.local pointing at staging.
 * Uses synthetic users/rows only and removes them afterwards.
 * Refuses to run against any project other than the staging reference.
 * The seed row columns assume the audits schema; adjust after schema inspection.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const STAGING_REF = "hxjquglxcbxxqjuqvuuy";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

if (!url.includes(STAGING_REF)) {
  console.error("Refusing to run: NEXT_PUBLIC_SUPABASE_URL is not the staging project.");
  process.exit(2);
}
if (!anon || !service) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  process.exit(2);
}

const admin = createClient(url, service, { auth: { persistSession: false } });
const results: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : ` (${detail})`}`);
};

async function makeUser(label: string) {
  const email = `isolation-${label}-${randomUUID().slice(0, 8)}@example.invalid`;
  const password = `${randomUUID()}Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data: s, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2 || !s.session) throw new Error(`sign-in failed: ${e2?.message}`);
  return { id: data.user.id, client, token: s.session.access_token };
}

const api = (path: string, token?: string) =>
  fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

async function main() {
  const A = await makeUser("a");
  const B = await makeUser("b");
  const auditA = randomUUID();
  const auditB = randomUUID();
  const SECRET = "SYNTHETIC-PAID-DETAIL";

  const mk = (id: string, owner: string) => ({
    id,
    owner_id: owner,
    status: "completed",
    lease_url: `${id}/lease.pdf`,
    recon_url: `${id}/recon.pdf`,
    free_findings: [{ category: "Synthetic free", description: "free", potential_savings: 1, severity: "low" }],
    paid_findings: [{ category: "Synthetic paid", description: SECRET, potential_savings: 5, severity: "high" }],
    report_pdf_url: `${id}/report.pdf`,
    error_message: "SYNTHETIC-INTERNAL-ERROR",
  });

  try {
    const ins = await admin.from("audits").insert([mk(auditA, A.id), mk(auditB, B.id)]);
    if (ins.error) throw new Error(`seed insert failed: ${ins.error.message}`);

    // --- Direct database access with each user's own JWT ---
    const own = await A.client.from("audits").select("id,status,free_findings").eq("id", auditA);
    check("DB: A reads own audit", !own.error && own.data?.length === 1, own.error?.message);

    const cross = await B.client.from("audits").select("id,status").eq("id", auditA);
    check("DB: B cannot read A's audit", !cross.error && cross.data?.length === 0);

    const cross2 = await A.client.from("audits").select("id").eq("id", auditB);
    check("DB: A cannot read B's audit", !cross2.error && cross2.data?.length === 0);

    for (const col of ["paid_findings", "lease_url", "recon_url", "report_pdf_url", "error_message"]) {
      const r = await A.client.from("audits").select(col).eq("id", auditA);
      check(`DB: A cannot select own ${col}`, !!r.error || !r.data?.length);
    }

    const anonC = createClient(url, anon, { auth: { persistSession: false } });
    const an = await anonC.from("audits").select("id").eq("id", auditA);
    check("DB: anonymous cannot read audits", !!an.error || an.data?.length === 0);

    const upd = await B.client.from("audits").update({ status: "hacked" }).eq("id", auditA).select();
    check("DB: B cannot update A's audit", !!upd.error || upd.data?.length === 0);
    const chg = await A.client.from("audits").update({ owner_id: B.id }).eq("id", auditA).select();
    check("DB: A cannot change owner_id", !!chg.error || chg.data?.length === 0);
    const claim = await B.client.from("audits").update({ owner_id: B.id }).eq("id", auditA).select();
    check("DB: B cannot take ownership of A's audit", !!claim.error || claim.data?.length === 0);
    const del = await B.client.from("audits").delete().eq("id", auditA).select();
    check("DB: B cannot delete A's audit", !!del.error || del.data?.length === 0);
    const insB = await B.client.from("audits").insert({ id: randomUUID(), owner_id: A.id, status: "pending" });
    check("DB: clients cannot insert audits at all", !!insB.error);
    const still = await admin.from("audits").select("owner_id,status").eq("id", auditA).single();
    check("DB: A's row unchanged after the attacks", still.data?.owner_id === A.id && still.data?.status === "completed");

    // --- HTTP API ---
    const r0 = await api(`/api/audit/${auditA}`);
    check("API: unauthenticated => 401", r0.status === 401, String(r0.status));
    const rA = await api(`/api/audit/${auditA}`, A.token);
    const bodyA = await rA.text();
    check("API: A reads own audit => 200", rA.status === 200, String(rA.status));
    check(
      "API: response has no paid detail, storage paths or raw error",
      !bodyA.includes(SECRET) &&
        !bodyA.includes("lease.pdf") &&
        !bodyA.includes("report.pdf") &&
        !bodyA.includes("SYNTHETIC-INTERNAL-ERROR"),
    );
    const rB = await api(`/api/audit/${auditA}`, B.token);
    const rMissing = await api(`/api/audit/${randomUUID()}`, B.token);
    check("API: B reading A's audit => 404", rB.status === 404, String(rB.status));
    check(
      "API: other-user and nonexistent audit are indistinguishable",
      rB.status === rMissing.status && (await rB.text()) === (await rMissing.text()),
    );
    const l0 = await api("/api/audits");
    check("API: audit list unauthenticated => 401", l0.status === 401, String(l0.status));
    const lA = (await (await api("/api/audits", A.token)).json()) as { id: string }[];
    const lB = (await (await api("/api/audits", B.token)).json()) as { id: string }[];
    check("API: A lists exactly their own audit", lA.length === 1 && lA[0].id === auditA, JSON.stringify(lA.map((x) => x.id)));
    check("API: B never sees A in their list", !lB.some((x) => x.id === auditA) && lB.length === 1);
    const rep0 = await api(`/api/audit/${auditA}/report`);
    const repA = await api(`/api/audit/${auditA}/report`, A.token);
    const repB = await api(`/api/audit/${auditA}/report`, B.token);
    check("API: report unauthenticated => 401", rep0.status === 401);
    check("API: report needs payment even for the owner (402)", repA.status === 402, String(repA.status));
    check("API: report not found for other users (404)", repB.status === 404, String(repB.status));
    check("API: report never redirects", !repA.headers.get("location") && !repB.headers.get("location"));
  } finally {
    await admin.from("audits").delete().in("id", [auditA, auditB]);
    await admin.auth.admin.deleteUser(A.id);
    await admin.auth.admin.deleteUser(B.id);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("Test run aborted:", e instanceof Error ? e.message : e);
  process.exit(1);
});
