"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { useAuditDraft } from "@/components/audit-draft-context";
import { supabase } from "@/lib/supabase";
import { buttonClass } from "@/components/ui";
import { Logo } from "@/components/logo";

/** The same five destinations on every page. Anchor links scroll in place when already on the homepage. */
const LINKS = [
  { href: "/#how-it-works", label: "How It Works", match: null },
  { href: "/sample-cam-audit-report", label: "Sample Report", match: "/sample-cam-audit-report" },
  { href: "/#pricing", label: "Pricing", match: null },
  { href: "/cam-calculator", label: "Calculator", match: "/cam-calculator" },
  { href: "/resources", label: "Guides", match: "/resources" },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const { clearDraft } = useAuditDraft();
  // null until the session has been read, so the account link never flashes the wrong label.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => active && setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(!!session));
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Close the mobile panel whenever the page changes.
  useEffect(() => setMobileOpen(false), [pathname]);

  const accountHref = signedIn === false ? "/login" : "/account";
  const accountLabel = signedIn === null ? "Account" : signedIn ? "My Audits" : "Sign In";
  const accountActive = pathname.startsWith("/account") || pathname.startsWith("/login");

  /** Leaving the upload page by any nav link discards the in-memory draft (same behaviour as before). */
  const handleNavAway = useCallback(() => {
    clearDraft();
    setMobileOpen(false);
  }, [clearDraft]);

  const handleAnchorClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      clearDraft();
      if (isLanding && href.startsWith("/#")) {
        e.preventDefault();
        document.getElementById(href.replace("/#", ""))?.scrollIntoView({ behavior: "smooth" });
        setMobileOpen(false);
      }
    },
    [isLanding, clearDraft],
  );

  const linkClass = (active: boolean) =>
    `relative inline-flex min-h-11 items-center text-sm font-medium transition-colors ${
      active ? "text-ink after:absolute after:inset-x-0 after:bottom-1.5 after:h-0.5 after:bg-ink" : "text-ink-muted hover:text-ink"
    }`;

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-line bg-paper/95 backdrop-blur-md" aria-label="Main">
      <div className="mx-auto flex h-[4.75rem] max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" onClick={handleNavAway} className="flex shrink-0 items-center" aria-label="LeaseGuard home">
          <Logo />
        </Link>

        {/* Desktop */}
        <div className="hidden items-center gap-6 md:flex">
          {LINKS.map((l) =>
            l.match ? (
              <Link key={l.href} href={l.href} onClick={handleNavAway} className={linkClass(pathname.startsWith(l.match))} aria-current={pathname.startsWith(l.match) ? "page" : undefined}>
                {l.label}
              </Link>
            ) : (
              <a key={l.href} href={l.href} onClick={(e) => handleAnchorClick(e, l.href)} className={linkClass(false)}>
                {l.label}
              </a>
            ),
          )}
          <Link href={accountHref} onClick={handleNavAway} className={linkClass(accountActive)} aria-current={accountActive ? "page" : undefined}>
            {accountLabel}
          </Link>
          <Link href="/upload" onClick={handleNavAway} className={buttonClass("primary", "!py-2")}>
            Start Free Preview
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted hover:text-ink md:hidden"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile panel */}
      {mobileOpen && (
        <div id="mobile-menu" className="border-t border-line bg-paper px-4 pb-5 pt-2 md:hidden">
          <ul className="divide-y divide-line">
            {LINKS.map((l) => (
              <li key={l.href}>
                {l.match ? (
                  <Link href={l.href} onClick={handleNavAway} className="flex min-h-12 items-center text-base font-medium text-ink">
                    {l.label}
                  </Link>
                ) : (
                  <a href={l.href} onClick={(e) => handleAnchorClick(e, l.href)} className="flex min-h-12 items-center text-base font-medium text-ink">
                    {l.label}
                  </a>
                )}
              </li>
            ))}
            <li>
              <Link href={accountHref} onClick={handleNavAway} className="flex min-h-12 items-center text-base font-medium text-ink">
                {accountLabel}
              </Link>
            </li>
          </ul>
          <Link href="/upload" onClick={handleNavAway} className={buttonClass("primary", "mt-4 w-full")}>
            Start Free Preview
          </Link>
        </div>
      )}
    </nav>
  );
}
