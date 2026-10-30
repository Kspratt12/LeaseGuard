/**
 * Administrator-authorization test against STAGING only.
 *
 *   (staging values in the shell or an env file, dev server running against them)
 *   npx tsx --env-file=.env.staging.local scripts/staging-admin-test.ts
 *
 * Needs: the staging project (hxjquglxcbxxqjuqvuuy) with migration 20261031_admin_users.sql applied, and a dev
 * server on BASE_URL started with the same staging values. Creates two synthetic users (one administrator, one
 * ordinary customer), checks every admin endpoint for 401 / 403 / 200, and removes everything it created.
 * Refuses to run against any other project, and never reads or prints a key.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const STAGING_REF = "hxjquglxcbxxqjuqvuuy";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

if (!url.includes(STAGING_REF) || !anon || !service) {
  console.error(`Refusing to run: NEXT_PUBLIC_SUPABASE_URL must be the staging project (${STAGING_REF}) with anon and service keys set.`);
  process.exit(1);
}

const admin = createClient(url, service, { auth: { persistSession: false } });
let failed = 0, passed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  ok ? passed++ : failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : detail ? `  (${detail})` : ""}`);
};

const ROUTES = ["overview", "revenue", "health", "payments", "config", "lookup?q=11111111-1111-4111-8111-111111111111"];

async function makeUser(label: string) {
  const email = `${label}-${randomUUID().slice(0, 8)}@example.invalid`;
  const password = `${randomUUID()}Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error("could not create a synthetic user");
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data: s, error: serr } = await client.auth.signInWithPassword({ email, password });
  if (serr || !s.session) throw new Error("synthetic sign-in failed");
  return { id: data.user.id, token: s.session.access_token };
}

(async () => {
  const made: string[] = [];
  try {
    const customer = await makeUser("customer");
    const boss = await makeUser("admin");
    made.push(customer.id, boss.id);
    const { error: aerr } = await admin.from("admin_users").insert({ user_id: boss.id, note: "synthetic staging test" });
    if (aerr) throw new Error("admin_users is missing: apply migration 20261031_admin_users.sql to staging first");

    const call = (route: string, token?: string) => fetch(`${BASE}/api/admin/${route}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });

    for (const r of ROUTES) {
      const name = r.split("?")[0];
      check(`/${name}: no credentials => 401`, (await call(r)).status === 401);
      check(`/${name}: invalid token => 401`, (await call(r, "not-a-real-token")).status === 401);
      const nonAdmin = await call(r, customer.token);
      const body = await nonAdmin.text();
      check(`/${name}: signed-in NON-admin => 403 and no data`, nonAdmin.status === 403 && !/audits|payments|revenue|users/.test(body.replace(/"error":"Not authorized"/, "")), String(nonAdmin.status));
      const ok = await call(r, boss.token);
      check(`/${name}: administrator => 200`, ok.status === 200, String(ok.status));
    }

    const bad = await call("lookup?q=abc", boss.token);
    check("lookup: anything but a full audit id or exact email => 400", bad.status === 400);

    const probe = await (await call("lookup?q=" + encodeURIComponent("nobody-here@example.invalid"), boss.token)).json();
    check("lookup: unknown email => no match", probe.kind === "none");

    const known = await (await call("lookup?q=" + encodeURIComponent((await admin.auth.admin.getUserById(customer.id)).data.user!.email!), boss.token)).json();
    check("lookup: known email => account found, and neither the email nor the user id comes back", known.kind === "account" && !JSON.stringify(known).includes("@example.invalid") && !JSON.stringify(known).includes(customer.id));

    const overview = await (await call("overview", boss.token)).json();
    check("overview: counts only, no secrets", !/sk_|whsec_|service_role|eyJ/.test(JSON.stringify(overview)));

    // the admin endpoints are read-only: no verb other than GET is accepted
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const r = await fetch(`${BASE}/api/admin/overview`, { method, headers: { Authorization: `Bearer ${boss.token}` } });
      check(`overview: ${method} is not accepted (405)`, r.status === 405, String(r.status));
    }
  } catch (e) {
    failed++;
    console.log("ERROR ", e instanceof Error ? e.message : "unknown");
  } finally {
    await admin.from("admin_users").delete().in("user_id", made);
    for (const id of made) await admin.auth.admin.deleteUser(id);
    console.log(`\n${passed} passed, ${failed} failed (synthetic users removed)`);
    process.exit(failed ? 1 : 0);
  }
})();
