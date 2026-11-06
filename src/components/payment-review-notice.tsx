import { AlertTriangle } from "lucide-react";
import { paymentReviewMessage, supportReference, type PaymentReview } from "@/lib/payment-review";

/**
 * Shown when the server says a confirmed payment for this audit could not be applied. Wording comes from one place
 * (src/lib/payment-review.ts). It is independent of whether the report is unlocked, so an entitled owner still sees a
 * second payment that needs review, with different wording that does not say their report is locked.
 */
export function PaymentReviewNotice({ kind, auditId }: { kind: Exclude<PaymentReview, null>; auditId: string }) {
  const m = paymentReviewMessage(kind, supportReference(auditId));
  return (
    <div role="note" data-testid="payment-review" data-kind={kind} className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:p-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-review" aria-hidden />
      <div>
        <p className="text-sm font-medium text-amber-900">{m.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-amber-800">{m.body}</p>
      </div>
    </div>
  );
}
