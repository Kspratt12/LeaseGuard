/**
 * Controlled end-to-end upload + audit test against STAGING.
 *
 *   npx tsx --env-file=.env.local scripts/staging-e2e-test.ts
 *
 * Needs `npm run dev` on BASE_URL with .env.local pointing at staging and a
 * valid ANTHROPIC_API_KEY. Uses ONLY the fictional text fixtures under
 * src/services/__tests__/fixtures, rendered to PDF. Cleans up afterwards.
 * Refuses to run against anything but the staging project.
 */
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const STAGING_REF = "hxjquglxcbxxqjuqvuuy";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const FIX = path.join(__dirname, "../src/services/__tests__/fixtures");

if (!url.includes(STAGING_REF)) {
  console.error("Refusing to run: not the staging project.");
  process.exit(2);
}
if (!anon || !service || !process.env.ANTHROPIC_API_KEY) {
  console.error("NOT RUN: missing anon key, service key or ANTHROPIC_API_KEY in .env.local.");
  process.exit(2);
}

const admin = createClient(url, service, { auth: { persistSession: false } });
const results: { name: string; status: "PASS" | "FAIL" | "NOT RUN"; evidence: string }[] = [];
const rec = (name: string, ok: boolean | null, evidence: string) => {
  const status = ok === null ? "NOT RUN" : ok ? "PASS" : "FAIL";
  results.push({ name, status, evidence });
  console.log(`${status.padEnd(7)} ${name} — ${evidence}`);
};

async function textToPdf(text: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Courier);
  const lines = text.split("\n");
  const perPage = 68;
  for (let i = 0; i < lines.length; i += perPage) {
    const page = pdf.addPage([612, 792]);
    lines.slice(i, i + perPage).forEach((l, j) => {
      page.drawText(l.replace(/[^\x20-\x7E]/g, "-"), { x: 36, y: 756 - j * 10.5, size: 8, font });
    });
  }
  return Buffer.from(await pdf.save());
}

function form(files: Record<string, Buffer>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(files)) {
    f.append(k, new File([new Uint8Array(v)], `synthetic-${k}-source.pdf`, { type: "application/pdf" }));
  }
  return f;
}

const upload = (files: Record<string, Buffer>, token?: string) =>
  fetch(`${BASE}/api/upload`, {
    method: "POST",
    body: form(files),
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

async function poll(id: string, token: string, maxMs = 5 * 60_000) {
  const start = Date.now();
  let last: Record<string, unknown> | null = null;
  while (Date.now() - start < maxMs) {
    const r = await fetch(`${BASE}/api/audit/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) {
      last = await r.json();
      if (last && (last.status === "completed" || last.status === "error")) return { last, ms: Date.now() - start };
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { last, ms: Date.now() - start };
}

async function mkUser(label: string) {
  const email = `e2e-${label}-${randomUUID().slice(0, 8)}@example.invalid`;
  const password = `${randomUUID()}Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { data: s, error: e2 } = await c.auth.signInWithPassword({ email, password });
  if (e2 || !s.session) throw new Error(`sign-in: ${e2?.message}`);
  return { id: data.user.id, token: s.session.access_token };
}

async function main() {
  const auditIds: string[] = [];
  const userIds: string[] = [];
  try {
    // --- Sign-up flow: is email confirmation required? (public auth settings, read-only) ---
    const settings = (await (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anon } })).json()) as { mailer_autoconfirm?: boolean; disable_signup?: boolean; external?: { email?: boolean } };
    rec("Sign-up enabled with email confirmation required", settings.external?.email === true && settings.disable_signup === false && settings.mailer_autoconfirm === false,
      `email_enabled=${settings.external?.email}, signups_disabled=${settings.disable_signup}, autoconfirm=${settings.mailer_autoconfirm} (autoconfirm=false means the customer must confirm by email)`);

    const A = await mkUser("a");
    const B = await mkUser("b");
    userIds.push(A.id, B.id);
    rec("Sign-in with email + password", true, "signInWithPassword returned a session for a confirmed synthetic user");

    const lease = await textToPdf(fs.readFileSync(path.join(FIX, "lease-high-confidence.txt"), "utf-8"));
    const recon = await textToPdf(fs.readFileSync(path.join(FIX, "recon-high-confidence.txt"), "utf-8"));

    // --- Validation ---
    const r401 = await upload({ lease, recon });
    rec("Upload without sign-in rejected", r401.status === 401, `HTTP ${r401.status}`);

    const fake = Buffer.from("<html>this is not a pdf</html>");
    const rFake = await upload({ lease: fake, recon }, A.token);
    rec("Upload: non-PDF content with PDF MIME type rejected", rFake.status === 400, `HTTP ${rFake.status}`);

    const big = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(26 * 1024 * 1024)]);
    const rBig = await upload({ lease: big, recon }, A.token);
    rec("Upload: file over 25 MB rejected", rBig.status === 400, `HTTP ${rBig.status}`);

    // --- Happy path ---
    const rUp = await upload({ lease, recon }, A.token);
    const upJson = (await rUp.json()) as { id?: string };
    rec("Upload: valid synthetic lease + CAM statement accepted", rUp.status === 200 && !!upJson.id, `HTTP ${rUp.status}`);
    if (!upJson.id) return;
    const id = upJson.id;
    auditIds.push(id);

    const { data: row0 } = await admin.from("audits").select("owner_id,status").eq("id", id).single();
    rec("Persisted audit is owned by the uploader", row0?.owner_id === A.id, `owner_id matches User A: ${row0?.owner_id === A.id}`);

    const { last, ms } = await poll(id, A.token);
    rec("Processing reaches a terminal state", last?.status === "completed" || last?.status === "error",
      `status=${String(last?.status)} after ${Math.round(ms / 1000)}s`);
    rec("Audit completed successfully (real extraction + analysis)", last?.status === "completed",
      last?.status === "completed" ? "status=completed" : `status=${String(last?.status)} (see DB error below)`);

    const { data: full } = await admin.from("audits").select("*").eq("id", id).single();
    const freeN = Array.isArray(full?.free_findings) ? full!.free_findings.length : 0;
    const paidN = Array.isArray(full?.paid_findings) ? full!.paid_findings.length : 0;
    rec("Results persisted from real analysis", freeN + paidN > 0,
      `free_findings=${freeN}, paid_findings=${paidN}, confidence=${full?.confidence ?? "null"}, lease_extraction=${full?.lease_extraction_method ?? "null"}, recon_extraction=${full?.recon_extraction_method ?? "null"}`);
    if (full?.status === "error") console.log("   DB error_message (internal):", full.error_message);

    // --- Storage ---
    const { data: objs } = await admin.storage.from("invoices").list(id);
    const names = (objs ?? []).map((o) => o.name).sort();
    rec("Documents stored under invoices/<audit-id>/", names.includes("lease.pdf") && names.includes("recon.pdf"), `objects: ${names.join(", ")}`);
    const pub = await fetch(`${url}/storage/v1/object/public/invoices/${id}/lease.pdf`);
    rec("Bucket is private (public URL does not serve the lease)", pub.status !== 200, `public URL HTTP ${pub.status}`);

    // --- API response ---
    const apiRes = await fetch(`${BASE}/api/audit/${id}`, { headers: { Authorization: `Bearer ${A.token}` } });
    const apiBody = await apiRes.text();
    const apiJson = JSON.parse(apiBody) as { paid_findings?: { description: string }[] };
    const leakedPaid = (full?.paid_findings ?? []).some((f: { description?: string }) => f.description && apiBody.includes(f.description));
    rec("API: owner gets 200", apiRes.status === 200, `HTTP ${apiRes.status}`);
    const leakedDescs = (full?.paid_findings ?? []).map((f: { description?: string }) => f.description).filter((d: string | undefined): d is string => !!d && apiBody.includes(d));
    const pathHits = ["lease.pdf", "recon.pdf", "report.pdf"].filter((p) => apiBody.includes(p));
    rec("API: no paid descriptions, storage paths or report path in response",
      leakedDescs.length === 0 && pathHits.length === 0,
      `paid descriptions found in body=${leakedDescs.length}${leakedDescs.length ? " (\"" + leakedDescs[0].slice(0, 60) + "...\")" : ""}, path hits=[${pathHits.join(",")}], teaser entries=${apiJson.paid_findings?.length ?? 0}`);
    const rB = await fetch(`${BASE}/api/audit/${id}`, { headers: { Authorization: `Bearer ${B.token}` } });
    rec("API: another user gets 404", rB.status === 404, `HTTP ${rB.status}`);
    const rep = await fetch(`${BASE}/api/audit/${id}/report`, { headers: { Authorization: `Bearer ${A.token}` }, redirect: "manual" });
    rec("Report download blocked for the owner until payment (402)", rep.status === 402, `HTTP ${rep.status}`);

    // --- Error handling: valid PDF signature, unreadable content ---
    const junk = Buffer.from("%PDF-1.4\nthis is not a real pdf body\n%%EOF");
    const rJ = await upload({ lease: junk, recon: junk }, A.token);
    const jId = ((await rJ.json()) as { id?: string }).id;
    if (jId) {
      auditIds.push(jId);
      const j = await poll(jId, A.token, 4 * 60_000);
      const { data: jrow } = await admin.from("audits").select("status,error_message").eq("id", jId).single();
      const jBody = JSON.stringify(j.last);
      rec("Corrupt PDF handled without crashing", j.last?.status === "completed" || j.last?.status === "error",
        `status=${String(j.last?.status)}; DB status=${jrow?.status}`);
      rec("Errors do not expose internal details through the API",
        !jrow?.error_message || !jBody.includes(jrow.error_message),
        jrow?.error_message ? "raw error stored server-side only; API returned the generic message" : "no error stored (audit completed with limited data)");
    } else {
      rec("Corrupt PDF handled without crashing", false, `upload HTTP ${rJ.status}`);
    }

    rec("Results displayed in the browser UI", null, "NOT RUN: needs a real browser session; this script covers the API only");
  } finally {
    for (const id of auditIds) {
      await admin.storage.from("invoices").remove([`${id}/lease.pdf`, `${id}/recon.pdf`, `${id}/report.pdf`]);
      const { data: left } = await admin.storage.from("invoices").list(id);
      if (left?.length) await admin.storage.from("invoices").remove(left.map((o) => `${id}/${o.name}`));
    }
    if (auditIds.length) await admin.from("audits").delete().in("id", auditIds);
    for (const u of userIds) await admin.auth.admin.deleteUser(u);
  }
  const c = (s: string) => results.filter((r) => r.status === s).length;
  console.log(`\n${c("PASS")} PASS, ${c("FAIL")} FAIL, ${c("NOT RUN")} NOT RUN`);
  process.exit(c("FAIL") ? 1 : 0);
}

main().catch((e) => {
  console.error("Run aborted:", e instanceof Error ? e.message : e);
  process.exit(1);
});
