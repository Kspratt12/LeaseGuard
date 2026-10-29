/**
 * Paid-path test against STAGING (no Stripe involved): a synthetic 'paid' payment row is
 * inserted with the service role to exercise everything that happens AFTER the webhook
 * unlocks an audit: full findings, report PDF, dispute letter draft and exports, account
 * list; and that another user and the unpaid state get nothing.
 *
 *   npx tsx --env-file=.env.local scripts/staging-paid-path-test.ts   (dev server on BASE_URL)
 * It does NOT prove the Stripe webhook; only the code that runs once a payment is recorded.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const REF = "hxjquglxcbxxqjuqvuuy";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
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

async function mkUser(label: string) {
  const email = `paid-${label}-${randomUUID().slice(0, 8)}@example.invalid`;
  const password = `${randomUUID()}Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(error?.message);
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { data: s, error: e2 } = await c.auth.signInWithPassword({ email, password });
  if (e2 || !s.session) throw new Error(e2?.message);
  return { id: data.user.id, token: s.session.access_token };
}
const call = (path: string, token?: string, init: RequestInit = {}) =>
  fetch(`${BASE}${path}`, { ...init, headers: { ...(init.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });

async function main() {
  const A = await mkUser("a");
  const B = await mkUser("b");
  const id = randomUUID();
  const SECRET = "SYNTHETIC-PAID-DESCRIPTION";
  try {
    const ins = await admin.from("audits").insert({
      id, owner_id: A.id, status: "completed", recon_year_count: 1, savings_estimate: 1359,
      lease_url: `${id}/lease.pdf`, recon_url: `${id}/recon.pdf`, report_pdf_url: `${id}/report.pdf`,
      free_findings: [{ category: "CAM Cap Exceeded", description: "Compare prior-year charges.", potential_savings: 0, severity: "high",
        sourceEvidence: [{ document: "tenant-lease-upload.pdf", page: 2, extractedText: "CAM Cap shall not exceed 5%" }] }],
      paid_findings: [{ category: "Admin Fee Overcharge", description: SECRET, potential_savings: 1359, severity: "medium",
        sourceEvidence: [{ document: "tenant-statement-upload.pdf", page: 1, extractedText: "Management Fee (18%) $100,897.20" }] }],
      overcharge_breakdown: [], estimated_overcharge: 0, confidence: "high", confidence_score: 80,
    });
    if (ins.error) throw new Error(`seed failed: ${ins.error.message}`);

    // --- BEFORE payment ---
    const pre = await (await call(`/api/audit/${id}`, A.token)).text();
    check("unpaid: audit API hides paid detail", !pre.includes(SECRET) && pre.includes('"unlocked":false'));
    check("unpaid: report => 402", (await call(`/api/audit/${id}/report`, A.token)).status === 402);
    check("unpaid: letter draft => 402", (await call(`/api/audit/${id}/letter`, A.token)).status === 402);
    check("unpaid: letter export => 402", (await call(`/api/audit/${id}/letter`, A.token, { method: "POST", body: JSON.stringify({ text: "x", format: "pdf" }) })).status === 402);

    // --- record a verified payment (what the webhook does) ---
    const pay = await admin.from("payments").insert({
      audit_id: id, owner_id: A.id, tier: "single", stripe_session_id: `cs_synthetic_${randomUUID()}`,
      amount_expected: 4900, amount_paid: 4900, currency: "usd", livemode: false, status: "paid", paid_at: new Date().toISOString(),
    });
    if (pay.error) throw new Error(`payment seed failed: ${pay.error.message}`);

    // --- AFTER payment ---
    const post = await (await call(`/api/audit/${id}`, A.token)).text();
    check("paid: audit API returns the full paid findings", post.includes(SECRET) && post.includes('"unlocked":true'));
    check("paid: audit API still never returns storage paths", !post.includes("report.pdf") && !post.includes("lease.pdf\"") );
    const rep = await call(`/api/audit/${id}/report`, A.token);
    const repBytes = Buffer.from(await rep.arrayBuffer());
    check("paid: report downloads as a real PDF", rep.status === 200 && repBytes.subarray(0, 5).toString() === "%PDF-" && repBytes.length > 1500, `${rep.status} ${repBytes.length}b`);
    const dr = await call(`/api/audit/${id}/letter`, A.token);
    const draft = (await dr.json()) as { text: string; total: number; headlineTotal: number };
    check("paid: dispute letter draft generated", dr.status === 200 && draft.text.includes("[Your name]"), String(dr.status));
    check("paid: letter total equals audit total", draft.total === draft.headlineTotal, `${draft.total} vs ${draft.headlineTotal}`);
    const pdf = await call(`/api/audit/${id}/letter`, A.token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: draft.text + "\nEdited by customer.", format: "pdf" }) });
    check("paid: edited letter exports to PDF", pdf.status === 200 && Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString() === "%PDF-");
    const doc = await call(`/api/audit/${id}/letter`, A.token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Edited by customer <b>x</b>", format: "docx" }) });
    const docBytes = Buffer.from(await doc.arrayBuffer());
    check("paid: edited letter exports to a real .docx", doc.status === 200 && docBytes.subarray(0, 2).toString() === "PK" && (doc.headers.get("content-type") ?? "").includes("wordprocessingml"), String(doc.status));
    const big = await call(`/api/audit/${id}/letter`, A.token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "x".repeat(20001), format: "pdf" }) });
    check("paid: oversized letter rejected", big.status === 400);
    const list = (await (await call("/api/audits", A.token)).json()) as { id: string; unlocked: boolean }[];
    check("paid: My audits shows it as unlocked", list.some((x) => x.id === id && x.unlocked));

    // --- ANOTHER USER ---
    for (const [label, path, init] of [
      ["audit", `/api/audit/${id}`, {}],
      ["report", `/api/audit/${id}/report`, {}],
      ["letter draft", `/api/audit/${id}/letter`, {}],
      ["letter export", `/api/audit/${id}/letter`, { method: "POST", body: JSON.stringify({ text: "x", format: "pdf" }) }],
    ] as const) {
      const r = await call(path, B.token, init as RequestInit);
      const body = await r.text();
      check(`other user: ${label} => 404 and no content`, r.status === 404 && !body.includes(SECRET) && !body.includes("Dear"), String(r.status));
    }
    const lb = (await (await call("/api/audits", B.token)).json()) as { id: string }[];
    check("other user: My audits does not list it", !lb.some((x) => x.id === id));
  } finally {
    await admin.from("payments").delete().eq("audit_id", id);
    await admin.from("audits").delete().eq("id", id);
    await admin.auth.admin.deleteUser(A.id);
    await admin.auth.admin.deleteUser(B.id);
  }
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error("Run aborted:", e instanceof Error ? e.message : e);
  process.exit(1);
});
