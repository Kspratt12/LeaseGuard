"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useCallback } from "react";
import { Menu, X } from "lucide-react";
import { useAuditDraft } from "@/components/audit-draft-context";

const navLinks = [
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#faq", label: "FAQ" },
];

export function Navbar() {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const { clearDraft } = useAuditDraft();

  /**
   * Clear the upload draft when navigating away from the upload page.
   * This ensures files don't persist when the user clicks Logo, CAM Audit,
   * Resources, or any other non-upload link. Files only persist for
   * the back-button flow (browser back doesn't trigger navbar clicks).
   */
  const handleNavAway = useCallback(() => {
    clearDraft();
    setMobileOpen(false);
  }, [clearDraft]);

  const handleAnchorClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      // Clear draft when navigating away via anchor links
      clearDraft();
      if (isLanding && href.startsWith("/#")) {
        e.preventDefault();
        const id = href.replace("/#", "");
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth" });
        }
        setMobileOpen(false);
      }
    },
    [isLanding, clearDraft]
  );

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-gray-200/60 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Logo — clears draft when clicked */}
        <Link href="/" onClick={handleNavAway} className="flex items-center gap-2.5 shrink-0">
          <Image
            src="/leaseguard-logo.png"
            alt="LeaseGuard CAM audit software logo"
            width={180}
            height={44}
            className="h-12 sm:h-14 w-auto"
            priority
          />
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-8">
          {isLanding &&
            navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => handleAnchorClick(e, link.href)}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                {link.label}
              </a>
            ))}
          <Link
            href="/cam-audit"
            onClick={handleNavAway}
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            CAM Audit
          </Link>
          <Link
            href="/resources"
            onClick={handleNavAway}
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Resources
          </Link>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 hover:shadow-md transition-all"
          >
            Run Audit
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-gray-600 hover:text-gray-900"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 pb-4 pt-2 space-y-1">
          {isLanding &&
            navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => handleAnchorClick(e, link.href)}
                className="block rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              >
                {link.label}
              </a>
            ))}
          <Link
            href="/cam-audit"
            onClick={handleNavAway}
            className="block rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          >
            CAM Audit
          </Link>
          <Link
            href="/resources"
            onClick={handleNavAway}
            className="block rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          >
            Resources
          </Link>
          <Link
            href="/upload"
            onClick={() => setMobileOpen(false)}
            className="block rounded-lg bg-blue-600 px-3 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-500 mt-2"
          >
            Run Audit
          </Link>
        </div>
      )}
    </nav>
  );
}
