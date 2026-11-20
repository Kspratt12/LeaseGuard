/**
 * Customer corrections of extracted NUMBERS, applied at read time. Pure: no I/O.
 *
 * What it does and does not do:
 *  - Extracted values are never changed. A correction is stored separately (audits.input_overrides) with the value the
 *    documents gave and the time it was entered, and is applied on every read, so the screen, report, letter and document
 *    request are always built from the same corrected view. Removing a correction restores the original result exactly.
 *  - Only checks whose inputs were stored as numbers (`calc` on a finding, and the excluded-expense rows) are recomputed,
 *    with the same formulas the engine uses. No AI step runs and nothing is re-read from the documents.
 *  - Checks that depend on reading the lease (exclusion matching, cap and gross-up observations, missing-term notices) are
 *    NOT reassessed, and the result lists them by name. Correcting a number never re-interprets the lease.
 *  - Audits stored before `calc` existed only offer the excluded-expense rows (their figures were always stored).
 */
import type { AdminFeeCalc, Finding, OverchargeLineItem } from "@/services/audit-logic";
import { computeAdminFeeTenantOvercharge, computeFeeOverBaseTenantOvercharge, totalSavings } from "@/services/savings-math";
import { shareFinding, shareMismatchThreshold, type ShareCalc } from "@/services/share-math";
import { findingKind } from "@/services/finding-classification";

export type InputUnit = "percent" | "usd";

export interface CorrectableInput {
  key: string;
  label: string;
  unit: InputUnit;
  /** The value the documents gave (null when the reading found none). */
  extracted: number | null;
  /** The value in use: the correction when there is one, otherwise the extracted value. */
  current: number | null;
  corrected: boolean;
  /** Which result the value feeds. */
  appliesTo: string;
}

export interface StoredOverride {
  value: number;
  original: number | null;
  at: string;
}
export interface InputOverrides {
  version: 1;
  values: Record<string, StoredOverride>;
}

export interface InputCorrectionsRecord {
  applied: Array<{ key: string; label: string; unit: InputUnit; value: number; original: number | null }>;
  /** Findings that were not reassessed because they depend on reading the lease, not on a corrected number. */
  notReassessed: string[];
  at: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const pct = (n: number) => `${parseFloat(n.toFixed(4))}%`;
const usd = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
const fmt = (unit: InputUnit, n: number) => (unit === "percent" ? pct(n) : usd(n));

export const MAX_USD = 1_000_000_000;

/** Parse stored JSON. Anything malformed is "no corrections", never a value. */
export function parseOverrides(v: unknown): InputOverrides | null {
  if (!isObj(v) || v.version !== 1 || !isObj(v.values)) return null;
  const values: Record<string, StoredOverride> = {};
  for (const [k, o] of Object.entries(v.values)) {
    if (!/^[a-z]+(\.[A-Za-z0-9]+)+$/.test(k) || !isObj(o) || typeof o.value !== "number" || !Number.isFinite(o.value)) continue;
    values[k] = { value: o.value, original: typeof o.original === "number" ? o.original : null, at: typeof o.at === "string" ? o.at : "" };
  }
  return Object.keys(values).length ? { version: 1, values } : null;
}

const all = (row: Record<string, unknown>): Finding[] => [
  ...((Array.isArray(row.free_findings) ? row.free_findings : []) as Finding[]),
  ...((Array.isArray(row.paid_findings) ? row.paid_findings : []) as Finding[]),
];
const shareOf = (row: Record<string, unknown>) => all(row).find((f) => isObj(f) && (f.calc as ShareCalc | undefined)?.kind === "share");
const feeOf = (row: Record<string, unknown>) => all(row).find((f) => isObj(f) && (f.calc as AdminFeeCalc | undefined)?.kind === "admin-fee" && f.potential_savings >= 0);
const rowsOf = (row: Record<string, unknown>) =>
  (Array.isArray(row.overcharge_breakdown) ? row.overcharge_breakdown : []).filter(
    (r): r is OverchargeLineItem => isObj(r) && typeof r.total_expense === "number" && typeof r.tenant_share_percent === "number",
  );

/** Every number this audit's deterministic checks used, with the value in use. */
export function listCorrectableInputs(row: Record<string, unknown>, overrides: InputOverrides | null): CorrectableInput[] {
  const out: CorrectableInput[] = [];
  const add = (key: string, label: string, unit: InputUnit, extracted: number | null, appliesTo: string) => {
    const o = overrides?.values[key];
    out.push({ key, label, unit, extracted, current: o ? o.value : extracted, corrected: !!o, appliesTo });
  };
  const share = shareOf(row)?.calc as ShareCalc | undefined;
  if (share) {
    const t = "Pro-rata share check";
    add("share.billedShare", "Share applied on the statement", "percent", share.billedShare, t);
    add("share.expectedShare", "Your share under the lease", "percent", share.expectedShare, t);
    add("share.pool", "Total the statement applied the share to", "usd", share.pool, t);
    add("share.tenantCharge", "Your charge on the statement", "usd", share.tenantCharge, t);
  }
  const fee = feeOf(row)?.calc as AdminFeeCalc | undefined;
  if (fee) {
    const t = "Management/admin fee check";
    add("fee.feeAmountBuilding", "Management/admin fee on the statement", "usd", fee.feeAmountBuilding, t);
    if (fee.method === "stated-rate") add("fee.statedPercent", "Fee rate stated on the statement", "percent", fee.statedPercent, t);
    else add("fee.feeBase", "Total the fee is measured against", "usd", fee.feeBase, t);
    add("fee.capPercent", "Fee limit in your lease", "percent", fee.capPercent, t);
    add("fee.tenantSharePercent", "Your share applied to the fee", "percent", fee.tenantSharePercent, t);
  }
  const rows = rowsOf(row);
  if (rows.length) {
    add("excluded.sharePercent", "Your share applied to excluded expenses", "percent", rows[0].tenant_share_percent, "Excluded expense lines");
    rows.forEach((r, i) => add(`excluded.row${i}.amount`, `Statement amount for ${r.category}`, "usd", r.total_expense, "Excluded expense lines"));
  }
  return out;
}

/** Validates a requested change against the audit's correctable inputs. null value = remove the correction. */
export function validateCorrections(
  inputs: CorrectableInput[],
  changes: Record<string, unknown>,
): { ok: true; changes: Record<string, number | null> } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const byKey = new Map(inputs.map((i) => [i.key, i]));
  const clean: Record<string, number | null> = {};
  const entries = Object.entries(changes);
  if (entries.length === 0) errors.push("No change was sent.");
  if (entries.length > 50) errors.push("Too many changes at once.");
  for (const [k, v] of entries) {
    const inp = byKey.get(k);
    if (!inp) { errors.push(`"${k}" is not a value this audit uses.`); continue; }
    if (v === null) { clean[k] = null; continue; }
    if (typeof v !== "number" || !Number.isFinite(v)) { errors.push(`${inp.label}: enter a number.`); continue; }
    if (inp.unit === "percent" && !(v > 0 && v < 100)) { errors.push(`${inp.label}: enter a percentage above 0 and below 100.`); continue; }
    if (inp.unit === "usd" && !(v >= 0 && v <= MAX_USD)) { errors.push(`${inp.label}: enter an amount between $0 and $1,000,000,000.`); continue; }
    clean[k] = inp.unit === "usd" ? round2(v) : Math.round(v * 10000) / 10000;
  }
  return errors.length ? { ok: false, errors } : { ok: true, changes: clean };
}

/** Merge validated changes into the stored record. A value equal to the extracted one removes the correction. */
export function mergeOverrides(
  existing: InputOverrides | null,
  inputs: CorrectableInput[],
  changes: Record<string, number | null>,
  now: string,
): InputOverrides | null {
  const values: Record<string, StoredOverride> = { ...(existing?.values ?? {}) };
  for (const [k, v] of Object.entries(changes)) {
    const inp = inputs.find((i) => i.key === k)!;
    if (v === null || (inp.extracted != null && Math.abs(v - inp.extracted) < 1e-9)) delete values[k];
    else values[k] = { value: v, original: inp.extracted, at: now };
  }
  return Object.keys(values).length ? { version: 1, values } : null;
}

const NOTE_LABEL = "Recalculated with figures you corrected";

/**
 * The audit as displayed with corrections applied. Returns the SAME object when there are no corrections that apply.
 * Run AFTER legacy containment.
 */
export function applyInputOverrides<T extends Record<string, unknown>>(row: T, raw: unknown): T {
  const overrides = parseOverrides(raw);
  if (!overrides) return row;
  const inputs = listCorrectableInputs(row, overrides);
  const applied = inputs
    .filter((i) => i.corrected)
    .map((i) => ({ ...i, value: i.current as number, original: overrides.values[i.key].original }));
  if (applied.length === 0) return row;
  const v = (key: string) => inputs.find((i) => i.key === key)?.current ?? null;
  const touched = new Set<Finding>();

  const fix = (f: Finding): Finding => {
    if (!isObj(f)) return f;
    const calc = f.calc as ShareCalc | AdminFeeCalc | undefined;
    if (calc?.kind === "share" && applied.some((a) => a.key.startsWith("share."))) {
      const billed = v("share.billedShare")!;
      const expected = v("share.expectedShare")!;
      let pool = v("share.pool");
      let charge = v("share.tenantCharge");
      const poolOnly = pool != null && charge == null;
      if (poolOnly) charge = round2((pool! * billed) / 100);
      if (pool != null && pool <= 0) pool = null;
      const keys = applied.filter((a) => a.key.startsWith("share.")).map((a) => a.key);
      const corrected = applied.filter((a) => a.key.startsWith("share.")).map((a) => `${a.label.toLowerCase()} ${fmt(a.unit, a.value)} (the documents gave ${a.original == null ? "no value" : fmt(a.unit, a.original)})`);
      const sentence = `Corrected values used: ${corrected.join("; ")}.${poolOnly ? " Your charge is taken as that total x the billed share." : ""}`;
      touched.add(f);
      if (!(billed - expected > shareMismatchThreshold(calc.expectedBasis))) {
        return {
          ...f,
          category: "Pro-Rata Share Below Lease Share",
          calc: { ...calc, billedShare: billed, expectedShare: expected, pool, tenantCharge: charge },
          description: `With the corrected values, the statement's share of ${pct(billed)} is not above the lease share of ${pct(expected)}, so no amount is counted. ${sentence}`,
          potential_savings: 0,
          letterText: "",
          severity: "low",
          correctedInputs: keys,
        } as Finding;
      }
      const next = shareFinding({ ...calc, billedShare: billed, expectedShare: expected, pool, tenantCharge: pool != null ? charge : null }, { expectedSentence: sentence });
      return { ...f, ...next, letterText: (next as { letterText?: string }).letterText, correctedInputs: keys } as Finding;
    }
    if (calc?.kind === "admin-fee" && applied.some((a) => a.key.startsWith("fee."))) {
      const fee = v("fee.feeAmountBuilding")!;
      const cap = v("fee.capPercent")!;
      const share = v("fee.tenantSharePercent");
      const stated = calc.method === "stated-rate" ? v("fee.statedPercent")! : null;
      const base = calc.method === "fee-over-base" ? v("fee.feeBase") : null;
      const exact =
        calc.method === "stated-rate"
          ? computeAdminFeeTenantOvercharge({ feeAmountBuilding: fee, statedPercent: stated, capPercent: cap, tenantSharePercent: share })
          : computeFeeOverBaseTenantOvercharge({ feeAmountBuilding: fee, feeBase: base, capPercent: cap, tenantSharePercent: share });
      const amount = Math.round(exact);
      const keys = applied.filter((a) => a.key.startsWith("fee.")).map((a) => a.key);
      const corrected = applied.filter((a) => a.key.startsWith("fee.")).map((a) => `${a.label.toLowerCase()} ${fmt(a.unit, a.value)} (the documents gave ${a.original == null ? "no value" : fmt(a.unit, a.original)})`);
      const permitted = calc.method === "stated-rate" ? round2((fee * cap) / stated!) : round2((base! * cap) / 100);
      touched.add(f);
      return {
        ...f,
        calc: { ...calc, feeAmountBuilding: fee, capPercent: cap, tenantSharePercent: share, statedPercent: stated ?? calc.statedPercent, feeBase: base },
        description:
          `Corrected values used: ${corrected.join("; ")}. ` +
          (amount > 0
            ? `At the ${pct(cap)} limit the permitted fee is ${usd(permitted)}, so the fee is ${usd(round2(fee - permitted))} above it; your ${pct(share!)} share of that is ${usd(exact)}, rounded to ${usd(amount)}. ` +
              "This assumes the limit and the fee are measured against the same total. This is a calculation from the documents and your corrections, not a confirmed overcharge."
            : "With these values the fee is not above the limit, or your share is not known, so no amount is counted."),
        potential_savings: amount,
        severity: amount > 0 ? f.severity : "low",
        ...(amount > 0 ? {} : { letterText: "" }),
        correctedInputs: keys,
      } as Finding;
    }
    return f;
  };

  const next: Record<string, unknown> = { ...row };
  if (Array.isArray(row.free_findings)) next.free_findings = (row.free_findings as Finding[]).map(fix);
  if (Array.isArray(row.paid_findings)) next.paid_findings = (row.paid_findings as Finding[]).map(fix);

  // Excluded-expense rows: tenant charge = statement amount x share, to the cent.
  const rows = rowsOf(row);
  let overcharge = typeof row.estimated_overcharge === "number" ? row.estimated_overcharge : rows.reduce((s, r) => s + r.tenant_charge, 0);
  if (rows.length && applied.some((a) => a.key.startsWith("excluded."))) {
    const share = v("excluded.sharePercent")!;
    const newRows = rows.map((r, i) => {
      const amount = v(`excluded.row${i}.amount`)!;
      return amount === r.total_expense && share === r.tenant_share_percent
        ? r
        : { ...r, total_expense: amount, tenant_share_percent: share, tenant_charge: round2((amount * share) / 100), correctedInputs: true };
    });
    next.overcharge_breakdown = newRows;
    overcharge = round2(newRows.reduce((s, r) => s + r.tenant_charge, 0));
    next.estimated_overcharge = overcharge;
  }

  // Headline: the engine's own formula over what is now listed. An unavailable headline (null) stays unavailable.
  if (row.savings_estimate !== null && row.savings_estimate !== undefined) {
    next.savings_estimate = totalSavings(all(next), overcharge);
  }

  const notReassessed = all(next)
    .filter((f) => isObj(f) && !touched.has(f) && !f.calc && findingKind(f) !== "note" && findingKind(f) !== "excluded")
    .map((f) => f.category);
  const at = applied.map((a) => overrides.values[a.key].at).sort().pop() ?? "";
  const record: InputCorrectionsRecord = {
    applied: applied.map((a) => ({ key: a.key, label: a.label, unit: a.unit, value: a.value, original: overrides.values[a.key].original })),
    notReassessed: Array.from(new Set(notReassessed)),
    at,
  };
  const lcs = isObj(row.lease_clauses_summary) ? row.lease_clauses_summary : {
    camCap: null, adminFeeCap: null, managementFeeCap: null, tenantProRataShare: null,
    tenantSquareFootage: null, buildingSquareFootage: null, excludedCategories: [], additionalClauses: [],
  };
  // The record travels with the clause summary; the screen and the PDF state it in their own neutral notice (not as a
  // data warning), worded by correctionsSentence below.
  next.lease_clauses_summary = { ...lcs, inputCorrections: record };
  return next as T;
}

/** The one sentence every surface uses to say a result was recalculated from corrected figures. */
export function correctionsSentence(r: InputCorrectionsRecord): string {
  const list = r.applied.map((a) => `${a.label.toLowerCase()} ${fmt(a.unit, a.value)} (documents: ${a.original == null ? "none" : fmt(a.unit, a.original)})`).join("; ");
  const not = r.notReassessed.length
    ? ` Items that depend on reading the lease were not reassessed: ${r.notReassessed.join(", ")}.`
    : "";
  return `${NOTE_LABEL}: ${list}.${not}`;
}

export const parseInputCorrections = (v: unknown): InputCorrectionsRecord | null => {
  if (!isObj(v) || !Array.isArray(v.applied) || !Array.isArray(v.notReassessed)) return null;
  return v as unknown as InputCorrectionsRecord;
};
