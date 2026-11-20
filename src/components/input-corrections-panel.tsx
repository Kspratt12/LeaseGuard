"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/auth-client";
import { buttonClass } from "@/components/ui";
import type { CorrectableInput, InputCorrectionsRecord } from "@/lib/input-overrides";

interface InputsView {
  available: boolean;
  inputs: CorrectableInput[];
  savings_estimate: number | null;
  corrections: InputCorrectionsRecord | null;
}

const show = (i: CorrectableInput, n: number | null) =>
  n == null ? "not found" : i.unit === "percent" ? `${parseFloat(n.toFixed(4))}%` : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "$1,234.50" / "8.5%" -> number; empty -> null; anything else -> NaN. */
const parse = (raw: string): number | null => {
  const t = raw.replace(/[$,%\s]/g, "");
  if (t === "") return null;
  return /^\d*\.?\d+$/.test(t) ? Number(t) : Number.NaN;
};

/** The figures for an audit, or null when they could not be loaded. Sets no state (safe to call from an effect). */
async function fetchInputs(auditId: string): Promise<InputsView | null> {
  const headers = await getAuthHeaders();
  if (!headers) return null;
  const res = await fetch(`/api/audit/${auditId}/inputs`, { headers, cache: "no-store" });
  return res.ok ? ((await res.json()) as InputsView) : null;
}

/**
 * The numbers the calculated checks used, with what the documents gave, and a way to correct a misread number.
 * Corrections are saved separately and every result (screen, PDF, letters) is recalculated from them on the server.
 */
export function InputCorrectionsPanel({ auditId, onChanged }: { auditId: string; onChanged: () => void }) {
  const [view, setView] = useState<InputsView | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saved, setSaved] = useState(false);

  const apply = (v: InputsView | null) => {
    if (!v) return setLoadFailed(true);
    setView(v);
    setDraft(Object.fromEntries(v.inputs.map((i) => [i.key, i.corrected && i.current != null ? String(i.current) : ""])));
  };
  const load = () => fetchInputs(auditId).then(apply);
  useEffect(() => {
    let active = true;
    fetchInputs(auditId).then((v) => {
      if (active) apply(v);
    });
    return () => {
      active = false;
    };
  }, [auditId]);

  async function save(values: Record<string, number | null>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const headers = await getAuthHeaders();
      if (!headers) throw new Error("Please sign in again.");
      const res = await fetch(`/api/audit/${auditId}/inputs`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "The correction could not be saved.");
      setView(body);
      setDraft(Object.fromEntries((body as InputsView).inputs.map((i) => [i.key, i.corrected && i.current != null ? String(i.current) : ""])));
      setSaved(true);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The correction could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!view) return;
    const values: Record<string, number | null> = {};
    const bad: string[] = [];
    for (const i of view.inputs) {
      const raw = (draft[i.key] ?? "").trim();
      const was = i.corrected ? i.current : null;
      if (raw === "") {
        if (was != null) values[i.key] = null; // cleared: back to the document value
        continue;
      }
      const n = parse(raw);
      if (n == null || Number.isNaN(n)) bad.push(i.label);
      else if (n !== was) values[i.key] = n;
    }
    if (bad.length) return setError(`Enter a number for: ${bad.join(", ")}.`);
    if (Object.keys(values).length === 0) return setError("Nothing has changed.");
    save(values);
  }

  if (loadFailed) {
    return (
      <section aria-labelledby="ic-title" className="rounded-xl border border-gray-200 bg-white p-4 text-sm sm:p-5">
        <h2 id="ic-title" className="text-lg font-semibold text-ink">Check the figures used</h2>
        <p className="mt-1 text-ink-soft">The figures could not be loaded.</p>
        <button type="button" onClick={() => { setLoadFailed(false); load(); }} className={`${buttonClass("secondary")} mt-3`}>Try again</button>
      </section>
    );
  }
  if (!view) return <Loader2 className="h-5 w-5 animate-spin text-blue-700" aria-label="Loading figures" />;
  if (view.inputs.length === 0) {
    return (
      <section aria-labelledby="ic-title" className="rounded-xl border border-gray-200 bg-white p-4 text-sm sm:p-5">
        <h2 id="ic-title" className="text-lg font-semibold text-ink">Check the figures used</h2>
        <p className="mt-1 text-ink-soft">
          No calculated item in this audit was built from figures that can be corrected here. Items that depend on reading the
          lease (exclusions, caps, missing terms) are not changed by correcting a number. Audits created before this feature
          did not record their inputs, except for excluded-expense lines.
        </p>
      </section>
    );
  }

  const groups = Array.from(new Set(view.inputs.map((i) => i.appliesTo)));
  return (
    <section aria-labelledby="ic-title" className="rounded-xl border border-gray-200 bg-white p-4 text-sm sm:p-5">
      <h2 id="ic-title" className="text-lg font-semibold text-ink">Check the figures used</h2>
      <p className="mt-1 text-ink-soft">
        These are the numbers read from your documents for the calculated items. If one was misread, enter the correct figure
        from your document. The calculated amounts, the total, the PDF report and both letters are recalculated from it. Your
        original documents and the values read from them are kept unchanged, and you can reset a correction at any time.
        Correcting a number does not re-read the lease: items that depend on its wording are not reassessed.
      </p>
      {!view.available && (
        <p role="note" className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-900">Saving corrections is not available yet. The figures are shown for reference.</p>
      )}
      {view.corrections && (
        <div role="status" className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-950">
          <p className="font-semibold">Results on this page use your corrections.</p>
          {view.corrections.notReassessed.length > 0 && (
            <p className="mt-1">Not reassessed (depends on reading the lease): {view.corrections.notReassessed.join(", ")}.</p>
          )}
        </div>
      )}
      <form onSubmit={submit} className="mt-4 space-y-5">
        {groups.map((g) => (
          <fieldset key={g} className="space-y-3">
            <legend className="font-semibold text-ink">{g}</legend>
            {view.inputs.filter((i) => i.appliesTo === g).map((i) => (
              <div key={i.key} className="grid gap-1 sm:grid-cols-[1fr_12rem] sm:items-end sm:gap-4">
                <div>
                  <label htmlFor={`ic-${i.key}`} className="font-medium text-gray-800">{i.label}</label>
                  <p id={`ic-${i.key}-hint`} className="text-xs text-gray-500">
                    From your documents: {show(i, i.extracted)}
                    {i.corrected ? ` · your correction: ${show(i, i.current)}` : ""}
                  </p>
                </div>
                <input
                  id={`ic-${i.key}`}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={i.extracted != null ? `Empty uses ${show(i, i.extracted)}` : "Enter the figure"}
                  value={draft[i.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [i.key]: e.target.value }))}
                  aria-describedby={`ic-${i.key}-hint`}
                  disabled={!view.available || busy}
                  className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 disabled:bg-gray-100"
                />
              </div>
            ))}
          </fieldset>
        ))}
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {saved && !error && <p role="status" className="text-verified">Saved. The results above were recalculated.</p>}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="submit" disabled={!view.available || busy} className={buttonClass("primary")}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save corrections
          </button>
          {view.inputs.some((i) => i.corrected) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => save(Object.fromEntries(view.inputs.filter((i) => i.corrected).map((i) => [i.key, null])))}
              className={buttonClass("ghost")}
            >
              Reset all to the document values
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500">Leave a field empty to use the value from your documents.</p>
      </form>
    </section>
  );
}
