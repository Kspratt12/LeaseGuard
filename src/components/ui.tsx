import type { ReactNode } from "react";

/**
 * Shared building blocks for the whole product (the "Ledger" system): ink-coloured primary buttons,
 * paper and line neutrals, and badges whose colour carries meaning (emerald = verified or unlocked,
 * amber = an item to review, red = a failure). Controls are at least 44 px tall and have a visible
 * keyboard focus ring.
 */

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const variants = {
  primary: "bg-ink text-white shadow-sm hover:bg-ink-soft",
  secondary: "border border-ink/30 bg-white text-ink hover:border-ink",
  ghost: "text-ink-muted hover:bg-paper-deep hover:text-ink",
  /** for use on dark (ink) backgrounds */
  inverse: "bg-paper text-ink hover:bg-white",
} as const;

export function buttonClass(variant: keyof typeof variants = "primary", extra = ""): string {
  return `${base} ${variants[variant]} ${extra}`.trim();
}

export const cardClass = "rounded-xl border border-line bg-white shadow-sm";

const tones = {
  neutral: "bg-paper-deep text-ink-muted",
  info: "bg-blue-50 text-ink",
  success: "bg-verified-soft text-verified",
  warning: "bg-review-soft text-review",
  danger: "bg-red-100 text-red-800",
} as const;

export function Pill({ tone = "neutral", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** Small monospace label used above titles and figures, as on the homepage. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-figures text-[11px] font-medium uppercase tracking-widest text-ink-muted">{children}</p>;
}

/** Audit row status: amber = needs review, emerald = checked and matches, grey = could not be checked yet. */
export function StatusBadge({ status, children }: { status: "review" | "matches" | "data"; children: ReactNode }) {
  const tone = status === "review" ? "warning" : status === "matches" ? "success" : "neutral";
  return <Pill tone={tone}>{children}</Pill>;
}
