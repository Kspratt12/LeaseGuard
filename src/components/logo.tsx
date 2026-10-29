import Image from "next/image";

/**
 * The LeaseGuard mark (cropped tight to the artwork, so it renders at a real size) next to a live
 * wordmark. The old single image had large transparent margins that made the logo look tiny.
 */
export function Logo({ tone = "dark", className = "" }: { tone?: "dark" | "light"; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Image src="/leaseguard-mark.png" alt="" width={480} height={366} priority className="h-9 w-auto sm:h-11" />
      <span className={`text-[1.45rem] font-bold leading-none tracking-tight sm:text-[1.7rem] ${tone === "dark" ? "text-ink" : "text-white"}`}>
        LeaseGuard
      </span>
    </span>
  );
}
