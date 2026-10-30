/**
 * Retention classifier: decides which STORED FILES would be candidates for deletion under a proposed policy.
 * Pure and read-only by design: it takes rows and a file listing and returns a report. It has no database access and
 * no way to delete anything. The deletion step does not exist yet; it needs the owner's approval and a staging test.
 *
 * Deliberately out of scope here, whatever the policy: payments, stripe_events, audit rows and findings. Payment
 * verification and customer support depend on them, so nothing in this module can nominate them.
 */

export interface AuditRef {
  id: string;
  status: string;
  created_at: string;
}

export interface StoredFile {
  /** folder name, which is the audit id */
  folder: string;
  /** object name inside the folder, for example lease.pdf */
  name: string;
  size: number | null;
  createdAt: string | null;
}

export interface Policy {
  /** error audits: files older than this are candidates */
  failedAfterDays: number;
  /** pending or processing audits older than this are treated as abandoned */
  stuckAfterHours: number;
  /** completed audits: source files (lease, statement) are candidates once processing succeeded */
  sourceFilesAfterSuccess: boolean;
}

/** Defaults are operational proposals for the dry run, NOT a legal retention policy. */
export const PROPOSED_POLICY: Policy = { failedAfterDays: 7, stuckAfterHours: 24, sourceFilesAfterSuccess: true };

export type Category = "source-after-success" | "failed-audit" | "abandoned-audit" | "orphan" | "stored-report-copy" | "unknown-name";

export interface Candidate {
  category: Category;
  folderShort: string;
  name: string;
  size: number | null;
  /** the owner has a paid payment on this audit: payment records are untouched either way */
  paid: boolean;
  reason: string;
}

export interface RetentionReport {
  candidates: Candidate[];
  byCategory: Record<Category, { files: number; bytes: number; paidAudits: number }>;
  /** files that are NOT candidates, counted so the totals add up */
  keptFiles: number;
  totals: { folders: number; files: number; audits: number };
  protectedRecords: string;
}

const SOURCE_FILES = new Set(["lease.pdf", "recon.pdf"]);
const REPORT_FILE = "report.pdf";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES: Category[] = ["source-after-success", "failed-audit", "abandoned-audit", "orphan", "stored-report-copy", "unknown-name"];

export function classifyRetention(input: { audits: AuditRef[]; files: StoredFile[]; paidAuditIds: Set<string>; now?: Date; policy?: Policy }): RetentionReport {
  const now = input.now ?? new Date();
  const policy = input.policy ?? PROPOSED_POLICY;
  const byId = new Map(input.audits.map((a) => [a.id.toLowerCase(), a]));
  const ageMs = (iso: string | null | undefined) => (iso && !Number.isNaN(Date.parse(iso)) ? now.getTime() - Date.parse(iso) : null);
  const candidates: Candidate[] = [];
  let kept = 0;

  for (const f of input.files) {
    const id = f.folder.toLowerCase();
    const audit = UUID.test(f.folder) ? byId.get(id) : undefined;
    const paid = input.paidAuditIds.has(id);
    const base = { folderShort: f.folder.slice(0, 8), name: f.name, size: f.size, paid };
    const known = SOURCE_FILES.has(f.name) || f.name === REPORT_FILE;

    // A name this system never writes could be anything, so it is never echoed back (the owner reviews it in the bucket).
    if (!known) { candidates.push({ ...base, name: "(other)", category: "unknown-name", reason: "a file name this system never writes: review by hand" }); continue; }
    if (!audit) { candidates.push({ ...base, category: "orphan", reason: "no audit row refers to this folder (for example an upload whose database insert failed)" }); continue; }

    if (audit.status === "completed") {
      if (SOURCE_FILES.has(f.name) && policy.sourceFilesAfterSuccess) {
        candidates.push({ ...base, category: "source-after-success", reason: "processing succeeded; the app never reads this file again" });
      } else if (f.name === REPORT_FILE) {
        candidates.push({ ...base, category: "stored-report-copy", reason: "downloads are regenerated from the database; this stored copy is not served" });
      } else kept++;
      continue;
    }
    if (audit.status === "error") {
      const a = ageMs(audit.created_at);
      if (a != null && a > policy.failedAfterDays * 86_400_000) candidates.push({ ...base, category: "failed-audit", reason: `failed more than ${policy.failedAfterDays} days ago` });
      else kept++;
      continue;
    }
    // pending or processing
    const a = ageMs(audit.created_at);
    if (a != null && a > policy.stuckAfterHours * 3_600_000) candidates.push({ ...base, category: "abandoned-audit", reason: `still ${audit.status} after ${policy.stuckAfterHours} hours` });
    else kept++;
  }

  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, { files: 0, bytes: 0, paidAudits: 0 }])) as RetentionReport["byCategory"];
  const paidSeen = new Map<Category, Set<string>>();
  for (const c of candidates) {
    const b = byCategory[c.category];
    b.files += 1;
    b.bytes += c.size ?? 0;
    if (c.paid) {
      const set = paidSeen.get(c.category) ?? new Set<string>();
      set.add(c.folderShort);
      paidSeen.set(c.category, set);
    }
  }
  for (const [cat, set] of paidSeen) byCategory[cat].paidAudits = set.size;

  return {
    candidates,
    byCategory,
    keptFiles: kept,
    totals: { folders: new Set(input.files.map((f) => f.folder)).size, files: input.files.length, audits: input.audits.length },
    protectedRecords: "Never nominated: payments, webhook events, audit rows, findings, accounts.",
  };
}
