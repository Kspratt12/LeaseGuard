/**
 * Audit-right and dispute-window clauses: find them in the lease text, quote them, and do date arithmetic ONLY on a
 * period the clause states and a start date the tenant enters.
 *
 * Rules (each enforced by src/lib/__tests__/audit-rights.test.ts):
 *  - Only a sentence that talks about auditing/inspecting records, or disputing/objecting to a statement, is used.
 *  - The quote is the lease's own sentence, with its page when the text has page breaks.
 *  - A period is read only when the sentence states it ("within 120 days", "ninety (90) days", "six (6) months").
 *    Business days are recognised and NOT converted to a date (holidays and weekends depend on the lease and location).
 *  - A date is produced only from a start date the tenant enters. The software never decides when "receipt" happened,
 *    whether notice requirements were met, or whether the window is enforceable. No countdowns, no urgency wording.
 * Pure: no I/O.
 */

export type PeriodUnit = "days" | "business days" | "months" | "years";

export interface AuditRightsClause {
  kind: "audit" | "dispute";
  /** The lease sentence, whitespace-normalised, at most 600 characters. */
  quote: string;
  page: number | null;
  /** Null when the sentence states no time limit the software can read. */
  period: { count: number; unit: PeriodUnit } | null;
  /** What starts the period, as the lease words it ("receiving the annual reconciliation statement"). */
  trigger: string | null;
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fifteen: 15, eighteen: 18, twenty: 20, "twenty-four": 24, thirty: 30, "forty-five": 45, sixty: 60, ninety: 90,
  "one hundred twenty": 120, "one hundred and twenty": 120, "one hundred fifty": 150, "one hundred eighty": 180,
  "one hundred and eighty": 180, "two hundred seventy": 270, "three hundred sixty-five": 365,
};

const AUDIT_WORDS = /\b(audit|inspect|examin|review)\w*\b/i;
const RECORD_WORDS = /\b(books|records|accounts|invoices|statement|reconciliation)\b/i;
const DISPUTE_WORDS = /\b(disput|object|contest|challeng)\w*\b/i;
const STATEMENT_WORDS = /\b(statement|reconciliation|charges?|operating expenses|additional rent)\b/i;

const UNIT = /\b(business\s+days|calendar\s+days|days|months|years)\b/gi;

/** The first "N unit" in the sentence: "(120) days", "120 days", "ninety days", "one hundred twenty (120) days". */
function parsePeriod(sentence: string): { count: number; unit: PeriodUnit } | null {
  for (const m of sentence.matchAll(UNIT)) {
    const unitRaw = m[1].toLowerCase().replace(/\s+/g, " ");
    const unit: PeriodUnit = unitRaw === "business days" ? "business days" : unitRaw.endsWith("days") ? "days" : (unitRaw as PeriodUnit);
    const before = sentence.slice(Math.max(0, m.index! - 50), m.index!).toLowerCase();
    let count: number | null = null;
    const digits = /\(?\s*(\d{1,4})\s*\)?\s*$/.exec(before);
    if (digits) count = Number(digits[1]);
    else {
      // longest number phrase ending right before the unit, e.g. "within one hundred twenty" -> 120
      const parts = before.replace(/[^a-z\s-]/g, " ").trim().split(/\s+/);
      for (let i = Math.max(0, parts.length - 5); i < parts.length && count == null; i++) {
        const tail = parts.slice(i).join(" ");
        if (WORD_NUMBERS[tail] != null) count = WORD_NUMBERS[tail];
      }
    }
    if (count != null && count > 0 && count <= 3650) return { count, unit };
  }
  return null;
}

function parseTrigger(sentence: string): string | null {
  const m = /\b(?:days|months|years)\s+(?:after|following|of|from)\s+(?:the\s+)?(?:date\s+of\s+)?([^.;:]{4,140})/i.exec(sentence);
  if (!m) return null;
  return m[1].replace(/\s+/g, " ").replace(/[,\s]+$/, "").trim();
}

function pageOf(fullText: string, needle: string): number | null {
  const pages = fullText.split("\f");
  if (pages.length <= 1) return null;
  const n = needle.slice(0, 60).toLowerCase();
  const i = pages.findIndex((p) => p.replace(/\s+/g, " ").toLowerCase().includes(n));
  return i >= 0 ? i + 1 : null;
}

/** Sentences, keeping section numbers such as "3.5" intact. */
function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.;])\s+(?=[A-Z(])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25);
}

/** Up to three clauses (audit first, then dispute), each a sentence of the lease. */
export function extractAuditRights(leaseText: string | null | undefined): AuditRightsClause[] {
  if (!leaseText) return [];
  const out: AuditRightsClause[] = [];
  for (const s of sentences(leaseText)) {
    const isAudit = AUDIT_WORDS.test(s) && RECORD_WORDS.test(s) && /\btenant\b/i.test(s);
    const isDispute = !isAudit && DISPUTE_WORDS.test(s) && STATEMENT_WORDS.test(s);
    if (!isAudit && !isDispute) continue;
    const quote = s.length > 600 ? s.slice(0, 597) + "..." : s;
    if (out.some((c) => c.quote === quote)) continue;
    out.push({ kind: isAudit ? "audit" : "dispute", quote, page: pageOf(leaseText, s), period: parsePeriod(s), trigger: parseTrigger(s) });
    if (out.length >= 3) break;
  }
  return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "audit" ? -1 : 1));
}

/** Validates stored JSON (anything malformed is "no clause", never a claim). */
export function parseAuditRights(v: unknown): AuditRightsClause[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((c): AuditRightsClause[] => {
    if (!c || typeof c !== "object") return [];
    const o = c as Record<string, unknown>;
    if ((o.kind !== "audit" && o.kind !== "dispute") || typeof o.quote !== "string" || !o.quote.trim()) return [];
    const p = o.period as Record<string, unknown> | null | undefined;
    const period =
      p && typeof p.count === "number" && Number.isInteger(p.count) && p.count > 0 && ["days", "business days", "months", "years"].includes(p.unit as string)
        ? { count: p.count, unit: p.unit as PeriodUnit }
        : null;
    return [{ kind: o.kind, quote: o.quote, page: typeof o.page === "number" ? o.page : null, period, trigger: typeof o.trigger === "string" ? o.trigger : null }];
  });
}

export type WindowDate = { ok: true; date: string; formula: string } | { ok: false; reason: string };

/**
 * The date that falls `period` after `startIso` (YYYY-MM-DD), by calendar arithmetic. Months and years keep the day of the
 * month, clamped to the month's last day (Jan 31 + 1 month = Feb 28/29). Business days are refused.
 */
export function windowEndDate(startIso: string, period: { count: number; unit: PeriodUnit } | null): WindowDate {
  if (!period) return { ok: false, reason: "The clause quoted does not state a period the calculator can read." };
  if (period.unit === "business days") {
    return { ok: false, reason: "The clause counts business days. Which days count depends on the lease and the location, so no date is calculated." };
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startIso);
  if (!m) return { ok: false, reason: "Enter the date as YYYY-MM-DD." };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const start = new Date(Date.UTC(y, mo - 1, d));
  if (start.getUTCFullYear() !== y || start.getUTCMonth() !== mo - 1 || start.getUTCDate() !== d) return { ok: false, reason: "That is not a valid date." };
  let end: Date;
  if (period.unit === "days") {
    end = new Date(start.getTime() + period.count * 86_400_000);
  } else {
    const months = period.unit === "years" ? period.count * 12 : period.count;
    const target = new Date(Date.UTC(y, mo - 1 + months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    end = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, lastDay)));
  }
  const iso = end.toISOString().slice(0, 10);
  return { ok: true, date: iso, formula: `${startIso} + ${period.count} ${period.unit} = ${iso}` };
}

/** Shown next to every calculated date, in the same words. */
export const WINDOW_CAUTION =
  "This is date arithmetic on the clause as quoted and the date you entered. It is not a determination of your legal deadline: " +
  "how the lease defines receipt or delivery, any notice requirements, amendments, and applicable law can change it. If the date matters, confirm it with the full lease or a qualified professional.";
