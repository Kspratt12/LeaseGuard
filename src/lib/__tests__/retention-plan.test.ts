/** Retention classifier and its dry-run script. Run: npx tsx src/lib/__tests__/retention-plan.test.ts */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { classifyRetention, PROPOSED_POLICY, type AuditRef, type StoredFile } from "../retention-plan";

let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n++;
  console.log("  ✓", name);
}

const NOW = new Date("2026-11-20T12:00:00Z");
const id = (c: string) => `${c.repeat(8)}-0000-4000-8000-000000000000`;
const A_DONE = id("a"), A_DONE_PAID = id("b"), A_ERR_OLD = id("c"), A_ERR_NEW = id("d"), A_STUCK = id("e"), A_PENDING_NEW = id("f"), ORPHAN = id("9");
const audits: AuditRef[] = [
  { id: A_DONE, status: "completed", created_at: "2026-11-19T00:00:00Z" },
  { id: A_DONE_PAID, status: "completed", created_at: "2026-11-01T00:00:00Z" },
  { id: A_ERR_OLD, status: "error", created_at: "2026-11-01T00:00:00Z" },
  { id: A_ERR_NEW, status: "error", created_at: "2026-11-19T00:00:00Z" },
  { id: A_STUCK, status: "processing", created_at: "2026-11-18T00:00:00Z" },
  { id: A_PENDING_NEW, status: "pending", created_at: "2026-11-20T11:30:00Z" },
];
const f = (folder: string, name: string, size = 1000): StoredFile => ({ folder, name, size, createdAt: null });
const files: StoredFile[] = [
  f(A_DONE, "lease.pdf"), f(A_DONE, "recon.pdf"), f(A_DONE, "report.pdf"),
  f(A_DONE_PAID, "lease.pdf"), f(A_DONE_PAID, "recon.pdf"), f(A_DONE_PAID, "report.pdf"),
  f(A_ERR_OLD, "lease.pdf"), f(A_ERR_OLD, "recon.pdf"),
  f(A_ERR_NEW, "lease.pdf"), f(A_ERR_NEW, "recon.pdf"),
  f(A_STUCK, "lease.pdf"), f(A_STUCK, "recon.pdf"),
  f(A_PENDING_NEW, "lease.pdf"), f(A_PENDING_NEW, "recon.pdf"),
  f(ORPHAN, "lease.pdf"), f(ORPHAN, "recon.pdf"),
  f("not-a-uuid", "something.txt"),
];
const paid = new Set([A_DONE_PAID]);
const r = classifyRetention({ audits, files, paidAuditIds: paid, now: NOW });
const cat = (c: string) => r.candidates.filter((x) => x.category === c);

t("completed audits: only the lease and statement are source-file candidates; the stored report copy is flagged separately", () => {
  assert.equal(cat("source-after-success").length, 4); // two audits x two files
  assert.deepEqual(new Set(cat("source-after-success").map((c) => c.name)), new Set(["lease.pdf", "recon.pdf"]));
  assert.equal(cat("stored-report-copy").length, 2);
});

t("failed audits: files are candidates only after the proposed number of days", () => {
  assert.deepEqual(cat("failed-audit").map((c) => c.folderShort), ["cccccccc", "cccccccc"]);
  assert.ok(!r.candidates.some((c) => c.folderShort === "dddddddd"), "a recent failure must be kept (support may need it)");
});

t("pending or processing audits are candidates only once clearly abandoned", () => {
  assert.deepEqual(new Set(cat("abandoned-audit").map((c) => c.folderShort)), new Set(["eeeeeeee"]));
  assert.ok(!r.candidates.some((c) => c.folderShort === "ffffffff"), "an upload in progress must never be nominated");
});

t("orphans: folders with no audit row, and files with names this system never writes, are surfaced for review", () => {
  assert.equal(cat("orphan").length, 2);
  assert.equal(cat("unknown-name").length, 1);
});

t("paid audits are marked, so the owner can see how many support-relevant audits a policy would touch", () => {
  assert.equal(r.byCategory["source-after-success"].paidAudits, 1);
  assert.ok(cat("source-after-success").filter((c) => c.paid).length === 2);
});

t("counts add up: every file is either a candidate or kept", () => {
  assert.equal(r.candidates.length + r.keptFiles, files.length);
  assert.equal(r.totals.files, files.length);
});

t("switching the success rule off removes those nominations", () => {
  const off = classifyRetention({ audits, files, paidAuditIds: paid, now: NOW, policy: { ...PROPOSED_POLICY, sourceFilesAfterSuccess: false } });
  assert.equal(off.candidates.filter((x) => x.category === "source-after-success").length, 0);
});

t("the report never names payments, rows or findings as candidates and carries no customer file names", () => {
  const text = JSON.stringify(r);
  assert.ok(/Never nominated: payments, webhook events, audit rows, findings, accounts/.test(r.protectedRecords));
  assert.ok(!/something\.txt/.test(text), "an unknown customer-supplied name must not be echoed");
});

t("the classifier and the dry-run script contain no way to delete or change anything", () => {
  for (const file of ["../retention-plan.ts", "../../../scripts/retention-dry-run.ts"]) {
    const s = fs.readFileSync(path.join(__dirname, file), "utf8");
    const code = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.ok(!/\.(remove|delete|update|insert|upsert|move|copy)\(|\.rpc\(|createSignedUrl|\.upload\(/.test(code), `${file}: contains a write or delete call`);
  }
});

t("the dry-run script refuses to run without --expect-ref matching the environment", () => {
  const s = fs.readFileSync(path.join(__dirname, "../../../scripts/retention-dry-run.ts"), "utf8");
  assert.ok(/--expect-ref/.test(s) && /Refusing to run/.test(s) && /url\.includes\(`\/\/\$\{expectRef\}\.`\)/.test(s));
});

console.log(`retention-plan: ${n} passed, 0 failed`);
