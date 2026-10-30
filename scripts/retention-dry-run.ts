/**
 * Retention DRY RUN. Read-only: it lists what a proposed policy WOULD nominate for deletion and changes nothing.
 * There is deliberately no delete option in this file. A deletion step will be added only after the owner approves
 * the behavior, and it must be tested on staging with synthetic data first.
 *
 *   npx tsx --env-file=<env file> scripts/retention-dry-run.ts --expect-ref <project ref> [--failed-days 7] [--stuck-hours 24] [--no-source-after-success]
 *
 * --expect-ref is required and must match the project in the environment, so the report can never come from the wrong
 * project by accident. Output contains counts, sizes and the first 8 characters of audit ids only: never file names
 * from customers, document text, emails or keys.
 */
import { createClient } from "@supabase/supabase-js";
import { classifyRetention, PROPOSED_POLICY, type Policy, type StoredFile } from "../src/lib/retention-plan";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const expectRef = arg("--expect-ref");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!expectRef || !url.includes(`//${expectRef}.`) || !service) {
  console.error("Refusing to run: pass --expect-ref <project ref> and make sure the environment points at exactly that project.");
  process.exit(1);
}

const policy: Policy = {
  failedAfterDays: Number(arg("--failed-days") ?? PROPOSED_POLICY.failedAfterDays),
  stuckAfterHours: Number(arg("--stuck-hours") ?? PROPOSED_POLICY.stuckAfterHours),
  sourceFilesAfterSuccess: !process.argv.includes("--no-source-after-success"),
};
const db = createClient(url, service, { auth: { persistSession: false } });
const BUCKET = "invoices";

async function listFiles(): Promise<StoredFile[]> {
  const files: StoredFile[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data: top, error } = await db.storage.from(BUCKET).list("", { limit: 100, offset });
    if (error) throw new Error("could not list the bucket");
    if (!top || top.length === 0) break;
    for (const entry of top) {
      const isFolder = entry.id === null || entry.metadata === null;
      if (!isFolder) {
        files.push({ folder: "", name: entry.name, size: (entry.metadata as { size?: number } | null)?.size ?? null, createdAt: entry.created_at ?? null });
        continue;
      }
      const { data: inner } = await db.storage.from(BUCKET).list(entry.name, { limit: 100 });
      for (const f of inner ?? []) files.push({ folder: entry.name, name: f.name, size: (f.metadata as { size?: number } | null)?.size ?? null, createdAt: f.created_at ?? null });
      if (!inner || inner.length === 0) files.push({ folder: entry.name, name: "(empty folder)", size: 0, createdAt: null });
    }
    if (top.length < 100) break;
  }
  return files;
}

(async () => {
  const [{ data: audits, error: ae }, { data: pays, error: pe }, files] = await Promise.all([
    db.from("audits").select("id,status,created_at").limit(20000),
    db.from("payments").select("audit_id,status").eq("status", "paid").limit(20000),
    listFiles(),
  ]);
  if (ae || pe) throw new Error("could not read the audit or payment tables");

  const report = classifyRetention({ audits: audits ?? [], files, paidAuditIds: new Set((pays ?? []).map((p) => String(p.audit_id).toLowerCase())), policy });

  console.log(`Project: ${expectRef}   (read-only; nothing is changed)`);
  console.log(`Policy used (a PROPOSAL, not a legal retention period): ${JSON.stringify(policy)}`);
  console.log(`Inventory: ${report.totals.audits} audit rows, ${report.totals.folders} storage folders, ${report.totals.files} files\n`);
  const mb = (n: number) => (n / 1048576).toFixed(2) + " MB";
  for (const [cat, v] of Object.entries(report.byCategory)) console.log(`${cat.padEnd(22)} files: ${String(v.files).padStart(5)}   size: ${mb(v.bytes).padStart(10)}   audits with a paid payment: ${v.paidAudits}`);
  console.log(`${"kept".padEnd(22)} files: ${String(report.keptFiles).padStart(5)}`);
  console.log(`\n${report.protectedRecords}`);
  const sample = report.candidates.slice(0, 20);
  if (sample.length) {
    console.log("\nFirst candidates (audit id prefix, file type, category):");
    for (const c of sample) console.log(`  ${c.folderShort || "(root)"}  ${/^(lease|recon|report)\.pdf$/.test(c.name) ? c.name : "(other)"}  ${c.category}${c.paid ? "  [paid audit]" : ""}`);
  }
  console.log("\nNo files were changed.");
})().catch((e) => {
  console.error("aborted:", e instanceof Error ? e.message : "unknown error");
  process.exit(1);
});
