"use client";

import { useState } from "react";
import { WINDOW_CAUTION, windowEndDate, type AuditRightsClause } from "@/lib/audit-rights";

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

/**
 * Quotes the lease's audit-right / dispute-window sentences and, only when the customer enters the date the period starts,
 * shows the date that falls that period later. No countdown, no "days left", no urgency styling.
 */
export function AuditRightsPanel({ clauses }: { clauses: AuditRightsClause[] }) {
  const [start, setStart] = useState("");

  if (clauses.length === 0) {
    return (
      <section aria-labelledby="ar-title" className="mt-6 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
        <h2 id="ar-title" className="font-semibold text-gray-900">Audit rights and time limits</h2>
        <p className="mt-1">
          This review did not quote an audit-right or dispute-window clause. Audits created before this check was added did not
          look for one, and your lease may word it in a way the check does not recognise. Look in the operating-expense section
          of your lease for any time limit on questioning a statement.
        </p>
      </section>
    );
  }

  const withPeriod = clauses.find((c) => c.period);
  const result = start && withPeriod ? windowEndDate(start, withPeriod.period) : null;

  return (
    <section aria-labelledby="ar-title" className="mt-6 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
      <h2 id="ar-title" className="font-semibold text-gray-900">Audit rights and time limits in your lease</h2>
      <ul className="mt-2 space-y-3">
        {clauses.map((c, i) => (
          <li key={i}>
            <p className="break-words border-l-2 border-gray-200 pl-3 italic">
              Lease{c.page != null ? `, page ${c.page}` : ""}: &ldquo;{c.quote}&rdquo;
            </p>
            <p className="mt-1 text-gray-600">
              {c.period
                ? `Period stated: ${c.period.count} ${c.period.unit}${c.trigger ? `, starting from ${c.trigger}` : ""}.`
                : "No time period was read from this sentence."}
            </p>
          </li>
        ))}
      </ul>

      {withPeriod && (
        <div className="mt-4">
          <label htmlFor="ar-start" className="block font-medium text-gray-800">
            {withPeriod.trigger ? `Date of ${withPeriod.trigger} (optional)` : "Date the period starts (optional)"}
          </label>
          <input
            id="ar-start"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 block min-h-11 w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900"
          />
          {result && (
            <div role="status" className="mt-3">
              {result.ok ? (
                <p>
                  {withPeriod.period!.count} {withPeriod.period!.unit} after {longDate(start)} is <span className="font-semibold">{longDate(result.date)}</span>.
                </p>
              ) : (
                <p>{result.reason}</p>
              )}
              <p className="mt-2 text-xs text-gray-500">{WINDOW_CAUTION}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
