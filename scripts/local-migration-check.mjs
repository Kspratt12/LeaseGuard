// Applies every migration to a DISPOSABLE local PostgreSQL and checks the input_overrides migration and its rollback.
// Never connects to any shared database: it starts its own server in a temporary folder on a local port and deletes it.
//
// Requires the tooling installed OUTSIDE this project (not a project dependency):
//   npm install --prefix <tools-dir> embedded-postgres@18.4.0-beta.17 pg@8.13.1
// Run:  LG_PG_TOOLS=<tools-dir> node scripts/local-migration-check.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";

const tools = process.env.LG_PG_TOOLS;
if (!tools) throw new Error("Set LG_PG_TOOLS to the folder where embedded-postgres and pg are installed.");
const req = createRequire(path.join(tools, "node_modules", "_"));
const EmbeddedPostgres = (await import(pathToFileURL(req.resolve("embedded-postgres")).href)).default;
const { Client } = req("pg");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lg-pg-"));
// a port the OS reports as free right now, so this never talks to another server on the machine
const port = await new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.once("error", reject);
  srv.listen(0, "127.0.0.1", () => { const p = srv.address().port; srv.close(() => resolve(p)); });
});
console.log(`disposable PostgreSQL on 127.0.0.1:${port}, data in ${os.tmpdir()}`);
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "local-only", port, persistent: false, onLog: (m) => { if (process.env.PGLOG) console.log("[pg]", String(m).trim()); }, onError: (m) => { if (process.env.PGLOG) console.log("[pg-err]", String(m).trim()); } });
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`  ✓ ${name}`); };

try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("lg_test");
  const db = new Client({ host: "127.0.0.1", port, user: "postgres", password: "local-only", database: "lg_test" });
  db.on("error", (e) => console.error("db error:", e.message));
  await db.connect();

  // Minimal stand-ins for what Supabase provides (roles, auth.users, auth.uid(), storage schema).
  await db.query(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage; create table storage.buckets (id text primary key, name text not null, public boolean default false);
  `);

  const migDir = path.join(root, "supabase", "migrations");
  const files = fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    await db.query(fs.readFileSync(path.join(migDir, f), "utf8"));
    console.log(`  applied ${f}`);
  }

  const uid = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  await db.query(`insert into auth.users (id) values ($1), ($2)`, [uid, other]);
  await db.query(`insert into public.audits (id, owner_id, status, savings_estimate) values ('aaaaaaaa-0000-4000-8000-000000000001', $1, 'completed', 12700)`, [uid]);

  // one transaction acting as a signed-in user (role + JWT subject), the way PostgREST does it
  const asUser = async (id) => {
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id]);
  };

  await check("the column exists, is nullable, and existing rows are NULL (no backfill)", async () => {
    const r = await db.query(`select input_overrides from public.audits`);
    assert.equal(r.rows[0].input_overrides, null);
  });

  await check("the service role can store a well-formed record", async () => {
    const value = { version: 1, values: { "share.expectedShare": { value: 9, original: 8.08, at: "2026-11-20T10:00:00Z" } } };
    await db.query(`update public.audits set input_overrides = $1`, [value]);
    const r = await db.query(`select input_overrides->'values'->'share.expectedShare'->>'value' as v from public.audits`);
    assert.equal(r.rows[0].v, "9");
  });

  await check("the check constraint refuses malformed records", async () => {
    for (const bad of [[1, 2], { version: 2, values: {} }, { version: 1, values: [] }, { version: 1 }, { version: 1, values: { big: "x".repeat(20000) } }]) {
      await assert.rejects(db.query(`update public.audits set input_overrides = $1`, [JSON.stringify(bad)]), /audits_input_overrides_shape/);
    }
  });

  await check("an owner cannot read the column with their own role (not in the column grant), but can read granted columns", async () => {
    await asUser(uid);
    const ok = await db.query(`select id, savings_estimate from public.audits`);
    assert.equal(ok.rows.length, 1, "RLS shows the owner their row");
    await assert.rejects(db.query(`select input_overrides from public.audits`), /permission denied/);
    await db.query(`rollback`);
  });

  await check("an owner cannot write the column directly", async () => {
    await asUser(uid);
    await assert.rejects(db.query(`update public.audits set input_overrides = null`), /permission denied/);
    await db.query(`rollback`);
  });

  await check("another user sees no row at all", async () => {
    await asUser(other);
    const r = await db.query(`select id from public.audits`);
    assert.equal(r.rows.length, 0);
    await db.query(`rollback`);
  });

  await check("the migration is re-runnable (idempotent)", async () => {
    await db.query(fs.readFileSync(path.join(migDir, "20261120_audit_input_overrides.sql"), "utf8"));
  });

  await check("the rollback removes the column and constraint and leaves the audit intact", async () => {
    await db.query(fs.readFileSync(path.join(root, "supabase", "rollback", "20261120_audit_input_overrides.down.sql"), "utf8"));
    const c = await db.query(`select 1 from information_schema.columns where table_name = 'audits' and column_name = 'input_overrides'`);
    assert.equal(c.rows.length, 0);
    const r = await db.query(`select savings_estimate from public.audits`);
    assert.equal(Number(r.rows[0].savings_estimate), 12700);
    await db.query(fs.readFileSync(path.join(root, "supabase", "rollback", "20261120_audit_input_overrides.down.sql"), "utf8")); // rollback is re-runnable
  });

  await db.end();
  console.log(`\nlocal-migration-check: ${passed} passed, 0 failed`);
} finally {
  await pg.stop().catch(() => {});
  fs.rmSync(dir, { recursive: true, force: true });
}
