"use client";

import { useMemo, useState } from "react";
import { calculateCam, fmtMoney, type CamInput } from "@/lib/cam-calculator";

/** Parses "$1,234.50" style input. Empty string => null; garbage => NaN (rejected by the logic). */
function num(raw: string): number | null {
  const t = raw.replace(/[$,%\s]/g, "");
  if (t === "") return null;
  return /^-?\d*\.?\d*$/.test(t) && t !== "." && t !== "-" ? Number(t) : Number.NaN;
}

const EMPTY = {
  expenses: "", fee: "", feeIncluded: false, mode: "percent" as "percent" | "sqft",
  share: "", tenantSqFt: "", buildingSqFt: "", statementShare: "",
  payments: "", billed: "", prior: "", cap: "",
};

// Fictional example. It is not a real statement.
const EXAMPLE = {
  ...EMPTY, expenses: "560,540.00", fee: "18", share: "8.08", payments: "40,883.20", billed: "12,560.93",
};

function Field(props: {
  id: string; label: string; value: string; onChange: (v: string) => void; hint?: string; prefix?: string; suffix?: string;
}) {
  return (
    <div>
      <label htmlFor={props.id} className="block text-sm font-medium text-gray-800">
        {props.label}
      </label>
      <div className="mt-1 flex items-stretch rounded-lg border border-gray-300 bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-200">
        {props.prefix && <span className="flex items-center pl-3 text-gray-500">{props.prefix}</span>}
        <input
          id={props.id}
          inputMode="decimal"
          autoComplete="off"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          aria-describedby={props.hint ? `${props.id}-hint` : undefined}
          className="min-w-0 flex-1 rounded-lg bg-transparent px-3 py-2.5 text-base text-gray-900 outline-none"
        />
        {props.suffix && <span className="flex items-center pr-3 text-gray-500">{props.suffix}</span>}
      </div>
      {props.hint && (
        <p id={`${props.id}-hint`} className="mt-1 text-xs text-gray-500">
          {props.hint}
        </p>
      )}
    </div>
  );
}

export function CamCalculator() {
  const [f, setF] = useState(EMPTY);
  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setF((p) => ({ ...p, [k]: v }));

  const input: CamInput = useMemo(
    () => ({
      totalExpenses: num(f.expenses),
      feePercent: num(f.fee),
      feeAlreadyIncluded: f.feeIncluded,
      shareMode: f.mode,
      sharePercent: num(f.share),
      tenantSqFt: num(f.tenantSqFt),
      buildingSqFt: num(f.buildingSqFt),
      statementSharePercent: num(f.statementShare),
      estimatedPayments: num(f.payments),
      billedBalance: num(f.billed),
      priorYearTenantTotal: num(f.prior),
      capPercent: num(f.cap),
    }),
    [f],
  );
  const started = f.expenses !== "" || f.share !== "" || f.tenantSqFt !== "";
  const outcome = useMemo(() => calculateCam(input), [input]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Enter your numbers</h2>
        <div className="flex gap-3 text-sm">
          <button type="button" onClick={() => setF(EXAMPLE)} className="min-h-10 px-2 py-2 text-blue-700 underline">
            Load a fictional example
          </button>
          <button type="button" onClick={() => setF(EMPTY)} className="min-h-10 px-2 py-2 text-gray-600 underline">
            Clear
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <Field id="expenses" label="Total operating expenses for the year" prefix="$" value={f.expenses}
          onChange={(v) => set("expenses", v)} hint="The expense pool on the statement, before your share is applied." />

        <Field id="fee" label="Management or admin fee (optional)" suffix="%" value={f.fee}
          onChange={(v) => set("fee", v)} hint="The percentage your statement shows, if any." />
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={f.feeIncluded} onChange={(e) => set("feeIncluded", e.target.checked)}
            className="mt-1 h-4 w-4" />
          <span>The expense total above already includes that fee.</span>
        </label>

        <fieldset>
          <legend className="text-sm font-medium text-gray-800">How is your share defined?</legend>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-700">
            <label className="flex items-center gap-2">
              <input type="radio" name="mode" checked={f.mode === "percent"} onChange={() => set("mode", "percent")} /> A percentage
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="mode" checked={f.mode === "sqft"} onChange={() => set("mode", "sqft")} /> Square footage
            </label>
          </div>
        </fieldset>

        {f.mode === "percent" ? (
          <Field id="share" label="Your pro-rata share" suffix="%" value={f.share} onChange={(v) => set("share", v)}
            hint="From your lease or the statement." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="tsf" label="Your square feet" value={f.tenantSqFt} onChange={(v) => set("tenantSqFt", v)} />
            <Field id="bsf" label="Building square feet" value={f.buildingSqFt} onChange={(v) => set("buildingSqFt", v)} />
            <Field id="stmtshare" label="Share shown on statement (optional)" suffix="%" value={f.statementShare}
              onChange={(v) => set("statementShare", v)} hint="Used only to compare with the square-footage math." />
          </div>
        )}

        <Field id="payments" label="Estimated payments you made for the year" prefix="$" value={f.payments}
          onChange={(v) => set("payments", v)} hint="Your monthly CAM estimate x the months covered." />
        <Field id="billed" label="Balance shown on the statement (optional)" prefix="$" value={f.billed}
          onChange={(v) => set("billed", v)} hint="Amount due as a positive number; a credit as a negative number." />

        <details className="rounded-lg border border-gray-200 bg-white p-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-800">Optional: compare with a CAM cap</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field id="prior" label="Your prior-year CAM total" prefix="$" value={f.prior} onChange={(v) => set("prior", v)} />
            <Field id="cap" label="Cap on annual increase" suffix="%" value={f.cap} onChange={(v) => set("cap", v)} />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Caps differ: some cover only controllable expenses, some are cumulative. This is a simple total-to-total comparison.
          </p>
        </details>
      </div>

      <div className="mt-6" aria-live="polite">
        {!started && <p className="text-sm text-gray-600">Enter your expenses and share to see the calculation.</p>}

        {started && !outcome.ok && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {outcome.errors.length > 0 && (
              <ul className="list-disc pl-5">
                {outcome.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            {outcome.errors.length === 0 && outcome.missing.length > 0 && <p>Still needed: {outcome.missing.join(", ")}.</p>}
          </div>
        )}

        {started && outcome.ok && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-gray-900">The calculation</h3>
            <ol className="space-y-2">
              {outcome.result.steps.map((s) => (
                <li key={s.label} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
                  <p className="font-medium text-gray-900">{s.label}</p>
                  <p className="break-words text-gray-500">{s.formula}</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{s.value}</p>
                </li>
              ))}
            </ol>

            {outcome.result.comparison.status !== "not_compared" && (
              <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
                {outcome.result.comparison.status === "matches" ? (
                  <p>This calculation matches the statement balance (within $1.00).</p>
                ) : (
                  <>
                    <p className="font-semibold">
                      The statement balance is {fmtMoney(Math.abs(outcome.result.comparison.difference))}{" "}
                      {outcome.result.comparison.status === "statement_higher" ? "higher" : "lower"} than this calculation.
                    </p>
                    <p className="mt-1">
                      That is a difference worth asking about, not proof of an overcharge. It can come from a different
                      expense pool, a gross-up of variable expenses, how the fee is based, a different share, the timing of
                      payments, or rounding. Your lease decides which is correct.
                    </p>
                  </>
                )}
              </div>
            )}

            {outcome.result.cap.status !== "not_checked" && (
              <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-800">
                {outcome.result.cap.status === "above_cap" ? (
                  <p>
                    Your calculated share is {fmtMoney(outcome.result.cap.difference)} above the highest total this cap would
                    allow ({fmtMoney(outcome.result.cap.allowedMax)}), if your cap applies to this total.
                  </p>
                ) : (
                  <p>Your calculated share is within the highest total this cap would allow ({fmtMoney(outcome.result.cap.allowedMax)}).</p>
                )}
              </div>
            )}

            {[...outcome.result.notes, ...outcome.warnings].length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
                {[...outcome.result.notes, ...outcome.warnings].map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
