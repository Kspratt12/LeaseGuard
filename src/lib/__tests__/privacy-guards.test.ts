/**
 * Guards that keep the code and the privacy policy telling the same story. Static checks only (no server, no database).
 * Run: npx tsx src/lib/__tests__/privacy-guards.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(__dirname, "../..");
const read = (f: string) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const walk = (d: string, out: string[] = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== "__tests__") walk(f, out); }
    else if (/\.(tsx?)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(f);
  }
  return out;
};
const files = walk(SRC);
const rel = (f: string) => path.relative(SRC, f).replace(/\\/g, "/");

let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n++;
  console.log("  ✓", name);
}

t("logs never contain document text previews or customer file names", () => {
  const bad: string[] = [];
  for (const f of files) {
    read(f).split("\n").forEach((line, i) => {
      if (!/console\.(log|warn|error|info)\(/.test(line)) return;
      if (/substring\(0, ?\d+\)|first \d+ chars|text preview|\$\{[^}]*\.name\}|\bname:\s*\w+\.name\b|rawLine|extractedText/.test(line)) bad.push(`${rel(f)}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, []);
});

t("the file-metadata log in the upload route carries sizes and types only", () => {
  const route = read(path.join(SRC, "app/api/upload/route.ts"));
  const block = route.slice(route.indexOf("File metadata:"), route.indexOf("totalFiles"));
  assert.ok(block.length > 0 && !/\bname\b/.test(block), "file names must not be logged");
});

t("customer documents are written to exactly one place: three private objects per audit (lease.pdf, recon.pdf, report.pdf)", () => {
  const writers: Record<string, string[]> = {};
  for (const f of files) {
    const s = read(f);
    for (const m of s.matchAll(/\.upload\(\s*([A-Za-z_.`$\{\}/"']+)/g)) (writers[rel(f)] ??= []).push(m[1]);
  }
  assert.deepEqual(Object.keys(writers), ["app/api/upload/route.ts"], "a new place writes to storage: update the retention and deletion plan and the privacy page");
  const route = read(path.join(SRC, "app/api/upload/route.ts"));
  for (const o of ["lease.pdf", "recon.pdf", "report.pdf"]) assert.ok(route.includes("`${auditId}/" + o + "`"), `${o} path changed`);
  const objectPaths = [...route.matchAll(/`\$\{auditId\}\/([^`]+)`/g)].map((m) => m[1]).sort();
  assert.deepEqual([...new Set(objectPaths)], ["lease.pdf", "recon.pdf", "report.pdf"], "unexpected object names");
});

t("extra statements for multi-year audits are processed in memory and are not stored", () => {
  const route = read(path.join(SRC, "app/api/upload/route.ts"));
  assert.ok(/extraRecons/.test(route));
  assert.ok(!/extra[\w.]*\.buffer[\s\S]{0,200}\.upload\(/.test(route), "extra statements appear to be uploaded to storage");
});

t("stored source documents are never read back after processing (so they could be deleted at once without losing a feature)", () => {
  for (const f of files) {
    const s = read(f);
    if (rel(f) === "app/api/upload/route.ts" || rel(f).startsWith("lib/admin") || rel(f) === "services/admin-data.ts") continue;
    assert.ok(!/createSignedUrl|storage\.from\([^)]*\)\.download\(/.test(s), `${rel(f)} reads documents back from storage`);
    assert.ok(!/\blease_url\b|\brecon_url\b/.test(s) || /OWNER_READABLE|admin-access-doc/.test(s) || rel(f) === "lib/audit-access.ts", `${rel(f)} uses lease_url or recon_url`);
  }
});

t("the privacy page matches the implementation: no automatic deletion exists, so none is claimed", () => {
  const privacy = read(path.join(SRC, "app/privacy/page.tsx")).replace(/\s+/g, " ");
  assert.ok(/We do not currently delete them automatically/.test(privacy));
  assert.ok(/no fixed retention period/.test(privacy));
  assert.ok(!/automatically deleted after|deleted after \d+|retained for a limited/i.test(privacy));
  // if deletion is ever built, this guard should be updated together with the policy
  const deleters = files.filter((f) => /storage\.from\([^)]*\)\.remove\(|\.from\("(audits|payments)"\)\.delete\(/.test(read(f)));
  assert.deepEqual(deleters.map(rel), [], "deletion code now exists: update this test and the privacy page together");
});

t("the privacy page names every outside service the code actually calls, and does not name ones it does not", () => {
  const privacy = read(path.join(SRC, "app/privacy/page.tsx")).replace(/\s+/g, " ");
  const all = files.map(read).join("\n");
  const used: Record<string, boolean> = {
    Supabase: /@supabase\/supabase-js/.test(all),
    Stripe: /from "stripe"|stripe\.checkout/.test(all) || /stripe/i.test(all),
    Anthropic: /@anthropic-ai\/sdk/.test(all),
  };
  for (const [name, isUsed] of Object.entries(used)) {
    assert.ok(isUsed, `${name} is not used by the code any more`);
    assert.ok(privacy.includes(name), `the privacy page does not name ${name}`);
  }
  // sign-in emails go through Supabase to Resend (configured in the Supabase dashboard), Vercel hosts the site
  assert.ok(privacy.includes("Resend") && privacy.includes("Vercel"));
  assert.ok(!/googletagmanager|gtag\(|plausible\.io|posthog|@vercel\/analytics|@vercel\/speed-insights|mixpanel|hotjar|segment\.com|fbq\(/i.test(all), "analytics or tracking code found; the cookie statement would be wrong");
  const pkg = read(path.join(SRC, "../package.json"));
  assert.ok(!/@vercel\/analytics|@vercel\/speed-insights|posthog|mixpanel|hotjar/i.test(pkg), "an analytics package is installed");
});

t("the privacy page does not promise contractual assurances, certifications or deletion timelines it cannot prove", () => {
  const privacy = read(path.join(SRC, "app/privacy/page.tsx")).replace(/\s+/g, " ");
  assert.ok(!/contractually|soc ?2|iso ?27001|gdpr compliant|hipaa|encrypted at rest|within \d+ (days|hours)|guarantee/i.test(privacy));
});

t("logs never print values extracted from a customer's documents (only whether a field was found)", () => {
  const bad = files.filter((f) => /\?\? "NULL"|JSON\.stringify\((aiLease|aiRecon)\)|excludedTerms\.join/.test(read(f)));
  assert.deepEqual(bad.map(rel), [], "a log line prints extracted lease values again");
});

console.log(`privacy-guards: ${n} passed, 0 failed`);
