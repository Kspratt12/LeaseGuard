/**
 * Static integrity checks for the public site (no server needed).
 * Run: npx tsx src/lib/__tests__/seo-integrity.test.ts
 *
 * Verifies source-level properties only. It does NOT prove anything about Google indexing.
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

const APP = path.join(__dirname, "../../app");
const read = (f: string) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");

// ---- discover pages ----
const pageFiles: string[] = [];
(function walk(d: string) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (e.name === "page.tsx") pageFiles.push(f);
  }
})(APP);

const routeOf = (f: string) => "/" + path.relative(APP, f).replace(/\\/g, "/").replace(/\/?page\.tsx$/, "");
const PRIVATE = /^\/(audit|account|admin|login|forgot-password|reset-password|api)(\/|$)/;
const allRoutes = new Set(pageFiles.map(routeOf));
const publicPages = pageFiles.filter((f) => !PRIVATE.test(routeOf(f)));
const src = new Map(publicPages.map((f) => [routeOf(f), read(f)]));

// sitemap paths (parsed from source so the test needs no build)
const sitemapSrc = read(path.join(APP, "sitemap.ts"));
const sitemapPaths = [...sitemapSrc.matchAll(/path:\s*"([^"]*)"/g)].map((m) => "/" + m[1].replace(/^\//, "")).map((p) => (p === "/" ? "/" : p.replace(/\/$/, "")));

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

test("every sitemap URL maps to a real page, with no fragments or duplicates", () => {
  assert.ok(sitemapPaths.length > 20);
  assert.strictEqual(new Set(sitemapPaths).size, sitemapPaths.length, "duplicate sitemap entries");
  for (const p of sitemapPaths) {
    assert.ok(!p.includes("#"), `fragment in sitemap: ${p}`);
    assert.ok(allRoutes.has(p === "" ? "/" : p), `sitemap path has no page: ${p}`);
    assert.ok(!PRIVATE.test(p), `private route in sitemap: ${p}`);
  }
});

test("new resources and the calculator are in the sitemap", () => {
  for (const p of ["/cam-calculator", "/resources/how-to-calculate-cam-charges", "/resources/management-fees-and-cam-caps"]) {
    assert.ok(sitemapPaths.includes(p), p);
  }
});

test("every public page declares a canonical URL", () => {
  for (const [route, s] of src) assert.ok(/alternates:\s*\{\s*canonical:/.test(s), `no canonical: ${route}`);
});

test("canonicals point to real pages; only the known duplicate points elsewhere", () => {
  for (const [route, s] of src) {
    const c = /canonical:\s*"([^"]+)"/.exec(s)?.[1];
    assert.ok(c && allRoutes.has(c), `${route} canonical target missing: ${c}`);
    if (c !== route) assert.strictEqual(route, "/resources/nnn-lease-hidden-costs", `unexpected cross-canonical: ${route} -> ${c}`);
  }
});

test("a page whose canonical is elsewhere is not in the sitemap", () => {
  assert.ok(!sitemapPaths.includes("/resources/nnn-lease-hidden-costs"));
});

test("page titles are unique", () => {
  const seen = new Map<string, string>();
  for (const [route, s] of src) {
    const t = /title:\s*"([^"]+)"/.exec(s)?.[1];
    if (!t) continue; // home inherits the root layout title
    assert.ok(!seen.has(t), `duplicate title "${t}": ${seen.get(t)} and ${route}`);
    seen.set(t, route);
  }
});

test("page H1s are unique where a page sets its own", () => {
  const seen = new Map<string, string>();
  for (const [route, s] of src) {
    const h = /<h1[^>]*>\s*([^<{]+?)\s*<\/h1>/.exec(s)?.[1].replace(/\s+/g, " ");
    if (!h) continue;
    assert.ok(!seen.has(h), `duplicate H1 "${h}": ${seen.get(h)} and ${route}`);
    seen.set(h, route);
  }
});

test("every internal link points to an existing page", () => {
  const srcRoot = path.join(APP, "..");
  const files: string[] = [];
  (function walk(d: string) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "__tests__") walk(f); }
      else if (/\.tsx?$/.test(e.name)) files.push(f);
    }
  })(srcRoot);
  const bad: string[] = [];
  for (const f of files) {
    for (const m of read(f).matchAll(/href=\{?["'`](\/[^"'`#?{$]*)/g)) {
      const target = m[1].replace(/\/$/, "") || "/";
      if (target.startsWith("/api") || target.startsWith("/_next") || /\.(png|jpg|svg|ico|xml|txt)$/.test(target)) continue;
      if (/\/audit\/$/.test(m[1])) continue; // dynamic /audit/<id> built in code
      if (!allRoutes.has(target) && !/^\/audit\//.test(target)) bad.push(`${path.relative(srcRoot, f)} -> ${target}`);
    }
  }
  assert.deepStrictEqual(bad, []);
});

test("no sitemap page is an orphan: each has at least 2 internal inbound links", () => {
  const inbound = new Map<string, Set<string>>();
  const add = (to: string, from: string) => { if (to !== from) (inbound.get(to) ?? inbound.set(to, new Set()).get(to)!).add(from); };
  const shared = ["/"]; // navbar/footer/article layout apply site-wide: counted via the layout files below
  const commonFiles = ["../components/footer.tsx", "../components/ArticleLayout.tsx", "../components/navbar.tsx"].map((f) => read(path.join(APP, f)));
  const articleToolLinks = [...commonFiles[1].matchAll(/href:\s*"(\/[^"]+)"/g)].map((m) => m[1]);
  const footerLinks = [...commonFiles[0].matchAll(/href="(\/[^"#]+)"/g)].map((m) => m[1]);
  const navLinks = [...commonFiles[2].matchAll(/href="(\/[^"#]+)"/g)].map((m) => m[1]);
  for (const [route, s] of src) {
    for (const m of s.matchAll(/href=\{?["'`](\/[^"'`#?{$]*)/g)) add(m[1].replace(/\/$/, "") || "/", route);
    if (route.startsWith("/resources/")) for (const l of articleToolLinks) add(l, route); // ArticleLayout "Tools" block
    for (const l of [...footerLinks, ...navLinks]) add(l, route + "#site-chrome");
  }
  // resources index lists each article by slug
  const idx = src.get("/resources") ?? "";
  for (const m of idx.matchAll(/slug:\s*"([^"]+)"/g)) add(`/resources/${m[1]}`, "/resources");
  for (const m of idx.matchAll(/href:\s*"(\/[^"]+)"/g)) add(m[1], "/resources");
  const weak = sitemapPaths.filter((p) => !["/", "/contact", "/terms", "/privacy", "/about"].includes(p) && (inbound.get(p)?.size ?? 0) < 2);
  assert.deepStrictEqual(weak, []);
});

test("no unsupported statistical or guarantee claims on public pages", () => {
  const forbidden: [RegExp, string][] = [
    [/studies (consistently )?(show|find|suggest)/i, "uncited studies"],
    [/industry studies/i, "uncited studies"],
    [/most (commercial )?tenants never/i, "unsupported statistic"],
    [/majority of tenants never/i, "unsupported statistic"],
    [/almost always (favor|result)/i, "unsupported statistic"],
    [/errors that favor the landlord/i, "one-sided claim"],
    [/\b100% (accurate|guaranteed)/i, "absolute claim"],
    [/guarantee[sd]? (savings|recovery|results)/i, "guarantee"],
    [/typically 30-120 days/i, "unsupported deadline"],
    [/estimated recoverable/i, "recoverable language"],
  ];
  for (const [route, s] of src) {
    const text = s.replace(/\s+/g, " ");
    for (const [re, why] of forbidden) assert.ok(!re.test(text), `${route}: ${why} (${re})`);
  }
});

test("pricing is consistent: any page quoting $49 also gives the $149 multi-year price", () => {
  for (const [route, s] of src) {
    if (/\$49\b/.test(s) && route !== "/sample-cam-audit-report") assert.ok(/\$149\b/.test(s), `${route} mentions $49 without $149`);
  }
  const layout = read(path.join(APP, "../components/ArticleLayout.tsx"));
  assert.ok(/\$49/.test(layout) && /\$149/.test(layout));
});

test("fictional examples are labelled where invented numbers appear", () => {
  for (const r of ["/resources/how-to-calculate-cam-charges", "/resources/management-fees-and-cam-caps", "/sample-cam-audit-report"]) {
    assert.ok(/fictional/i.test(src.get(r) ?? ""), `${r} should label its example as fictional`);
  }
});

test("new content makes no legal citations and no invented expertise", () => {
  for (const r of ["/cam-calculator", "/resources/how-to-calculate-cam-charges", "/resources/management-fees-and-cam-caps"]) {
    const s = src.get(r) ?? "";
    assert.ok(!/U\.S\.C|§|\bv\.\s[A-Z]|reviewed by|attorney-reviewed|our (attorneys|experts|lawyers)/i.test(s), r);
  }
});

test("structured data pricing matches the product and is not injected site-wide", () => {
  const layout = read(path.join(APP, "layout.tsx"));
  assert.ok(!/SoftwareApplication/.test(layout), "SoftwareApplication must not be injected on every page");
  const home = src.get("/") ?? "";
  assert.ok(/SoftwareApplication/.test(home) && /price: "49"/.test(home) && /price: "149"/.test(home));
});

test("private routes are disallowed in robots and carry noindex", () => {
  const robots = read(path.join(APP, "robots.ts"));
  for (const p of ["/api/", "/audit/", "/account", "/admin", "/login", "/forgot-password", "/reset-password"]) assert.ok(robots.includes(`"${p}"`), `robots missing ${p}`);
  for (const f of ["login/layout.tsx", "account/layout.tsx", "admin/layout.tsx", "forgot-password/layout.tsx", "reset-password/layout.tsx"]) assert.ok(/index:\s*false/.test(read(path.join(APP, f))), `${f} lacks noindex`);
});

console.log(`\nseo-integrity: ${passed} passed, 0 failed`);
