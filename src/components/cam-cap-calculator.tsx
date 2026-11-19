"use client";

import { useMemo, useState } from "react";
import {
  CAP_METHOD_LABEL,
  MAX_CAP_YEARS,
  calculateBaseYear,
  calculateCap,
  money,
  type CapInput,
  type CapMethod,
  type PriorBasis,
  type StopMode,
} from "@/lib/cap-calculator";

/** "$1,234.50" -> 1234.5. Empty -> null; anything else that is not a number -> NaN (rejected by the logic). */
function num(raw: string): number | null {
  const t = raw.replace(/[$,%\s]/g, "");
  if (t === "") return null;
  return /^-?\d*\.?\d*$/.test(t) && t !== "." && t !== "-" ? Number(t) : Number.NaN;
}

type Row = { year: string; capped: string; uncapped: string };
const EMPTY_ROWS: Row[] = [
  { year: "", capped: "", uncapped: "" },
  { year: "", capped: "", uncapped: "" },
];
// Fictional example (not a real lease or statement).
const EXAMPLE_ROWS: Row[] = [
  { year: "2021", capped: "100,000", uncapped: "40,000" },
  { year: "2022", capped: "103,000", uncapped: "41,000" },
  { year: "2023", capped: "112,000", uncapped: "45,000" },
  { year: "2024", capped: "115,000", uncapped: "47,000" },
];

function Field(props: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string; prefix?: string; suffix?: string; inputMode?: "decimal" | "numeric" }) {
  return (
    <div>
      <label htmlFor={props.id} className="block text-sm font-medium text-gray-800">{props.label}</label>
      <div className="mt-1 flex items-stretch rounded-lg border border-gray-300 bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-200">
        {props.prefix && <span className="flex items-center pl-3 text-gray-500">{props.prefix}</span>}
        <input
          id={props.id}
          inputMode={props.inputMode ?? "decimal"}
          autoComplete="off"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          aria-describedby={props.hint ? `${props.id}-hint` : undefined}
          className="min-w-0 flex-1 rounded-lg bg-transparent px-3 py-2.5 text-base text-gray-900 outline-none"
        />
        {props.suffix && <span className="flex items-center pr-3 text-gray-500">{props.suffix}</span>}
      </div>
      {props.hint && <p id={`${props.id}-hint`} className="mt-1 text-xs text-gray-500">{props.hint}</p>}
    </div>
  );
}

function Problems({ errors, missing }: { errors: string[]; missing: string[] }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      {errors.length > 0 && <ul className="list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {errors.length === 0 && missing.length > 0 && <p>Still needed: {missing.join(", ")}.</p>}
    </div>
  );
}

function CapPanel() {
  const [rows, setRows] = useState<Row[]>(EMPTY_ROWS);
  const [cap, setCap] = useState("");
  const [method, setMethod] = useState<CapMethod>("non-cumulative");
  const [priorBasis, setPriorBasis] = useState<PriorBasis>("capped");
  const [amountsAre, setAmountsAre] = useState<"tenant" | "building">("tenant");
  const [share, setShare] = useState("");

  const setRow = (i: number, k: keyof Row, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const addRow = () =>
    setRows((rs) => {
      if (rs.length >= MAX_CAP_YEARS) return rs;
      const last = num(rs[rs.length - 1]?.year ?? "");
      return [...rs, { year: last != null && Number.isInteger(last) ? String(last + 1) : "", capped: "", uncapped: "" }];
    });
  const removeRow = (i: number) => setRows((rs) => (rs.length <= 2 ? rs : rs.filter((_, j) => j !== i)));

  const input: CapInput = useMemo(
    () => ({
      method,
      capPercent: num(cap),
      priorBasis,
      amountsAre,
      sharePercent: num(share),
      years: rows.map((r) => ({ year: num(r.year), capped: num(r.capped), uncapped: num(r.uncapped) })),
    }),
    [rows, cap, method, priorBasis, amountsAre, share],
  );
  const outcome = useMemo(() => calculateCap(input), [input]);
  // The same figures under every reading of the cap, so the effect of the method is visible.
  const readings = useMemo(() => {
    if (!outcome.ok) return null;
    const variants: Array<{ label: string; over: Partial<CapInput> }> = [
      { label: "Non-cumulative, against the prior year's allowed amount", over: { method: "non-cumulative", priorBasis: "capped" } },
      { label: "Non-cumulative, against the prior year's actual expenses", over: { method: "non-cumulative", priorBasis: "actual" } },
      { label: "Cumulative, compounding", over: { method: "cumulative-compounded" } },
      { label: "Cumulative, non-compounding", over: { method: "cumulative-simple" } },
    ];
    return variants.map((v) => {
      const o = calculateCap({ ...input, ...v.over });
      return { label: v.label, total: o.ok ? o.result.totalTenantAboveCap : null };
    });
  }, [outcome, input]);
  const started = cap !== "" || rows.some((r) => r.capped !== "" || r.year !== "");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 text-sm">
        <button type="button" className="min-h-10 px-2 py-2 text-blue-700 underline" onClick={() => { setRows(EXAMPLE_ROWS); setCap("5"); setAmountsAre("tenant"); setShare(""); }}>
          Load a fictional example
        </button>
        <button type="button" className="min-h-10 px-2 py-2 text-gray-600 underline" onClick={() => { setRows(EMPTY_ROWS); setCap(""); setShare(""); }}>
          Clear
        </button>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-gray-800">How does your lease measure the cap?</legend>
        <div className="mt-2 space-y-2 text-sm text-gray-700">
          {(Object.keys(CAP_METHOD_LABEL) as CapMethod[]).map((m) => (
            <label key={m} className="flex items-start gap-2">
              <input type="radio" name="cap-method" className="mt-1" checked={method === m} onChange={() => setMethod(m)} /> {CAP_METHOD_LABEL[m]}
            </label>
          ))}
        </div>
      </fieldset>

      {method === "non-cumulative" && (
        <fieldset>
          <legend className="text-sm font-medium text-gray-800">Each year is limited by the prior year&apos;s</legend>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-700">
            <label className="flex items-center gap-2"><input type="radio" name="prior-basis" checked={priorBasis === "capped"} onChange={() => setPriorBasis("capped")} /> amount allowed under the cap</label>
            <label className="flex items-center gap-2"><input type="radio" name="prior-basis" checked={priorBasis === "actual"} onChange={() => setPriorBasis("actual")} /> actual expenses</label>
          </div>
          <p className="mt-1 text-xs text-gray-500">Leases word this differently. If yours is unclear, compare both readings below.</p>
        </fieldset>
      )}

      <Field id="cap-pct" label="Cap on increases" suffix="%" value={cap} onChange={setCap} hint="The percentage in your lease's cap clause." />

      <fieldset>
        <legend className="text-sm font-medium text-gray-800">The amounts you enter are</legend>
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-700">
          <label className="flex items-center gap-2"><input type="radio" name="amounts-are" checked={amountsAre === "tenant"} onChange={() => setAmountsAre("tenant")} /> my share</label>
          <label className="flex items-center gap-2"><input type="radio" name="amounts-are" checked={amountsAre === "building"} onChange={() => setAmountsAre("building")} /> building totals</label>
        </div>
      </fieldset>
      {amountsAre === "building" && <Field id="cap-share" label="Your pro-rata share" suffix="%" value={share} onChange={setShare} />}

      <div>
        <p className="text-sm font-medium text-gray-800">One row per year, starting with the base year</p>
        <p className="mt-1 text-xs text-gray-500">
          Put only the expenses your lease caps in the first amount (often called controllable expenses). You decide which
          expenses those are from your lease; this calculator does not sort them by name.
        </p>
        <div className="mt-3 space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">{i === 0 ? "Base year" : `Year ${i + 1}`}</p>
                {rows.length > 2 && (
                  <button type="button" onClick={() => removeRow(i)} className="min-h-10 px-2 text-sm text-gray-600 underline" aria-label={`Remove row ${i + 1}`}>
                    Remove
                  </button>
                )}
              </div>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <Field id={`y-${i}`} label="Year" inputMode="numeric" value={r.year} onChange={(v) => setRow(i, "year", v)} />
                <Field id={`c-${i}`} label="Expenses subject to the cap" prefix="$" value={r.capped} onChange={(v) => setRow(i, "capped", v)} />
                <Field id={`u-${i}`} label="Expenses outside the cap (optional)" prefix="$" value={r.uncapped} onChange={(v) => setRow(i, "uncapped", v)} />
              </div>
            </div>
          ))}
        </div>
        {rows.length < MAX_CAP_YEARS && (
          <button type="button" onClick={addRow} className="mt-3 min-h-10 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50">
            Add the next year
          </button>
        )}
      </div>

      <div aria-live="polite">
        {!started && <p className="text-sm text-gray-600">Enter the cap and at least two years to see the calculation.</p>}
        {started && !outcome.ok && <Problems errors={outcome.errors} missing={outcome.missing} />}
        {started && outcome.ok && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-gray-900">The calculation</h3>
            <ol className="space-y-2">
              {outcome.result.rows.map((r) => (
                <li key={r.year} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
                  <p className="font-medium text-gray-900">{r.year}{r.n === 0 ? " (base year)" : ""}</p>
                  <p className="break-words text-gray-500">{r.formula}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    <dt className="text-gray-500">Subject to the cap</dt><dd className="text-right font-medium text-gray-900">{money(r.capped)}</dd>
                    {r.allowedCapped != null && (<><dt className="text-gray-500">Allowed under the cap</dt><dd className="text-right font-medium text-gray-900">{money(r.allowedCapped)}</dd></>)}
                    {r.n > 0 && (<><dt className="text-gray-500">Above the cap</dt><dd className="text-right font-semibold text-gray-900">{money(r.aboveCap)}</dd></>)}
                    {r.n > 0 && amountsAre === "building" && (<><dt className="text-gray-500">Your share of that</dt><dd className="text-right font-semibold text-gray-900">{money(r.tenantAboveCap)}</dd></>)}
                    {r.uncapped > 0 && (<><dt className="text-gray-500">Outside the cap</dt><dd className="text-right text-gray-700">{money(r.uncapped)}</dd></>)}
                  </dl>
                </li>
              ))}
            </ol>
            <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
              <p className="font-semibold">
                Under the method selected, the amounts entered are {money(outcome.result.totalTenantAboveCap)} above the cap in total
                {amountsAre === "building" ? " (your share)" : ""}.
              </p>
              <p className="mt-1">
                That is a difference worth asking about, not proof of an overcharge. It depends on the method, the base year and
                the expenses you placed under the cap, all of which come from your lease.
              </p>
            </div>
            {readings && (
              <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
                <p className="font-medium text-gray-900">The same figures under each way of measuring a {cap}% cap</p>
                <ul className="mt-2 space-y-1">
                  {readings.map((x) => (
                    <li key={x.label} className="flex justify-between gap-4"><span className="text-gray-600">{x.label}</span><span className="font-medium text-gray-900">{x.total == null ? "n/a" : money(x.total)}</span></li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-gray-500">Only one of these is your lease. A difference between them is why the cap wording matters.</p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-gray-900">What this result assumes</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-700">
                {[...outcome.result.assumptions, ...outcome.result.notes].map((n) => <li key={n}>{n}</li>)}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BaseYearPanel() {
  const [mode, setMode] = useState<StopMode>("base-year");
  const [f, setF] = useState({ current: "", base: "", stop: "", psf: "", bsf: "", share: "" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const outcome = useMemo(
    () =>
      calculateBaseYear({
        mode,
        currentExpenses: num(f.current),
        baseYearExpenses: num(f.base),
        stopAmount: num(f.stop),
        stopPerSqFt: num(f.psf),
        buildingSqFt: num(f.bsf),
        sharePercent: num(f.share),
      }),
    [mode, f],
  );
  const started = Object.values(f).some((v) => v !== "");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 text-sm">
        <button type="button" className="min-h-10 px-2 py-2 text-blue-700 underline" onClick={() => { setMode("base-year"); setF({ current: "661,437.20", base: "600,000", stop: "", psf: "", bsf: "", share: "8.08" }); }}>
          Load a fictional example
        </button>
        <button type="button" className="min-h-10 px-2 py-2 text-gray-600 underline" onClick={() => setF({ current: "", base: "", stop: "", psf: "", bsf: "", share: "" })}>
          Clear
        </button>
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-gray-800">What does your lease use?</legend>
        <div className="mt-2 space-y-2 text-sm text-gray-700">
          <label className="flex items-center gap-2"><input type="radio" name="stop-mode" checked={mode === "base-year"} onChange={() => setMode("base-year")} /> A base year (you pay your share of increases over that year&apos;s expenses)</label>
          <label className="flex items-center gap-2"><input type="radio" name="stop-mode" checked={mode === "expense-stop-total"} onChange={() => setMode("expense-stop-total")} /> An expense stop as a dollar amount</label>
          <label className="flex items-center gap-2"><input type="radio" name="stop-mode" checked={mode === "expense-stop-psf"} onChange={() => setMode("expense-stop-psf")} /> An expense stop per square foot</label>
        </div>
      </fieldset>
      <Field id="by-current" label="This year's building operating expenses" prefix="$" value={f.current} onChange={(v) => set("current", v)} />
      {mode === "base-year" && <Field id="by-base" label="Base-year building operating expenses" prefix="$" value={f.base} onChange={(v) => set("base", v)} />}
      {mode === "expense-stop-total" && <Field id="by-stop" label="Expense stop (building total)" prefix="$" value={f.stop} onChange={(v) => set("stop", v)} />}
      {mode === "expense-stop-psf" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="by-psf" label="Expense stop per square foot per year" prefix="$" value={f.psf} onChange={(v) => set("psf", v)} />
          <Field id="by-bsf" label="Building square feet" value={f.bsf} onChange={(v) => set("bsf", v)} hint="The area the per-foot figure is measured on." />
        </div>
      )}
      <Field id="by-share" label="Your pro-rata share" suffix="%" value={f.share} onChange={(v) => set("share", v)} />

      <div aria-live="polite">
        {!started && <p className="text-sm text-gray-600">Enter the figures to see the calculation.</p>}
        {started && !outcome.ok && <Problems errors={outcome.errors} missing={outcome.missing} />}
        {started && outcome.ok && (
          <div className="space-y-4">
            <ol className="space-y-2">
              {outcome.steps.map((s) => (
                <li key={s.label} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
                  <p className="font-medium text-gray-900">{s.label}</p>
                  <p className="break-words text-gray-500">{s.formula}</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{s.value}</p>
                </li>
              ))}
            </ol>
            <div>
              <p className="text-sm font-medium text-gray-900">What this result assumes</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-700">{outcome.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function CamCapCalculator() {
  const [tab, setTab] = useState<"cap" | "base">("cap");
  const tabClass = (on: boolean) =>
    `min-h-11 flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${on ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200" : "text-gray-600 hover:text-gray-900"}`;
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4 sm:p-6">
      <div role="tablist" aria-label="Calculator" className="flex gap-1 rounded-xl bg-gray-100 p-1">
        <button type="button" role="tab" aria-selected={tab === "cap"} aria-controls="panel-cap" id="tab-cap" className={tabClass(tab === "cap")} onClick={() => setTab("cap")}>
          Cap on increases
        </button>
        <button type="button" role="tab" aria-selected={tab === "base"} aria-controls="panel-base" id="tab-base" className={tabClass(tab === "base")} onClick={() => setTab("base")}>
          Base year or expense stop
        </button>
      </div>
      <div className="mt-5" role="tabpanel" id={tab === "cap" ? "panel-cap" : "panel-base"} aria-labelledby={tab === "cap" ? "tab-cap" : "tab-base"}>
        {tab === "cap" ? <CapPanel /> : <BaseYearPanel />}
      </div>
    </div>
  );
}
