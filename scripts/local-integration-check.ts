/**
 * LOCAL-ONLY integration check of the REAL API routes (Next production build) against disposable local services:
 *   PostgreSQL (all repository migrations, Supabase roles, RLS and column grants)  <-  PostgREST (Supabase's REST layer)
 *   <- a local gateway exposing /rest/v1 (PostgREST) and /auth/v1/user (accepts only tokens minted here)  <-  the app.
 * Users, audits and payments are synthetic. The JWT secret and keys are generated per run and discarded.
 * No Supabase project, Stripe, email or AI service is contacted (those variables are removed from the environment).
 *
 * Tools installed OUTSIDE the project: LG_PG_TOOLS (embedded-postgres + pg), LG_POSTGREST (postgrest.exe folder).
 * Run: LG_PG_TOOLS=... LG_POSTGREST=... npx tsx scripts/local-integration-check.ts
 */
for (const v of ["ANTHROPIC_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_ALLOW_LIVE", "RESEND_API_KEY"]) delete process.env[v];
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { PDFDocument, StandardFonts } from "pdf-lib";

const ROOT = process.cwd();
const req = createRequire(path.join(process.env.LG_PG_TOOLS ?? "", "node_modules", "_"));
const PGRST_DIR = process.env.LG_POSTGREST ?? "";
const PG_BIN = path.join(process.env.LG_PG_TOOLS ?? "", "node_modules", "@embedded-postgres", "windows-x64", "native", "bin");
const NODE = process.execPath;
const NEXT = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");

const freePort = () => new Promise<number>((res, rej) => { const s = net.createServer(); s.once("error", rej); s.listen(0, "127.0.0.1", () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); }); });
const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const SECRET = crypto.randomBytes(32).toString("hex");
const jwt = (claims: Record<string, unknown>) => {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64u(JSON.stringify({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 7200, ...claims }));
  return `${h}.${p}.${b64u(crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest())}`;
};
const verify = (t: string): Record<string, unknown> | null => {
  const [h, p, s] = t.split(".");
  if (!h || !p || !s) return null;
  const want = b64u(crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest());
  if (want.length !== s.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(s))) return null;
  const c = JSON.parse(Buffer.from(p, "base64url").toString());
  return c.exp > Date.now() / 1000 ? c : null;
};

const U = { A: "aaaaaaaa-1111-4111-8111-111111111111", B: "bbbbbbbb-2222-4222-8222-222222222222", C: "cccccccc-3333-4333-8333-333333333333" };
const AUD = { NEW: "a0000000-0000-4000-8000-000000000001", LEGACY: "a0000000-0000-4000-8000-000000000002", UNPAID: "a0000000-0000-4000-8000-000000000003" };
const tok = (sub: string) => jwt({ sub, role: "authenticated", aud: "authenticated", email: `${sub.slice(0, 4)}@example.invalid` });

const results: Array<[string, boolean, string?]> = [];
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push([name, true]); console.log(`  ✓ ${name}`); }
  catch (e) { const m = e instanceof Error ? e.message.split("\n")[0] : String(e); results.push([name, false, m]); console.log(`  ✗ ${name}: ${m}`); }
}

async function textToPdf(text: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Courier);
  const page = pdf.addPage([612, 792]);
  text.split("\n").slice(0, 68).forEach((l, j) => page.drawText(l.replace(/[^\x20-\x7E]/g, "-"), { x: 36, y: 756 - j * 10.5, size: 8, font }));
  return Buffer.from(await pdf.save());
}

const procs: ChildProcess[] = [];
const waitFor = async (url: string, ms = 120000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { try { const r = await fetch(url); if (r.status < 500) return; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  throw new Error(`timeout waiting for ${url}`);
};

async function main() {
  const EmbeddedPostgres = (await import(pathToFileURL(req.resolve("embedded-postgres")).href)).default;
  const { Client } = req("pg");
  const [pgPort, pgrstPort, gwPort, appPort] = [await freePort(), await freePort(), await freePort(), await freePort()];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lg-int-"));
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "local-only", port: pgPort, persistent: false, onLog: () => {} });
  let server: http.Server | null = null;
  try {
    await pg.initialise();
    await pg.start();
    await pg.createDatabase("lg");
    const db = new Client({ host: "127.0.0.1", port: pgPort, user: "postgres", password: "local-only", database: "lg" });
    db.on("error", () => {});
    await db.connect();
    const authPw = crypto.randomBytes(12).toString("hex");
    await db.query(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create role authenticator login noinherit password '${authPw}'; grant anon, authenticated, service_role to authenticator;
      create schema auth; create table auth.users (id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
      create schema storage; create table storage.buckets (id text primary key, name text not null, public boolean default false);
    `);
    const migDir = path.join(ROOT, "supabase", "migrations");
    const migrations = fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
    for (const f of migrations) await db.query(fs.readFileSync(path.join(migDir, f), "utf8"));
    await db.query(`grant usage on schema public, auth to anon, authenticated, service_role;
      grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role;`);
    console.log(`  (applied ${migrations.length} migrations: ${migrations.join(", ")})`);

    // ── synthetic data: the fictional 10.00%-vs-8.08% audit (current engine), the pre-fix engine's stored row, an unpaid audit
    delete process.env.ANTHROPIC_API_KEY;
    const FIX = path.join(ROOT, "src", "services", "__tests__", "fixtures");
    const { validateDocuments } = await import("../src/services/document-validator");
    const { runAudit } = await import("../src/services/audit-logic");
    const recon = fs.readFileSync(path.join(FIX, "recon-high-confidence.txt"), "utf-8")
      .replace("Tenant's Pro-Rata Share: 8.08%", "Tenant's Pro-Rata Share: 10.00%")
      .replace("Tenant's Share (8.08%)                                 $53,444.13", "Tenant's Share (10.00%)                                $66,143.72")
      .replace("Total CAM charges for your suite: $53,444.13", "Total CAM charges for your suite: $66,143.72");
    const r = await runAudit(await validateDocuments(await textToPdf(fs.readFileSync(path.join(FIX, "lease-high-confidence.txt"), "utf-8")), await textToPdf(recon)));
    const legacy = JSON.parse(fs.readFileSync(path.join(FIX, "legacy-share-audit.json"), "utf-8"));
    await db.query(`insert into auth.users (id) values ($1), ($2), ($3)`, [U.A, U.B, U.C]);
    const ins = `insert into public.audits (id, owner_id, status, savings_estimate, free_findings, paid_findings, estimated_overcharge, overcharge_breakdown, lease_clauses_summary, confidence, audit_mode, recon_year_count)
                 values ($1,$2,'completed',$3,$4,$5,$6,$7,$8,'high','full',1)`;
    const rowArgs = (x: { savings_estimate: number; free_findings: unknown; paid_findings: unknown; estimated_overcharge: number; overcharge_breakdown: unknown; lease_clauses_summary: unknown }) =>
      [x.savings_estimate, JSON.stringify(x.free_findings), JSON.stringify(x.paid_findings), x.estimated_overcharge, JSON.stringify(x.overcharge_breakdown), JSON.stringify(x.lease_clauses_summary)];
    const cur = { savings_estimate: r.savings_estimate, free_findings: r.free_findings, paid_findings: r.paid_findings, estimated_overcharge: r.estimated_overcharge, overcharge_breakdown: r.overcharge_breakdown, lease_clauses_summary: r.leaseClausesSummary };
    await db.query(ins, [AUD.NEW, U.A, ...rowArgs(cur)]);
    await db.query(ins, [AUD.LEGACY, U.A, ...rowArgs(legacy)]);
    await db.query(ins, [AUD.UNPAID, U.C, ...rowArgs(cur)]);
    for (const [i, a] of [AUD.NEW, AUD.LEGACY].entries()) {
      await db.query(`insert into public.payments (audit_id, owner_id, tier, stripe_session_id, amount_expected, amount_paid, livemode, status, paid_at) values ($1,$2,'single',$3,4900,4900,false,'paid',now())`, [a, U.A, `cs_test_local_${i}`]);
    }

    // ── PostgREST + gateway
    const conf = path.join(dir, "postgrest.conf");
    fs.writeFileSync(conf, `db-uri = "postgres://authenticator:${authPw}@127.0.0.1:${pgPort}/lg"\ndb-schemas = "public"\ndb-anon-role = "anon"\njwt-secret = "${SECRET}"\nserver-host = "127.0.0.1"\nserver-port = ${pgrstPort}\n`);
    const pgrst = spawn(path.join(PGRST_DIR, "postgrest.exe"), [conf], { env: { ...process.env, PATH: `${PG_BIN};${process.env.PATH}` }, stdio: "ignore" });
    procs.push(pgrst);
    await waitFor(`http://127.0.0.1:${pgrstPort}/`);
    let restDown = false;
    // Minimal in-memory stand-in for Supabase Storage: only the object upload the app uses (POST /storage/v1/object/{bucket}/{path}).
    // Only the service role may write, and an existing object is never overwritten (the app uploads with upsert: false).
    const storage = new Map<string, { bytes: number; contentType: string }>();
    server = http.createServer(async (inReq, out) => {
      const u = new URL(inReq.url ?? "/", "http://x");
      if (u.pathname === "/auth/v1/user") {
        const c = verify(String(inReq.headers.authorization ?? "").replace(/^Bearer\s+/i, ""));
        if (!c || c.role !== "authenticated") { out.writeHead(401, { "content-type": "application/json" }); return out.end(JSON.stringify({ code: 401, msg: "invalid JWT" })); }
        out.writeHead(200, { "content-type": "application/json" });
        return out.end(JSON.stringify({ id: c.sub, aud: "authenticated", role: "authenticated", email: c.email }));
      }
      if (u.pathname.startsWith("/storage/v1/object/") && inReq.method === "POST") {
        const c = verify(String(inReq.headers.authorization ?? "").replace(/^Bearer\s+/i, ""));
        if (!c || c.role !== "service_role") { out.writeHead(403, { "content-type": "application/json" }); return out.end(JSON.stringify({ statusCode: "403", error: "Unauthorized", message: "service role required" })); }
        const key = decodeURIComponent(u.pathname.slice("/storage/v1/object/".length));
        if (storage.has(key) && inReq.headers["x-upsert"] !== "true") { out.writeHead(409, { "content-type": "application/json" }); return out.end(JSON.stringify({ statusCode: "409", error: "Duplicate", message: "The resource already exists" })); }
        let bytes = 0;
        for await (const ch of inReq) bytes += (ch as Buffer).length;
        storage.set(key, { bytes, contentType: String(inReq.headers["content-type"] ?? "") });
        out.writeHead(200, { "content-type": "application/json" });
        return out.end(JSON.stringify({ Key: key, Id: crypto.randomUUID() }));
      }
      if (u.pathname.startsWith("/rest/v1/")) {
        if (restDown) { out.writeHead(503); return out.end("down"); }
        const body: Buffer[] = [];
        for await (const ch of inReq) body.push(ch as Buffer);
        const headers = { ...inReq.headers } as Record<string, string>;
        delete headers.host;
        const up = await fetch(`http://127.0.0.1:${pgrstPort}${u.pathname.slice("/rest/v1".length)}${u.search}`, { method: inReq.method, headers, body: ["GET", "HEAD"].includes(inReq.method ?? "GET") ? undefined : Buffer.concat(body) });
        out.writeHead(up.status, Object.fromEntries(up.headers.entries()));
        return out.end(Buffer.from(await up.arrayBuffer()));
      }
      out.writeHead(404); out.end();
    });
    await new Promise<void>((res) => server!.listen(gwPort, "127.0.0.1", () => res()));

    // ── build and start the app against the gateway (NEXT_PUBLIC_* are build-time values)
    const appEnv = {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${gwPort}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: "anon" }),
      SUPABASE_SERVICE_ROLE_KEY: jwt({ role: "service_role" }),
      NEXT_TELEMETRY_DISABLED: "1",
    };
    const distDir = path.join(ROOT, ".next");
    fs.rmSync(distDir, { recursive: true, force: true });
    const build = spawn(NODE, [NEXT, "build"], { cwd: ROOT, env: appEnv, stdio: "ignore" });
    const code: number = await new Promise((res) => build.on("exit", (c) => res(c ?? 1)));
    if (code !== 0) {
      // the framework's advisory notice interrupts every other build; one retry is that command's documented behaviour
      const again = spawn(NODE, [NEXT, "build"], { cwd: ROOT, env: appEnv, stdio: "ignore" });
      const c2: number = await new Promise((res) => again.on("exit", (c) => res(c ?? 1)));
      if (c2 !== 0) throw new Error("next build failed");
    }
    const app = spawn(NODE, [NEXT, "start", "-p", String(appPort), "-H", "127.0.0.1"], { cwd: ROOT, env: appEnv, stdio: "ignore" });
    procs.push(app);
    const BASE = `http://127.0.0.1:${appPort}`;
    await waitFor(`${BASE}/`);
    console.log(`  (app on ${BASE}, gateway ${gwPort}, PostgREST ${pgrstPort}, PostgreSQL ${pgPort})\n`);

    const call = (p: string, opts: { as?: string | null; method?: string; body?: unknown; raw?: string } = {}) =>
      fetch(`${BASE}${p}`, {
        method: opts.method ?? "GET",
        headers: { ...(opts.as ? { Authorization: `Bearer ${opts.as}` } : {}), ...(opts.body !== undefined || opts.raw ? { "Content-Type": "application/json" } : {}) },
        body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      });
    const A = tok(U.A), B = tok(U.B), C = tok(U.C);
    const { extractTextFromPdf } = await import("../src/services/document-validator");
    const pdfText = async (res: Response) => (await extractTextFromPdf(Buffer.from(await res.arrayBuffer()))).text.replace(/\s+/g, " ");
    const shareOf = (j: { free_findings?: Array<{ category: string; potential_savings: number; description: string }>; paid_findings?: Array<{ category: string; potential_savings: number; description: string }> }) =>
      [...(j.free_findings ?? []), ...(j.paid_findings ?? [])].filter((f) => /allocation|pro-?rata|share/i.test(f.category));

    // ── authentication and ownership
    await check("no token, a forged token (wrong key) and an expired-format token are refused with 401 on every gated route", async () => {
      const forged = (() => { const t = tok(U.A).split("."); return `${t[0]}.${t[1]}.${b64u(crypto.randomBytes(32))}`; })();
      for (const p of [`/api/audit/${AUD.NEW}`, `/api/audit/${AUD.NEW}/inputs`, `/api/audit/${AUD.NEW}/letter`, `/api/audit/${AUD.NEW}/report`, "/api/audits"]) {
        for (const t of [null, forged, "not.a.jwt"]) assert.equal((await call(p, { as: t })).status, 401, `${p} with ${t ? "bad" : "no"} token`);
      }
    });
    await check("another user gets 404 for someone else's audit (existence not revealed) on every route", async () => {
      for (const p of [`/api/audit/${AUD.NEW}`, `/api/audit/${AUD.NEW}/inputs`, `/api/audit/${AUD.NEW}/letter`, `/api/audit/${AUD.NEW}/report`]) {
        assert.equal((await call(p, { as: B })).status, 404, p);
      }
      assert.equal((await call(`/api/audit/${AUD.NEW}/inputs`, { as: B, method: "PUT", body: { values: { "share.expectedShare": 9 } } })).status, 404);
      const list = await (await call("/api/audits", { as: B })).json();
      assert.deepEqual(list, [], "the other user's list is empty");
    });
    await check("an owner cannot read or write paid-only columns directly through the REST layer with their own token", async () => {
      const gw = `http://127.0.0.1:${gwPort}/rest/v1`;
      const anon = jwt({ role: "anon" });
      const h = { apikey: anon, Authorization: `Bearer ${A}`, "Content-Type": "application/json" };
      const ok = await fetch(`${gw}/audits?select=id,savings_estimate&id=eq.${AUD.NEW}`, { headers: h });
      assert.equal(ok.status, 200);
      assert.equal((await ok.json()).length, 1, "RLS shows the owner their row");
      for (const col of ["paid_findings", "input_overrides"]) {
        const r2 = await fetch(`${gw}/audits?select=${col}&id=eq.${AUD.NEW}`, { headers: h });
        assert.ok([401, 403].includes(r2.status), `${col} readable: ${r2.status}`);
      }
      const w = await fetch(`${gw}/audits?id=eq.${AUD.NEW}`, { method: "PATCH", headers: h, body: JSON.stringify({ input_overrides: null }) });
      assert.ok([401, 403].includes(w.status), `write allowed: ${w.status}`);
    });

    // ── locked vs paid
    await check("unpaid owner: preview with the corrected share amount, teaser only for paid items, no paid clause data; paid routes 402", async () => {
      const res = await call(`/api/audit/${AUD.UNPAID}`, { as: C });
      assert.equal(res.status, 200);
      const j = await res.json();
      assert.equal(j.payment.unlocked, false);
      assert.equal(j.savings_estimate, cur.savings_estimate);
      assert.equal(shareOf(j)[0].potential_savings, 12700);
      assert.ok((j.paid_findings ?? []).every((f: { description: string }) => f.description === "Full details are included in the complete report."));
      assert.ok(!JSON.stringify(j).includes("auditRights"), "audit-rights quote leaked to the unpaid response");
      assert.equal(j.report_available, false);
      for (const p of ["inputs", "letter", "report"]) assert.equal((await call(`/api/audit/${AUD.UNPAID}/${p}`, { as: C })).status, 402, p);
      assert.equal((await call(`/api/audit/${AUD.UNPAID}/inputs`, { as: C, method: "PUT", body: { values: { "share.expectedShare": 9 } } })).status, 402);
    });
    await check("paid owner: full findings, one share item of $12,700, audit-rights clause released, report available", async () => {
      const j = await (await call(`/api/audit/${AUD.NEW}`, { as: A })).json();
      assert.equal(j.payment.unlocked, true);
      assert.equal(j.report_available, true);
      const share = shareOf(j);
      assert.equal(share.length, 1);
      assert.equal(share[0].potential_savings, 12700);
      assert.ok(j.lease_clauses_summary.auditRights?.length >= 1, "audit-rights clause");
    });

    // ── stored pre-fix audit adjusted at read time on every route
    await check("stored pre-fix audit: $5,086 and four share items become one $0 question on the API, list, report and letter", async () => {
      const j = await (await call(`/api/audit/${AUD.LEGACY}`, { as: A })).json();
      assert.equal(j.savings_estimate, 0);
      const s = shareOf(j);
      assert.equal(s.length, 1);
      assert.equal(s[0].potential_savings, 0);
      assert.ok(/earlier version/i.test(s[0].description));
      const list = await (await call("/api/audits", { as: A })).json();
      assert.equal(list.find((x: { id: string }) => x.id === AUD.LEGACY).savings_estimate, 0);
      const rep = await call(`/api/audit/${AUD.LEGACY}/report`, { as: A });
      assert.equal(rep.status, 200);
      const t = await pdfText(rep);
      assert.ok(!t.includes("$5,086") && !t.includes("$1,272"), "old amounts in the PDF");
      assert.ok(/pro-rata share amount is no longer shown/.test(t), "notice in the PDF");
      const l = await (await call(`/api/audit/${AUD.LEGACY}/letter`, { as: A })).json();
      assert.ok(!/\$5,086|\$1,272|\$1,270/.test(l.text));
      assert.equal(l.total, 0);
      const stored = await db.query(`select savings_estimate, jsonb_array_length(paid_findings) n from public.audits where id = $1`, [AUD.LEGACY]);
      assert.equal(Number(stored.rows[0].savings_estimate), 5086, "the stored row is not rewritten");
    });

    // ── corrections: validation, persistence, recalculation everywhere, reset
    await check("corrections: invalid requests are refused with 400 and nothing is written", async () => {
      for (const body of [{ values: { "share.secret": 1 } }, { values: { "share.expectedShare": 0 } }, { values: { "share.expectedShare": 100 } }, { values: { "share.pool": -1 } }, { values: { "share.pool": "1,000" } }, { values: {} }, { values: [] }, {}]) {
        assert.equal((await call(`/api/audit/${AUD.NEW}/inputs`, { as: A, method: "PUT", body })).status, 400, JSON.stringify(body));
      }
      assert.equal((await call(`/api/audit/${AUD.NEW}/inputs`, { as: A, method: "PUT", raw: "{not json" })).status, 400);
      const s = await db.query(`select input_overrides from public.audits where id = $1`, [AUD.NEW]);
      assert.equal(s.rows[0].input_overrides, null);
    });
    await check("corrections: a valid correction is stored with provenance and recalculates the API, list, report, letter and request", async () => {
      const put = await call(`/api/audit/${AUD.NEW}/inputs`, { as: A, method: "PUT", body: { values: { "share.expectedShare": 9 } } });
      assert.equal(put.status, 200);
      const pj = await put.json();
      assert.ok(pj.inputs.find((i: { key: string; corrected: boolean }) => i.key === "share.expectedShare").corrected);
      const s = await db.query(`select input_overrides from public.audits where id = $1`, [AUD.NEW]);
      const o = s.rows[0].input_overrides.values["share.expectedShare"];
      assert.equal(o.value, 9);
      assert.equal(o.original, 8.08);
      assert.ok(!Number.isNaN(Date.parse(o.at)));
      const j = await (await call(`/api/audit/${AUD.NEW}`, { as: A })).json();
      assert.equal(shareOf(j)[0].potential_savings, 6614); // 66,143.72 - 661,437.20 x 9% (59,529.35) = 6,614.37
      assert.equal(j.savings_estimate, Math.round((cur.savings_estimate - 12700 + 6614) * 100) / 100);
      assert.equal(j.lease_clauses_summary.inputCorrections.applied[0].key, "share.expectedShare");
      const list = await (await call("/api/audits", { as: A })).json();
      assert.equal(list.find((x: { id: string }) => x.id === AUD.NEW).savings_estimate, j.savings_estimate);
      const t = await pdfText(await call(`/api/audit/${AUD.NEW}/report`, { as: A }));
      assert.ok(t.includes("$6,614") && /Recalculated with figures you corrected/.test(t));
      const l = await (await call(`/api/audit/${AUD.NEW}/letter`, { as: A })).json();
      assert.ok(l.text.includes("$6,614") && !l.text.includes("$12,700"));
      assert.equal(l.total, j.savings_estimate);
      assert.ok(l.documentRequest.text.includes("REQUESTED RECORDS") && l.documentRequest.citesLeaseClause === true);
      assert.ok(l.auditRights.length >= 1 && l.auditRights[0].period.count === 120);
    });
    await check("exports: PDF and Word return the customer's edited text; empty or oversized text is refused", async () => {
      // letter-length text: the reader used here OCRs anything under 200 characters as if it were a scan
      const text = "Edited by the tenant: $6,614 to review. " + "Please send the general ledger detail and the calculation of my share for the reconciliation year. ".repeat(4);
      const pdf = await call(`/api/audit/${AUD.NEW}/letter`, { as: A, method: "POST", body: { text, format: "pdf", kind: "documents" } });
      assert.equal(pdf.status, 200);
      assert.match(pdf.headers.get("content-disposition") ?? "", /LeaseGuard-Document-Request-/);
      assert.ok((await pdfText(pdf)).includes("Edited by the tenant: $6,614"));
      const docx = await call(`/api/audit/${AUD.NEW}/letter`, { as: A, method: "POST", body: { text, format: "docx" } });
      assert.equal(docx.status, 200);
      assert.match(docx.headers.get("content-type") ?? "", /wordprocessingml/);
      assert.equal((await call(`/api/audit/${AUD.NEW}/letter`, { as: A, method: "POST", body: { text: " ", format: "pdf" } })).status, 400);
      assert.equal((await call(`/api/audit/${AUD.NEW}/letter`, { as: A, method: "POST", body: { text: "x".repeat(20001), format: "pdf" } })).status, 400);
      assert.equal((await call(`/api/audit/${AUD.NEW}/letter`, { as: C, method: "POST", body: { text, format: "pdf" } })).status, 404, "another user's export");
    });
    await check("corrections: reset clears the stored record and restores the document result exactly", async () => {
      const put = await call(`/api/audit/${AUD.NEW}/inputs`, { as: A, method: "PUT", body: { values: { "share.expectedShare": null } } });
      assert.equal(put.status, 200);
      const s = await db.query(`select input_overrides from public.audits where id = $1`, [AUD.NEW]);
      assert.equal(s.rows[0].input_overrides, null);
      const j = await (await call(`/api/audit/${AUD.NEW}`, { as: A })).json();
      assert.equal(j.savings_estimate, cur.savings_estimate);
      assert.equal(shareOf(j)[0].potential_savings, 12700);
    });

    // ── failure and retry
    await check("data layer unavailable: saving fails with a clear error and no crash; after recovery the same request succeeds", async () => {
      restDown = true;
      const bad = await call(`/api/audit/${AUD.NEW}/inputs`, { as: A, method: "PUT", body: { values: { "share.expectedShare": 9 } } });
      assert.ok(bad.status >= 400 && bad.status < 600, `status ${bad.status}`);
      const body = await bad.text();
      assert.ok(!/at .*\.ts:|stack/i.test(body), "no stack trace in the response");
      restDown = false;
      const ok = await call(`/api/audit/${AUD.NEW}/inputs`, { as: A, method: "PUT", body: { values: { "share.expectedShare": 9 } } });
      assert.equal(ok.status, 200);
      await call(`/api/audit/${AUD.NEW}/inputs`, { as: A, method: "PUT", body: { values: { "share.expectedShare": null } } });
    });

    // ── upload -> storage -> background analysis -> stored result (real /api/upload; no AI key, so deterministic extraction)
    const upload = async (as: string | null, files: Record<string, { bytes: Buffer; type: string; name: string }>) => {
      const fd = new FormData();
      for (const [field, f] of Object.entries(files)) fd.append(field, new Blob([new Uint8Array(f.bytes)], { type: f.type }), f.name);
      return fetch(`${BASE}/api/upload`, { method: "POST", headers: as ? { Authorization: `Bearer ${as}` } : {}, body: fd });
    };
    const waitDone = async (id: string, as: string, ms = 180000) => {
      const t = Date.now();
      while (Date.now() - t < ms) {
        const j = await (await call(`/api/audit/${id}`, { as })).json();
        if (j.status === "completed" || j.status === "error") return j;
        await new Promise((r2) => setTimeout(r2, 1500));
      }
      throw new Error("analysis did not finish");
    };
    const leasePdf = await textToPdf(fs.readFileSync(path.join(FIX, "lease-high-confidence.txt"), "utf-8"));
    const reconPdf = await textToPdf(recon);
    let uploadedId = "";
    await check("upload: refused without sign-in (401), for a non-PDF (400) and with a document missing (400)", async () => {
      assert.equal((await upload(null, { lease: { bytes: leasePdf, type: "application/pdf", name: "lease.pdf" }, recon: { bytes: reconPdf, type: "application/pdf", name: "recon.pdf" } })).status, 401);
      const fake = Buffer.from("this is not a pdf, only a renamed text file");
      assert.equal((await upload(A, { lease: { bytes: fake, type: "application/pdf", name: "lease.pdf" }, recon: { bytes: reconPdf, type: "application/pdf", name: "recon.pdf" } })).status, 400, "non-PDF content");
      assert.equal((await upload(A, { lease: { bytes: leasePdf, type: "application/pdf", name: "lease.pdf" } })).status, 400, "statement missing");
      assert.equal(storage.size, 0, "nothing stored for refused uploads");
    });
    await check("upload: a signed-in user's lease and statement are stored, analysed in the background and completed with traceable findings", async () => {
      const res = await upload(A, { lease: { bytes: leasePdf, type: "application/pdf", name: "Fictional-Lease.pdf" }, recon: { bytes: reconPdf, type: "application/pdf", name: "Fictional-Statement.pdf" } });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.success && typeof body.id === "string");
      uploadedId = body.id;
      const j = await waitDone(uploadedId, A);
      assert.equal(j.status, "completed", `status ${j.status}: ${j.error_message}`);
      const share = shareOf(j);
      assert.equal(share.length, 1);
      assert.equal(share[0].potential_savings, 12700, "the corrected share calculation runs inside the real upload pipeline");
      const ev = (share[0] as { sourceEvidence?: Array<{ document: string; extractedText: string }> }).sourceEvidence ?? [];
      assert.ok(ev.some((e) => e.document === "Fictional-Statement.pdf" && /661,437\.20/.test(e.extractedText)), "evidence names the uploaded statement and quotes it");
      assert.ok([...(j.free_findings ?? [])].every((f: { description: string }) => !/\bconfirmed overcharge\b(?! )/i.test(f.description.replace(/not a confirmed overcharge/gi, ""))), "no finding asserts a confirmed overcharge");
      for (const name of ["lease.pdf", "recon.pdf", "report.pdf"]) assert.ok(storage.has(`invoices/${uploadedId}/${name}`), `${name} stored under the audit`);
      const row = await db.query(`select owner_id, status, lease_url, recon_url from public.audits where id = $1`, [uploadedId]);
      assert.equal(row.rows[0].owner_id, U.A, "the audit belongs to the uploader");
      assert.equal(row.rows[0].lease_url, `${uploadedId}/lease.pdf`, "a private storage path, not a public URL");
    });
    await check("upload: the new audit is invisible to another user and locked until payment", async () => {
      assert.equal((await call(`/api/audit/${uploadedId}`, { as: B })).status, 404);
      const j = await (await call(`/api/audit/${uploadedId}`, { as: A })).json();
      assert.equal(j.payment.unlocked, false);
      assert.equal((await call(`/api/audit/${uploadedId}/report`, { as: A })).status, 402);
      const list = await (await call("/api/audits", { as: A })).json();
      assert.ok(list.some((x: { id: string }) => x.id === uploadedId), "listed in the owner's account");
      assert.ok(!JSON.stringify(j).includes("invoices/"), "no storage path in the response");
    });
    await check("upload: an unreadable document ends in an understandable error status, never an empty 'completed' result", async () => {
      const blank = await (async () => { const d = await PDFDocument.create(); d.addPage([612, 792]); return Buffer.from(await d.save()); })();
      const res = await upload(A, { lease: { bytes: leasePdf, type: "application/pdf", name: "lease.pdf" }, recon: { bytes: blank, type: "application/pdf", name: "blank.pdf" } });
      assert.equal(res.status, 200, "accepted for processing (a valid PDF)");
      const j = await waitDone((await res.json()).id, A);
      assert.equal(j.status, "error");
      assert.match(String(j.error_message), /could not process these documents/i);
      assert.ok(!/stack|\.ts:|Error:/i.test(String(j.error_message)), "no internal detail shown to the customer");
    });

    // ── deploy order: code before migration
    await check("before the migration (column absent): every route still works with original results; saving says not available (503)", async () => {
      await db.query(fs.readFileSync(path.join(ROOT, "supabase", "rollback", "20261120_audit_input_overrides.down.sql"), "utf8"));
      await db.query(`notify pgrst, 'reload schema'`);
      await new Promise((r2) => setTimeout(r2, 1500));
      const j = await (await call(`/api/audit/${AUD.NEW}`, { as: A })).json();
      assert.equal(shareOf(j)[0].potential_savings, 12700);
      const g = await (await call(`/api/audit/${AUD.NEW}/inputs`, { as: A })).json();
      assert.equal(g.available, false);
      const p = await call(`/api/audit/${AUD.NEW}/inputs`, { as: A, method: "PUT", body: { values: { "share.expectedShare": 9 } } });
      assert.equal(p.status, 503);
      assert.equal((await call(`/api/audit/${AUD.NEW}/report`, { as: A })).status, 200);
      assert.equal((await call(`/api/audit/${AUD.NEW}/letter`, { as: A })).status, 200);
      assert.equal((await call("/api/audits", { as: A })).status, 200);
      await db.query(fs.readFileSync(path.join(migDir, "20261120_audit_input_overrides.sql"), "utf8"));
      await db.query(`notify pgrst, 'reload schema'`);
      await new Promise((r2) => setTimeout(r2, 1500));
      assert.equal((await call(`/api/audit/${AUD.NEW}/inputs`, { as: A, method: "PUT", body: { values: { "share.expectedShare": 9 } } })).status, 200, "works again after the migration");
    });

    await db.end();
  } finally {
    for (const p of procs) { try { p.kill(); } catch {} }
    server?.close();
    await pg.stop().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const failed = results.filter((x) => !x[1]);
  console.log(`\nlocal-integration-check: ${results.length - failed.length} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); for (const p of procs) { try { p.kill(); } catch {} } process.exit(1); });
