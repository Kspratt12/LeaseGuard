/**
 * Source-file deletion test against STAGING. Simulates what automatic deletion would do (remove the uploaded lease and
 * statement from storage and clear their paths) and proves a completed, paid audit still works afterwards: audit API,
 * report PDF with the CAM Review Plan, dispute letter and exports. Uses an invented audit and placeholder files only.
 *
 * Run (dev server on port 3100 started with the staging values, see STAGING-TEST-RUNBOOK.md):
 *   BASE_URL=http://localhost:3100 npx tsx --env-file=.env.staging.local scripts/staging-source-deletion-test.ts
 * It does NOT enable or implement deletion in the app; it only removes the files itself with the service role.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const REF = "hxjquglxcbxxqjuqvuuy";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
if (!url.includes(REF) || !anon || !service) {
  console.error("Refusing to run: staging env not configured.");
  process.exit(2);
}
const admin = createClient(url, service, { auth: { persistSession: false } });
const results: boolean[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : ` (${detail})`}`);
};
const call = (path: string, token: string, init: RequestInit = {}) =>
  fetch(`${BASE}${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
const PLACEHOLDER = Buffer.from("%PDF-1.4\n% invented placeholder, not a real lease\n%%EOF\n");

async function main() {
  const email = `del-${randomUUID().slice(0, 8)}@example.invalid`;
  const password = `${randomUUID()}Aa1!`;
  const { data: u, error: ue } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (ue || !u.user) throw new Error(ue?.message);
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { data: s, error: se } = await c.auth.signInWithPassword({ email, password });
  if (se || !s.session) throw new Error(se?.message);
  const token = s.session.access_token;
  const id = randomUUID();
  const lease = `${id}/lease.pdf`, recon = `${id}/recon.pdf`, report = `${id}/report.pdf`;
  try {
    for (const p of [lease, recon, report]) {
      const up = await admin.storage.from("invoices").upload(p, PLACEHOLDER, { contentType: "application/pdf" });
      if (up.error) throw new Error(`upload failed: ${up.error.message}`);
    }
    const ins = await admin.from("audits").insert({
      id, owner_id: u.user.id, status: "completed", recon_year_count: 1, savings_estimate: 1359,
      lease_url: lease, recon_url: recon, report_pdf_url: report,
      free_findings: [{ category: "CAM Cap Exceeded", description: "Compare prior-year charges.", potential_savings: 0, severity: "high",
        sourceEvidence: [{ document: "tenant-lease-upload.pdf", page: 2, extractedText: "CAM Cap shall not exceed 5%" }] }],
      paid_findings: [{ category: "Admin Fee Overcharge", description: "Admin fee above the lease percentage.", potential_savings: 1359, severity: "medium",
        sourceEvidence: [{ document: "tenant-statement-upload.pdf", page: 1, extractedText: "Management Fee (18%) $100,897.20" }] }],
      overcharge_breakdown: [], estimated_overcharge: 0, confidence: "high", confidence_score: 80,
    });
    if (ins.error) throw new Error(`seed failed: ${ins.error.message}`);
    const pay = await admin.from("payments").insert({
      audit_id: id, owner_id: u.user.id, tier: "single", stripe_session_id: `cs_synthetic_${randomUUID()}`,
      amount_expected: 4900, amount_paid: 4900, currency: "usd", livemode: false, status: "paid", paid_at: new Date().toISOString(),
    });
    if (pay.error) throw new Error(`payment seed failed: ${pay.error.message}`);

    const before = Buffer.from(await (await call(`/api/audit/${id}/report`, token)).arrayBuffer());
    const beforeAudit = await (await call(`/api/audit/${id}`, token)).text();
    check("before deletion: report is a PDF", before.subarray(0, 5).toString() === "%PDF-");

    // --- simulate automatic deletion: remove the sources, clear their paths ---
    const rm = await admin.storage.from("invoices").remove([lease, recon]);
    check("source files removed from storage", !rm.error, rm.error?.message);
    const upd = await admin.from("audits").update({ lease_url: null, recon_url: null }).eq("id", id);
    check("source paths cleared on the audit row", !upd.error, upd.error?.message);
    const { data: left } = await admin.storage.from("invoices").list(id);
    const names = (left ?? []).map((f) => f.name).sort();
    check("only report.pdf is left in the audit folder", names.length === 1 && names[0] === "report.pdf", `${names.length} left`);

    // --- everything must still work ---
    const a = await call(`/api/audit/${id}`, token);
    const aBody = await a.text();
    check("after deletion: audit API still returns the full paid findings", a.status === 200 && aBody.includes("Admin fee above the lease percentage.") && aBody.includes('"unlocked":true'), String(a.status));
    check("after deletion: evidence quotes and pages are unchanged", aBody.includes("Management Fee (18%) $100,897.20") && aBody.includes('"page":1'));
    check("after deletion: audit response is otherwise the same as before", beforeAudit.length === aBody.length, `${beforeAudit.length} vs ${aBody.length}`);
    const r = await call(`/api/audit/${id}/report`, token);
    const rb = Buffer.from(await r.arrayBuffer());
    check("after deletion: report PDF downloads", r.status === 200 && rb.subarray(0, 5).toString() === "%PDF-" && rb.length > 1500, `${r.status} ${rb.length}b`);
    check("after deletion: report PDF is the same size as before (regenerated from the database)", Math.abs(rb.length - before.length) < 200, `${rb.length} vs ${before.length}`);
    const l = await call(`/api/audit/${id}/letter`, token);
    const lj = (await l.json()) as { text?: string };
    check("after deletion: dispute letter draft still generated", l.status === 200 && !!lj.text?.includes("[Your name]"), String(l.status));
    const lp = await call(`/api/audit/${id}/letter`, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Edited", format: "pdf" }) });
    check("after deletion: letter export still works", lp.status === 200);
    const list = (await (await call("/api/audits", token)).json()) as { id: string; unlocked: boolean }[];
    check("after deletion: My audits still lists it as unlocked", list.some((x) => x.id === id && x.unlocked));
    const { data: pr } = await admin.from("payments").select("id").eq("audit_id", id);
    check("payment record untouched", (pr ?? []).length === 1);
  } finally {
    await admin.storage.from("invoices").remove([lease, recon, report]);
    await admin.from("payments").delete().eq("audit_id", id);
    await admin.from("audits").delete().eq("id", id);
    await admin.auth.admin.deleteUser(u.user.id);
  }
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error("Run aborted:", e instanceof Error ? e.message : e);
  process.exit(1);
});
