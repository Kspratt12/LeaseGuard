import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { NO_CAP_ONLY_NO_CAP, NO_CAP_ONLY_NOT_A_PASS, type QuantificationNotice } from "@/lib/quantification";
import { QuantificationNoticeBlock } from "@/components/quantification-notice";
import { CONFIDENCE_NOT_RATED, EXTRACTION_INCOMPLETE_SENTENCE, EXTRACTION_INCOMPLETE_TITLE, TOTAL_UNRELIABLE_QUALIFIER } from "@/lib/extraction-status";

/** Replaces the confidence level and bar when the automated reading did not finish. */
export function ConfidenceNotRated() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4" data-testid="confidence-not-rated">
      <span className="text-sm font-medium text-gray-700">Audit Confidence</span>
      <p className="mt-1 text-sm text-gray-600">{CONFIDENCE_NOT_RATED}</p>
    </div>
  );
}

/** Shown directly above the headline total of such an analysis, so the figure is not read as a reliable result. */
export function TotalUnreliableNotice() {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-center text-sm font-medium leading-relaxed text-amber-900" data-testid="headline-unreliable" role="note">
      {TOTAL_UNRELIABLE_QUALIFIER}
    </div>
  );
}

/**
 * Shown instead of the purchase panel when the server says there is nothing to sell for this audit
 * (see src/lib/purchase-eligibility.ts). Fixed sentences only: no finding text, no invented items, no price.
 */
export function NoPurchasePanel({
  reason,
  coverageNote,
  unquantifiedChecks,
  noCapObservationOnly,
  notice,
}: {
  reason: "nothing_to_unlock" | "insufficient_analysis" | "extraction_incomplete";
  coverageNote?: string;
  /** Cap or gross-up observations listed without an amount. They cannot make an audit purchasable by themselves. */
  unquantifiedChecks?: number;
  /** True only when every finding is a no-cap observation: the wording then says no cap was available to compare with. */
  noCapObservationOnly?: boolean;
  notice?: QuantificationNotice | null;
}) {
  const clean = reason === "nothing_to_unlock";
  if (reason === "extraction_incomplete") {
    return (
      <section className="rounded-xl border border-line bg-white p-5 sm:p-6" aria-labelledby="no-purchase-title" data-testid="extraction-incomplete">
        <h2 id="no-purchase-title" className="text-lg font-semibold text-ink">
          {EXTRACTION_INCOMPLETE_TITLE}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{EXTRACTION_INCOMPLETE_SENTENCE}</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          If this keeps happening, contact{" "}
          <a className="font-medium text-ink underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
        <p className="mt-3">
          <Link href="/upload" className="text-sm font-medium text-ink underline">
            Run the audit again
          </Link>
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-line bg-white p-5 sm:p-6" aria-labelledby="no-purchase-title">
      <h2 id="no-purchase-title" className="text-lg font-semibold text-ink">
        {clean ? "No additional findings were detected" : "We could not complete enough checks to offer a paid report"}
      </h2>
      {clean && noCapObservationOnly ? (
        <>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Nothing beyond what is shown above was flagged, so there is no paid report to unlock and nothing to buy.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted" data-testid="nocap-only-note">
            {NO_CAP_ONLY_NO_CAP} {NO_CAP_ONLY_NOT_A_PASS}
          </p>
          {coverageNote && (
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              {coverageNote} Having nothing flagged therefore does not cover the whole document, and it does not show that any provision is absent.
            </p>
          )}
        </>
      ) : clean ? (
        <>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Your documents were checked and nothing beyond what is shown above was flagged, so there is no paid report to unlock and nothing to
            buy. Having no flagged items is a normal result.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            LeaseGuard runs a defined set of checks (CAM cap, fees, your share, excluded expenses and year-over-year change). It does not check
            everything, so this is not a statement that the statement is correct in every respect.
          </p>
          {coverageNote && (
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              {coverageNote} Having nothing flagged therefore does not cover the whole document, and it does not show that any provision is absent.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {unquantifiedChecks && unquantifiedChecks > 0
              ? "The only items found are cap or gross-up observations that could not be turned into a supported result, because the lease's cap or adjustment method and what it covers were not established. This is not a clean result, and it is not enough to build a paid report from. We are not offering a purchase for this audit."
              : "These documents did not give us enough readable information to run the checks a paid report is built from. We are not offering a purchase for this audit."}
          </p>
          {notice && (
            <div className="mt-3">
              <QuantificationNoticeBlock notice={notice} />
            </div>
          )}
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            {coverageNote ? `${coverageNote} ` : ""}To try again, upload clearer copies of both documents, or add the missing statement if the notice above mentions one. Questions? Email{" "}
            <a className="font-medium text-ink underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
          <p className="mt-3">
            <Link href="/upload" className="text-sm font-medium text-ink underline">
              Start a new audit
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
