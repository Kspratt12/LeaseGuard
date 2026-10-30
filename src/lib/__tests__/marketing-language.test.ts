/**
 * Customer-facing pages must describe findings as potential discrepancies, never as confirmed violations or overcharges,
 * and must not make unsupported frequency claims. Static scan of every page and component.
 * Run: npx tsx src/lib/__tests__/marketing-language.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(__dirname, "../..");
const walk = (d: string, out: string[] = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) {
      if (!["__tests__", "api", "admin"].includes(e.name)) walk(f, out);
    } else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(f);
  }
  return out;
};
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ").replace(/\s+/g, " ");

const BANNED: Array<[RegExp, string]> = [
  [/\b(cap|CAM cap|excluded[- ]expense) violations?\b/i, "a finding described as a violation"],
  [/\bviolat(?:e|es|ed|ing|ion|ions)\b/i, "violation language"],
  [/\b(?:to|and) (?:identify|catch|detect|uncover) (?!potential |possible )(?:\w+ )?overcharges\b/i, "claims to identify or catch overcharges"],
  [/\bmore common than (?:most )?(?:tenants|people)\b/i, "an unsupported frequency claim"],
  [/\b(?:frequently|most often|usually) missed\b/i, "an unsupported frequency claim"],
  [/\bsurprisingly common\b/i, "an unsupported frequency claim"],
  [/\byou(?:'re| are| were) (?:being )?overcharged\b/i, "telling the customer they were overcharged"],
  [/\bproves? (?:an |that )?(?:overcharge|violation|you)/i, "claims proof"],
  [/\bguarantee[ds]? (?:a )?(?:refund|recovery|savings|credit)/i, "guarantees recovery"],
];

let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n++;
  console.log("  ✓", name);
}

t("no page or component calls a finding a violation, claims to catch overcharges, or makes an unsupported frequency claim", () => {
  const hits: string[] = [];
  for (const f of walk(SRC)) {
    const text = strip(fs.readFileSync(f, "utf8"));
    for (const [re, why] of BANNED) {
      const m = text.match(re);
      if (!m) continue;
      const around = text.slice(Math.max(0, m.index! - 40), m.index! + m[0].length + 20);
      // "code violations" (a fine the landlord paid) and "does not guarantee" are about something else
      if (/code violations/i.test(around) || /not guarantee|never guarantee|is never guaranteed|cannot guarantee|no guarantee/i.test(around)) continue;
      hits.push(`${path.relative(SRC, f).replace(/\\/g, "/")}: ${why}: "...${around}..."`);
    }
  }
  assert.deepEqual(hits, []);
});

t("the pages named in the review say 'potential CAM cap discrepancies'", () => {
  for (const p of ["app/cam-audit/page.tsx", "app/commercial-tenant-cam-audit-guide/page.tsx", "app/about/page.tsx"]) {
    const text = strip(fs.readFileSync(path.join(SRC, p), "utf8"));
    assert.match(text, /potential CAM cap discrepancies/i, p);
  }
});

console.log(`marketing-language: ${n} passed, 0 failed`);
