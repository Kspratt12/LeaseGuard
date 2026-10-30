import { CheckCircle2, ClipboardList, HelpCircle, ListChecks, Scale } from "lucide-react";
import { Pill } from "@/components/ui";
import { ROUNDING_NOTE } from "@/lib/format";
import { planMoney, reviewedSentence, type PlanItem, type PlanTier, type ReviewPlan } from "@/services/review-plan";

/**
 * CAM Review Plan panel. Presentational only: the plan is built from the report data the page already holds,
 * so it shows nothing the customer has not already unlocked. Wording avoids any claim that money is owed.
 */

const TONE: Record<PlanTier, "success" | "warning" | "neutral"> = {
  calculated: "success",
  judgment: "warning",
  "needs-data": "neutral",
  match: "neutral",
};

function Item({ item, open }: { item: PlanItem; open: boolean }) {
  return (
    <li>
      <details open={open} className="group rounded-xl border border-line bg-white open:bg-paper/50">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-3 sm:p-4 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-start gap-3">
            <span className="font-figures mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white" aria-label={`Rank ${item.rank}`}>
              {item.rank}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-snug text-ink sm:text-base">{item.title}</span>
              <span className="mt-1 flex flex-wrap items-center gap-2">
                <Pill tone={TONE[item.tier]}>{item.tierLabel}</Pill>
                <span className="text-xs text-ink-muted">{item.evidenceLabel}</span>
              </span>
            </span>
          </span>
          {item.amount != null && item.amount > 0 && (
            <span className="shrink-0 text-right">
              <span className="font-figures block text-base font-semibold tabular-nums text-ink">{planMoney(item.amount)}</span>
              <span className="block text-[11px] text-ink-muted">in question</span>
            </span>
          )}
        </summary>

        <div className="space-y-4 px-3 pb-4 text-sm text-ink-soft sm:px-4 sm:pl-14">
          <p><span className="font-semibold text-ink">Why it is ranked here.</span> {item.whyRanked}</p>

          {item.whatWeFound && (
            <p><span className="font-semibold text-ink">What the report says.</span> {item.whatWeFound}</p>
          )}

          <div>
            <p className="font-semibold text-ink">How it was worked out</p>
            {item.calculation.length > 0 ? (
              <ol className="font-figures mt-1 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed">
                {item.calculation.map((s) => <li key={s}>{s}</li>)}
              </ol>
            ) : (
              <p className="mt-1 text-ink-muted">The report does not hold step-by-step figures for this item. Use the description above and the evidence below.</p>
            )}
          </div>

          {item.evidence.length > 0 && (
            <div>
              <p className="font-semibold text-ink">Evidence from your documents</p>
              <ul className="mt-1 space-y-2">
                {item.evidence.slice(0, 3).map((e, i) => (
                  <li key={i} className="rounded-lg border-l-4 border-ink/60 bg-paper p-2.5">
                    <p className="text-xs font-semibold text-ink-muted">{e.document}{e.page != null ? `, page ${e.page}` : ""}</p>
                    {e.quote && <p className="font-serif text-[14px] leading-relaxed">&ldquo;{e.quote}&rdquo;</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {item.questions.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 font-semibold text-ink"><HelpCircle className="h-4 w-4" aria-hidden /> Questions you could ask your landlord</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {item.questions.map((q) => <li key={q}>{q}</li>)}
              </ul>
            </div>
          )}

          {item.documents.length > 0 && (
            <div>
              <p className="font-semibold text-ink">Documents to review or request</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {item.documents.map((d) => <li key={d}>{d}</li>)}
              </ul>
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

export function ReviewPlanPanel({ plan, sample = false }: { plan: ReviewPlan; sample?: boolean }) {
  return (
    <section id="review-plan" aria-labelledby="review-plan-heading" className="rounded-xl border border-line bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="review-plan-heading" className="flex items-center gap-2 text-xl font-semibold text-ink">
          <ClipboardList className="h-5 w-5 text-accent" aria-hidden /> CAM Review Plan
        </h2>
        {sample && <span className="rounded-full bg-review-soft px-2.5 py-0.5 text-[11px] font-semibold text-review">Fictional example</span>}
      </div>
      <p className="mt-2 rounded-lg bg-paper p-3 text-xs leading-relaxed text-ink-muted">{plan.caution}</p>

      {plan.empty ? (
        <p className="mt-4 text-sm text-ink-soft">The report has no findings to organize. You can still compare your statement with your lease yourself.</p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["calculated", "judgment", "needs-data", "match"] as PlanTier[]).map((t) => (
              <div key={t} className="rounded-lg border border-line p-3">
                <dt className="text-[11px] font-medium leading-tight text-ink-muted">{{ calculated: "Calculated", judgment: "Needs judgment", "needs-data": "Needs information", match: "Matches" }[t]}</dt>
                <dd className="font-figures mt-1 text-xl font-semibold tabular-nums text-ink">{plan.tierCounts[t]}</dd>
              </div>
            ))}
          </dl>
          {(plan.calculatedTotal > 0 || plan.judgmentTotal > 0) && (
            <p className="mt-2 text-xs text-ink-muted">
              Amounts in question: {planMoney(plan.calculatedTotal)} calculated, {planMoney(plan.judgmentTotal)} that depends on judgment. They are shown separately because they are different kinds of items, and
              neither is a confirmed overcharge. {ROUNDING_NOTE}
            </p>
          )}
          {plan.confidenceNote && <p className="mt-1 text-xs text-ink-muted">{plan.confidenceNote}</p>}
          {reviewedSentence(plan.reviewed) && <p className="mt-1 text-xs text-ink-muted">{reviewedSentence(plan.reviewed)}</p>}

          <h3 className="mt-6 flex items-center gap-2 text-sm font-semibold text-ink"><ListChecks className="h-4 w-4" aria-hidden /> Your items, in priority order</h3>
          <p className="mt-1 flex gap-1.5 text-xs leading-relaxed text-ink-muted"><Scale className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {plan.rankingRule}</p>
          <ol className="mt-3 space-y-3">
            {plan.items.map((it, i) => <Item key={it.id} item={it} open={i < 2 && it.tier !== "match"} />)}
          </ol>

          <div className="mt-6 rounded-xl border border-line bg-paper p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><CheckCircle2 className="h-4 w-4 text-verified" aria-hidden /> One-page checklist and action summary</h3>
            {plan.topActions.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-ink-soft">
                {plan.topActions.map((a) => <li key={a}>{a}</li>)}
              </ul>
            )}
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {plan.checklist.map((g) => (
                <div key={g.title}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{g.title}</p>
                  <ul className="mt-1 space-y-1 text-sm text-ink-soft">
                    {g.steps.map((s) => (
                      <li key={s} className="flex gap-2"><span aria-hidden className="mt-1.5 h-3 w-3 shrink-0 rounded-sm border border-ink/40" /><span>{s}</span></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
